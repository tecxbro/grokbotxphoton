import test from "node:test";
import assert from "node:assert/strict";
import { FixedClock, context } from "../../fixtures/harness.js";
import {
  buildRegistry,
  type ExecutionServices,
  type Action,
} from "../../../src/index.js";
import { TypingLeases } from "../../../src/runtime/typing/leases.js";
import { createTypingModule } from "../../../src/runtime/typing/operations.js";
import {
  FakeTimers,
  deferred,
  settle,
  scope,
  scoped,
  fixture,
} from "./helpers.js";
function setup() {
  const clock = new FixedClock(),
    timers = new FakeTimers(clock),
    calls: string[] = [],
    reports: string[] = [];
  const space = {
    startTyping: async () => {
      calls.push("start");
    },
    stopTyping: async () => {
      calls.push("stop");
    },
  };
  const leases = new TypingLeases(
    clock,
    async () => space,
    timers,
    (code) => reports.push(code),
  );
  return { clock, timers, calls, reports, space, leases };
}
test("delayed start cancelled before dispatch; expiry and timeout stop active typing", async () => {
  const { leases, timers, calls } = setup();
  const a = leases.begin(scope, 1, 1000, { delayMs: 100 })!;
  leases.end(a);
  await timers.advance(100);
  assert.deepEqual(calls, []);
  leases.begin(scope, 2, 1000, { delayMs: 100 });
  await timers.advance(99);
  assert.deepEqual(calls, []);
  await timers.advance(1);
  assert.deepEqual(calls, ["start"]);
  await timers.advance(900);
  assert.deepEqual(calls, ["start", "stop"]);
});
test("old generation and old same-generation ticket cannot stop newer indicator", async () => {
  const { leases, calls } = setup();
  const a = leases.begin(scope, 1, 1000)!;
  await settle();
  const b = leases.begin(scope, 2, 1000)!;
  leases.end(a);
  await settle();
  assert.deepEqual(calls, ["start"]);
  assert.equal(leases.begin(scope, 1, 1000), undefined);
  const c = leases.begin(scope, 2, 1000)!;
  leases.end(b);
  await settle();
  assert.deepEqual(calls, ["start"]);
  leases.end(c);
  await settle();
  assert.deepEqual(calls, ["start", "stop"]);
});
test("late start after cancellation is followed by stop", async () => {
  const { leases, space, calls } = setup(),
    start = deferred();
  space.startTyping = async () => {
    calls.push("start");
    await start.promise;
  };
  const a = leases.begin(scope, 1, 1000)!;
  await settle();
  leases.end(a);
  assert.deepEqual(calls, ["start"]);
  start.resolve();
  await settle();
  assert.deepEqual(calls, ["start", "stop"]);
});
test("delayed stop completes before newer start; stale completion cannot leave new generation off", async () => {
  const { leases, space, calls } = setup(),
    stop = deferred();
  space.stopTyping = async () => {
    calls.push("stop");
    await stop.promise;
  };
  const a = leases.begin(scope, 1, 1000)!;
  await settle();
  leases.end(a);
  await settle();
  leases.begin(scope, 2, 1000);
  await settle();
  assert.deepEqual(calls, ["start", "stop"]);
  stop.resolve();
  await settle();
  assert.deepEqual(calls, ["start", "stop", "start"]);
});
test("overlapping start generations need no stale stop", async () => {
  const { leases, space, calls } = setup(),
    start = deferred();
  space.startTyping = async () => {
    calls.push("start");
    await start.promise;
  };
  const a = leases.begin(scope, 1, 1000)!;
  await settle();
  leases.begin(scope, 2, 1000);
  leases.end(a);
  start.resolve();
  await settle();
  assert.deepEqual(calls, ["start"]);
});
test("slow resolver cannot replay expired typing-start work", async () => {
  const { clock, timers, space, calls } = setup(),
    resolve = deferred<typeof space>();
  const leases = new TypingLeases(clock, () => resolve.promise, timers);
  leases.begin(scope, 1, 100);
  await timers.advance(100);
  resolve.resolve(space);
  await settle();
  assert.deepEqual(calls, []);
});
test("completion, error, abort, and long-worker waiting run the stop path", async () => {
  for (const terminal of ["completion", "error", "abort", "waiting"]) {
    const { leases, calls } = setup(),
      abort = new AbortController();
    const work = leases.responding(
      scope,
      1,
      async (ticket) => {
        await settle();
        assert.deepEqual(calls, ["start"]);
        if (terminal === "error") throw new Error("worker-error");
        if (terminal === "abort") abort.abort();
        if (terminal === "waiting") leases.waiting(ticket!);
        return "reply";
      },
      { signal: abort.signal },
    );
    if (terminal === "error") await assert.rejects(work, /worker-error/);
    else assert.equal(await work, "reply");
    await settle();
    assert.deepEqual(calls, ["start", "stop"]);
  }
});
test("typing rejection and hung control never block real response", async () => {
  for (const failure of ["reject", "hang"]) {
    const { leases, space, calls } = setup();
    space.startTyping = async () => {
      calls.push("start");
      if (failure === "reject") throw new Error("provider");
      await deferred().promise;
    };
    assert.equal(
      await leases.responding(scope, 1, async () => {
        calls.push("reply");
        return "delivered-by-test";
      }),
      "delivered-by-test",
    );
    assert.ok(calls.includes("reply"));
  }
});
test("shutdown, connection loss, restoration, and restart invalidate prior starts", async () => {
  const { leases, calls, clock, timers, space } = setup();
  leases.begin(scope, 1, 1000);
  await settle();
  leases.connectionLost();
  await settle();
  assert.deepEqual(calls, ["start", "stop"]);
  assert.equal(leases.begin(scope, 2, 1000), undefined);
  leases.connectionRestored();
  await settle();
  assert.equal(calls.length, 2);
  leases.begin(scope, 2, 1000);
  await settle();
  leases.shutdown();
  await settle();
  assert.deepEqual(calls, ["start", "stop", "start", "stop"]);
  assert.equal(leases.begin(scope, 3, 1000), undefined);
  const restarted = new TypingLeases(clock, async () => space, timers);
  await timers.advance(2000);
  assert.equal(calls.length, 4);
  assert.equal(restarted.evidence().persistentStarts, false);
});
test("failure reports unknown visibility and does not spin on failed stop", async () => {
  const { leases, calls, space, reports, timers } = setup();
  space.stopTyping = async () => {
    calls.push("stop");
    throw new Error("offline");
  };
  const ticket = leases.begin(scope, 1, 1000)!;
  await settle();
  leases.end(ticket);
  await settle();
  await timers.advance(5000);
  assert.deepEqual(calls, ["start", "stop"]);
  assert.ok(reports.includes("TYPING_STOP_UNKNOWN"));
  assert.equal(leases.evidence().visible, "unknown");
});
test("explicit typing module consumes F0 services and persisted execution identity; expired starts do not replay", async () => {
  const f = fixture(),
    { leases, calls, clock } = setup();
  try {
    const action: Action = {
      version: 1,
      idempotencyKey: "typing-key",
      contextId: context.contextId,
      operation: "typing.begin",
      arguments: { space: scoped(scope), ttlMs: 1000 },
    };
    const services: ExecutionServices = {
      context: {
        ...context,
        scope,
        permissions: ["typing.begin", "typing.end"],
      },
      clock,
      claim: {
        owner: "owner",
        fence: 1,
        generation: 1,
        leaseUntil: clock.now() + 5000,
      },
      signal: new AbortController().signal,
      transactions: f.store,
      resources: {
        resolve: async (ref) => ref,
        space: async () => {
          throw new Error("unused");
        },
        message: async () => {
          throw new Error("unused");
        },
      },
      media: {
        resolve: async () => {
          throw new Error("unused");
        },
      },
      streams: {
        open: async () => {
          throw new Error("unused");
        },
      },
    };
    let expired = false;
    const module = createTypingModule(leases, () => ({
      requestId: "persisted-request-id",
      resultRevision: 2,
      expiresAt: expired ? 0 : clock.now() + 1000,
      assertCurrent: () => {},
    }));
    const registry = buildRegistry([module], { requireComplete: false });
    const result = await registry.handlers
      .get("typing.begin")!
      .execute(action, services);
    await settle();
    assert.equal(result.requestId, "persisted-request-id");
    assert.equal(result.status, "executor-completed");
    assert.deepEqual(calls, ["start"]);
    assert.deepEqual(result.references, []);
    assert.deepEqual(result.observations, []);
    await registry.handlers.get("typing.end")!.execute(
      {
        ...action,
        operation: "typing.end",
        arguments: { space: scoped(scope) },
      },
      services,
    );
    await settle();
    assert.deepEqual(calls, ["start", "stop"]);
    expired = true;
    await assert.rejects(
      registry.handlers.get("typing.begin")!.execute(action, services),
      /EXPIRED/,
    );
    assert.equal(
      await module.recoveryCodecs[0]!.reconcile({ expiresAt: 0 }, services),
      "completed",
    );
  } finally {
    f.close();
  }
});
test("bounded shutdown reports a hung control without claiming a stop", async () => {
  const { leases, space, reports } = setup();
  space.startTyping = async () => {
    await deferred().promise;
  };
  leases.begin(scope, 1, 1000);
  await settle();
  leases.shutdown();
  assert.equal(await leases.drain(10), false);
  assert.ok(reports.includes("TYPING_SHUTDOWN_INCOMPLETE"));
});
test("dispatch revalidates the fence after a delayed resolver", async () => {
  const { clock, timers, space, calls } = setup(),
    resolve = deferred<typeof space>();
  let valid = true;
  const leases = new TypingLeases(clock, () => resolve.promise, timers);
  leases.begin(scope, 1, 1000, {
    validate: () => {
      if (!valid) throw new Error("STALE_FENCE");
    },
  });
  valid = false;
  resolve.resolve(space);
  await settle();
  assert.ok(!calls.includes("start"));
});
test("old start rejection cannot cancel a newer generation", async () => {
  const { leases, space, calls } = setup(),
    old = deferred();
  let count = 0;
  space.startTyping = async () => {
    calls.push("start");
    if (++count === 1) await old.promise;
  };
  leases.begin(scope, 1, 1000);
  await settle();
  leases.begin(scope, 2, 1000);
  old.reject(new Error("old-failure"));
  await settle();
  assert.deepEqual(calls, ["start", "stop", "start"]);
  leases.end({ scope, generation: 1 });
  await settle();
  assert.equal(calls.length, 3);
});
test("old stop rejection cannot cancel a newer generation", async () => {
  const { leases, space, calls } = setup(),
    old = deferred();
  space.stopTyping = async () => {
    calls.push("stop");
    await old.promise;
  };
  const a = leases.begin(scope, 1, 1000)!;
  await settle();
  leases.end(a);
  await settle();
  leases.begin(scope, 2, 1000);
  old.reject(new Error("old-failure"));
  await settle();
  assert.deepEqual(calls, ["start", "stop", "start"]);
});
