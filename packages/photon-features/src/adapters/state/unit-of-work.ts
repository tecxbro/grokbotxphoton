import {
  incomingEventSchema,
  sameScope,
  type EventReducer,
  type IncomingEvent,
  type TrustedContext,
  type WakeAdapter,
  type Clock,
} from "../../contracts/index.js";
import type { HandoffRecord, TransactionStore } from "../../state/index.js";
import type { StateTables, Transaction } from "../../state/index.js";
import type {
  ContinuationSpec,
  DomainTable,
  UnitOfWork,
} from "../../contracts/store.js";
import type { Claim } from "../../state/index.js";
import type { ExecutionClaims } from "../../runtime/core/claims.js";
import { digest, canonical } from "../../runtime/core/idempotency.js";
import { fault } from "../../runtime/core/errors.js";
function stableEvent(event: IncomingEvent): unknown {
  const { receivedAt: _, ...identity } = event;
  return identity;
}
export function eventIdentity(event: IncomingEvent): string {
  return digest([
    event.ordering.source,
    event.scope.projectId,
    event.scope.provider,
    event.scope.accountId,
    event.scope.lineId,
    event.providerEventId ?? event.eventId,
  ]);
}
/** Reducer state, inbox disposition and continuation are one F0 synchronous transaction. */
export async function applyInteraction(
  store: TransactionStore,
  eventInput: IncomingEvent,
  context: TrustedContext,
  reducer: EventReducer | undefined,
  wake: WakeAdapter,
  clock: Clock,
): Promise<{
  handoffId: string | null;
  wake: "accepted" | "failed" | "unknown" | "not-needed";
}> {
  const event = incomingEventSchema.parse(eventInput);
  if (!sameScope(event.scope, context.scope)) fault("SCOPE_MISMATCH");
  const id = eventIdentity(event),
    handoffId = digest([
      id,
      context.principalId,
      context.taskId,
      context.generation,
    ]);
  const persisted = store.transaction((tx) => {
    const existing = tx.get("inbox", id);
    if (existing) {
      if (
        canonical(stableEvent(existing.event)) !== canonical(stableEvent(event))
      )
        fault("IDEMPOTENCY_CONFLICT");
      return tx.get("handoffs", handoffId) ?? null;
    }
    const task = tx.get("tasks", context.taskId),
      grant = tx.get("contexts", context.contextId);
    if (
      !task ||
      task.generation !== context.generation ||
      task.cancelledAt !== null ||
      task.principalId !== context.principalId ||
      !sameScope(task.scope, context.scope) ||
      !grant ||
      grant.context.revokedAt !== null ||
      grant.context.principalId !== context.principalId ||
      grant.context.generation !== context.generation ||
      grant.context.taskId !== context.taskId ||
      !sameScope(grant.context.scope, context.scope) ||
      grant.context.issuedAt > clock.now() ||
      grant.context.expiresAt <= clock.now()
    )
      fault("STALE_GENERATION");
    tx.put(
      "inbox",
      {
        id,
        scope: event.scope,
        revision: 0,
        event,
        state: reducer ? "reduced" : "unresolved",
      },
      null,
    );
    if (!reducer) {
      tx.put(
        "unresolved",
        {
          id,
          scope: event.scope,
          revision: 0,
          eventId: id,
          reason: "NO_REGISTERED_REDUCER",
          checkpointId: null,
        },
        null,
      );
      return null;
    }
    if (reducer.type !== event.type) fault("INVALID_REQUEST");
    const reduction: unknown = reducer.reduce(event, tx);
    if (
      reduction !== null &&
      (typeof reduction === "object" || typeof reduction === "function") &&
      "then" in reduction
    ) {
      void Promise.resolve(reduction).catch(() => {});
      fault("INVALID_REQUEST");
    }
    const handoff: HandoffRecord = {
      id: handoffId,
      scope: event.scope,
      revision: 0,
      taskId: context.taskId,
      generation: context.generation,
      principalId: context.principalId,
      eventIds: [id],
      state: "pending",
      claim: null,
      createdAt: event.receivedAt,
    };
    tx.put("handoffs", handoff, null);
    return handoff;
  });
  if (
    !persisted ||
    persisted.state === "acknowledged" ||
    persisted.state === "cancelled"
  )
    return { handoffId: persisted?.id ?? null, wake: "not-needed" };
  try {
    return {
      handoffId,
      wake: (
        await wake.wake({
          handoffId,
          taskId: context.taskId,
          generation: context.generation,
        })
      ).status,
    };
  } catch {
    return { handoffId, wake: "unknown" };
  }
}

const domainTables: readonly DomainTable[] = [
  "references",
  "polls",
  "votes",
  "cards",
  "sessions",
  "stagedMedia",
  "streams",
];

