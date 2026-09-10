import { createHash } from "node:crypto";
import { z } from "zod";
import { imessage } from "spectrum-ts/providers/imessage";
import {
  assertClaim, assertScope, parseAction, sameScope, resultSchema,
  type Action, type ExecutionServices, type OperationResult, type RuntimeError,
  type Transaction, type OutboxRecord, type ResourceRef,
} from "../../index.js";
import { scopedId, referenceOwner, type PollRef } from "./identity.js";
import { checkedSpace, compilePoll } from "./sdk.js";

export const pollOperations = ["poll.create", "poll.get", "poll.vote", "poll.unvote", "poll.addOption"] as const;
export const codecIdentity = { id: "wt-05-poll-create", version: 1 } as const;
export const checkpointSchema = z.strictObject({
  version: z.literal(1), operation: z.literal("poll.create"), digest: z.string().length(64),
  stage: z.enum(["dispatching", "completed", "unknown"]),
  choices: z.array(z.strictObject({ key: z.string(), label: z.string() })),
  result: resultSchema.optional(),
});

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export const actionDigest = (action: Action) => createHash("sha256").update(canonical(action)).digest("hex");

/** The host must pass an already-authorized, claimed row from its single outbox.
 * F0 lacks a request pointer, so match the unique scoped row; fail closed at the list bound.
 */
function currentRequest(tx: Transaction, action: Action, s: ExecutionServices): OutboxRecord {
  const c = s.context;
  if (action.contextId !== c.contextId || !c.permissions.includes(action.operation)) throw new Error("FORBIDDEN");
  if (c.revokedAt !== null) throw new Error("CONTEXT_REVOKED");
  if (c.expiresAt <= s.clock.now()) throw new Error("CONTEXT_EXPIRED");
  const grant = tx.get("contexts", c.contextId)?.context;
  if (!grant || canonical(grant) !== canonical(c)) throw new Error("CONTEXT_REVOKED");
  const task = tx.get("tasks", c.taskId);
  if (!task || !sameScope(task.scope, c.scope) || task.principalId !== c.principalId) throw new Error("FORBIDDEN");
  if (task.generation !== c.generation) throw new Error("STALE_GENERATION");
  if (task.cancelledAt !== null || s.signal.aborted) throw new Error("CANCELLED");
  const rows = tx.list("outbox", c.scope, 1000);
  if (rows.length === 1000) throw new Error("UNAVAILABLE");
  const candidates = rows.filter(r => r.principalId === c.principalId && r.taskId === c.taskId &&
    r.generation === c.generation && r.action.idempotencyKey === action.idempotencyKey);
  if (candidates.length !== 1) throw new Error("FORBIDDEN");
  const row = candidates[0]!;
  if (actionDigest(row.action) !== actionDigest(action)) throw new Error("IDEMPOTENCY_CONFLICT");
  if (!row.claim) throw new Error("STALE_FENCE");
  assertClaim(s.claim, {
    ...row.claim, cancelled: row.cancellationRequestedAt !== null,
  }, s.clock.now());
  if (row.claim.leaseUntil <= s.clock.now()) throw new Error("STALE_FENCE");
  return row;
}

function result(requestId: string, s: ExecutionServices, fields: Partial<OperationResult>): OperationResult {
  return { version: 1, requestId, status: "executor-completed", revision: 0,
    updatedAt: s.clock.now(), references: [], observations: [], ...fields };
}
function failure(requestId: string, s: ExecutionServices, code: RuntimeError["code"], message: string,
  status: OperationResult["status"] = "failed", blockerId?: string): OperationResult {
  return result(requestId, s, { status, error: {
    code, message, retry: status === "unknown-outcome" ? "reconcile-first" : "never", blockerId,
  } });
}

async function authorizeReferences(action: Action, s: ExecutionServices) {
  const args = action.arguments;
  const refs: ResourceRef[] = [];
  if ("space" in args) refs.push(args.space);
  if ("poll" in args) refs.push(args.poll);
  if ("option" in args && "pollId" in args.option) refs.push(args.option);
  for (const ref of refs) {
    assertScope(ref, s.context.scope);
    const resolved = await s.resources.resolve(ref, s.context);
    if (canonical(resolved) !== canonical(ref)) throw new Error("RESOURCE_NOT_FOUND");
    s.transactions.transaction(tx => {
      const owner = referenceOwner(tx, ref);
      if (owner.ownedByPrincipalId !== s.context.principalId || owner.taskId !== s.context.taskId ||
          owner.generation !== s.context.generation) throw new Error("FORBIDDEN");
    });
  }
}

