import type { Claim, OutboxRecord, Transaction } from "../../state/index.js";
import type { TrustedContext } from "../../contracts/index.js";
import { DurableSQLiteStore } from "../../adapters/state/sqlite.js";
import { DurableContexts } from "./authorization.js";
import { saveOutbox } from "./submission.js";
import { fault } from "./errors.js";
export class ExecutionClaims {
  constructor(
    readonly store: DurableSQLiteStore,
    readonly contexts: DurableContexts,
  ) {}
  acquire(id: string, owner: string, leaseMs: number): Claim | null {
    if (
      !owner ||
      !Number.isInteger(leaseMs) ||
      leaseMs < 1000 ||
      leaseMs > 60000
    )
      fault("INVALID_REQUEST");
    return this.store.transaction((tx) => {
      const row = tx.get("outbox", id),
        now = this.contexts.clock.now();
      if (
        !row ||
        row.result.status !== "queued" ||
        row.cancellationRequestedAt !== null ||
        (row.claim && row.claim.leaseUntil > now) ||
        this.store.predecessors(id, row.scope)
      )
        return null;
      // Expired claimed requests MUST pass recovery before another executor can own them.
      if (row.claim) return null;
      const c = this.contexts.current(
        tx,
        row.principalId,
        row.action.contextId,
      );
      this.contexts.owned(tx, id, c);
      this.contexts.action(tx, c, row.action);
      row.claim = {
        owner,
        leaseUntil: now + leaseMs,
        fence: row.revision + 1,
        generation: row.generation,
      };
      saveOutbox(tx, row, now);
      return row.claim;
    });
  }
  held(tx: Transaction, id: string, claim: Claim): OutboxRecord {
    const row = tx.get("outbox", id),
      current = row?.claim;
    if (
      !row ||
      !current ||
      current.owner !== claim.owner ||
      current.fence !== claim.fence ||
      current.generation !== claim.generation ||
      current.leaseUntil <= this.contexts.clock.now()
    )
      return fault("STALE_FENCE");
    return row;
  }
  writable(
    tx: Transaction,
    id: string,
    claim: Claim,
  ): { row: OutboxRecord; context: TrustedContext } {
    const row = this.held(tx, id, claim);
    if (row.result.status !== "queued") fault("STALE_FENCE");
    if (row.cancellationRequestedAt !== null) fault("CANCELLED");
    const context = this.contexts.current(
      tx,
      row.principalId,
      row.action.contextId,
    );
    this.contexts.owned(tx, id, context);
    this.contexts.action(tx, context, row.action);
    return { row, context };
  }
  heartbeat(id: string, claim: Claim, leaseMs: number): void {
    if (!Number.isInteger(leaseMs) || leaseMs < 1000 || leaseMs > 60000)
      fault("INVALID_REQUEST");
    this.store.transaction((tx) => {
      const { row } = this.writable(tx, id, claim);
      row.claim!.leaseUntil = this.contexts.clock.now() + leaseMs;
      saveOutbox(tx, row, this.contexts.clock.now());
    });
  }
}

/** Acquire a new fenced owner only when no live or recoverable predecessor owns the request. */
export function acquireClaim(
  claims: ExecutionClaims,
  requestId: string,
  owner: string,
  leaseMs: number,
): Claim | null {
  return claims.acquire(requestId, owner, leaseMs);
}

/** Renew only the exact current fence and generation. */
export function renewClaim(
  claims: ExecutionClaims,
  requestId: string,
  claim: Claim,
  leaseMs: number,
): void {
  claims.heartbeat(requestId, claim, leaseMs);
}

/** Revalidate mutable authority, cancellation, lease, generation, and owner in one transaction. */
export function validateClaim(
  claims: ExecutionClaims,
  tx: Transaction,
  requestId: string,
  claim: Claim,
): { row: OutboxRecord; context: TrustedContext } {
  return claims.writable(tx, requestId, claim);
}
