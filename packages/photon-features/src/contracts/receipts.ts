import { z } from "zod";
import { idSchema, scopeSchema, messageRefSchema, sameScope, type MessageRef } from "./references.js";
const time = z.number().int().nonnegative();
/** Append-only provider evidence; no local mark-read control can satisfy this contract. */
export const receiptObservationSchema = z.strictObject({
  evidenceId: idSchema,
  scope: scopeSchema,
  target: messageRefSchema.nullable(),
  providerTargetId: idSchema,
  partId: idSchema.nullable(),
  kind: z.enum(["accepted", "delivered", "read", "rejected"]),
  readerId: idSchema.nullable(),
  providerAt: time.nullable(),
  observedAt: time,
  source: z.enum(["sdk-return", "provider-event", "snapshot", "reconciliation"]),
  sourceRevision: idSchema.nullable(),
});
export type ReceiptObservation = z.infer<typeof receiptObservationSchema>;
/** Validate scope as well as shape before recording evidence. */
export function parseReceiptObservation(input: unknown): ReceiptObservation {
  const value = receiptObservationSchema.parse(input);
  if (value.target && !sameScope(value.scope, value.target.scope)) throw new Error("SCOPE_MISMATCH");
  return value;
}
/** Duplicate arrival times are ignored; conflicting evidence identities must be quarantined. */
export function appendReceipt(observations: readonly ReceiptObservation[], input: ReceiptObservation): ReceiptObservation[] {
  const next = parseReceiptObservation(input);
  const prior = observations.find(r => sameScope(r.scope, next.scope) && r.evidenceId === next.evidenceId);
  if (prior) {
    const stable = (r: ReceiptObservation) => JSON.stringify({...r, observedAt: 0, target: null});
    // Target is derived correlation, so replay of an early receipt cannot erase a later mapping.
    if (prior.target && next.target && prior.target.id !== next.target.id) throw new Error("EVIDENCE_ID_CONFLICT");
    if (stable(prior) !== stable(next)) throw new Error("EVIDENCE_ID_CONFLICT");
    return [...observations];
  }
  return [...observations, next];
}
/** Resolve only an exact native target in the same account/line/chat. Keep original times. */
export function reconcileReceipt(observation: ReceiptObservation, mapping: {providerId: string; reference: MessageRef}): ReceiptObservation {
  if (!sameScope(observation.scope, mapping.reference.scope) || observation.providerTargetId !== mapping.providerId) throw new Error("RECEIPT_TARGET_MISMATCH");
  if (observation.target && observation.target.id !== mapping.reference.id) throw new Error("RECEIPT_TARGET_MISMATCH");
  return parseReceiptObservation({...observation, target: mapping.reference});
}
/** Derive each evidence dimension independently. Read does not synthesize delivery or acceptance. */
export function summarizeReceipts(observations: readonly ReceiptObservation[], target: MessageRef, partId: string | null = null) {
  const matching = observations.filter(r => r.target?.id === target.id && sameScope(r.scope, target.scope) && r.partId === partId);
  const of = (kind: ReceiptObservation["kind"]) => matching.filter(r => r.kind === kind);
  return {
    accepted: of("accepted"), delivered: of("delivered"), read: of("read"), rejected: of("rejected"),
    delivery: of("delivered").length ? "observed" as const : "unknown" as const,
    reading: of("read").length ? "observed" as const : "unknown" as const,
    readers: [...new Set(of("read").flatMap(r => r.readerId ? [r.readerId] : []))],
  };
}
