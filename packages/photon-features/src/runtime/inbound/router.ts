import {
  incomingEventSchema,
  sameScope,
  type Clock,
  type EventReducer,
  type IncomingEvent,
  type Scope,
} from "../../contracts/index.js";
import type {
  InboxRecord,
  Transaction,
  TransactionStore,
} from "../../state/index.js";
import {
  canonicalJson,
  opaqueId,
  scopeKey,
} from "../../adapters/transport/provider-context.js";

export class CorrelationPending extends Error {}
export interface TaskRoute {
  taskId: string;
  generation: number;
  principalId: string;
}
export interface InboundPolicy {
  /** Reads authoritative task routing in the same transaction as reduction. */
  route(event: IncomingEvent, tx: Transaction): TaskRoute | undefined;
  /** Explicit feature opt-in to a continuation (e.g. a correlated poll vote).
   * Receipts/reactions/group metadata/typing never become conversational input by default. */
  continuation?(event: IncomingEvent): boolean;
}
export const conversational = (e: IncomingEvent) =>
  e.direction === "inbound" && e.type === "message" && e.change === "created";
export const batchable = (e: IncomingEvent) =>
  conversational(e) && e.type === "message" && e.content.type === "text";
export function activeRoute(
  tx: Transaction,
  scope: Scope,
  route: TaskRoute,
): boolean {
  const task = tx.get("tasks", route.taskId);
  return (
    !!task &&
    sameScope(task.scope, scope) &&
    task.principalId === route.principalId &&
    task.generation === route.generation &&
    task.cancelledAt === null
  );
}
export class InboundRouter {
  private readonly reducers: Map<IncomingEvent["type"], EventReducer>;
  constructor(
    readonly store: TransactionStore,
    readonly clock: Clock,
    readonly policy: InboundPolicy,
    reducers: readonly EventReducer[],
  ) {
    this.reducers = new Map(reducers.map((r) => [r.type, r]));
    if (this.reducers.size !== reducers.length)
      throw new Error("DUPLICATE_REDUCER");
  }
  /** No wake or provider call here. Acknowledgement may follow this durable commit. */
  async accept(input: IncomingEvent): Promise<void> {
    const event = incomingEventSchema.parse(input);
    const checkReferences = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      if (
        "kind" in value &&
        "scope" in value &&
        !sameScope(value.scope as Scope, event.scope)
      )
        throw new Error("SCOPE_MISMATCH");
      for (const child of Object.values(value)) checkReferences(child);
    };
    checkReferences(event);
    this.store.transaction((tx) => {
      const prior = tx.get("inbox", event.eventId);
      if (prior) {
        if (!sameScope(prior.scope, event.scope))
          throw new Error("EVENT_ID_COLLISION");
        const { receivedAt: _a, ...a } = prior.event,
          { receivedAt: _b, ...b } = event;
        if (prior.event.type === "unresolved" && event.type !== "unresolved") {
          const stable = (e: IncomingEvent) => ({
            eventId: e.eventId,
            scope: e.scope,
            providerEventId: e.providerEventId,
            occurredAt: e.occurredAt,
            direction: e.direction,
            ordering: e.ordering,
          });
          if (
            canonicalJson(stable(prior.event)) !== canonicalJson(stable(event))
          )
            throw new Error("EVENT_ID_COLLISION");
          tx.put(
            "inbox",
            {
              ...prior,
              event: { ...event, receivedAt: prior.event.receivedAt },
              state: "pending",
              revision: prior.revision + 1,
            },
            prior.revision,
          );
        } else if (a.type === "unresolved" && b.type === "unresolved") {
          // A new authenticated delivery may have its own durable capture path.
          // Keep the first pointer; callback/capture identity is not event identity.
          const { quarantineId: _oldCapture, ...oldEvent } = a;
          const { quarantineId: _newCapture, ...newEvent } = b;
          if (canonicalJson(oldEvent) !== canonicalJson(newEvent))
            throw new Error("EVENT_ID_COLLISION");
        } else if (canonicalJson(a) !== canonicalJson(b))
          throw new Error("EVENT_ID_COLLISION");
        return;
      }
      tx.put(
        "inbox",
        {
          id: event.eventId,
          scope: event.scope,
          revision: 0,
          event,
          state: "pending",
        },
        null,
      );
    });
    // Reduction failure leaves the already committed event pending for replay.
    if (!batchable(event)) this.reduce([event.eventId]);
  }
  reduce(ids: readonly string[]): string | undefined {
    try {
      return this.store.transaction((tx) => {
        const records = ids
          .map((id) => tx.get("inbox", id))
          .filter((r): r is InboxRecord => !!r && r.state !== "reduced");
        if (!records.length) return;
        const first = records[0]!;
        let route: TaskRoute | undefined;
        const continuationIds: string[] = [];
        for (const row of records) {
          const e = row.event;
          let wantsWork = false;
          let eventRoute: TaskRoute | undefined;
          if (!sameScope(first.scope, row.scope))
            throw new Error("SCOPE_MISMATCH");
          if (e.type === "unresolved") throw new CorrelationPending(e.reason);
          if (e.direction !== "outbound") {
            const reducer = this.reducers.get(e.type);
            if (!conversational(e) && !reducer)
              throw new CorrelationPending("missing-feature-reducer");
            wantsWork =
              conversational(e) || (e.direction === "inbound" && ["poll", "reaction", "app-interaction"].includes(e.type) &&
                this.policy.continuation?.(e) === true);
            if (wantsWork) {
              const next = this.policy.route(e, tx);
              if (!next || !activeRoute(tx, row.scope, next))
                throw new CorrelationPending("missing-active-task");
              if (route && canonicalJson(route) !== canonicalJson(next))
                throw new CorrelationPending("mixed-task-batch");
              route = next;
              eventRoute = next;
            }
            const reduced: unknown = reducer?.reduce(e, tx);
            if (
              reduced !== null &&
              (typeof reduced === "object" || typeof reduced === "function") &&
              "then" in reduced
            ) {
              // TypeScript permits async functions in void-returning slots. The
              // F0 transaction must never commit while a reducer is still running.
              void Promise.resolve(reduced).catch(() => undefined);
              throw new Error("ASYNC_REDUCER_FORBIDDEN");
            }
            if (wantsWork) {
              const continuationId =
                reduced && typeof reduced === "object" &&
                "continuationId" in reduced &&
                typeof reduced.continuationId === "string"
                  ? reduced.continuationId
                  : undefined;
              if (continuationId) {
                const handoff = tx.get("handoffs", continuationId);
                if (
                  !handoff ||
                  !eventRoute ||
                  !sameScope(handoff.scope, row.scope) ||
                  handoff.taskId !== eventRoute.taskId ||
                  handoff.generation !== eventRoute.generation ||
                  handoff.principalId !== eventRoute.principalId ||
                  !handoff.eventIds.includes(row.id)
                )
                  throw new Error("INVALID_REDUCER_CONTINUATION");
              } else continuationIds.push(row.id);
            }
          }
          // A feature reducer may atomically persist its state and mark this
          // inbox row reduced in the same transaction. Re-read after reduction
          // so the router neither overwrites that update nor uses a stale fence.
          const current = tx.get("inbox", row.id);
          if (current && current.state !== "reduced")
            tx.put(
              "inbox",
              {
                ...current,
                state: "reduced",
                revision: current.revision + 1,
              },
              current.revision,
            );
          const unresolved = tx.get("unresolved", row.id);
          if (unresolved)
            tx.put(
              "unresolved",
              {
                ...unresolved,
                reason: "resolved",
                revision: unresolved.revision + 1,
              },
              unresolved.revision,
            );
        }
        if (!route || !continuationIds.length) return;
        if (!activeRoute(tx, first.scope, route))
          throw new CorrelationPending("task-changed-during-reduction");
        const id = opaqueId(
          "handoff",
          scopeKey(first.scope),
          route.taskId,
          route.generation,
          route.principalId,
          continuationIds,
        );
        tx.put(
          "handoffs",
          {
            id,
            scope: first.scope,
            revision: 0,
            ...route,
            eventIds: continuationIds,
            state: "pending",
            claim: null,
            createdAt: this.clock.now(),
          },
          null,
        );
        return id;
      });
    } catch (error) {
      if (!(error instanceof CorrelationPending)) throw error;
      this.store.transaction((tx) => {
        for (const id of ids) {
          const row = tx.get("inbox", id);
          if (!row || row.state === "reduced") continue;
          if (row.state !== "unresolved")
            tx.put(
              "inbox",
              { ...row, state: "unresolved", revision: row.revision + 1 },
              row.revision,
            );
          const prior = tx.get("unresolved", id);
          tx.put(
            "unresolved",
            {
              id,
              scope: row.scope,
              revision: prior ? prior.revision + 1 : 0,
              eventId: id,
              reason: error.message,
              checkpointId: null,
            },
            prior?.revision ?? null,
          );
        }
      });
      return undefined;
    }
  }
  pending(scope: Scope): InboxRecord[] {
    return this.store.transaction((tx) => {
      const rows = tx.list("inbox", scope, 1000);
      // F0 has no pagination/filter cursor. Surface a blocker rather than silently
      // starving records outside the first page. WT-00 request documents the extension.
      if (rows.length === 1000) throw new Error("INBOX_PAGINATION_REQUIRED");
      return rows
        .filter((r) => r.state !== "reduced")
        .sort(
          (a, b) =>
            a.event.receivedAt - b.event.receivedAt || a.id.localeCompare(b.id),
        );
    });
  }
}

/** Capture/receipt acquisition is the ingress caller's responsibility. This commits
 * individual input, then reduces structured input through registered reducers. */
export function routeInboundEvent(router: InboundRouter, event: IncomingEvent): Promise<void> {
  return router.accept(event);
}
