import type { Scope, Transaction } from "../../index.js";

/** F0 has no exhaustive reference query. Saturation is fail-closed; never assume a truncated scan is complete. */
export function scopeHasConsumers(tx: Transaction, scope: Scope): boolean {
  const outbox = tx.list("outbox", scope, 1000);
  const inbox = tx.list("inbox", scope, 1000);
  const unresolved = tx.list("unresolved", scope, 1000);
  const children = tx.list("children", scope, 1000);
  const checkpoints = tx.list("checkpoints", scope, 1000);
  const handoffs = tx.list("handoffs", scope, 1000);
  if ([outbox, inbox, unresolved, children, checkpoints, handoffs].some(rows => rows.length === 1000)) return true;
  // Conservatively retain every resource in the scope while any operation may still use one.
  return outbox.some(r => !["observed-read", "failed", "cancelled"].includes(r.result.status)) ||
    inbox.some(r => r.state !== "reduced") || unresolved.length > 0 ||
    children.some(r => r.state !== "completed") ||
    handoffs.some(r => !["acknowledged", "cancelled"].includes(r.state)) ||
    checkpoints.some(r => r.codecId !== "wt04.media-metadata");
}

import { sameScope, stagedMediaSchema, type Action, type TrustedContext } from "../../index.js";
import { reject } from "./safety.js";
/** WT-01 must call inside its submission transaction before persisting an action referencing staged media. */
export function assertActionMediaAvailable(tx: Transaction, action: Action, context: TrustedContext): void {
  function walk(value: unknown): void {
    if (!value || typeof value !== "object") return;
    if ("stagingId" in value) {
      const media = stagedMediaSchema.parse(value);
      const record = tx.get("stagedMedia", media.stagingId);
      if (!record || record.expiresAt === 0 || !sameScope(record.scope, context.scope) ||
        record.principalId !== context.principalId || record.taskId !== context.taskId ||
        record.generation !== context.generation || record.sha256 !== media.sha256 ||
        record.bytes !== media.bytes || record.mimeType !== media.mimeType) reject("staged resource unavailable");
    } else for (const child of Object.values(value)) walk(child);
  }
  walk(action.arguments);
}

import type { UnitOfWork } from "../../contracts/store.js";
import type { StagedMediaRecord } from "../../state/ports.js";
import type { StagedMedia } from "./staging.js";

/** A pin has no time-based expiry: queued or unknown work may survive arbitrarily long. */
export const RETAINED = Number.MAX_SAFE_INTEGER;
/** Runtime-owned proof, synchronous in the tombstone transaction. Must cover admission and all readers. */
export type NoMediaConsumers = (unit: UnitOfWork, record: Readonly<StagedMediaRecord>) => boolean;

/** Verify descriptor, full scope and owner against the existing shared domain row. */
export function authorizedMedia(unit: UnitOfWork, media: StagedMedia, context: TrustedContext): StagedMediaRecord {
  stagedMediaSchema.parse(media);
  const row = unit.get("stagedMedia", media.stagingId);
  if (!row || !sameScope(row.scope, context.scope) || row.principalId !== context.principalId ||
    row.taskId !== context.taskId || row.generation !== context.generation || row.sha256 !== media.sha256 ||
    row.mimeType !== media.mimeType || row.bytes !== media.bytes) reject("staged resource unavailable");
  return row;
}
/** Call atomically during admission, and before asynchronous reads. Idempotent across retries. */
export function retainResource(unit: UnitOfWork, media: StagedMedia, context: TrustedContext): void {
  const row = authorizedMedia(unit, media, context);
  if (row.expiresAt === 0) reject("released resource");
  if (row.expiresAt !== RETAINED) unit.put("stagedMedia", { ...row, expiresAt: RETAINED, revision: row.revision + 1 }, row.revision);
}
/** Only a runtime proof can release a pin; an expired lease is not proof that a send no longer needs bytes. */
export function releaseResource(unit: UnitOfWork, media: StagedMedia, context: TrustedContext,
  expiresAt: number, noConsumers?: NoMediaConsumers): boolean {
  const row = authorizedMedia(unit, media, context);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0 || expiresAt >= RETAINED) reject("invalid expiry");
  if (row.expiresAt === 0 || noConsumers?.(unit, row) !== true) return false;
  unit.put("stagedMedia", { ...row, expiresAt, revision: row.revision + 1 }, row.revision);
  return true;
}
/** Tombstone before filesystem removal. Without a same-transaction runtime proof, retain indefinitely. */
export function cleanExpiredResources(unit: UnitOfWork, media: StagedMedia, context: TrustedContext,
  now: number, noConsumers?: NoMediaConsumers): StagedMediaRecord | undefined {
  const row = authorizedMedia(unit, media, context);
  if (row.expiresAt === 0) return row;
  if (row.expiresAt === RETAINED || row.expiresAt > now || noConsumers?.(unit, row) !== true) return undefined;
  const tombstone = { ...row, expiresAt: 0, revision: row.revision + 1 };
  unit.put("stagedMedia", tombstone, row.revision);
  return tombstone;
}
