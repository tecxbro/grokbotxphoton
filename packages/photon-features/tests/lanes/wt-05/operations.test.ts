import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AdvancedIMessage } from "@photon-ai/advanced-imessage/grpc";
import { parseAction, resultSchema, buildRegistry, type Action } from "../../../src/index.js";
import { executePoll, pollOperations } from "../../../src/features/polls/operations.js";
import { createPollModule, pollWorkflowAvailability } from "../../../src/features/polls/module.js";
import { createAction, enqueue, registerPoll, seed, services, storeFixture, trusted, scope } from "./support.js";

// Compile-only against the installed public export. No client is constructed; no extension is enabled.
export async function pinnedAdvancedProbe(polls: AdvancedIMessage["polls"]) {
  const created = await polls.create("native-chat", "Choose?", ["A", "B"]);
  await polls.get(created.pollMessageGuid);
  await polls.vote(created.pollMessageGuid, created.options[0]!.optionIdentifier);
  // 2.1.0 unvote removes the bot account's selection; it takes NO option identifier.
  await polls.unvote(created.pollMessageGuid);
  await polls.addOption(created.pollMessageGuid, "C");
}

test("all five F0 schemas validate their fixtures and reject malformed payloads", () => {
  for (const op of pollOperations) {
    const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname,
      `../../../../tests/fixtures/${op}.json`), "utf8"));
    assert.equal(parseAction(fixture.valid).operation, op);
    assert.throws(() => parseAction(fixture.rejected));
  }
  const duplicate = createAction();
  if (duplicate.operation === "poll.create") duplicate.arguments.options[1]!.key = "first";
  assert.throws(() => parseAction(duplicate));
});

test("public pinned advanced call shapes compile and execute only against a test double", async () => {
  const calls: unknown[] = [];
  const state = { pollMessageGuid: "guid", options: [{ optionIdentifier: "choice", text: "A" }],
    title: "Choose?", chatGuid: "native-chat", votes: [] };
  const api = Object.fromEntries(["create", "get", "vote", "unvote", "addOption"].map(name =>
    [name, async (...args: unknown[]) => { calls.push([name, ...args]); return state; }]));
  await pinnedAdvancedProbe(api as unknown as AdvancedIMessage["polls"]);
  assert.deepEqual(calls, [["create", "native-chat", "Choose?", ["A", "B"]], ["get", "guid"],
    ["vote", "guid", "choice"], ["unvote", "guid"], ["addOption", "guid", "C"]]);
});

test("create uses actual Spectrum builders; keys and duplicate labels persist without fabricated native option IDs", async () => {
  const f = storeFixture();
  try {
    seed(f.store); const action = createAction(); enqueue(f.store, action); const h = services(f.store);
    const accepted = await executePoll(action, h.services);
    resultSchema.parse(accepted);
    assert.equal(accepted.status, "provider-accepted");
    assert.deepEqual(h.payloads, [{ type: "poll", title: "Choose?", options: [{ title: "Same" }, { title: "Same" }] }]);
    const state = f.store.transaction(tx => ({ polls: tx.list("polls", scope, 10),
      refs: tx.list("references", scope, 10), checkpoints: tx.list("checkpoints", scope, 10) }));
    assert.equal(state.polls.length, 1); assert.deepEqual(state.polls[0]!.options, []);
    assert.equal(state.refs.find(r => r.reference.kind === "poll")?.providerId, "native-poll-1");
    assert.equal(state.refs.find(r => r.reference.kind === "poll")?.taskId, trusted.taskId);
    assert.deepEqual(JSON.parse(state.checkpoints[0]!.payloadJson).choices,
      [{ key: "first", label: "Same" }, { key: "second", label: "Same" }]);
    assert.deepEqual(await executePoll(action, h.services), accepted);
    assert.equal(h.calls(), 1);
  } finally { f.close(); }
});

test("four native operations are explicitly unimplemented at F0, never private-client or alternate sends", async () => {
  const f = storeFixture();
  try {
    seed(f.store); const p = registerPoll(f.store); const h = services(f.store);
    for (const operation of pollOperations.filter(o => o !== "poll.create")) {
      const args = operation === "poll.get" ? { poll: p.ref } : operation === "poll.addOption" ?
        { poll: p.ref, option: { key: "new", label: "New" } } : { poll: p.ref, option: p.options[0]! };
      const action = parseAction({ version: 1, contextId: trusted.contextId, idempotencyKey: operation, operation, arguments: args });
      enqueue(f.store, action);
      const result = await executePoll(action, h.services);
      resultSchema.parse(result); assert.equal(result.status, "blocked");
      assert.equal(result.error?.code, "UNIMPLEMENTED");
    }
    assert.equal(h.calls(), 0);
  } finally { f.close(); }
});

