import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { SQLiteStore, incomingEventSchema, type Transaction, type IncomingEvent } from "../../../src/index.js";
import { registerNativeOptions, scopedId } from "../../../src/features/polls/identity.js";
import { createPollReducer } from "../../../src/features/polls/reducer.js";
import { reconcilePollEvents, registerAndReconcilePollOptions } from "../../../src/features/polls/reconciliation.js";
import { registerPoll, seed, storeFixture, scope, pollEvent, trusted } from "./support.js";

const reducer = createPollReducer({ orderedSources: ["native-test"], selectionSemantics: "independent-option-deltas" });
test("two simultaneous polls and duplicate display labels correlate using native identities to their own tasks", () => {
  const f = storeFixture();
  try {
    seed(f.store); const a = registerPoll(f.store, "a", "task-a"); const b = registerPoll(f.store, "b", "task-b");
    const ea = pollEvent(a, { poll: { ...a.ref, id: "a", messageId: "a" },
      option: { ...a.options[1]!, id: "native-option-b", pollId: "a" } });
    const eb = pollEvent(b, { eventId: "event-2", providerEventId: "provider-2" });
    f.store.transaction(tx => { reducer.reduce(ea, tx); reducer.reduce(eb, tx); });
    const rows = f.store.transaction(tx => ({ votes: tx.list("votes", scope, 100), handoffs: tx.list("handoffs", scope, 100) }));
    assert.equal(rows.votes.length, 2);
    assert.ok(rows.votes.some(v => v.pollId === a.ref.id && v.optionId === a.options[1]!.id));
    assert.deepEqual(rows.handoffs.map(h => h.taskId).sort(), ["task-a", "task-b"]);
    assert.notEqual(a.options[0]!.id, a.options[1]!.id);
  } finally { f.close(); }
});

test("independent option selections, multiple voters, duplicates, removal, and stale events", () => {
  const f = storeFixture();
  try {
    seed(f.store); const p = registerPoll(f.store);
    const events = [pollEvent(p), pollEvent(p, { eventId: "second", providerEventId: "second",
      option: p.options[1]!, ordering: { source: "native-test", sequence: "2" } }),
      pollEvent(p, { eventId: "bob", providerEventId: "bob", actorId: "bob" }),
      pollEvent(p, { eventId: "removed", providerEventId: "removed", change: "unvote",
        ordering: { source: "native-test", sequence: "3" } })];
    f.store.transaction(tx => events.forEach(e => { reducer.reduce(e, tx); reducer.reduce(e, tx); }));
    f.store.transaction(tx => reducer.reduce(pollEvent(p, { eventId: "old", providerEventId: "old",
      ordering: { source: "native-test", sequence: "2" } }), tx));
    const rows = f.store.transaction(tx => ({ votes: tx.list("votes", scope, 100), handoffs: tx.list("handoffs", scope, 100) }));
    assert.equal(rows.votes.length, 3);
    assert.equal(rows.votes.filter(v => v.active).length, 2);
    assert.equal(rows.handoffs.length, 4);
    assert.ok(rows.votes.some(v => v.actorId === "alice" && v.optionId === p.options[1]!.id && v.active));
    assert.ok(rows.votes.some(v => v.actorId === "bob" && v.active));
  } finally { f.close(); }
});

test("vote before local registration is retained and repeated reconciliation creates one continuation", () => {
  const f = storeFixture();
  try {
    seed(f.store);
    const ref = { version: 1 as const, kind: "poll" as const, scope, id: "early-guid", messageId: "early-guid" };
    const e: IncomingEvent = { version: 1, type: "poll", eventId: "early", scope, direction: "inbound",
      occurredAt: null, receivedAt: 1, ordering: { source: "native-test", sequence: "1" }, targets: [],
      poll: ref, option: { version: 1, kind: "poll-option", scope, id: "native-option-a", pollId: ref.id },
      actorId: "alice", change: "vote" };
    f.store.transaction(tx => reducer.reduce(e, tx));
    assert.equal(f.store.transaction(tx => tx.get("inbox", e.eventId)?.state), "unresolved");
    registerPoll(f.store, "early-guid");
    assert.deepEqual(reconcilePollEvents(f.store, scope, reducer), { resolved: 1, unresolved: 0 });
    assert.deepEqual(reconcilePollEvents(f.store, scope, reducer), { resolved: 0, unresolved: 0 });
    assert.equal(f.store.transaction(tx => tx.list("handoffs", scope, 100).length), 1);
  } finally { f.close(); }
});

