import type { ChildExecution as ChildSpec } from "../../contracts/services.js";
import {
  sameScope,
  type OperationResult,
} from "../../contracts/index.js";
import type { Claim } from "../../state/index.js";
import type { ExecutionClaims } from "./claims.js";
import { childIdentity, digest } from "./idempotency.js";
import { cleanResult } from "./outcomes.js";
import { saveOutbox } from "./submission.js";
import { fault, RuntimeFault } from "./errors.js";
import { withDeadline } from "./cancellation.js";

export interface ExecuteChildOptions {
  claims: ExecutionClaims;
  requestId: string;
  claim: Claim;
  child: ChildSpec;
  controller: AbortController;
  deadlineMs: number;
}

function validateReturnedResult(
  result: OperationResult,
  operation: string,
  scope: Parameters<typeof sameScope>[0],
): void {
  if (
    result.references.some((reference) =>
      operation === "space.create"
        ? reference.kind !== "space" ||
          reference.scope.projectId !== scope.projectId ||
          reference.scope.provider !== scope.provider ||
          reference.scope.accountId !== scope.accountId ||
          reference.scope.lineId !== scope.lineId
        : !sameScope(reference.scope, scope),
    )
  )
    fault("SCOPE_MISMATCH");
  if (result.status === "queued" || result.status === "unknown-outcome")
    fault("UNKNOWN_OUTCOME");
  if (
    result.status === "provider-accepted" &&
    !result.observations.some((observation) => observation.kind === "accepted")
  )
    fault("UNKNOWN_OUTCOME");
  if (
    result.status === "observed-delivered" &&
    !result.observations.some(
      (observation) =>
        observation.kind === "delivered" &&
        observation.source !== "sdk-return",
    )
  )
    fault("UNKNOWN_OUTCOME");
  if (
    result.status === "observed-read" &&
    !result.observations.some(
      (observation) =>
        observation.kind === "read" && observation.source !== "sdk-return",
    )
  )
    fault("UNKNOWN_OUTCOME");
}

function markUnknown(
  options: ExecuteChildOptions,
  attemptId: string,
  childId: string,
): void {
  try {
    options.claims.store.transaction((tx) => {
      const row = options.claims.held(
        tx,
        options.requestId,
        options.claim,
      );
      const attempt = tx.get("attempts", attemptId);
      const child = tx.get("children", childId);
      const now = options.claims.contexts.clock.now();
      if (attempt && attempt.phase !== "returned") {
        const revision = attempt.revision;
        attempt.phase = "unknown";
        attempt.finishedAt = now;
        attempt.revision++;
        tx.put("attempts", attempt, revision);
      }
      if (child && child.state !== "completed") {
        const revision = child.revision;
        child.state = "unknown";
        child.revision++;
        tx.put("children", child, revision);
      }
      row.result.status = "unknown-outcome";
      row.result.error = {
        code: "UNKNOWN_OUTCOME",
        message: "UNKNOWN_OUTCOME",
        retry: "reconcile-first",
      };
      row.claim = null;
      saveOutbox(tx, row, now);
    });
  } catch {
    // A newer fence owns resolution. Durable dispatching intent remains recoverable.
  }
}