export async function executePoll(input: Action, s: ExecutionServices): Promise<OperationResult> {
  let requestId = input.idempotencyKey;
  let dispatched = false;
  try {
    const action = parseAction(input);
    if (!pollOperations.includes(action.operation as typeof pollOperations[number])) throw new Error("INVALID_REQUEST");
    requestId = s.transactions.transaction(tx => currentRequest(tx, action, s).id);
    await authorizeReferences(action, s);
    if (action.operation !== "poll.create") return failure(requestId, s, "UNIMPLEMENTED",
      "The pinned public advanced poll API requires a host-owned extension not approved in F0.",
      "blocked", "wt-05-advanced-polls");

    const content = compilePoll(action.arguments.question, action.arguments.options);
    const space = checkedSpace(await s.resources.space(action.arguments.space, s.context));
    s.transactions.transaction(tx => {
      const native = referenceOwner(tx, action.arguments.space);
      if (native.providerId !== space.id) throw new Error("SCOPE_MISMATCH");
    });
    const checkpointId = scopedId("create", s.context.scope, requestId);
    const digest = actionDigest(action);
    const priorResult = s.transactions.transaction(tx => {
      currentRequest(tx, action, s);
      const prior = tx.get("checkpoints", checkpointId);
      if (prior) {
        const saved = checkpointSchema.parse(JSON.parse(prior.payloadJson));
        if (saved.digest !== digest) throw new Error("IDEMPOTENCY_CONFLICT");
        return saved.result ?? failure(requestId, s, "UNKNOWN_OUTCOME",
          "A previous dispatch may have created this poll; native outcome lookup is required before retry.", "unknown-outcome");
      }
      tx.put("checkpoints", {
        id: checkpointId, scope: s.context.scope, revision: 0, requestId,
        codecId: codecIdentity.id, codecVersion: 1, nextChildIndex: 0, claim: s.claim,
        payloadJson: JSON.stringify({ version: 1, operation: "poll.create", digest,
          stage: "dispatching", choices: action.arguments.options }),
      }, null);
      return undefined;
    });
    if (priorResult) return priorResult;
    // No awaits between the committed dispatch marker and the SDK call.
    dispatched = true;
    const message = await space.send(content);
    if (!message || message.platform !== "imessage" || message.direction !== "outbound" ||
        message.space.id !== space.id || imessage(message.space).phone !== imessage(space).phone ||
        message.content.type !== "poll") throw new Error("UNKNOWN_OUTCOME");
    const messageRef: Extract<ResourceRef, { kind: "message" }> = {
      version: 1, kind: "message", scope: s.context.scope,
      id: scopedId("message", s.context.scope, message.id),
    };
    const pollRef: PollRef = {
      version: 1, kind: "poll", scope: s.context.scope,
      id: scopedId("poll", s.context.scope, message.id), messageId: messageRef.id,
    };
    const accepted = result(requestId, s, { status: "provider-accepted", references: [messageRef, pollRef],
      observations: [{ kind: "accepted", source: "sdk-return", at: s.clock.now() }] });
    s.transactions.transaction(tx => {
      currentRequest(tx, action, s);
      const prior = tx.get("checkpoints", checkpointId)!;
      for (const reference of [messageRef, pollRef]) tx.put("references", {
        id: reference.id, reference, scope: s.context.scope, revision: 0, providerId: message.id,
        ownedByPrincipalId: s.context.principalId, taskId: s.context.taskId, generation: s.context.generation,
      }, null);
      // Spectrum's returned labels provide no native option identifiers. Keep them in the checkpoint.
      tx.put("polls", { id: pollRef.id, reference: pollRef, scope: s.context.scope, revision: 0,
        question: action.arguments.question, options: [] }, null);
      tx.put("checkpoints", { ...prior, revision: prior.revision + 1, payloadJson: JSON.stringify({
        version: 1, operation: "poll.create", digest, stage: "completed",
        choices: action.arguments.options, result: accepted,
      }) }, prior.revision);
    });
    return accepted;
  } catch (error) {
    if (dispatched) return failure(requestId, s, "UNKNOWN_OUTCOME",
      "Poll dispatch outcome is uncertain; automatic resend is disabled.", "unknown-outcome");
    const code = error instanceof Error ? error.message : "INTERNAL";
    const allowed = ["INVALID_REQUEST", "FORBIDDEN", "CONTEXT_REVOKED", "CONTEXT_EXPIRED", "STALE_GENERATION",
      "STALE_FENCE", "CANCELLED", "UNAVAILABLE", "IDEMPOTENCY_CONFLICT", "RESOURCE_NOT_FOUND", "SCOPE_MISMATCH", "UNSUPPORTED"] as const;
    const safe = allowed.find(c => c === code) ?? (error instanceof z.ZodError ? "INVALID_REQUEST" : "INTERNAL");
    return failure(requestId, s, safe, `Poll operation rejected: ${safe}.`);
  }
}