function domainRecordAllowed<K extends DomainTable>(
  tx: Transaction,
  table: K,
  row: StateTables[K],
  context: TrustedContext,
): boolean {
  if (!domainTables.includes(table) || !sameScope(row.scope, context.scope))
    return false;
  if (table === "references") {
    const reference = row as StateTables["references"];
    return (
      sameScope(reference.reference.scope, context.scope) &&
      reference.ownedByPrincipalId === context.principalId &&
      reference.taskId === context.taskId &&
      reference.generation === context.generation
    );
  }
  if (table === "stagedMedia") {
    const media = row as StateTables["stagedMedia"];
    return (
      media.principalId === context.principalId &&
      media.taskId === context.taskId &&
      media.generation === context.generation
    );
  }
  if (table === "streams") {
    const stream = row as StateTables["streams"];
    return (
      sameScope(stream.reference.scope, context.scope) &&
      stream.principalId === context.principalId &&
      stream.taskId === context.taskId &&
      stream.reference.generation === context.generation
    );
  }
  const ownerId =
    table === "votes"
      ? (row as StateTables["votes"]).pollId
      : "reference" in row
        ? row.reference.id
        : undefined;
  if (!ownerId) return false;
  const owner = tx.get("references", ownerId);
  return !!(
    owner &&
    owner.ownedByPrincipalId === context.principalId &&
    owner.taskId === context.taskId &&
    owner.generation === context.generation &&
    sameScope(owner.scope, context.scope)
  );
}

export interface UnitOfWorkTransactionOptions<T> {
  claims: ExecutionClaims;
  requestId: string;
  claim: Claim;
  run(unit: UnitOfWork): T extends PromiseLike<unknown> ? never : T;
  /** Called after commit with a pointer only. Throwing cannot roll the committed transaction back. */
  afterCommit?(pointer: {
    handoffId: string;
    taskId: string;
    generation: number;
  }): void;
}

/** Run one synchronous, fenced domain transaction and atomically persist its continuations. */
export function runUnitOfWorkTransaction<T>(
  options: UnitOfWorkTransactionOptions<T>,
): T {
  const pendingWake: {
    handoffId: string;
    taskId: string;
    generation: number;
  }[] = [];
  const result = options.claims.store.transaction((tx) => {
    const { context } = options.claims.writable(
      tx,
      options.requestId,
      options.claim,
    );
    let open = true;
    const guard = () => {
      if (!open) fault("FORBIDDEN");
    };
    const unit: UnitOfWork = {
      get: <K extends DomainTable>(table: K, id: string) => {
        guard();
        if (!domainTables.includes(table)) return fault("FORBIDDEN");
        const row = tx.get(table, id);
        return row && domainRecordAllowed(tx, table, row, context)
          ? row
          : undefined;
      },
      put: <K extends DomainTable>(
        table: K,
        record: StateTables[K],
        expectedRevision: number | null,
      ) => {
        guard();
        if (!domainRecordAllowed(tx, table, record, context))
          fault("FORBIDDEN");
        const existing = tx.get(table, record.id);
        if (existing && !domainRecordAllowed(tx, table, existing, context))
          fault("FORBIDDEN");
        tx.put(table, record, expectedRevision);
      },
      createContinuation: (spec: ContinuationSpec) => {
        guard();
        if (
          !/^[A-Za-z0-9_:+.@/-]{1,200}$/.test(spec.id) ||
          !/^[A-Za-z0-9_:+.@/-]{1,200}$/.test(spec.resumeKey) ||
          !Array.isArray(spec.eventIds) ||
          spec.eventIds.length < 1 ||
          spec.eventIds.length > 128 ||
          new Set(spec.eventIds).size !== spec.eventIds.length
        )
          fault("INVALID_REQUEST");
        for (const eventId of spec.eventIds) {
          const event = tx.get("inbox", eventId);
          if (!event || !sameScope(event.scope, context.scope))
            fault("RESOURCE_NOT_FOUND");
        }
        const handoffId = digest([
          options.requestId,
          "continuation",
          spec.id,
        ]);
        const encoded = canonical({
          id: spec.id,
          eventIds: [...spec.eventIds],
          resumeKey: spec.resumeKey,
        });
        const prior = tx.get("handoffs", handoffId);
        const checkpoint = tx.get("checkpoints", handoffId);
        if (prior || checkpoint) {
          if (
            !prior ||
            !checkpoint ||
            checkpoint.codecId !== "wt01-continuation" ||
            checkpoint.codecVersion !== 1 ||
            checkpoint.payloadJson !== encoded ||
            canonical(prior.eventIds) !== canonical(spec.eventIds)
          )
            fault("IDEMPOTENCY_CONFLICT");
          return;
        }
        const handoff: HandoffRecord = {
          id: handoffId,
          scope: context.scope,
          revision: 0,
          taskId: context.taskId,
          generation: context.generation,
          principalId: context.principalId,
          eventIds: [...spec.eventIds],
          state: "pending",
          claim: null,
          createdAt: options.claims.contexts.clock.now(),
        };
        tx.put("handoffs", handoff, null);
        tx.put(
          "checkpoints",
          {
            id: handoffId,
            scope: context.scope,
            revision: 0,
            requestId: options.requestId,
            codecId: "wt01-continuation",
            codecVersion: 1,
            payloadJson: encoded,
            nextChildIndex: 0,
            claim: options.claim,
          },
          null,
        );
        pendingWake.push({
          handoffId,
          taskId: context.taskId,
          generation: context.generation,
        });
      },
    };
    try {
      return options.run(unit);
    } finally {
      open = false;
    }
  });
  for (const pointer of pendingWake) {
    try {
      options.afterCommit?.(pointer);
    } catch {
      // Durable work remains listable when a local wake adapter is unavailable.
    }
  }
  return result;
}
