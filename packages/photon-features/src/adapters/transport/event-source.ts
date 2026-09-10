import type {
  IngressAdapter,
  IncomingEvent,
  Clock,
} from "../../contracts/index.js";
import type { CaptureStore } from "./capture.js";
import type { SpectrumOwner } from "./spectrum-owner.js";
import { snapshotMessage } from "./snapshot.js";
import {
  normalizeCaptured,
  type Correlations,
} from "../../runtime/inbound/normalize.js";

export interface IngressDiagnostic {
  code: "RECEIVE_FAILED" | "UNRESOLVED_ROUTE" | "RESTART_GAP";
  captureId?: string;
}
export class SpectrumEventSource implements IngressAdapter {
  private stopped = false;
  private running?: Promise<void>;
  constructor(
    private readonly owner: SpectrumOwner,
    private readonly captures: CaptureStore,
    private readonly clock: Clock,
    private readonly report: (diagnostic: IngressDiagnostic) => void,
    private readonly correlations: Correlations = {},
  ) {}
  async start(accept: (event: IncomingEvent) => Promise<void>): Promise<void> {
    if (this.running || this.stopped)
      throw new Error("INGRESS_ALREADY_STARTED");
    const stream = this.owner.stream("wt-02.stream");
    this.report({ code: "RESTART_GAP" });
    this.running = (async () => {
      for await (const [, message] of stream) {
        // Once read, finish durable acceptance even when stop/cancellation arrives.
        const snapshot = snapshotMessage(message),
          captureId = this.captures.put({
            capturedAt: this.clock.now(),
            message: snapshot,
          });
        let event: IncomingEvent;
        try {
          event = normalizeCaptured(
            snapshot,
            captureId,
            this.owner.routes,
            this.clock.now(),
            this.correlations,
          );
        } catch {
          this.report({ code: "UNRESOLVED_ROUTE", captureId });
          if (this.stopped) break;
          continue;
        }
        await accept(event);
        if (this.stopped) break;
      }
      if (!this.stopped) throw new Error("UNEXPECTED_STREAM_END");
    })().catch(() => {
      this.owner.receiveFailed();
      this.report({ code: "RECEIVE_FAILED" });
    });
  }
  async stop(): Promise<void> {
    this.stopped = true;
    // Public app.stop closes the blocked async iterator; return() alone may wait forever.
    await this.owner.stop();
    await this.running;
  }
}
