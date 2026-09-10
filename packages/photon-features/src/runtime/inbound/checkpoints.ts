import { sameScope, type Scope } from "../../contracts/index.js";
import type { Transaction } from "../../state/index.js";

/** An ingestion barrier, NOT a provider resume token. Call only in the transaction
 * persisting the events. SDK 12.8.0 exposes no host-managed iMessage recovery cursor. */
export function contiguousDurablePrefix(
  tx: Transaction,
  scope: Scope,
  precedingEventIds: readonly string[],
): number {
  let count = 0;
  for (const id of precedingEventIds) {
    const row = tx.get("inbox", id);
    if (!row || !sameScope(scope, row.scope)) break;
    count++;
  }
  return count;
}
export const recoveryEvidence = Object.freeze({
  sdkVersion: "12.8.0",
  publicResumeCursor: false,
  publicConnectionState: false,
  withinProcess:
    "provider internally reconnects and catches up from its volatile cursor",
  restart:
    "replay local durable captures/inbox; provider gap remains unrecoverable through public Spectrum API",
  order:
    "only explicitly supplied ordering is authoritative; do not parse sequences out of synthetic IDs",
});

/** Advance a host-owned checkpoint only when every preceding local event is durable.
 * persist must write within this same transaction. This is not an SDK cursor. */
export function advanceCheckpoint(tx: Transaction, scope: Scope, preceding: readonly string[], persist: () => void): void {
  if (!preceding.length || contiguousDurablePrefix(tx, scope, preceding) !== preceding.length)
    throw new Error("CHECKPOINT_NOT_DURABLE");
  const result: unknown = persist();
  if (result && typeof result === "object" && "then" in result) {
    void Promise.resolve(result).catch(() => undefined);
    throw new Error("ASYNC_CHECKPOINT_FORBIDDEN");
  }
}
/** Recover raw captures plus receipt writes before inbox acceptance. Unmapped routes
 * remain captured; write failure aborts recovery so a later retry cannot skip work. */
export async function recoverStream(options: {
  ids: Iterable<string>;
  captures: import("../../adapters/transport/capture.js").CaptureStore;
  routes: import("../../adapters/transport/provider-context.js").ProviderContext;
  clock: import("../../contracts/ports.js").Clock;
  receipts: import("./receipt-observer.js").ReceiptAcquisition;
  accept(event: import("../../contracts/events.js").IncomingEvent): Promise<void>;
  correlations?: import("./normalize.js").Correlations;
}) {
  const {normalizeInboundEvent} = await import("./normalize.js");
  const {observeReceipt} = await import("./receipt-observer.js");
  const unresolved: string[] = [];
  for (const id of options.ids) {
    const raw = options.captures.read(id);
    const envelope = raw && typeof raw === "object" ? raw : {};
    const message = "message" in envelope ? envelope.message : raw;
    const at = "capturedAt" in envelope && typeof envelope.capturedAt === "number" ? envelope.capturedAt : options.clock.now();
    let event: import("../../contracts/events.js").IncomingEvent;
    try { event = normalizeInboundEvent(message, id, options.routes, at, options.correlations); }
    catch { unresolved.push(id); continue; }
    await observeReceipt(message, options.routes, at, options.receipts);
    await options.accept(event);
  }
  return {unresolved, evidence: recoveryEvidence};
}
