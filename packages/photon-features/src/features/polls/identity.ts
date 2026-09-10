import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  sameScope, idSchema, pollRefSchema,
  type ResourceRef, type Scope, type Transaction, type ReferenceRecord,
} from "../../index.js";

export type PollRef = Extract<ResourceRef, { kind: "poll" }>;
export type OptionRef = Extract<ResourceRef, { kind: "poll-option" }>;
export const scopedId = (kind: string, scope: Scope, ...parts: unknown[]) =>
  `polls:${kind}:${createHash("sha256").update(JSON.stringify([
    scope.projectId, scope.provider, scope.accountId, scope.lineId, scope.spaceId, ...parts,
  ])).digest("hex")}`;

export function referenceOwner(tx: Pick<UnitOfWork, "get">, ref: ResourceRef): ReferenceRecord {
  const owner = tx.get("references", ref.id);
  if (!owner || !sameScope(owner.scope, ref.scope) ||
      !isDeepStrictEqual(owner.reference, ref)) throw new Error("RESOURCE_NOT_FOUND");
  return owner;
}

/** Native IDs are supplied by an authoritative host lookup, never inferred from labels/indexes.
 * This pure registration step does not supply the advanced lookup absent at F0.
 * Caller must have persisted the originating poll/message ownership first.
 */
export function registerNativeOptions(
  tx: Pick<UnitOfWork, "get" | "put">,
  input: { poll: PollRef; nativePollGuid: string; options: readonly { nativeId: string; label: string }[] },
): OptionRef[] {
  pollRefSchema.parse(input.poll);
  idSchema.parse(input.nativePollGuid);
  const owner = referenceOwner(tx, input.poll);
  if (owner.providerId !== input.nativePollGuid) throw new Error("POLL_IDENTITY_MISMATCH");
  const stored = tx.get("polls", input.poll.id);
  if (!stored || !sameScope(stored.scope, input.poll.scope) || !isDeepStrictEqual(stored.reference, input.poll)) throw new Error("RESOURCE_NOT_FOUND");
  if (input.options.length > 100 || new Set(input.options.map(o => o.nativeId)).size !== input.options.length)
    throw new Error("AMBIGUOUS_OPTIONS");
  const options = input.options.map(o => {
    idSchema.parse(o.nativeId);
    if (!o.label.trim() || o.label.length > 200) throw new Error("INVALID_OPTION_LABEL");
    const reference: OptionRef = {
      version: 1, kind: "poll-option", scope: input.poll.scope, pollId: input.poll.id,
      id: scopedId("option", input.poll.scope, input.nativePollGuid, o.nativeId),
    };
    const prior = tx.get("references", reference.id);
    if (prior && (!isDeepStrictEqual(prior.reference, reference) || prior.providerId !== o.nativeId || prior.taskId !== owner.taskId ||
        prior.generation !== owner.generation || prior.ownedByPrincipalId !== owner.ownedByPrincipalId ||
        !sameScope(prior.scope, owner.scope))) throw new Error("OPTION_IDENTITY_CONFLICT");
    if (!prior) tx.put("references", {
      ...owner, id: reference.id, revision: 0, reference, providerId: o.nativeId,
    }, null);
    return { reference, label: o.label };
  });
  // A partial lookup must not silently erase previously registered native options.
  if (stored.options.some(old => !options.some(o => o.reference.id === old.reference.id)))
    throw new Error("INCOMPLETE_OPTION_LOOKUP");
  if (stored.options.some(old => options.find(o => o.reference.id === old.reference.id)?.label !== old.label))
    throw new Error("CONFLICTING_OPTION_METADATA");
  if (JSON.stringify(stored.options) !== JSON.stringify(options)) tx.put("polls", {
    ...stored, revision: stored.revision + 1, options,
  }, stored.revision);
  return options.map(o => o.reference);
}