/** Journal and execute one trusted consequential child without replaying completed work. */
export async function executeChild(
  options: ExecuteChildOptions,
): Promise<OperationResult> {
  const { child, claims, claim, requestId, controller } = options;
  if (
    !Number.isInteger(child.index) ||
    child.index < 0 ||
    child.index >= 128 ||
    !/^[A-Za-z0-9_:+.@/-]{1,200}$/.test(child.key) ||
    !/^[a-f0-9]{64}$/.test(child.argumentsDigest) ||
    !Number.isInteger(options.deadlineMs) ||
    options.deadlineMs < 10 ||
    options.deadlineMs > 60000
  )
    return fault("INVALID_REQUEST");
  const childId = childIdentity(requestId, child.index);
  const stableKey = digest([child.key, child.argumentsDigest]);
  const attemptId = digest([childId, claim.fence]);
  const existing = claims.store.transaction((tx) => {
    const { row } = claims.writable(tx, requestId, claim);
    const prior = tx.get("children", childId);
    if (prior && prior.stableKey !== stableKey)
      fault("IDEMPOTENCY_CONFLICT");
    if (prior?.state === "completed") {
      const checkpoint = tx.get("checkpoints", childId);
      if (
        !checkpoint ||
        checkpoint.codecId !== "wt01-execute-child" ||
        checkpoint.codecVersion !== 1
      )
        fault("INTERNAL");
      return cleanResult(JSON.parse(checkpoint.payloadJson));
    }
    if (prior?.state === "dispatching" || prior?.state === "unknown")
      fault("UNKNOWN_OUTCOME");
    if (
      child.index > 0 &&
      tx.get("children", childIdentity(requestId, child.index - 1))?.state !==
        "completed"
    )
      fault("INVALID_REQUEST");
    if (!prior) {
      tx.put(
        "children",
        {
          id: childId,
          scope: row.scope,
          revision: 0,
          requestId,
          index: child.index,
          stableKey,
          state: "pending",
          references: [],
        },
        null,
      );
    }
    const attempt = tx.get("attempts", attemptId);
    if (attempt && attempt.phase !== "prepared") fault("UNKNOWN_OUTCOME");
    if (!attempt)
      tx.put(
        "attempts",
        {
          id: attemptId,
          scope: row.scope,
          revision: 0,
          requestId,
          claim,
          phase: "prepared",
          providerIdempotencyKey: null,
          startedAt: claims.contexts.clock.now(),
          finishedAt: null,
        },
        null,
      );
    return null;
  });
  if (existing) return existing;

  claims.store.transaction((tx) => {
    claims.writable(tx, requestId, claim);
    if (controller.signal.aborted) fault("CANCELLED");
    const attempt = tx.get("attempts", attemptId);
    const savedChild = tx.get("children", childId);
    if (!attempt || !savedChild) fault("INTERNAL");
    const attemptRevision = attempt.revision;
    attempt.phase = "dispatching";
    attempt.revision++;
    tx.put("attempts", attempt, attemptRevision);
    const childRevision = savedChild.revision;
    savedChild.state = "dispatching";
    savedChild.revision++;
    tx.put("children", savedChild, childRevision);
  });

  let result: OperationResult;
  try {
    result = cleanResult(
      await withDeadline(
        () => child.dispatch(controller.signal),
        controller,
        options.deadlineMs,
      ),
    );
    const row = claims.store.transaction((tx) =>
      claims.held(tx, requestId, claim),
    );
    validateReturnedResult(result, row.action.operation, row.scope);
  } catch {
    markUnknown(options, attemptId, childId);
    throw new RuntimeFault("UNKNOWN_OUTCOME", "reconcile-first");
  }

  try {
    claims.store.transaction((tx) => {
      // Use held, not writable: cancellation/revocation after dispatch cannot erase an actual return.
      const row = claims.held(tx, requestId, claim);
      const attempt = tx.get("attempts", attemptId);
      const savedChild = tx.get("children", childId);
      if (!attempt || !savedChild) fault("INTERNAL");
      validateReturnedResult(result, row.action.operation, row.scope);
      const now = claims.contexts.clock.now();
      const attemptRevision = attempt.revision;
      attempt.phase = "returned";
      attempt.finishedAt = now;
      attempt.revision++;
      tx.put("attempts", attempt, attemptRevision);
      const childRevision = savedChild.revision;
      savedChild.state = "completed";
      savedChild.references = result.references;
      savedChild.revision++;
      tx.put("children", savedChild, childRevision);
      const checkpoint = tx.get("checkpoints", childId);
      tx.put(
        "checkpoints",
        {
          id: childId,
          scope: row.scope,
          revision: checkpoint ? checkpoint.revision + 1 : 0,
          requestId,
          codecId: "wt01-execute-child",
          codecVersion: 1,
          payloadJson: JSON.stringify(result),
          nextChildIndex: child.index + 1,
          claim,
        },
        checkpoint?.revision ?? null,
      );
      row.result.references = [
        ...new Map(
          [...row.result.references, ...result.references].map((reference) => [
            digest(reference),
            reference,
          ]),
        ).values(),
      ];
      row.result.observations = [
        ...row.result.observations,
        ...result.observations,
      ].slice(-100);
      saveOutbox(tx, row, now);
    });
  } catch {
    markUnknown(options, attemptId, childId);
    throw new RuntimeFault("UNKNOWN_OUTCOME", "reconcile-first");
  }
  return result;
}