test("unknown option additions wait for native metadata registration; never derive a label from an ID", () => {
  const f = storeFixture();
  try {
    seed(f.store); const p = registerPoll(f.store);
    const e = pollEvent(p, { change: "option-added", option: { ...p.options[0]!, id: "native-option-c" } });
    f.store.transaction(tx => reducer.reduce(e, tx));
    assert.equal(f.store.transaction(tx => tx.get("inbox", e.eventId)?.state), "unresolved");
    registerAndReconcilePollOptions(f.store, { poll: p.ref, nativePollGuid: p.guid,
      options: [{ nativeId: "native-option-a", label: "Same" }, { nativeId: "native-option-b", label: "Same" },
        { nativeId: "native-option-c", label: "Same" }] }, reducer);
    reconcilePollEvents(f.store, scope, reducer); reconcilePollEvents(f.store, scope, reducer);
    assert.equal(f.store.transaction(tx => tx.get("polls", p.ref.id)?.options.length), 3);
    assert.equal(f.store.transaction(tx => tx.list("handoffs", scope, 100).length), 1);
  } finally { f.close(); }
});

test("unknown ordering, contradictory sequence, unrelated source and cross-scope targets stay unresolved", () => {
  const f = storeFixture();
  try {
    seed(f.store); const p = registerPoll(f.store); f.store.transaction(tx => reducer.reduce(pollEvent(p), tx));
    const cases = [pollEvent(p, { eventId: "unordered", providerEventId: "unordered", ordering: { source: "native-test" }, change: "unvote" }),
      pollEvent(p, { eventId: "contradiction", providerEventId: "contradiction", change: "unvote" }),
      pollEvent(p, { eventId: "other-source", providerEventId: "other-source", ordering: { source: "other", sequence: "99" } }),
      pollEvent(p, { eventId: "wrong-line", option: { ...p.options[0]!, scope: { ...scope, lineId: "wrong" } } }),
      pollEvent(p, { eventId: "wrong-chat", poll: { ...p.ref, scope: { ...scope, spaceId: "wrong" } } }),
      pollEvent(p, { eventId: "wrong-parent", option: { ...p.options[0]!, pollId: "elsewhere" } })];
    f.store.transaction(tx => cases.forEach(e => reducer.reduce(e, tx)));
    assert.equal(f.store.transaction(tx => tx.list("inbox", scope, 100).filter(r => r.state === "unresolved").length), 6);
    assert.equal(f.store.transaction(tx => tx.list("votes", scope, 100)[0]!.active), true);
    assert.equal(f.store.transaction(tx => tx.list("handoffs", scope, 100).length), 1);
    assert.throws(() => incomingEventSchema.parse({ ...pollEvent(p), actorId: undefined }));
    assert.throws(() => incomingEventSchema.parse({ ...pollEvent(p), actorId: "" }));
  } finally { f.close(); }
});

test("ambiguous native target remains explicit unresolved, not latest poll", () => {
  const f = storeFixture();
  try {
    seed(f.store); const p = registerPoll(f.store, "guid"); const second = registerPoll(f.store, "different");
    f.store.transaction(tx => {
      for (const id of [second.ref.id, second.ref.messageId]) {
        const old = tx.get("references", id)!;
        tx.put("references", { ...old, revision: old.revision + 1, providerId: "guid" }, old.revision);
      }
      const e = pollEvent(p, { poll: { ...p.ref, id: "guid", messageId: "guid" },
        option: { ...p.options[0]!, pollId: "guid" } });
      reducer.reduce(e, tx);
    });
    assert.equal(f.store.transaction(tx => tx.list("unresolved", scope, 10)[0]?.reason), "AMBIGUOUS_POLL");
    assert.equal(f.store.transaction(tx => tx.list("handoffs", scope, 10).length), 0);
  } finally { f.close(); }
});

