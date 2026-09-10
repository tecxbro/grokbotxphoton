import { test } from "node:test";
import assert from "node:assert/strict";
import { applyNativeEvent } from "../../../src/features/native/reducer.js";
import { fixture, sample, spaceRef } from "./fixture.js";

test("read-only discovery does not enable, configure, subscribe, or dispatch", async t => {
  const f = fixture(); t.after(f.close);
  for (const operation of ["space.get", "space.getName", "space.getMembers", "space.getAvatar", "metadata.get"] as const)
    assert.equal((await f.run(sample(operation))).status, "executor-completed");
  assert.ok(f.calls.every(call => [
    "binding", "resolve", "resolveSpace", "space.get", "getDisplayName", "getMembers",
    "getAvatar", "resolveMessage", "retainAvatar",
  ].includes(call.method)));
});

test("wrong chat and line fail before native mutation", async t => {
  const f = fixture(); t.after(f.close);
  f.space.phone = "+15555550999";
  assert.equal((await f.run(sample("space.rename"))).error?.code, "SCOPE_MISMATCH");
  f.space.phone = f.binding.phone;
  f.binding.provider.space.get = async () => ({ ...f.space, id: "foreign-chat" });
  assert.equal((await f.run(sample("space.leave"))).error?.code, "SCOPE_MISMATCH");
  assert.ok(!f.calls.some(call => call.method === "rename" || call.method === "leave"));
});

test("normalized group reducer rejects wrong scope or conversation without side effects", t => {
  const f = fixture(); t.after(f.close);
  const base = {
    version: 1 as const, eventId: "group-event-2", type: "group" as const,
    direction: "inbound" as const, scope: spaceRef.scope, occurredAt: null, receivedAt: 1000,
    ordering: { source: "wt-02" }, targets: [spaceRef], change: "members-added" as const,
    members: ["member-token"],
  };
  assert.doesNotThrow(() => f.store.transaction(tx => applyNativeEvent(base, tx)));
  const wrong = { ...base, eventId: "group-event-3", targets: [{ ...spaceRef, id: "foreign-space" }] };
  assert.throws(() => f.store.transaction(tx => applyNativeEvent(wrong, tx)), /scoped conversation/);
  assert.equal(f.store.transaction(tx => tx.list("handoffs", spaceRef.scope, 1000).length), 0);
  assert.equal(f.calls.length, 0);
});

test("provider write failures remain unknown and redact provider details", async t => {
  const f = fixture(); t.after(f.close);
  f.behavior.failWrite = true;
  const result = await f.run(sample("account.shareContact"));
  assert.equal(result.status, "unknown-outcome");
  assert.equal(result.error?.retry, "reconcile-first");
  assert.doesNotMatch(JSON.stringify(result), /secret-token|15555559999/);
});