test("unauthorized bot vote and wrong line/conversation are rejected before SDK dispatch", async () => {
  const f = storeFixture();
  try {
    seed(f.store); const p = registerPoll(f.store, "other-poll", "other-task"); const h = services(f.store);
    const action = parseAction({ version: 1, contextId: trusted.contextId, idempotencyKey: "vote",
      operation: "poll.vote", arguments: { poll: p.ref, option: p.options[0] } });
    enqueue(f.store, action); assert.equal((await executePoll(action, h.services)).error?.code, "FORBIDDEN");
    for (const field of ["lineId", "spaceId"] as const) {
      const bad = createAction(`wrong-${field}`);
      if (bad.operation === "poll.create") bad.arguments.space = { ...bad.arguments.space,
        scope: { ...scope, [field]: "elsewhere" } };
      enqueue(f.store, bad); assert.equal((await executePoll(bad, h.services)).error?.code, "SCOPE_MISMATCH");
    }
    assert.equal(h.calls(), 0);
  } finally { f.close(); }
});

for (const mode of ["timeout", "undefined"] as const) test(`${mode} has unknown outcome and repeated recovery never resends`, async () => {
  const f = storeFixture();
  try {
    seed(f.store); const action = createAction(); enqueue(f.store, action);
    const h = services(f.store, async () => { if (mode === "timeout") throw new Error("secret-provider-text"); return undefined; });
    const first = await executePoll(action, h.services);
    assert.equal(first.status, "unknown-outcome"); assert.ok(!JSON.stringify(first).includes("secret-provider-text"));
    assert.equal((await executePoll(action, h.services)).status, "unknown-outcome");
    assert.equal(h.calls(), 1);
    const checkpoint = f.store.transaction(tx => tx.list("checkpoints", scope, 10)[0]!);
    const codec = createPollModule().recoveryCodecs[0]!;
    assert.equal(await codec.reconcile(JSON.parse(checkpoint.payloadJson), h.services), "unknown");
    assert.equal(await codec.reconcile(JSON.parse(checkpoint.payloadJson), h.services), "unknown");
    assert.equal(h.calls(), 1);
  } finally { f.close(); }
});

test("creation and unavailable vote ingress have separate capability status; registry composition is lane-local", () => {
  const config = { voteIngress: "unavailable" as const, reduction: { orderedSources: [] } };
  const module = createPollModule(config);
  const registry = buildRegistry([module], { requireComplete: false });
  assert.equal(registry.handlers.size, 5);
  assert.equal(module.capabilities[0]?.direction.outbound, "implemented");
  assert.equal(module.capabilities[0]?.direction.inbound, "unknown");
  assert.equal(module.capabilities[1]?.implementation, "unimplemented");
  assert.equal(pollWorkflowAvailability(config).creationImplemented, true);
  assert.equal(pollWorkflowAvailability(config).interactiveWorkflowAdvertisable, false);
});

test("provider acceptance followed by local registration failure leaves a durable no-resend marker", async () => {
  const f = storeFixture();
  try {
    seed(f.store); const action = createAction(); enqueue(f.store, action); const h = services(f.store);
    h.services.transactions = { close: () => {}, transaction: fn => f.store.transaction(tx => fn({ ...tx,
      put: (table, row, expected) => {
        if (table === "polls") throw new Error("TEST_REGISTRATION_CRASH");
        tx.put(table, row, expected);
      },
    })) };
    assert.equal((await executePoll(action, h.services)).status, "unknown-outcome");
    assert.equal(f.store.transaction(tx => tx.list("polls", scope, 10).length), 0);
    assert.equal(f.store.transaction(tx => tx.list("references", scope, 10).length), 1);
    h.services.transactions = f.store;
    assert.equal((await executePoll(action, h.services)).status, "unknown-outcome");
    assert.equal(h.calls(), 1);
  } finally { f.close(); }
});

test("concurrent execution of the same claimed request issues only one SDK send", async () => {
  const f = storeFixture();
  try {
    seed(f.store); const action = createAction(); enqueue(f.store, action); const h = services(f.store);
    const results = await Promise.all([executePoll(action, h.services), executePoll(action, h.services)]);
    assert.equal(h.calls(), 1);
    assert.ok(results.some(r => r.status === "provider-accepted"));
    assert.ok(results.every(r => ["provider-accepted", "unknown-outcome"].includes(r.status)));
  } finally { f.close(); }
});

test("revoked context and expired/replaced executor fences prevent sends", async () => {
  const f = storeFixture();
  try {
    seed(f.store); const action = createAction(); const requestId = enqueue(f.store, action); const h = services(f.store);
    f.store.transaction(tx => {
      const row = tx.get("outbox", requestId)!;
      tx.put("outbox", { ...row, revision: row.revision + 1, claim: { ...row.claim!, fence: 2 } }, row.revision);
    });
    assert.equal((await executePoll(action, h.services)).error?.code, "STALE_FENCE");
    f.store.transaction(tx => {
      const c = tx.get("contexts", trusted.contextId)!;
      tx.put("contexts", { ...c, revision: c.revision + 1, context: { ...c.context, revokedAt: 9999 } }, c.revision);
    });
    assert.equal((await executePoll(action, h.services)).error?.code, "CONTEXT_REVOKED");
    assert.equal(h.calls(), 0);
  } finally { f.close(); }
});