test("transaction failure rolls back vote, inbox and continuation together", () => {
  const f = storeFixture();
  try {
    seed(f.store); const p = registerPoll(f.store); const e = pollEvent(p);
    assert.throws(() => f.store.transaction(tx => {
      const failing: Transaction = { ...tx, put: (table, row, expected) => {
        if (table === "handoffs") throw new Error("TEST_FAILURE");
        tx.put(table, row, expected);
      } };
      reducer.reduce(e, failing);
    }), /TEST_FAILURE/);
    assert.equal(f.store.transaction(tx => tx.list("votes", scope, 100).length), 0);
    assert.equal(f.store.transaction(tx => tx.list("handoffs", scope, 100).length), 0);
    assert.equal(f.store.transaction(tx => tx.get("inbox", e.eventId)), undefined);
    f.store.transaction(tx => reducer.reduce(e, tx));
    assert.equal(f.store.transaction(tx => tx.list("handoffs", scope, 100).length), 1);
  } finally { f.close(); }
});

test("restart preserves task/option/voter correlation and replay creates no duplicate continuation", () => {
  const f = storeFixture();
  let reopened: SQLiteStore | undefined;
  try {
    seed(f.store); const p = registerPoll(f.store, "durable", "original-task"); const e = pollEvent(p);
    f.store.transaction(tx => reducer.reduce(e, tx)); f.store.close();
    reopened = new SQLiteStore(f.path); reopened.transaction(tx => reducer.reduce(e, tx));
    reconcilePollEvents(reopened, scope, reducer);
    const state = reopened.transaction(tx => ({ votes: tx.list("votes", scope, 10), handoffs: tx.list("handoffs", scope, 10) }));
    assert.equal(state.handoffs.length, 1); assert.equal(state.handoffs[0]?.taskId, "original-task");
    assert.equal(state.handoffs[0]?.generation, 1); assert.equal(state.votes[0]?.actorId, "alice");
  } finally {
    if (reopened) { reopened.close(); rmSync(f.dir, { recursive: true, force: true }); }
    else f.close();
  }
});

test("stale task generation and reused event identity do not wake another task", () => {
  const f = storeFixture();
  try {
    seed(f.store); const p = registerPoll(f.store); const e = pollEvent(p);
    f.store.transaction(tx => {
      const task = tx.get("tasks", trusted.taskId)!;
      tx.put("tasks", { ...task, revision: task.revision + 1, generation: 2 }, task.revision);
      reducer.reduce(e, tx);
    });
    assert.equal(f.store.transaction(tx => tx.list("handoffs", scope, 10).length), 0);
    assert.throws(() => f.store.transaction(tx => reducer.reduce({ ...e, actorId: "bob" }, tx)), /EVENT_IDENTITY_CONFLICT/);
  } finally { f.close(); }
});

test("delivery timestamps do not create a new event; stable provider identity deduplicates router aliases", () => {
  const f = storeFixture();
  try {
    seed(f.store); const p = registerPoll(f.store); const e = pollEvent(p);
    f.store.transaction(tx => {
      reducer.reduce(e, tx);
      reducer.reduce({ ...e, receivedAt: 9999 }, tx);
      reducer.reduce({ ...e, eventId: "router-alias", receivedAt: 20000 }, tx);
    });
    assert.equal(f.store.transaction(tx => tx.list("handoffs", scope, 100).length), 1);
    assert.equal(f.store.transaction(tx => tx.list("votes", scope, 100)[0]?.revision), 0);
  } finally { f.close(); }
});

test("native vote replacement ambiguity cannot be treated as independent multi-select deltas", () => {
  const f = storeFixture();
  try {
    seed(f.store); const p = registerPoll(f.store);
    const unknownSemantics = createPollReducer({ orderedSources: ["native-test"] });
    f.store.transaction(tx => unknownSemantics.reduce(pollEvent(p), tx));
    assert.equal(f.store.transaction(tx => tx.list("unresolved", scope, 100)[0]?.reason), "SELECTION_SEMANTICS_REQUIRE_NATIVE_STATE");
    assert.equal(f.store.transaction(tx => tx.list("votes", scope, 100).length), 0);
    assert.equal(f.store.transaction(tx => tx.list("handoffs", scope, 100).length), 0);
  } finally { f.close(); }
});
