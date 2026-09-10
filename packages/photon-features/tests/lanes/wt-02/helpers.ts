import { join } from "node:path";
import type { Scope } from "../../../src/index.js";
import { FixedClock, storeFixture } from "../../fixtures/harness.js";
import { ProviderContext } from "../../../src/adapters/transport/provider-context.js";
import { FileCaptureStore } from "../../../src/adapters/transport/capture.js";
import { normalizeCaptured } from "../../../src/runtime/inbound/normalize.js";
import type { TimerPort } from "../../../src/runtime/typing/leases.js";
export const routes = new ProviderContext("project-1", [
  { accountId: "account-1", lineId: "line-1", phone: "+15555550101" },
  { accountId: "account-2", lineId: "line-2", phone: "+15555550102" },
]);
export const chat = "any;-;+15555550999";
export const scope = routes.inbound("+15555550101", chat);
export const taskRoute = {
  taskId: "task-1",
  principalId: "principal-1",
  generation: 1,
};
export const snapshot = (
  id = "message-1",
  content: Record<string, unknown> = { type: "text", text: "hello" },
) => ({
  id,
  platform: "imessage",
  direction: "inbound",
  timestamp: "2026-09-08T00:00:00.000Z",
  sender: { id: "+15555550999" },
  space: { id: chat, platform: "imessage", phone: "+15555550101" },
  content,
});
export function fixture() {
  const f = storeFixture(),
    clock = new FixedClock(10000),
    captures = new FileCaptureStore(join(f.dir, "captures"));
  f.store.transaction((tx) =>
    tx.put(
      "tasks",
      {
        id: taskRoute.taskId,
        scope,
        revision: 0,
        ...taskRoute,
        cancelledAt: null,
      },
      null,
    ),
  );
  const event = (id = "message-1", c?: Record<string, unknown>) => {
    const input = snapshot(id, c);
    return normalizeCaptured(input, captures.put(input), routes, clock.now());
  };
  return { ...f, clock, captures, event };
}
export function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void,
    reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}
export class FakeTimers implements TimerPort {
  private id = 0;
  private timers = new Map<number, { at: number; fn: () => void }>();
  constructor(readonly clock: FixedClock) {}
  set(fn: () => void, ms: number) {
    const id = ++this.id;
    this.timers.set(id, { at: this.clock.now() + ms, fn });
    return id;
  }
  clear(handle: unknown) {
    this.timers.delete(handle as number);
  }
  async advance(ms: number) {
    const until = this.clock.now() + ms;
    while (true) {
      const next = [...this.timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > until) break;
      this.clock.advance(next[1].at - this.clock.now());
      this.timers.delete(next[0]);
      next[1].fn();
      await settle();
    }
    this.clock.advance(until - this.clock.now());
    await settle();
  }
}
export const scoped = (scope: Scope) => ({
  version: 1 as const,
  kind: "space" as const,
  id: scope.spaceId,
  scope,
});