import { isDeepStrictEqual } from "node:util";
import { parseActionRequest } from "../../contracts/actions.js";
import type { ExecutionServices as F0ExecutionServices } from "../../contracts/services.js";
import { assertPollOwner, resolvePollIdentity, resolveOptionIdentity } from "./identity.js";
import { mapPollOperation, type PollProviderBinding, type PollAction } from "./sdk.js";

function f0Result(s: F0ExecutionServices, requestId: string, fields: Partial<OperationResult>): OperationResult {
  return { version: 1, requestId, status: "executor-completed", revision: 0,
    updatedAt: s.clock.now(), references: [], observations: [], ...fields };
}
function f0Failure(s: F0ExecutionServices, requestId: string, code: RuntimeError["code"], message: string,
  status: OperationResult["status"] = "failed", blockerId?: string): OperationResult {
  return f0Result(s, requestId, { status, error: { code, message,
    retry: status === "unknown-outcome" ? "reconcile-first" : "never", blockerId } });
}
function assertPollActionActive(action: Action, s: F0ExecutionServices): void {
  s.assertActiveClaim();
  const c = s.context;
  if (s.signal.aborted) throw new Error("CANCELLED");
  if (action.contextId !== c.contextId || !c.permissions.includes(action.operation)) throw new Error("FORBIDDEN");
  if (c.revokedAt !== null) throw new Error("CONTEXT_REVOKED");
  if (c.issuedAt > s.clock.now() || c.expiresAt <= s.clock.now()) throw new Error("CONTEXT_EXPIRED");
}

/** F0 handler. The shared executor owns dispatch intent, deduplication and uncertain recovery.
 * Provider work happens outside UoW. Cancellation after transmission cannot erase uncertainty.
 * Bindings are executable host code, never action arguments or a new SDK owner.
 */
