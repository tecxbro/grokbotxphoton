import { test } from "node:test";
import assert from "node:assert/strict";
import { InboundRouter } from "../../../src/runtime/inbound/router.js";
import { createFeatureModule, nativeOperations } from "../../../src/features/native/module.js";
import { fixture, imageBytes, sample, spaceRef } from "./fixture.js";

test("feature module exposes the exact native handlers and shared compiler/reducer seams", t => {
  const f = fixture(); t.after(f.close);
  const module = createFeatureModule(f.deps);
  assert.deepEqual(module.handlers.map(handler => handler.operation), [...nativeOperations]);
  assert.deepEqual(module.compilers.map(compiler => compiler.family), ["effect", "registered-custom"]);
  assert.deepEqual(module.reducers.map(reducer => reducer.type), ["group"]);
});

test("appearance and effects share host media/compiler services and preserve line routing", async t => {
  const f = fixture(); t.after(f.close);
  assert.equal((await f.run(sample("space.setAvatar"))).status, "executor-completed");
  assert.equal((await f.run(sample("effect.send"))).status, "executor-completed");
  assert.equal(f.calls.filter(call => call.method === "media.resolve").length, 1);
  assert.ok(f.calls.some(call => call.method === "avatar" && Buffer.compare(call.args[0] as Buffer, imageBytes) === 0));
  assert.ok(f.calls.some(call => call.method === "send"));
  assert.ok(f.calls.filter(call => call.method === "space.get")
    .every(call => (call.args[1] as { phone: string }).phone === f.binding.phone));
});

test("shared inbound router consumes a normalized group event without a continuation", async t => {
  const f = fixture(); t.after(f.close);
  const event = {
    version: 1 as const, eventId: "group-event-1", providerEventId: "native-group-1",
    type: "group" as const, direction: "inbound" as const, scope: spaceRef.scope,
    occurredAt: 1000, receivedAt: 1001, ordering: { source: "wt-02", sequence: "1" },
    targets: [spaceRef], change: "renamed" as const, name: "Launch",
  };
  const router = new InboundRouter(f.store, f.clock, { route: () => undefined }, f.module.reducers);
  await router.accept(event);
  const inbox = f.store.transaction(tx => tx.get("inbox", event.eventId));
  assert.equal(inbox?.state, "reduced");
  assert.equal(f.store.transaction(tx => tx.list("handoffs", spaceRef.scope, 1000).length), 0);
  assert.equal(f.calls.length, 0);
});
