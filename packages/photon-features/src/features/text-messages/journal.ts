import { digest } from "./identity.js";
import type { Message } from "spectrum-ts";
import {
  assertClaim,
  sameScope,
  type Action,
  type ExecutionServices,
  type OperationResult,
  type ResourceRef,
  type Transaction,
  type OutboxRecord,
} from "../../index.js";
import { FeatureError, requireThat } from "./errors.js";
import { remember } from "./targets.js";
import { checkMessage, type TextMessageOptions } from "./sdk.js";
export const codecId = "wt03-children";

export class Journal {
  readonly requestId: string;
  readonly references: ResourceRef[] = [];
  constructor(
    readonly action: Action,
    readonly services: ExecutionServices,
    readonly options: TextMessageOptions,
  ) {
    this.requestId = options.requestId(action, services);
    services.transactions.transaction((tx) => this.guard(tx));
  }
  guard(tx: Transaction): OutboxRecord {
    const s = this.services,
      c = s.context;
    requireThat(!s.signal.aborted, "CANCELLED", "Execution was cancelled.");
    requireThat(
      c.revokedAt === null && c.expiresAt > s.clock.now(),
      "CONTEXT_EXPIRED",
      "Context is no longer active.",
    );
    requireThat(
      c.contextId === this.action.contextId &&
        c.permissions.includes(this.action.operation),
      "FORBIDDEN",
      "Context does not authorize this operation.",
    );
    const parent = tx.get("outbox", this.requestId),
      task = tx.get("tasks", c.taskId);
    requireThat(
      parent && task && parent.claim,
      "UNAVAILABLE",
      "Shared executor outbox, task and claim are required.",
    );
    requireThat(
      sameScope(parent.scope, c.scope) &&
        sameScope(task.scope, c.scope) &&
        parent.principalId === c.principalId &&
        task.principalId === c.principalId &&
        parent.taskId === c.taskId &&
        parent.generation === c.generation &&
        digest(parent.action) === digest(this.action),
      "FORBIDDEN",
      "Outbox does not match this authorized action.",
    );
    assertClaim(
      s.claim,
      {
        owner: parent.claim.owner,
        fence: parent.claim.fence,
        generation: task.generation,
        cancelled:
          task.cancelledAt !== null || parent.cancellationRequestedAt !== null,
      },
      s.clock.now(),
    );
    requireThat(
      parent.claim.leaseUntil > s.clock.now() &&
        s.claim.generation === c.generation,
      "STALE_FENCE",
      "Executor lease is no longer active.",
    );
    return parent;
  }
  result(
    status: OperationResult["status"] = "executor-completed",
  ): OperationResult {
    return {
      version: 1,
      requestId: this.requestId,
      revision: 0,
      status,
      updatedAt: this.services.clock.now(),
      references: [...this.references],
      observations: [],
    };
  }
  /** A group reserves all its children together. There is no unobservable per-part replay. */
  async run(
    index: number,
    count: number,
    identity: unknown,
    prepare: () => Promise<() => Promise<Message | undefined | void>>,
    control?: ResourceRef,
    reactionParent?: string,
  ): Promise<void> {
    const s = this.services;
    const ids = Array.from(
      { length: count },
      (_, offset) => `wt03-${digest([this.requestId, index + offset])}`,
    );
    const stableKey = digest(identity);
    const previous = s.transactions.transaction((tx) => {
      this.guard(tx);
      return ids.map((id) => tx.get("children", id));
    });
    for (const child of previous)
      if (child)
        requireThat(
          child.requestId === this.requestId &&
            sameScope(child.scope, s.context.scope) &&
            child.stableKey === stableKey,
          "IDEMPOTENCY_CONFLICT",
          "Child identity changed.",
        );
    if (previous.every((child) => child?.state === "completed")) {
      this.references.push(...previous.flatMap((child) => child!.references));
      return;
    }
    requireThat(
      previous.every((child) => !child || child.state === "pending"),
      "UNKNOWN_OUTCOME",
      "A child may already have reached the provider; reconciliation is required.",
    );
    // Compilation and deterministic validation precede dispatch. A failed later compiler can be retried safely.
    const dispatch = await prepare();
    s.transactions.transaction((tx) => {
      this.guard(tx);
      ids.forEach((id, offset) => {
        const old = tx.get("children", id);
        requireThat(
          !old || old.state === "pending",
          "UNKNOWN_OUTCOME",
          "Concurrent or previously dispatched child cannot be replayed.",
        );
        tx.put(
          "children",
          {
            id,
            scope: s.context.scope,
            revision: old ? old.revision + 1 : 0,
            requestId: this.requestId,
            index: index + offset,
            stableKey,
            state: "dispatching",
            references: [],
          },
          old?.revision ?? null,
        );
      });
    });
    let returned: Message | undefined | void;
    try {
      returned = await dispatch();
      requireThat(
        control || returned,
        "UNKNOWN_OUTCOME",
        "SDK returned no message; delivery is unconfirmed.",
      );
      const messages = returned
        ? returned.content.type === "group"
          ? returned.content.items
          : [returned]
        : [];
      requireThat(
        control || messages.length === count,
        "UNKNOWN_OUTCOME",
        "SDK did not return every grouped child outcome.",
      );
      const refs = control
        ? [control]
        : messages.map((message) => {
            checkMessage(message, s, this.options);
            requireThat(
              message.direction === "outbound",
              "UNKNOWN_OUTCOME",
              "Send returned a non-outbound message.",
            );
            if (reactionParent)
              requireThat(
                message.content.type === "reaction",
                "UNKNOWN_OUTCOME",
                "SDK did not return a reaction handle.",
              );
            const id = `wt03-${digest([s.context.scope, reactionParent ? "reaction" : "message", message.id])}`;
            return {
              version: 1 as const,
              kind: reactionParent
                ? ("reaction" as const)
                : ("message" as const),
              id,
              scope: s.context.scope,
              ...(reactionParent ? { messageId: reactionParent } : {}),
            } as ResourceRef;
          });
      s.transactions.transaction((tx) => {
        this.guard(tx);
        ids.forEach((id, offset) => {
          const old = tx.get("children", id)!;
          requireThat(
            old.state === "dispatching",
            "UNKNOWN_OUTCOME",
            "Child state changed during dispatch.",
          );
          tx.put(
            "children",
            {
              ...old,
              revision: old.revision + 1,
              state: "completed",
              references: [refs[offset]!],
            },
            old.revision,
          );
        });
        if (!control)
          refs.forEach((reference, i) => {
            const old = tx.get("references", reference.id);
            requireThat(
              !old ||
                (old.providerId === messages[i]!.id &&
                  sameScope(old.scope, reference.scope) &&
                  old.ownedByPrincipalId === s.context.principalId),
              "FORBIDDEN",
              "Returned resource conflicts with its existing owner.",
            );
            tx.put(
              "references",
              {
                id: reference.id,
                scope: reference.scope,
                revision: old ? old.revision + 1 : 0,
                reference,
                providerId: messages[i]!.id,
                ownedByPrincipalId: s.context.principalId,
                taskId: s.context.taskId,
                generation: s.context.generation,
              },
              old?.revision ?? null,
            );
          });
      });
      if (!control) refs.forEach((ref, i) => remember(s, ref, messages[i]!));
      this.references.push(...refs);
    } catch {
      // Do not turn network errors, cancellation, lost leases or failed persistence into definitely-unsent claims.
      try {
        s.transactions.transaction((tx) => {
          this.guard(tx);
          ids.forEach((id) => {
            const old = tx.get("children", id)!;
            if (old.state === "dispatching")
              tx.put(
                "children",
                { ...old, revision: old.revision + 1, state: "unknown" },
                old.revision,
              );
          });
        });
      } catch {
        /* Durable dispatching is itself an unknown outcome. */
      }
      throw new FeatureError(
        "UNKNOWN_OUTCOME",
        "Provider call started but its complete outcome could not be durably confirmed.",
      );
    }
  }
}
