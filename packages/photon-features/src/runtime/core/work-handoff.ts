import {
  sameScope,
  type TrustedContext,
  type IncomingEvent,
} from "../../contracts/index.js";
import type { TransactionStore, HandoffRecord } from "../../state/index.js";
import { DurableContexts } from "./authorization.js";
import { fault } from "./errors.js";
export class DurableWork {
  constructor(
    private readonly store: TransactionStore,
    private readonly contexts: DurableContexts,
  ) {}
  list(c: TrustedContext, limit: number): HandoffRecord[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      fault("INVALID_REQUEST");
    return this.store.transaction((tx) => {
      const current = this.contexts.refresh(tx, c);
      return tx.listWork(
        current.scope,
        current.principalId,
        current.taskId,
        current.generation,
        this.contexts.clock.now(),
        limit,
      );
    });
  }
  change(
    c: TrustedContext,
    id: string,
    method: "claim" | "heartbeat" | "ack",
    fence?: number,
    leaseMs = 1000,
  ): { handoff: HandoffRecord; events: IncomingEvent[] } {
    if (!Number.isInteger(leaseMs) || leaseMs < 1000 || leaseMs > 60000)
      fault("INVALID_REQUEST");
    return this.store.transaction((tx) => {
      c = this.contexts.refresh(tx, c);
      const h = tx.get("handoffs", id),
        now = this.contexts.clock.now();
      if (
        !h ||
        h.principalId !== c.principalId ||
        h.taskId !== c.taskId ||
        h.generation !== c.generation ||
        !sameScope(h.scope, c.scope)
      )
        return fault("RESOURCE_NOT_FOUND");
      if (h.state === "cancelled") fault("CANCELLED");
      const matches =
        h.claim &&
        h.claim.owner === c.principalId &&
        h.claim.fence === fence &&
        h.claim.generation === c.generation;
      // A repeated ack of the exact completed claim is safe even after its lease expired.
      const repeat = method === "ack" && h.state === "acknowledged" && matches;
      if (!repeat) {
        if (h.state === "acknowledged") fault("STALE_FENCE");
        if (method === "claim") {
          if (h.claim && h.claim.leaseUntil > now) fault("UNAVAILABLE");
          h.claim = {
            owner: c.principalId,
            fence: (h.claim?.fence ?? 0) + 1,
            generation: c.generation,
            leaseUntil: now + leaseMs,
          };
          h.state = "claimed";
        } else {
          if (!matches || !h.claim || h.claim.leaseUntil <= now)
            fault("STALE_FENCE");
          if (method === "ack") h.state = "acknowledged";
          else h.claim.leaseUntil = now + leaseMs;
        }
        const rev = h.revision;
        h.revision++;
        tx.put("handoffs", h, rev);
      }
      const events = h.eventIds.map((eventId) => {
        const e = tx.get("inbox", eventId);
        if (
          !e ||
          !sameScope(e.scope, c.scope) ||
          !sameScope(e.event.scope, c.scope)
        )
          return fault("RESOURCE_NOT_FOUND");
        return e.event;
      });
      return { handoff: h, events };
    });
  }
}

/** Claim durable work and return its persisted events; wake acceptance alone is never acknowledgement. */
export function claimWork(
  work: DurableWork,
  context: TrustedContext,
  handoffId: string,
  leaseMs: number,
): { handoff: HandoffRecord; events: IncomingEvent[] } {
  return work.change(context, handoffId, "claim", undefined, leaseMs);
}

/** Extend only the exact current handoff fence. */
export function heartbeatWork(
  work: DurableWork,
  context: TrustedContext,
  handoffId: string,
  fence: number,
  leaseMs: number,
): { handoff: HandoffRecord; events: IncomingEvent[] } {
  return work.change(context, handoffId, "heartbeat", fence, leaseMs);
}

/** Acknowledge durably processed work; repeating the same completed fence is idempotent. */
export function acknowledgeWork(
  work: DurableWork,
  context: TrustedContext,
  handoffId: string,
  fence: number,
): { handoff: HandoffRecord; events: IncomingEvent[] } {
  return work.change(context, handoffId, "ack", fence);
}
