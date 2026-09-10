import { RuntimeFault } from "./errors.js";
import type { Claim, OutboxRecord } from "../../state/index.js";
import type { ExecutionClaims } from "./claims.js";
import { fault } from "./errors.js";

/** Cancellation is advisory until this durable check; it cannot retract an already dispatched provider call. */
export function checkCancellation(
  claims: ExecutionClaims,
  requestId: string,
  claim: Claim,
  signal?: AbortSignal,
): OutboxRecord {
  if (signal?.aborted) return fault("CANCELLED");
  return claims.store.transaction(
    (tx) => claims.writable(tx, requestId, claim).row,
  );
}
export async function withDeadline<T>(
  send: () => Promise<T>,
  controller: AbortController,
  deadlineMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      send(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new RuntimeFault("UNKNOWN_OUTCOME", "reconcile-first"));
        }, deadlineMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
