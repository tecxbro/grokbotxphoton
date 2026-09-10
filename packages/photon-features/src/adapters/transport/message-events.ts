import type { Clock, IncomingEvent } from "../../contracts/index.js";
import type { CaptureStore } from "./capture.js";
import type { SpectrumOwner } from "./spectrum-owner.js";
import { snapshotMessage } from "./snapshot.js";
import { normalizeInboundEvent, type Correlations } from "../../runtime/inbound/normalize.js";
import { observeReceipt, type ReceiptAcquisition } from "../../runtime/inbound/receipt-observer.js";

/** The only subscription for this owner; accepts sequentially after raw capture.
 * completion rejects on persistence or provider failure, so the host can stop and
 * recover captures. No fire-and-forget durability claim or independent receipts feed. */
export function subscribeMessageEvents(options: {
  owner: SpectrumOwner; captures: CaptureStore; clock: Clock;
  accept(event: IncomingEvent): Promise<void>;
  receipts: ReceiptAcquisition;
  correlations?: Correlations;
  report(code: string): void;
}) {
  const {owner, captures, clock, accept, receipts, correlations, report} = options;
  const stream = owner.stream("wt-02.messages");
  let stopping = false;
  report("RESTART_GAP");
  const completion = (async () => {
    try {
      for await (const [, message] of stream) {
        const snapshot = snapshotMessage(message);
        const capturedAt = clock.now();
        const captureId = captures.put({capturedAt, message: snapshot});
        let event: IncomingEvent;
        try { event = normalizeInboundEvent(snapshot, captureId, owner.routes, capturedAt, correlations); }
        catch { report("UNRESOLVED_ROUTE"); if (stopping) break; continue; }
        await observeReceipt(snapshot, owner.routes, capturedAt, receipts);
        await accept(event);
        if (stopping) break;
      }
      if (!stopping) throw new Error("UNEXPECTED_STREAM_END");
    } catch (error) {
      owner.receiveFailed(); report("RECEIVE_FAILED"); throw error;
    }
  })();
  // Attach rejection handling immediately; callers still receive the rejecting promise.
  void completion.catch(() => undefined);
  return {completion, async stop() { stopping = true; await owner.stop(); await completion; }};
}
