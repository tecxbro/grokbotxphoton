import { parseReceiptObservation, type ReceiptObservation } from "../../contracts/receipts.js";
import { sameScope, type MessageRef, type Scope } from "../../contracts/references.js";
import { isIMessagePlatform, opaqueId, scopeKey, type ProviderContext } from "../../adapters/transport/provider-context.js";
import { slimMessage } from "./normalize.js";

/** Inject StateStore.recordReceipt or the runtime receipt service. This lane
 * never stores receipt rows itself. Replaying a capture repeats idempotent writes. */
export interface ReceiptWriter { recordReceipt(observation: ReceiptObservation): void | Promise<void>; }
export interface ReceiptAcquisition {
  writer: ReceiptWriter;
  resolveTarget?(scope: Scope, providerTargetId: string): {providerId: string; reference: MessageRef} | undefined;
}
const time = (value: unknown): number | null => {
  if (typeof value !== "string") return null;
  const n = Date.parse(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
};
/** Read events retain the actual reader when exposed. Outbound native metadata
 * provides independent delivered/read/rejected evidence, never inferred readers,
 * acceptance, delivery-from-read, or unread-from-absence. Part IDs must be supplied
 * explicitly by an authoritative caller; synthetic message IDs are never parsed. */
export async function observeReceipt(
  input: unknown, routes: ProviderContext, observedAt: number,
  acquisition: ReceiptAcquisition,
  options: { source?: "snapshot" | "reconciliation"; partId?: string | null } = {},
): Promise<ReceiptObservation[]> {
  const message = slimMessage.parse(input);
  if (!isIMessagePlatform(message.platform) || (message.space.platform && !isIMessagePlatform(message.space.platform)))
    throw new Error("UNBOUND_PROVIDER_ROUTE");
  const scope = routes.inbound(message.space.phone ?? "", message.space.id);
  const readEvent = message.content.type === "read" && message.direction === "inbound";
  if (!readEvent && message.direction !== "outbound") return [];
  const target = message.content.target;
  const providerTargetId = readEvent
    ? (target && typeof target === "object" && "id" in target ? target.id : undefined)
    : message.id;
  if (typeof providerTargetId !== "string" || !providerTargetId) throw new Error("RECEIPT_TARGET_REQUIRED");
  const mapping = acquisition.resolveTarget?.(scope, providerTargetId);
  if (mapping && (mapping.providerId !== providerTargetId || !sameScope(mapping.reference.scope, scope)))
    throw new Error("RECEIPT_TARGET_MISMATCH");
  const source = readEvent ? "provider-event" : options.source ?? "snapshot";
  const partId = options.partId ?? null;
  const metadata = message.metadata ?? message;
  const evidence: {kind: ReceiptObservation["kind"]; providerAt: number | null; readerId: string | null}[] = [];
  if (readEvent) evidence.push({kind: "read", providerAt: time(message.timestamp), readerId: message.sender?.id || null});
  else {
    if (metadata.isDelivered === true || time(metadata.dateDelivered) !== null)
      evidence.push({kind: "delivered", providerAt: time(metadata.dateDelivered), readerId: null});
    if (time(metadata.dateRead) !== null)
      evidence.push({kind: "read", providerAt: time(metadata.dateRead), readerId: null});
    if (typeof metadata.sendErrorCode === "number" && metadata.sendErrorCode !== 0)
      evidence.push({kind: "rejected", providerAt: null, readerId: null});
  }
  const observations = evidence.map(e => parseReceiptObservation({
    ...e, scope, target: mapping?.reference ?? null, providerTargetId, partId,
    source, sourceRevision: null, observedAt,
    evidenceId: opaqueId("receipt", scopeKey(scope), source,
      readEvent ? message.id : providerTargetId, partId, readEvent ? null : e,
      e.kind === "rejected" ? metadata.sendErrorCode : null),
  }));
  for (const observation of observations) await acquisition.writer.recordReceipt(observation);
  return observations;
}
