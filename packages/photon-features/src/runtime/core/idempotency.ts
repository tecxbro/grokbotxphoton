import { createHash } from "node:crypto";
import type {
  Action,
  OperationResult,
  TrustedContext,
} from "../../contracts/index.js";
import type { OutboxRecord, TransactionStore } from "../../state/index.js";
import type { DurableContexts } from "./authorization.js";
import { fault } from "./errors.js";
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("INVALID_JSON");
  return encoded;
}
export const digest = (value: unknown): string =>
  createHash("sha256").update(canonical(value)).digest("hex");
export const requestIdentity = (action: Action, c: TrustedContext): string =>
  digest([
    c.principalId,
    c.scope,
    c.taskId,
    c.generation,
    action.idempotencyKey,
  ]);
export const argumentDigest = (a: Action): string =>
  digest([a.version, a.operation, a.arguments]);
export const childIdentity = (requestId: string, index: number): string =>
  digest([requestId, "child", index]);

/** Atomically bind the caller's key to canonical authorized scope and payload before any external I/O. */
export function reserveRequestIdentity(
  store: TransactionStore,
  contexts: DurableContexts,
  action: Action,
  supplied: TrustedContext,
): { record: OutboxRecord; existing: boolean } {
  return store.transaction((tx) => {
    const context = contexts.action(tx, supplied, action);
    const id = requestIdentity(action, context);
    const argumentsHash = argumentDigest(action);
    const existing = tx.get("outbox", id);
    if (existing) {
      contexts.owned(tx, id, context);
      if (existing.argumentDigest !== argumentsHash)
        fault("IDEMPOTENCY_CONFLICT");
      return { record: existing, existing: true };
    }
    const result: OperationResult = {
      version: 1,
      requestId: id,
      status: "queued",
      revision: 0,
      updatedAt: contexts.clock.now(),
      references: [],
      observations: [],
    };
    const record: OutboxRecord = {
      id,
      scope: context.scope,
      revision: 0,
      action,
      principalId: context.principalId,
      taskId: context.taskId,
      generation: context.generation,
      argumentDigest: argumentsHash,
      result,
      claim: null,
      cancellationRequestedAt: null,
    };
    tx.put("outbox", record, null);
    return { record, existing: false };
  });
}
