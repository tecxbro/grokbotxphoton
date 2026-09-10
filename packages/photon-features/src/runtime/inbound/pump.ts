import type { Scope } from "../../contracts/index.js";
import type { TaskRoute } from "./router.js";
import type { TextBatcher } from "./batching.js";
import type { WakeDispatcher } from "./wake-dispatcher.js";

export interface ActiveInboundRoute {
  scope: Scope;
  task: TaskRoute;
}
/** One host scheduler over persisted work. No transcript or provider polling.
 * User-input cancellation stops the task, not this recovery/notification loop. */
export class InboundPump {
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private stopped = false;
  constructor(
    private readonly routes: () => readonly ActiveInboundRoute[],
    private readonly batcher: TextBatcher,
    private readonly wake: WakeDispatcher,
    private readonly report: (code: string) => void,
    private readonly intervalMs = 1000,
  ) {
    if (!Number.isFinite(intervalMs) || intervalMs < 10)
      throw new Error("INVALID_PUMP_INTERVAL");
  }
  async start(): Promise<void> {
    if (this.running || this.timer || this.stopped)
      throw new Error("PUMP_ALREADY_STARTED");
    await this.tick();
    this.schedule();
  }
  private schedule() {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.tick().finally(() => this.schedule());
    }, this.intervalMs);
    this.timer.unref();
  }
  tick(): Promise<void> {
    if (this.running) return this.running;
    return (this.running = (async () => {
      for (const { scope, task } of this.routes()) {
        try {
          this.batcher.tick(scope);
          const dispatched = await this.wake.tick(scope, task);
          for (const result of dispatched)
            if (result.status !== "accepted") this.report("WAKE_RETRY_PENDING");
        } catch {
          this.report("INBOUND_RECOVERY_PENDING");
        }
      }
    })().finally(() => {
      this.running = undefined;
    }));
  }
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    await this.running;
  }
}
