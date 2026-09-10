import { equivalent } from "./identity.js";
import type { Message, Space } from "spectrum-ts";
import {
  assertScope,
  sameScope,
  type ExecutionServices,
  type ResourceRef,
  type ReferenceRecord,
} from "../../index.js";
import { checkMessage, checkSpace, type TextMessageOptions } from "./sdk.js";
import { requireThat } from "./errors.js";
const handles = new WeakMap<
  ExecutionServices["resources"],
  Map<string, Message>
>();
export function remember(
  services: ExecutionServices,
  ref: ResourceRef,
  message: Message,
): void {
  let map = handles.get(services.resources);
  if (!map) {
    map = new Map();
    handles.set(services.resources, map);
  }
  // Durable records remain authoritative. Eviction falls back to the host resolver.
  if (map.size >= 1000) map.delete(map.keys().next().value!);
  map.set(ref.id, message);
}
export async function recordFor(
  ref: ResourceRef,
  s: ExecutionServices,
): Promise<ReferenceRecord> {
  assertScope(ref, s.context.scope);
  const resolved = await s.resources.resolve(ref, s.context);
  requireThat(
    equivalent(resolved, ref),
    "SCOPE_MISMATCH",
    "Resolved reference differs from requested resource.",
  );
  const record = s.transactions.transaction((tx) =>
    tx.get("references", ref.id),
  );
  requireThat(
    record &&
      sameScope(record.scope, ref.scope) &&
      equivalent(record.reference, ref),
    "RESOURCE_NOT_FOUND",
    "Authoritative resource mapping is unavailable.",
  );
  return record;
}
export async function targetSpace(
  ref: ResourceRef,
  s: ExecutionServices,
  options: TextMessageOptions,
): Promise<Space> {
  const record = await recordFor(ref, s);
  requireThat(
    ref.kind === "space",
    "INVALID_REQUEST",
    "Expected a space reference.",
  );
  const space = await s.resources.space(ref, s.context);
  checkSpace(space, s, options);
  requireThat(
    space.id === record.providerId,
    "SCOPE_MISMATCH",
    "Resolved SDK space differs from its mapping.",
  );
  return space;
}
export async function targetMessage(
  ref: ResourceRef,
  s: ExecutionServices,
  options: TextMessageOptions,
  owned = false,
): Promise<Message> {
  const record = await recordFor(ref, s);
  requireThat(
    ref.kind === "message" || ref.kind === "reaction",
    "INVALID_REQUEST",
    "Expected a message or reaction reference.",
  );
  if (owned)
    requireThat(
      record.ownedByPrincipalId === s.context.principalId,
      "FORBIDDEN",
      "This principal does not own the target.",
    );
  const message =
    handles.get(s.resources)?.get(ref.id) ??
    (await s.resources.message(ref, s.context));
  requireThat(
    message,
    "RESOURCE_NOT_FOUND",
    "The actual SDK target handle is unavailable.",
  );
  checkMessage(message, s, options);
  requireThat(
    message.id === record.providerId,
    "SCOPE_MISMATCH",
    "SDK target does not match its authoritative mapping.",
  );
  if (owned)
    requireThat(
      message.direction === "outbound",
      "FORBIDDEN",
      "Only bot-owned outbound targets can be mutated.",
    );
  if (ref.kind === "reaction") {
    requireThat(
      message.content.type === "reaction",
      "UNAVAILABLE",
      "Actual reaction handle and target metadata are required.",
    );
    const parent = await recordFor(
      { version: 1, kind: "message", id: ref.messageId, scope: ref.scope },
      s,
    );
    checkMessage(message.content.target, s, options);
    requireThat(
      message.content.target.id === parent.providerId,
      "SCOPE_MISMATCH",
      "Reaction target differs from its authorized parent.",
    );
  }
  return message;
}

