import test from "node:test";
import assert from "node:assert/strict";
import {
  SQLiteStore,
  type IncomingEvent,
  type TransactionStore,
  type EventReducer,
} from "../../../src/index.js";
import {
  InboundRouter,
  CorrelationPending,
} from "../../../src/runtime/inbound/router.js";
import { TextBatcher } from "../../../src/runtime/inbound/batching.js";
import {
  WakeDispatcher,
  ExistingGrokWakeAdapter,
} from "../../../src/runtime/inbound/wake-dispatcher.js";
import { normalizeCaptured } from "../../../src/runtime/inbound/normalize.js";
import {
  contiguousDurablePrefix,
  recoveryEvidence,
} from "../../../src/runtime/inbound/checkpoints.js";
import { recoverCaptures } from "../../../src/runtime/inbound/recovery.js";
import { fixture, routes, scope, snapshot, taskRoute } from "./helpers.js";
const policy = { route: () => taskRoute };

test("normalizes text, attachments, groups, edits, reactions, read and membership without prose coercion", () => {
  const f = fixture();
  try {
    for (const [type, c] of [
      ["message", { type: "text", text: "hello" }],
      [
        "message",
        {
          type: "attachment",
          id: "attachment-1",
          name: "x.heic",
          mimeType: "image/heic",
          size: 99,
        },
      ],
      [
        "message",
        {
          type: "group",
          items: [
            { content: { type: "text", text: "caption" } },
            { content: { type: "attachment", id: "a", mimeType: "image/png" } },
          ],
        },
      ],
      [
        "message",
        {
          type: "edit",
          target: { id: "same" },
          content: { type: "text", text: "edited" },
        },
      ],
      ["reaction", { type: "reaction", target: { id: "same" }, emoji: "❤️" }],
      ["receipt", { type: "read", target: { id: "same" } }],
      ["group", { type: "rename", displayName: "New name" }],
      ["group", { type: "addMember", members: ["+15555550111"] }],
      ["group", { type: "removeMember", members: ["+15555550111"] }],
      ["group", { type: "leaveSpace" }],
      ["group", { type: "avatar", action: "clear" }],
      ["typing", { type: "typing", state: "start" }],
    ] as const)
      assert.equal(f.event("id", c).type, type);
    const media = f.event("media", {
      type: "attachment",
      id: "a",
      name: "picture.heic",
      mimeType: "image/heic",
    });
    assert.equal(media.type, "message");
    assert.ok(
      [...f.captures.ids()].some((id) =>
        JSON.stringify(f.captures.read(id)).includes("picture.heic"),
      ),
    );
  } finally {
    f.close();
  }
});
test("unknown, senderless, unsent, card and ambiguous poll content is durably unresolved", () => {
  const f = fixture();
  try {
    for (const c of [
      { type: "custom", raw: { newField: 123 } },
      { type: "app", url: "https://example.com" },
      { type: "unsend", target: { id: "x" } },
      {
        type: "poll_option",
        option: { title: "A" },
        poll: { title: "Q", options: [{ title: "A" }, { title: "B" }] },
        selected: true,
      },
    ]) {
      const e = f.event("id", c);
      assert.equal(e.type, "unresolved");
      if (e.type === "unresolved") assert.ok(f.captures.read(e.quarantineId));
    }
    const raw = { ...snapshot(), sender: undefined };
    assert.equal(
      normalizeCaptured(raw, f.captures.put(raw), routes, 1).type,
      "unresolved",
    );
  } finally {
    f.close();
  }
});
test("correlated poll votes and unvotes retain distinct identities and scoped references", () => {
  const f = fixture();
  try {
    const poll = {
      version: 1 as const,
      kind: "poll" as const,
      id: "poll-1",
      messageId: "parent",
      scope,
    };
    const option = {
      version: 1 as const,
      kind: "poll-option" as const,
      id: "option-1",
      pollId: poll.id,
      scope,
    };
    const build = (selected: boolean) => {
      const raw = snapshot("same", {
        type: "poll_option",
        option: { title: "A" },
        poll: { title: "Q", options: [{ title: "A" }] },
        selected,
      });
      return normalizeCaptured(raw, f.captures.put(raw), routes, 1, {
        poll: () => ({ poll, option }),
      });
    };
    const vote = build(true),
      unvote = build(false);
    assert.equal(vote.type, "poll");
    assert.notEqual(vote.eventId, unvote.eventId);
    if (vote.type === "poll") assert.deepEqual(vote.targets, [poll, option]);
  } finally {
    f.close();
  }
});
test("two-second quiet window resets on new text; restart and duplicate arrival preserve individual input", async () => {
  const f = fixture();
  try {
    const router = new InboundRouter(f.store, f.clock, policy, []),
      batcher = new TextBatcher(router);
    const a = f.event("a");
    await router.accept(a);
    f.clock.advance(1999);
    assert.deepEqual(batcher.tick(scope), []);
    const b = f.event("b");
    await router.accept(b);
    f.clock.advance(1999);
    assert.deepEqual(batcher.tick(scope), []);
    await router.accept({ ...a, receivedAt: f.clock.now() }); // retry does not extend quiet window
    f.clock.advance(1);
    const restarted = new TextBatcher(
      new InboundRouter(f.store, f.clock, policy, []),
    );
    assert.equal(restarted.tick(scope).length, 1);
    const rows = f.store.transaction((tx) => tx.list("handoffs", scope, 100));
    assert.deepEqual(rows[0]?.eventIds, [a.eventId, b.eventId]);
    assert.equal(
      f.store.transaction((tx) => tx.list("inbox", scope, 100)).length,
      2,
    );
    assert.deepEqual(restarted.tick(scope), []);
  } finally {
    f.close();
  }
});
test("non-text wakes immediately; outbound echoes and operational events do not create reply loops", async () => {
  const f = fixture();
  try {
    const reducers: EventReducer[] = [
      "receipt",
      "reaction",
      "group",
      "typing",
    ].map((type) => ({ type: type as EventReducer["type"], reduce: () => {} }));
    const router = new InboundRouter(f.store, f.clock, policy, reducers);
    await router.accept(
      f.event("media", { type: "attachment", id: "a", mimeType: "image/png" }),
    );
    for (const c of [
      { type: "read", target: { id: "same" } },
      { type: "reaction", emoji: "❤️", target: { id: "same" } },
      { type: "rename", displayName: "n" },
      { type: "typing", state: "stop" },
    ])
      await router.accept(f.event(JSON.stringify(c), c));
    await router.accept({ ...f.event("echo"), direction: "outbound" });
    assert.equal(
      f.store.transaction((tx) => tx.list("handoffs", scope, 100)).length,
      1,
    );
    assert.equal(
      f.store.transaction((tx) => tx.list("inbox", scope, 100)).length,
      6,
    );
  } finally {
    f.close();
  }
});
test("distinct events targeting one message survive dedupe and out-of-order arrivals", async () => {
  const f = fixture();
  try {
    let reductions = 0;
    const router = new InboundRouter(f.store, f.clock, policy, [
      {
        type: "receipt",
        reduce: () => {
          reductions++;
        },
      },
    ]);
    const read = f.event("read-2", { type: "read", target: { id: "same" } });
    assert.equal(read.type, "receipt");
    if (read.type !== "receipt") return;
    const delivered: IncomingEvent = {
      ...read,
      eventId: "delivered-1",
      receipt: "delivered",
      ordering: { source: "provider", sequence: "1" },
    };
    await router.accept(read);
    await router.accept(delivered);
    await router.accept(read);
    assert.equal(reductions, 2);
    assert.equal(
      f.store.transaction((tx) => tx.list("inbox", scope, 100)).length,
      2,
    );
  } finally {
    f.close();
  }
});
test("reducer state and continuation commit atomically; early correlation remains durable and retries", async () => {
  const f = fixture();
  try {
    let ready = false;
    const reducer: EventReducer = {
      type: "reaction",
      reduce: (e, tx) => {
        tx.put(
          "unresolved",
          {
            id: "derived",
            scope,
            revision: 0,
            eventId: e.eventId,
            reason: "test-derived-state",
            checkpointId: null,
          },
          null,
        );
        if (!ready) throw new CorrelationPending("parent-not-yet-seen");
      },
    };
    const router = new InboundRouter(
      f.store,
      f.clock,
      { route: () => taskRoute, continuation: () => true },
      [reducer],
    );
    const e = f.event("reaction", {
      type: "reaction",
      target: { id: "future" },
      emoji: "❤️",
    });
    await router.accept(e);
    assert.equal(
      f.store.transaction((tx) => tx.get("unresolved", "derived")),
      undefined,
    );
    assert.equal(
      f.store.transaction((tx) => tx.get("inbox", e.eventId))?.state,
      "unresolved",
    );
    assert.equal(
      f.store.transaction((tx) => tx.list("handoffs", scope, 100)).length,
      0,
    );
    ready = true;
    router.reduce([e.eventId]);
    assert.ok(f.store.transaction((tx) => tx.get("unresolved", "derived")));
    assert.equal(
      f.store.transaction((tx) => tx.list("handoffs", scope, 100)).length,
      1,
    );
  } finally {
    f.close();
  }
});
test("persistence failure prevents acceptance and wake; crash in reduction leaves inbox replayable", async () => {
  const f = fixture();
  try {
    const failing: TransactionStore = {
      transaction: () => {
        throw new Error("disk-full");
      },
      close: () => {},
    };
    await assert.rejects(
      new InboundRouter(failing, f.clock, policy, []).accept(f.event()),
      /disk-full/,
    );
    const router = new InboundRouter(f.store, f.clock, policy, [
      {
        type: "message",
        reduce: () => {
          throw new Error("crash");
        },
      },
    ]);
    const media = f.event("media", { type: "attachment", id: "a" });
    await assert.rejects(router.accept(media), /crash/);
    assert.equal(
      f.store.transaction((tx) => tx.get("inbox", media.eventId))?.state,
      "pending",
    );
    assert.equal(
      f.store.transaction((tx) => tx.list("handoffs", scope, 100)).length,
      0,
    );
  } finally {
    f.close();
  }
});
test("wake retries the same committed identity after SQLite close/reopen; claims and cancellations are honored", async () => {
  const f = fixture();
  let reopened: SQLiteStore | undefined;
  try {
    const router = new InboundRouter(f.store, f.clock, policy, []);
    await router.accept(f.event("media", { type: "attachment", id: "a" }));
    const seen: string[] = [];
    const wake = new ExistingGrokWakeAdapter({
      notifyExistingTask: async (p) => {
        assert.ok(
          (reopened ?? f.store).transaction((tx) =>
            tx.get("handoffs", p.handoffId),
          ),
        );
        seen.push(p.handoffId);
        return seen.length === 1 ? "failed" : "accepted";
      },
    });
    assert.equal(
      (
        await new WakeDispatcher(f.store, f.clock, wake).tick(scope, taskRoute)
      )[0]?.status,
      "failed",
    );
    f.store.close();
    reopened = new SQLiteStore(f.path);
    assert.equal(
      (
        await new WakeDispatcher(reopened, f.clock, wake).tick(scope, taskRoute)
      )[0]?.status,
      "accepted",
    );
    assert.equal(seen[0], seen[1]);
    reopened.transaction((tx) => {
      const row = tx.get("tasks", taskRoute.taskId)!;
      tx.put(
        "tasks",
        { ...row, cancelledAt: f.clock.now(), revision: row.revision + 1 },
        row.revision,
      );
    });
    assert.deepEqual(
      await new WakeDispatcher(reopened, f.clock, wake).tick(scope, taskRoute),
      [],
    );
  } finally {
    if (reopened) {
      reopened.close();
    } else {
      f.store.close();
    }
  }
});
test("cancellation never discards batched text; new generation can accept retained inputs", async () => {
  const f = fixture();
  try {
    const route = { ...taskRoute };
    const router = new InboundRouter(
        f.store,
        f.clock,
        { route: () => route },
        [],
      ),
      batch = new TextBatcher(router);
    const e = f.event();
    await router.accept(e);
    f.clock.advance(2000);
    f.store.transaction((tx) => {
      const t = tx.get("tasks", route.taskId)!;
      tx.put(
        "tasks",
        { ...t, cancelledAt: 1, revision: t.revision + 1 },
        t.revision,
      );
    });
    batch.tick(scope);
    assert.equal(
      f.store.transaction((tx) => tx.get("inbox", e.eventId))?.state,
      "unresolved",
    );
    route.generation++;
    f.store.transaction((tx) => {
      const t = tx.get("tasks", route.taskId)!;
      tx.put(
        "tasks",
        {
          ...t,
          generation: route.generation,
          cancelledAt: null,
          revision: t.revision + 1,
        },
        t.revision,
      );
    });
    assert.equal(batch.tick(scope).length, 1);
  } finally {
    f.close();
  }
});
test("checkpoint barrier never skips a missing preceding event; public restart recovery limit stays explicit", async () => {
  const f = fixture();
  try {
    const router = new InboundRouter(f.store, f.clock, policy, []);
    const a = f.event("a"),
      b = f.event("b");
    await router.accept(b);
    assert.equal(
      f.store.transaction((tx) =>
        contiguousDurablePrefix(tx, scope, [a.eventId, b.eventId]),
      ),
      0,
    );
    await router.accept(a);
    assert.equal(
      f.store.transaction((tx) =>
        contiguousDurablePrefix(tx, scope, [a.eventId, b.eventId]),
      ),
      2,
    );
    assert.equal(recoveryEvidence.publicResumeCursor, false);
  } finally {
    f.close();
  }
});
test("local capture replay closes the pre-inbox crash window and reports missing routes", async () => {
  const f = fixture();
  try {
    f.captures.put(snapshot());
    const bad = {
      ...snapshot("bad"),
      space: { ...snapshot().space, phone: "unconfigured" },
    };
    f.captures.put(bad);
    const router = new InboundRouter(f.store, f.clock, policy, []);
    const unknown = await recoverCaptures(
      f.captures.ids(),
      f.captures,
      routes,
      f.clock,
      (e) => router.accept(e),
    );
    assert.equal(unknown.length, 1);
    assert.equal(
      f.store.transaction((tx) => tx.list("inbox", scope, 100)).length,
      1,
    );
  } finally {
    f.close();
  }
});
test("historical text bursts stay separate after delayed restart recovery", async () => {
  const f = fixture();
  try {
    const router = new InboundRouter(f.store, f.clock, policy, []),
      batcher = new TextBatcher(router);
    await router.accept(f.event("first"));
    f.clock.advance(2000);
    await router.accept(f.event("second"));
    f.clock.advance(2000);
    assert.equal(batcher.tick(scope).length, 2);
  } finally {
    f.close();
  }
});
test("poll capture can be promoted from unresolved after authoritative correlation arrives", async () => {
  const f = fixture();
  try {
    const raw = snapshot("vote", {
        type: "poll_option",
        option: { title: "A" },
        poll: { title: "Q", options: [{ title: "A" }] },
        selected: true,
      }),
      capture = f.captures.put(raw);
    const router = new InboundRouter(
      f.store,
      f.clock,
      { route: () => taskRoute, continuation: () => true },
      [{ type: "poll", reduce: () => {} }],
    );
    const early = normalizeCaptured(raw, capture, routes, f.clock.now());
    await router.accept(early);
    const poll = {
        version: 1 as const,
        kind: "poll" as const,
        id: "poll",
        messageId: "message",
        scope,
      },
      option = {
        version: 1 as const,
        kind: "poll-option" as const,
        id: "option",
        pollId: poll.id,
        scope,
      };
    const later = normalizeCaptured(raw, capture, routes, f.clock.now() + 10, {
      poll: () => ({ poll, option }),
    });
    assert.equal(early.eventId, later.eventId);
    await router.accept(later);
    assert.equal(
      f.store.transaction((tx) => tx.get("inbox", early.eventId))?.event.type,
      "poll",
    );
    assert.equal(
      f.store.transaction((tx) => tx.list("handoffs", scope, 100)).length,
      1,
    );
  } finally {
    f.close();
  }
});
test("JSON key order does not alter logical event identity", () => {
  const f = fixture();
  try {
    const a = snapshot("one", { type: "text", text: "hello" }),
      b = snapshot("one", { text: "hello", type: "text" });
    assert.equal(
      normalizeCaptured(a, f.captures.put(a), routes, 1).eventId,
      normalizeCaptured(b, f.captures.put(b), routes, 2).eventId,
    );
  } finally {
    f.close();
  }
});
test("simple contacts normalize; richer unsupported contacts retain full capture", () => {
  const f = fixture();
  try {
    assert.equal(
      f.event("simple", {
        type: "contact",
        name: { formatted: "Alice" },
        phones: [{ value: "+15555550199" }],
        emails: [],
      }).type,
      "message",
    );
    assert.equal(
      f.event("rich", {
        type: "contact",
        name: { formatted: "Alice" },
        note: "preserve this",
      }).type,
      "unresolved",
    );
    assert.equal(
      f.event("bad-attachment", { type: "attachment" }).type,
      "unresolved",
    );
  } finally {
    f.close();
  }
});
test("host pump batches before dispatch and retries a failed wake using the same work", async () => {
  const { InboundPump } = await import("../../../src/runtime/inbound/pump.js");
  const f = fixture();
  try {
    const router = new InboundRouter(f.store, f.clock, policy, []),
      seen: string[] = [],
      reports: string[] = [];
    const wake = new WakeDispatcher(f.store, f.clock, {
      wake: async (p) => {
        seen.push(p.handoffId);
        return { status: seen.length === 1 ? "failed" : "accepted" };
      },
    });
    const pump = new InboundPump(
      () => [{ scope, task: taskRoute }],
      new TextBatcher(router),
      wake,
      (c) => reports.push(c),
    );
    await router.accept(f.event());
    await pump.tick();
    assert.equal(seen.length, 0);
    f.clock.advance(2000);
    await pump.tick();
    await pump.tick();
    assert.equal(seen.length, 2);
    assert.equal(seen[0], seen[1]);
    assert.deepEqual(reports, ["WAKE_RETRY_PENDING"]);
    await pump.stop();
  } finally {
    f.close();
  }
});
test("cross-scope targets and conflicting reuse of an event identity are rejected", async () => {
  const f = fixture();
  try {
    const router = new InboundRouter(f.store, f.clock, policy, []),
      event = f.event();
    await router.accept(event);
    await assert.rejects(
      router.accept({ ...event, direction: "outbound" }),
      /EVENT_ID_COLLISION/,
    );
    if (event.type === "message")
      await assert.rejects(
        router.accept({
          ...event,
          eventId: "cross-scope",
          message: { ...event.message, scope: { ...scope, lineId: "other" } },
        }),
        /SCOPE_MISMATCH/,
      );
  } finally {
    f.close();
  }
});
test("duplicate unresolved delivery with a new capture pointer remains accepted", async () => {
  const f = fixture();
  try {
    const router = new InboundRouter(f.store, f.clock, policy, []);
    const raw = snapshot("unknown", { type: "custom", raw: { future: true } });
    const one = normalizeCaptured(
      raw,
      f.captures.put({ capturedAt: 1, message: raw }),
      routes,
      1,
    );
    const two = normalizeCaptured(
      raw,
      f.captures.put({ capturedAt: 2, message: raw }),
      routes,
      2,
    );
    assert.equal(one.eventId, two.eventId);
    await router.accept(one);
    await router.accept(two);
    assert.equal(
      f.store.transaction((tx) => tx.list("inbox", scope, 100)).length,
      1,
    );
    assert.deepEqual(
      f.store.transaction((tx) => tx.get("inbox", one.eventId))?.event,
      one,
    );
  } finally {
    f.close();
  }
});
test("async reducers cannot commit a continuation ahead of correlated state", async () => {
  const f = fixture();
  try {
    const router = new InboundRouter(f.store, f.clock, policy, [
      { type: "message", reduce: async () => {} },
    ]);
    const e = f.event("media", { type: "attachment", id: "a" });
    await assert.rejects(router.accept(e), /ASYNC_REDUCER_FORBIDDEN/);
    assert.equal(
      f.store.transaction((tx) => tx.get("inbox", e.eventId))?.state,
      "pending",
    );
    assert.equal(
      f.store.transaction((tx) => tx.list("handoffs", scope, 100)).length,
      0,
    );
  } finally {
    f.close();
  }
});