export function pollForEvent(tx: Transaction, ref: PollRef) {
  // F0 has no indexed provider lookup or paging. Refuse saturation, never choose a truncated match.
  const polls = tx.list("polls", ref.scope, 1000);
  if (polls.length === 1000) throw new Error("LOOKUP_REQUIRES_PAGINATION");
  const matches = polls.filter(p => {
    const owner = tx.get("references", p.id);
    const message = tx.get("references", p.reference.messageId);
    return owner && message && sameScope(owner.scope, ref.scope) && sameScope(message.scope, ref.scope) &&
      owner.providerId === message.providerId &&
      (ref.id === p.id || ref.id === owner.providerId) &&
      (ref.messageId === p.reference.messageId || ref.messageId === message.providerId);
  });
  if (matches.length !== 1) throw new Error(matches.length ? "AMBIGUOUS_POLL" : "UNKNOWN_POLL");
  return matches[0]!;
}

import type { UnitOfWork } from "../../contracts/store.js";
import type { TrustedContext } from "../../contracts/context.js";
import type { PollRecord } from "../../state/ports.js";
type PollIdentityReader = Pick<UnitOfWork, "get">;

/** Verify the durable originating principal/task/generation; a matching chat is insufficient. */
export function assertPollOwner(owner: ReferenceRecord, context: Readonly<TrustedContext>): void {
  if (!sameScope(owner.scope, context.scope)) throw new Error("SCOPE_MISMATCH");
  if (owner.ownedByPrincipalId !== context.principalId || owner.taskId !== context.taskId)
    throw new Error("FORBIDDEN");
  if (owner.generation !== context.generation) throw new Error("STALE_GENERATION");
}

/** Exact or deterministic native GUID lookup, never a latest-poll scan.
 * Native aliases must agree with both persisted message and poll identity.
 */
export function resolvePollIdentity(unit: PollIdentityReader, ref: PollRef,
  context: Readonly<TrustedContext>): PollRecord {
  pollRefSchema.parse(ref);
  if (!sameScope(ref.scope, context.scope)) throw new Error("SCOPE_MISMATCH");
  const candidates = [ref.id, scopedId("poll", ref.scope, ref.id)]
    .map(id => unit.get("polls", id)).filter((p): p is PollRecord => !!p);
  const matches = candidates.filter(p => {
    const owner = unit.get("references", p.id);
    const message = unit.get("references", p.reference.messageId);
    return owner && message && isDeepStrictEqual(owner.reference, p.reference) &&
      message.reference.kind === "message" && message.reference.id === p.reference.messageId &&
      sameScope(p.scope, ref.scope) && sameScope(p.reference.scope, ref.scope) &&
      sameScope(owner.scope, ref.scope) && sameScope(message.scope, ref.scope) &&
      sameScope(message.reference.scope, ref.scope) && owner.providerId === message.providerId &&
      (ref.id === p.id || ref.id === owner.providerId) &&
      (ref.messageId === p.reference.messageId || ref.messageId === message.providerId);
  });
  const unique = [...new Map(matches.map(p => [p.id, p])).values()];
  if (unique.length !== 1) throw new Error(unique.length ? "AMBIGUOUS_POLL" : "UNKNOWN_POLL");
  const poll = unique[0]!;
  assertPollOwner(unit.get("references", poll.id)!, context);
  assertPollOwner(unit.get("references", poll.reference.messageId)!, context);
  return poll;
}

/** Compare native IDs only against reference records; duplicate display labels are valid. */
export function resolveOptionIdentity(unit: PollIdentityReader, poll: PollRecord, ref: OptionRef,
  context: Readonly<TrustedContext>): PollRecord["options"][number] {
  const owner = unit.get("references", poll.id);
  if (!owner) throw new Error("UNKNOWN_POLL");
  assertPollOwner(owner, context);
  if (!sameScope(ref.scope, context.scope) ||
      (ref.pollId !== poll.id && ref.pollId !== owner.providerId)) throw new Error("POLL_OPTION_MISMATCH");
  const matches = poll.options.filter(o => {
    const native = unit.get("references", o.reference.id);
    if (!native || !isDeepStrictEqual(native.reference, o.reference) ||
        o.reference.pollId !== poll.id || !sameScope(o.reference.scope, poll.scope)) return false;
    assertPollOwner(native, context);
    return ref.id === o.reference.id || ref.id === native.providerId;
  });
  if (matches.length !== 1) throw new Error(matches.length ? "AMBIGUOUS_OPTION" : "NATIVE_OPTION_LOOKUP_REQUIRED");
  return matches[0]!;
}
