import type { Scope } from "../../contracts/index.js";
import { batchable, type InboundRouter } from "./router.js";

export const QUIET_WINDOW_MS = 2000;
/** Host scheduler calls tick, including at startup. Durable inbox is the queue;
 * timers and cancellation tokens never own or remove user input. */
export class TextBatcher {
  constructor(private readonly router: InboundRouter) {}
  tick(scope: Scope): string[] {
    const pending = this.router.pending(scope);
    const work: string[] = [];
    // Non-text retries bypass the prose window completely.
    for (const row of pending.filter((r) => !batchable(r.event))) {
      const id = this.router.reduce([row.id]);
      if (id) work.push(id);
    }
    const text = pending.filter((r) => batchable(r.event));
    if (!text.length) return work;
    // On restart, multiple already-separated bursts may be pending. Preserve
    // the historical quiet boundaries instead of merging every pending text.
    const bursts: (typeof text)[] = [];
    for (const row of text) {
      const previous = bursts.at(-1)?.at(-1);
      if (
        !previous ||
        row.event.receivedAt - previous.event.receivedAt >= QUIET_WINDOW_MS
      )
        bursts.push([row]);
      else bursts.at(-1)!.push(row);
    }
    for (const burst of bursts) {
      if (
        this.router.clock.now() - burst.at(-1)!.event.receivedAt <
        QUIET_WINDOW_MS
      )
        continue;
      const id = this.router.reduce(burst.map((r) => r.id));
      if (id) work.push(id);
    }
    return work;
  }
}

/** Persist every input individually; the durable inbox owns the quiet window. */
export function appendToBatch(router: InboundRouter, event: import("../../contracts/events.js").IncomingEvent): Promise<void> {
  return router.accept(event);
}
/** Release ready historical bursts without applying text delays to structured events. */
export function releaseReadyBatch(batcher: TextBatcher, scope: Scope): string[] { return batcher.tick(scope); }