export async function executePollOperation(input: Action, s: F0ExecutionServices,
  binding?: PollProviderBinding): Promise<OperationResult> {
  const requestId = input.idempotencyKey;
  let possibleTransmission = false;
  try {
    const action = parseActionRequest(input);
    if (!pollOperations.includes(action.operation as typeof pollOperations[number])) throw new Error("INVALID_REQUEST");
    assertPollActionActive(action, s);
    const refs: ResourceRef[] = [];
    if ("space" in action.arguments) refs.push(action.arguments.space);
    if ("poll" in action.arguments) refs.push(action.arguments.poll);
    if ("option" in action.arguments && "pollId" in action.arguments.option) refs.push(action.arguments.option);
    for (const ref of refs) {
      assertScope(ref, s.context.scope);
      const resolved = await s.resolveResource(ref);
      assertPollActionActive(action, s);
      if (!isDeepStrictEqual(resolved, ref)) throw new Error("RESOURCE_NOT_FOUND");
      s.transaction(unit => assertPollOwner(referenceOwner(unit, ref), s.context));
    }
    const args = action.arguments;
    if ("poll" in args) s.transaction(unit => {
      const p = resolvePollIdentity(unit, args.poll, s.context);
      if ("option" in args && "pollId" in args.option)
        resolveOptionIdentity(unit, p, args.option, s.context);
    });
    const mapped = mapPollOperation(action as PollAction);
    if (mapped.kind === "blocked") return f0Failure(s, requestId, "UNIMPLEMENTED", mapped.reason,
      "blocked", mapped.blockerId);
    if (action.operation !== "poll.create") throw new Error("INVALID_REQUEST");
    if (!binding) return f0Failure(s, requestId, "UNAVAILABLE", "Shared owner Spectrum space binding is missing.",
      "blocked", "wt-05-provider-binding");
    const space = checkedSpace(await binding.resolveSpace(action.arguments.space, s.context));
    assertPollActionActive(action, s);
    s.transaction(unit => {
      const owner = referenceOwner(unit, action.arguments.space);
      assertPollOwner(owner, s.context);
      if (owner.providerId !== space.id || imessage(space).phone !== s.context.scope.lineId)
        throw new Error("SCOPE_MISMATCH");
    });
    const childResult = await s.executeChild({ index: 0,
      key: scopedId("child", s.context.scope, s.context.taskId, s.context.generation, requestId),
      argumentsDigest: actionDigest(action),
      dispatch: async signal => {
        assertPollActionActive(action, s);
        if (signal.aborted) throw new Error("CANCELLED");
        possibleTransmission = true;
        try {
          const message = await space.send(mapped.content);
          if (!message || !message.id || message.platform !== "imessage" || message.direction !== "outbound" ||
              message.content.type !== "poll" || message.space.id !== space.id ||
              imessage(message.space).phone !== imessage(space).phone)
            throw new Error("UNKNOWN_OUTCOME");
          const messageRef: Extract<ResourceRef, { kind: "message" }> = {
            version: 1, kind: "message", scope: s.context.scope, id: scopedId("message", s.context.scope, message.id),
          };
          const pollRef: PollRef = { version: 1, kind: "poll", scope: s.context.scope,
            id: scopedId("poll", s.context.scope, message.id), messageId: messageRef.id };
          // Persist actual native GUID while the child remains unfinished. A failed commit is uncertain,
          // so runtime recovery must not resend. There is no feature-owned dispatch journal.
          s.transaction(unit => {
            assertPollActionActive(action, s);
            for (const reference of [messageRef, pollRef]) {
              const prior = unit.get("references", reference.id);
              if (prior) {
                assertPollOwner(prior, s.context);
                if (!isDeepStrictEqual(prior.reference, reference) || prior.providerId !== message.id)
                  throw new Error("POLL_IDENTITY_MISMATCH");
              } else unit.put("references", { id: reference.id, scope: s.context.scope, revision: 0,
                reference, providerId: message.id, ownedByPrincipalId: s.context.principalId,
                taskId: s.context.taskId, generation: s.context.generation }, null);
            }
            const prior = unit.get("polls", pollRef.id);
            if (prior && (!isDeepStrictEqual(prior.reference, pollRef) || prior.question !== action.arguments.question))
              throw new Error("POLL_IDENTITY_MISMATCH");
            if (!prior) unit.put("polls", { id: pollRef.id, scope: s.context.scope, revision: 0,
              reference: pollRef, question: action.arguments.question, options: [] }, null);
          });
          return f0Result(s, requestId, { status: "provider-accepted", references: [messageRef, pollRef],
            observations: [{ kind: "accepted", source: "sdk-return", at: s.clock.now() }] });
        } catch {
          return f0Failure(s, requestId, "UNKNOWN_OUTCOME", "Poll may have been transmitted; reconcile before retry.", "unknown-outcome");
        }
      },
    });
    // Returning recorded child evidence is valid even if cancellation wins after its dispatch.
    return { ...childResult, requestId };
  } catch (error) {
    if (possibleTransmission) return f0Failure(s, requestId, "UNKNOWN_OUTCOME",
      "Poll may have been transmitted; reconcile before retry.", "unknown-outcome");
    const message = error instanceof Error ? error.message : "INTERNAL";
    const codes = ["FORBIDDEN", "SCOPE_MISMATCH", "RESOURCE_NOT_FOUND", "CONTEXT_REVOKED", "CONTEXT_EXPIRED",
      "STALE_GENERATION", "STALE_FENCE", "CANCELLED", "UNSUPPORTED", "IDEMPOTENCY_CONFLICT", "INVALID_REQUEST"] as const;
    const invalid = error instanceof z.ZodError || ["POLL_OPTION_MISMATCH", "DUPLICATE_OPTION"].includes(message);
    const code = invalid ? "INVALID_REQUEST" : codes.find(code => code === message) ?? "INTERNAL";
    return f0Failure(s, requestId, code, `Poll operation rejected: ${code}.`);
  }
}
