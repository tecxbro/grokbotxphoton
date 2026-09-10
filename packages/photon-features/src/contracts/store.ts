import type { TrustedContext } from "./context.js";
import type { Claim, StateTables, TransactionStore } from "../state/ports.js";
import type { ReceiptObservation } from "./receipts.js";
/** Monotonic fence and task generation must both be checked against durable authoritative state. */
export type ExecutionClaim = Claim;
export type DomainTable = "references" | "polls" | "votes" | "cards" | "sessions" | "stagedMedia" | "streams";
export interface ContinuationSpec { id: string; eventIds: readonly string[]; resumeKey: string; }
/** A synchronous, scoped transaction facade: no private outbox, attempts, children or task access. */
export interface UnitOfWork {
  get<K extends DomainTable>(table: K, id: string): StateTables[K] | undefined;
  put<K extends DomainTable>(table: K, record: StateTables[K], expectedRevision: number | null): void;
  createContinuation(spec: ContinuationSpec): void;
}
/** Runtime-owned durable store. Features receive UnitOfWork, never this private record API. */
export interface StateStore extends TransactionStore {
  readonly persistence: "sqlite";
  assertActiveClaim(context: TrustedContext, claim: ExecutionClaim): void;
  recordReceipt(observation: ReceiptObservation): void;
}
