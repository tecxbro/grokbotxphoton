import test from "node:test";
import assert from "node:assert/strict";
import { createConnection } from "node:net";
import { chmodSync, lstatSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { event, seedHandoff } from "../../fixtures/harness.js";
import {
  applyInteraction,
  eventIdentity,
} from "../../../src/adapters/state/unit-of-work.js";
import { DurableSQLiteStore } from "../../../src/adapters/state/sqlite.js";
import {
  listenDurableLocal,
  DurableLocalProtocol,
  executeChild,
  childIdentity,
} from "../../../src/runtime/core/index.js";
import {
  fixture,
  context,
  principal,
  action,
  outcome,
  binding,
  components,
} from "./fixture.js";
const noWake = { wake: async () => ({ status: "failed" as const }) };
function request(path: string, data: string | Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(path);
    let answer = "";
    socket.on("connect", () => socket.write(data));
    socket.on("data", (b) => (answer += b));
    socket.on("close", () => resolve(answer));
    socket.on("error", (e) => {
      if (
        (e as NodeJS.ErrnoException).code === "ECONNRESET" ||
        (e as NodeJS.ErrnoException).code === "EPIPE"
      )
        resolve(answer);
      else reject(e);
    });
  });
}

test("event, reducer state and continuation all roll back on a reducer crash", async (t) => {
  const f = fixture(t);
  await assert.rejects(
    applyInteraction(
      f.store,
      event,
      context,
      {
        type: "message",
        reduce: (_e, tx) => {
          tx.put(
            "polls",
            {
              id: "poll-1",
              scope: context.scope,
              revision: 0,
              reference: {
                version: 1,
                kind: "poll",
                id: "poll-1",
                messageId: "message-1",
                scope: context.scope,
              },
              question: "question",
              options: [],
            },
            null,
          );
          throw Error("crash");
        },
      },
      noWake,
      f.clock,
    ),
    /crash/,
  );
  assert.deepEqual(f.store.scan("inbox"), []);
  assert.deepEqual(f.store.scan("polls"), []);
  assert.deepEqual(f.store.scan("handoffs"), []);
});
test("persisted interaction survives a failed wake, with idempotent repeated application", async (t) => {
  const f = fixture(t);
  let reduced = 0,
    wakes = 0;
  const reducer = {
      type: "message" as const,
      reduce: () => {
        reduced++;
      },
    },
    wake = {
      wake: async () => {
        wakes++;
        throw Error("wake unavailable");
      },
    };
  const first = await applyInteraction(
      f.store,
      event,
      context,
      reducer,
      wake,
      f.clock,
    ),
    second = await applyInteraction(
      f.store,
      event,
      context,
      reducer,
      wake,
      f.clock,
    );
  assert.equal(first.wake, "unknown");
  assert.equal(first.handoffId, second.handoffId);
  assert.equal(reduced, 1);
  assert.equal(wakes, 2);
  assert.equal(f.work.list(context, 20)[0]?.id, first.handoffId);
  assert.equal(
    f.store.transaction((tx) => tx.get("inbox", eventIdentity(event))!.state),
    "reduced",
  );
  await assert.rejects(
    applyInteraction(
      f.store,
      { ...event, occurredAt: 99999 },
      context,
      reducer,
      wake,
      f.clock,
    ),
    /IDEMPOTENCY_CONFLICT/,
  );
});
test("unsupported events persist as unresolved without creating a guessed continuation", async (t) => {
  const f = fixture(t);
  const r = await applyInteraction(
    f.store,
    event,
    context,
    undefined,
    noWake,
    f.clock,
  );
  assert.equal(r.handoffId, null);
  assert.equal(f.store.scan("unresolved").length, 1);
  assert.equal(f.store.scan("inbox")[0]?.state, "unresolved");
});
test("work fencing, expiry, heartbeat and exact repeated acknowledgement", async (t) => {
  const f = fixture(t);
  seedHandoff(f.store);
  const first = f.work.change(context, "handoff-1", "claim", undefined, 1000);
  const old = first.handoff.claim!.fence;
  assert.equal(first.events[0]?.eventId, event.eventId);
  assert.equal(f.work.list(context, 20).length, 0);
  f.clock.advance(500);
  const h = f.work.change(context, "handoff-1", "heartbeat", old, 1000);
  assert.equal(h.handoff.claim!.fence, old);
  f.clock.advance(1001);
  assert.equal(f.work.list(context, 20).length, 1);
  const newer = f.work.change(context, "handoff-1", "claim", undefined, 1000);
  assert.ok(newer.handoff.claim!.fence > old);
  assert.throws(
    () => f.work.change(context, "handoff-1", "ack", old),
    /STALE_FENCE/,
  );
  const done = f.work.change(
    context,
    "handoff-1",
    "ack",
    newer.handoff.claim!.fence,
  );
  f.clock.advance(1001);
  const repeated = f.work.change(
    context,
    "handoff-1",
    "ack",
    newer.handoff.claim!.fence,
  );
  assert.deepEqual(repeated, done);
  assert.throws(
    () =>
      f.work.change(
        context,
        "handoff-1",
        "heartbeat",
        newer.handoff.claim!.fence,
      ),
    /STALE_FENCE/,
  );
});
test("work acknowledgement rejects cancellation, revocation and changed generation", async (t) => {
  const f = fixture(t);
  seedHandoff(f.store);
  const h = f.work.change(context, "handoff-1", "claim");
  f.store.transaction((tx) => {
    const task = tx.get("tasks", context.taskId)!;
    task.generation++;
    task.revision++;
    tx.put("tasks", task, task.revision - 1);
  });
  assert.throws(
    () => f.work.change(context, "handoff-1", "ack", h.handoff.claim!.fence),
    /STALE_GENERATION/,
  );
  assert.equal(f.store.scan("handoffs")[0]?.state, "claimed");
});
test("restart retains work, poll/card/session state, references and claims", async (t) => {
  const f = fixture(t);
  seedHandoff(f.store);
  const h = f.work.change(context, "handoff-1", "claim");
  f.store.transaction((tx) => {
    tx.put(
      "polls",
      {
        id: "poll-1",
        scope: context.scope,
        revision: 0,
        reference: {
          version: 1,
          kind: "poll",
          id: "poll-1",
          messageId: "message-1",
          scope: context.scope,
        },
        question: "choose",
        options: [],
      },
      null,
    );
    tx.put(
      "cards",
      {
        id: "card-1",
        scope: context.scope,
        revision: 0,
        reference: {
          version: 1,
          kind: "card",
          id: "card-1",
          messageId: "message-1",
          scope: context.scope,
        },
        templateId: "registered",
      },
      null,
    );
    tx.put(
      "sessions",
      {
        id: "session-1",
        scope: context.scope,
        revision: 0,
        reference: {
          version: 1,
          kind: "card-session",
          id: "session-1",
          cardId: "card-1",
          scope: context.scope,
        },
        allowedActionIds: ["approve"],
        generation: context.generation,
        expiresAt: 100000,
      },
      null,
    );
  });
  const r = await f.submission.submit(action(), context),
    claim = f.claims.acquire(r.requestId, "worker", 1000);
  const store = new DurableSQLiteStore(f.path);
  t.after(() => store.close());
  const fresh = components(store, f.clock);
  assert.deepEqual(store.scan("handoffs")[0]?.claim, h.handoff.claim);
  assert.equal(store.scan("polls")[0]?.question, "choose");
  assert.equal(store.scan("cards")[0]?.templateId, "registered");
  assert.equal(store.scan("sessions")[0]?.allowedActionIds[0], "approve");
  assert.equal(store.scan("references").length, 1);
  assert.deepEqual(store.scan("outbox")[0]?.claim, claim);
  f.clock.advance(1001);
  assert.equal(fresh.work.list(context, 100).length, 1);
});
test("completed multipart child is reused from its checkpoint after pre-dispatch interruption", async (t) => {
  const f = fixture(t),
    r = await f.submission.submit(action(), context);
  let sends = 0;
  const result = await f.executor.execute(
    r.requestId,
    binding(async (_a, s) => {
      await executeChild(s, 0, async () => {
        sends++;
        return outcome();
      });
      throw Error("worker interrupted before next child");
    }, "durable-children"),
  );
  assert.equal(result?.status, "blocked");
  assert.equal(
    f.store.transaction(
      (tx) => tx.get("children", childIdentity(r.requestId, 0))!.state,
    ),
    "completed",
  );
  f.recovery.retry(r.requestId, context);
  await f.executor.execute(
    r.requestId,
    binding(async (_a, s) => {
      await executeChild(s, 0, async () => {
        sends++;
        return outcome();
      });
      return executeChild(s, 1, async () => {
        sends++;
        return outcome();
      });
    }, "durable-children"),
  );
  assert.equal(sends, 2);
  assert.equal(
    (await f.submission.status(r.requestId, context)).status,
    "executor-completed",
  );
});
test("socket authenticates outside the action; framing is bounded and malformed UTF-8 is rejected", async (t) => {
  const f = fixture(t),
    token = "a".repeat(64),
    path = join(f.dir, "runtime.sock");
  const server = await listenDurableLocal(
    path,
    [{ token, principal }],
    f.protocol,
  );
  t.after(() => server.close());
  assert.equal(lstatSync(path).mode & 0o777, 0o600);
  const frame = {
    token,
    request: {
      version: 1,
      method: "diagnostics",
      contextId: context.contextId,
    },
  };
  const good = JSON.parse(await request(path, JSON.stringify(frame) + "\n"));
  assert.deepEqual(good.result, { ready: false, activation: "disabled" });
  const bad = JSON.parse(
    await request(
      path,
      JSON.stringify({ ...frame, token: "b".repeat(64) }) + "\n",
    ),
  );
  assert.equal(bad.error.code, "UNAUTHENTICATED");
  assert.equal(JSON.parse(await request(path, "{\n")).ok, false);
  assert.equal(await request(path, "x".repeat(262145)), "");
  assert.equal(
    JSON.parse(await request(path, Buffer.from([0xff, 10]))).ok,
    false,
  );
  assert.equal(
    JSON.parse(
      await request(
        path,
        JSON.stringify(frame) + "\n" + JSON.stringify(frame) + "\n",
      ),
    ).ok,
    false,
  );
  const forged = JSON.parse(
    await request(
      path,
      JSON.stringify({
        token,
        request: {
          version: 1,
          method: "submit",
          action: { ...action(), authorized: true },
        },
      }) + "\n",
    ),
  );
  assert.equal(forged.error.code, "INVALID_REQUEST");
});
test("protocol exposes no credential or other-task data in diagnostics/status errors", async (t) => {
  const f = fixture(t),
    token = "c".repeat(64),
    path = join(f.dir, "secrets.sock");
  const p = new DurableLocalProtocol({
    contexts: f.contexts,
    submission: f.submission,
    work: f.work,
    capabilities: () => [],
    diagnostics: () => ({
      ready: true,
      activation: "disabled",
      token,
      password: "sensitive",
    }),
  });
  const server = await listenDurableLocal(path, [{ token, principal }], p);
  t.after(() => server.close());
  for (const req of [
    { version: 1, method: "diagnostics", contextId: context.contextId },
    {
      version: 1,
      method: "status",
      contextId: context.contextId,
      requestId: "guess",
    },
  ]) {
    const answer = await request(
      path,
      JSON.stringify({ token, request: req }) + "\n",
    );
    assert.ok(!answer.includes(token));
    assert.ok(!answer.includes("sensitive"));
    assert.ok(!answer.includes("password"));
  }
});
test("socket refuses existing paths, public directories and malformed configured credentials", async (t) => {
  const f = fixture(t),
    path = join(f.dir, "occupied");
  writeFileSync(path, "keep");
  await assert.rejects(
    listenDurableLocal(
      path,
      [{ token: "a".repeat(64), principal }],
      f.protocol,
    ),
    /SOCKET_PATH_EXISTS/,
  );
  await assert.rejects(
    listenDurableLocal(
      join(f.dir, "bad"),
      [{ token: "z".repeat(64), principal }],
      f.protocol,
    ),
    /INVALID_LOCAL_CREDENTIAL/,
  );
  chmodSync(f.dir, 0o755);
  await assert.rejects(
    listenDurableLocal(
      join(f.dir, "public"),
      [{ token: "a".repeat(64), principal }],
      f.protocol,
    ),
    /PRIVATE_DIRECTORY_REQUIRED/,
  );
  chmodSync(f.dir, 0o700);
});

test("an accidentally async reducer cannot commit a continuation before its state", async (t) => {
  const f = fixture(t);
  await assert.rejects(
    applyInteraction(
      f.store,
      event,
      context,
      {
        type: "message",
        reduce: async (_e, tx) => {
          await Promise.resolve();
          tx.put(
            "unresolved",
            {
              id: "late",
              revision: 0,
              scope: context.scope,
              eventId: "event-1",
              reason: "late",
              checkpointId: null,
            },
            null,
          );
        },
      },
      noWake,
      f.clock,
    ),
    /INVALID_REQUEST/,
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(f.store.scan("inbox").length, 0);
  assert.equal(f.store.scan("handoffs").length, 0);
  assert.equal(f.store.scan("unresolved").length, 0);
});
