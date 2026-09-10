import { sameScope, type OperationResult } from "../../contracts/index.js";
import type { Claim } from "../../state/index.js";
import { ExecutionClaims } from "./claims.js";
import { childIdentity, digest } from "./idempotency.js";
import {
  checkedCapability,
  cleanResult,
  ChildOutcome,
  type ExecutionBinding,
} from "./outcomes.js";
import { saveOutbox } from "./submission.js";
import { fault, RuntimeFault } from "./errors.js";
import { withDeadline } from "./cancellation.js";
export class ChildExecution {
  busy = false;
  invocations = 0;
  constructor(
    readonly claims: ExecutionClaims,
    readonly id: string,
    readonly claim: Claim,
    readonly binding: ExecutionBinding,
    readonly controller: AbortController,
    readonly deadlineMs: number,
  ) {}
  dispatch = async (
    index: number,
    send: () => Promise<OperationResult>,
  ): Promise<OperationResult> => {
    const { id, claim: held, binding, controller } = this;
    const clock = this.claims.contexts.clock;
    if (this.busy) fault("UNAVAILABLE");
    if (!Number.isInteger(index) || index < 0 || index >= 128)
      fault("INVALID_REQUEST");
    this.busy = true;
    this.invocations++;
    const childId = childIdentity(id, index),
      attemptId = digest([childId, held.fence]);
    try {
      const existing = this.claims.store.transaction((tx) => {
        const { row, context } = this.claims.writable(tx, id, held);
        checkedCapability(binding, context);
        const child = tx.get("children", childId);
        if (child?.state === "completed") {
          const saved = tx.get("checkpoints", childId);
          if (
            !saved ||
            saved.codecId !== "wt01-child-result" ||
            saved.codecVersion !== 1
          )
            fault("INTERNAL");
          return cleanResult(JSON.parse(saved.payloadJson));
        }
        if (child && child.state !== "pending") fault("UNKNOWN_OUTCOME");
        if (
          index > 0 &&
          tx.get("children", childIdentity(id, index - 1))?.state !==
            "completed"
        )
          fault("INVALID_REQUEST");
        if (!child)
          tx.put(
            "children",
            {
              id: childId,
              scope: row.scope,
              revision: 0,
              requestId: id,
              index,
              stableKey: childId,
              state: "pending",
              references: [],
            },
            null,
          );
        tx.put(
          "attempts",
          {
            id: attemptId,
            scope: row.scope,
            revision: 0,
            requestId: id,
            claim: held,
            phase: "prepared",
            providerIdempotencyKey: null,
            startedAt: clock.now(),
            finishedAt: null,
          },
          null,
        );
        return null;
      });
      if (existing) {
        if (["failed", "blocked", "cancelled"].includes(existing.status))
          throw new ChildOutcome(existing);
        return existing;
      }
      // No await between this last authorization/lease check and invoking the trusted call.
      this.claims.store.transaction((tx) => {
        const { context } = this.claims.writable(tx, id, held);
        checkedCapability(binding, context);
        if (controller.signal.aborted) fault("CANCELLED");
        const a = tx.get("attempts", attemptId)!,
          child = tx.get("children", childId)!;
        a.phase = "dispatching";
        a.revision++;
        tx.put("attempts", a, a.revision - 1);
        child.state = "dispatching";
        child.revision++;
        tx.put("children", child, child.revision - 1);
      });
      let result: OperationResult;
      try {
        result = cleanResult(
          await withDeadline(send, controller, this.deadlineMs),
        );
      } catch {
        this.unknown(id, held, attemptId, childId);
        throw new RuntimeFault("UNKNOWN_OUTCOME", "reconcile-first");
      }
      try {
        this.claims.store.transaction((tx) => {
          const { row } = this.claims.writable(tx, id, held);
          if (
            result.references.some((ref) =>
              row.action.operation === "space.create"
                ? ref.kind !== "space" ||
                  ref.scope.projectId !== row.scope.projectId ||
                  ref.scope.provider !== row.scope.provider ||
                  ref.scope.accountId !== row.scope.accountId ||
                  ref.scope.lineId !== row.scope.lineId
                : !sameScope(ref.scope, row.scope),
            )
          )
            fault("SCOPE_MISMATCH");
          if (
            ![
              "executor-completed",
              "provider-accepted",
              "observed-delivered",
              "observed-read",
              "failed",
              "blocked",
              "cancelled",
              "unknown-outcome",
            ].includes(result.status)
          )
            fault("INVALID_REQUEST");
          if (result.status === "unknown-outcome") fault("UNKNOWN_OUTCOME");
          // Provider delivery claims need corresponding evidence, never inferred from resolution.
          if (
            result.status === "provider-accepted" &&
            !result.observations.some((o) => o.kind === "accepted")
          )
            fault("UNKNOWN_OUTCOME");
          if (
            result.status === "observed-delivered" &&
            !result.observations.some(
              (o) => o.kind === "delivered" && o.source !== "sdk-return",
            )
          )
            fault("UNKNOWN_OUTCOME");
          if (
            result.status === "observed-read" &&
            !result.observations.some(
              (o) => o.kind === "read" && o.source !== "sdk-return",
            )
          )
            fault("UNKNOWN_OUTCOME");
          const a = tx.get("attempts", attemptId)!,
            child = tx.get("children", childId)!;
          a.phase = "returned";
          a.finishedAt = clock.now();
          a.revision++;
          tx.put("attempts", a, a.revision - 1);
          // Child completed means its outcome was recorded, not that it delivered.
          child.state = "completed";
          child.references = result.references;
          child.revision++;
          tx.put("children", child, child.revision - 1);
          const checkpoint = tx.get("checkpoints", childId);
          tx.put(
            "checkpoints",
            {
              id: childId,
              scope: row.scope,
              revision: checkpoint ? checkpoint.revision + 1 : 0,
              requestId: id,
              codecId: "wt01-child-result",
              codecVersion: 1,
              payloadJson: JSON.stringify(result),
              nextChildIndex: index + 1,
              claim: held,
            },
            checkpoint?.revision ?? null,
          );
          row.result.references = [
            ...new Map(
              [...row.result.references, ...result.references].map((ref) => [
                digest(ref),
                ref,
              ]),
            ).values(),
          ];
          row.result.observations = [
            ...row.result.observations,
            ...result.observations,
          ].slice(-100);
          saveOutbox(tx, row, clock.now());
        });
      } catch {
        this.unknown(id, held, attemptId, childId);
        throw new RuntimeFault("UNKNOWN_OUTCOME", "reconcile-first");
      }
      if (["failed", "blocked", "cancelled"].includes(result.status))
        throw new ChildOutcome(result);
      return result;
    } finally {
      this.busy = false;
    }
  };
  private unknown(
    id: string,
    claim: Claim,
    attemptId: string,
    childId: string,
  ): void {
    try {
      this.claims.store.transaction((tx) => {
        const row = this.claims.held(tx, id, claim),
          a = tx.get("attempts", attemptId),
          child = tx.get("children", childId);
        if (a) {
          a.phase = "unknown";
          a.finishedAt = this.claims.contexts.clock.now();
          a.revision++;
          tx.put("attempts", a, a.revision - 1);
        }
        if (child) {
          child.state = "unknown";
          child.revision++;
          tx.put("children", child, child.revision - 1);
        }
        row.result.status = "unknown-outcome";
        row.result.error = {
          code: "UNKNOWN_OUTCOME",
          message: "UNKNOWN_OUTCOME",
          retry: "reconcile-first",
        };
        saveOutbox(tx, row, this.claims.contexts.clock.now());
      });
    } catch {
      /* Lease loss leaves durable dispatching intent for recovery. */
    }
  }
}
