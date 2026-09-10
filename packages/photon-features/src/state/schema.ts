import type { ReceiptObservation } from "../contracts/receipts.js";
export type { StateTables, InboxRecord, UnresolvedRecord, HandoffRecord, OutboxRecord, AttemptRecord, ChildRecord, ReferenceRecord, PollRecord, VoteRecord, CardRecord, SessionRecord, CheckpointRecord } from "./ports.js";
/** Fresh-host schema adds evidence alongside the existing generic durable record layout. */
export const freshStorePath = ".photon-local/runtime/photon.sqlite";
export const initialMigration = "src/state/migrations/0001-initial.sql";
export interface ReceiptRecord { id: string; revision: number; observation: ReceiptObservation; }
/** Authoritative claims are persisted by owner runtime, not by feature handlers. */
export interface ClaimRecord { id: string; owner: string; taskId: string; generation: number; fence: number; leaseUntil: number; cancelledAt: number | null; }
