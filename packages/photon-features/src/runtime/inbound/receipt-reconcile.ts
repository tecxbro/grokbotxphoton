import { sameScope, type MessageRef } from "../../contracts/references.js";
import type { Clock } from "../../contracts/ports.js";
import type { SpectrumOwner } from "../../adapters/transport/spectrum-owner.js";
import { lookupNativeMessageState, type NativeTarget } from "../../adapters/transport/native-state.js";
import { observeReceipt, type ReceiptWriter } from "./receipt-observer.js";

/** A scheduler supplies one durable, registered outgoing target per call, including
 * after restart. No broad scans, internal timers, or feature-local receipt ledger.
 * Missing/timeout evidence stays unknown; shared early-receipt correlation updates
 * require the WT-01 service extension documented in CHANGE-REQUESTS.md. */
export async function reconcileReceiptTarget(
  owner: SpectrumOwner, target: NativeTarget & {reference: MessageRef; partId?: string | null},
  writer: ReceiptWriter, clock: Clock,
  options: {timeoutMs?: number; signal?: AbortSignal} = {},
) {
  if (!sameScope(target.scope, target.reference.scope)) throw new Error("RECEIPT_TARGET_MISMATCH");
  const state = await lookupNativeMessageState(owner, target, options);
  if (state.status !== "found") return { ...state, observations: [] };
  if (options.signal?.aborted) return {status: "unavailable" as const, reason: "cancelled", observations: []};
  const observations = await observeReceipt(state.message, owner.routes, clock.now(), {
    writer, resolveTarget: () => ({providerId: target.providerTargetId, reference: target.reference}),
  }, {source: "reconciliation", partId: target.partId});
  return {status: "found" as const, observations};
}