import type { ExecutionServices as PublicServices } from "../../contracts/services.js";
import type { MessageRef, ReactionRef } from "../../contracts/references.js";
import { checkPublicSpace, type PublicTextMessageOptions } from "./sdk.js";
/** Resolve the shared domain record before handing a reference to the existing SDK owner. */
export async function publicRecordFor(
  ref: ResourceRef,
  s: PublicServices,
): Promise<ReferenceRecord> {
  s.assertActiveClaim();
  assertScope(ref, s.context.scope);
  const resolved = await s.resolveResource(ref);
  s.assertActiveClaim();
  requireThat(
    equivalent(resolved, ref),
    "SCOPE_MISMATCH",
    "Resource resolution changed identity.",
  );
  const record = s.transaction((unit) => unit.get("references", ref.id));
  requireThat(
    record &&
      sameScope(record.scope, ref.scope) &&
      equivalent(record.reference, ref),
    "RESOURCE_NOT_FOUND",
    "Authoritative reference mapping is unavailable.",
  );
  return record;
}
export async function resolveTextSpace(
  ref: Extract<ResourceRef, { kind: "space" }>,
  s: PublicServices,
  o: PublicTextMessageOptions,
): Promise<Space> {
  const record = await publicRecordFor(ref, s);
  const space = await o.resources.space(ref, s.context);
  s.assertActiveClaim();
  checkPublicSpace(space, s, o);
  requireThat(
    space.id === record.providerId,
    "SCOPE_MISMATCH",
    "SDK space differs from its mapping.",
  );
  return space;
}
/** Ownership is checked on authoritative records and actual SDK direction, never caller claims. */
export async function resolveMessageTarget(
  ref: MessageRef | ReactionRef,
  s: PublicServices,
  o: PublicTextMessageOptions,
  owned = false,
): Promise<Message> {
  const record = await publicRecordFor(ref, s);
  if (owned)
    requireThat(
      record.ownedByPrincipalId === s.context.principalId,
      "FORBIDDEN",
      "Target belongs to another principal.",
    );
  const message = await o.resources.message(ref, s.context);
  s.assertActiveClaim();
  requireThat(
    message,
    "RESOURCE_NOT_FOUND",
    "Actual SDK target is unavailable.",
  );
  checkPublicSpace(message.space, s, o);
  requireThat(
    message.id === record.providerId && message.platform === "imessage",
    "SCOPE_MISMATCH",
    "SDK target differs from its mapping.",
  );
  requireThat(
    message.direction === "inbound" || message.direction === "outbound",
    "FORBIDDEN",
    "Target direction is unknown.",
  );
  if (owned)
    requireThat(
      message.direction === "outbound",
      "FORBIDDEN",
      "Only owned outbound messages can be mutated.",
    );
  return message;
}
/** Removing a tapback requires the real bot reaction and its authorized parent handle. */
export async function resolveReactionTarget(
  ref: ReactionRef,
  s: PublicServices,
  o: PublicTextMessageOptions,
): Promise<Message> {
  const reaction = await resolveMessageTarget(ref, s, o, true);
  requireThat(
    reaction.content.type === "reaction",
    "UNAVAILABLE",
    "Actual reaction content is required.",
  );
  const parent = await resolveMessageTarget(
    { version: 1, kind: "message", id: ref.messageId, scope: ref.scope },
    s,
    o,
  );
  checkPublicSpace(reaction.content.target.space, s, o);
  requireThat(
    reaction.content.target.id === parent.id &&
      reaction.content.target.platform === parent.platform,
    "SCOPE_MISMATCH",
    "Reaction parent differs from the authorized target.",
  );
  return reaction;
}

/** Fetch current provider metadata only after resolving the authorized target and containing chat. */
export async function getMessageTarget(
  ref: MessageRef,
  s: PublicServices,
  o: PublicTextMessageOptions,
): Promise<Message> {
  const resolved = await resolveMessageTarget(ref, s, o);
  const current = await resolved.space.getMessage(resolved.id);
  s.assertActiveClaim();
  requireThat(
    current,
    "RESOURCE_NOT_FOUND",
    "Provider could not retrieve the authorized target.",
  );
  checkPublicSpace(current.space, s, o);
  requireThat(
    current.id === resolved.id &&
      current.platform === "imessage" &&
      current.direction === resolved.direction,
    "SCOPE_MISMATCH",
    "Provider retrieval changed the target identity or direction.",
  );
  return current;
}
