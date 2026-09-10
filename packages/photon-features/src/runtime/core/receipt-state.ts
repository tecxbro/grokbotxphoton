import {
  messageRefSchema,
  sameScope,
  type TrustedContext,
} from "../../contracts/index.js";
import {
  parseReceiptObservation,
  summarizeReceipts,
  type ReceiptObservation,
} from "../../contracts/receipts.js";
import type { DurableSQLiteStore } from "../../adapters/state/sqlite.js";
import { fault } from "./errors.js";

/** Append one provider observation without promoting executor state into receipt evidence. */
export function applyReceiptObservation(
  store: DurableSQLiteStore,
  input: ReceiptObservation,
  context?: TrustedContext,
): ReceiptObservation {
  const observation = parseReceiptObservation(input);
  if (context && !sameScope(observation.scope, context.scope))
    return fault("SCOPE_MISMATCH");
  store.recordReceipt(observation);
  return observation;
}

/** Derive independent accepted/delivered/read dimensions for one exact target and part. */
export function getMessageStatus(
  store: DurableSQLiteStore,
  targetInput: unknown,
  partId: string | null = null,
) {
  const target = messageRefSchema.parse(targetInput);
  const observations = store.listReceipts(target.scope);
  return {
    target,
    partId,
    observations: observations.filter(
      (observation) =>
        observation.target?.id === target.id && observation.partId === partId,
    ),
    ...summarizeReceipts(observations, target, partId),
  };
}
