import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type ResourceRef } from "../../../src/index.js";
import { DurableSQLiteStore } from "../../../src/adapters/state/sqlite.js";
import {
  executeChild,
  childIdentity,
  fencedStore,
  RuntimeFault,
} from "../../../src/runtime/core/index.js";
import {
  fixture,
  action,
  context,
  principal,
  binding,
  outcome,
  deferred,
  components,
  seed,
} from "./fixture.js";
function worker(
  mode: string,
  path: string,
  id = "",
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(
      process.execPath,
      [
        fileURLToPath(new URL("./process-worker.js", import.meta.url)),
        mode,
        path,
        id,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "",
      error = "";
    p.stdout.on("data", (b) => (output += b));
    p.stderr.on("data", (b) => (error += b));
    p.on("error", reject);
    p.on("exit", (code) => {
      if (code !== 0 && code !== 23) reject(Error(error));
      else resolve({ code, output });
    });
  });
}

test("two processes concurrently reserve the same identity in a real SQLite file", async (t) => {
  const f = fixture(t);
  const rows = await Promise.all(
    Array.from({ length: 4 }, () => worker("reserve", f.path)),
  );
  assert.equal(new Set(rows.map((r) => r.output)).size, 1);
  assert.equal(f.store.scan("outbox").length, 1);
  await assert.rejects(
    f.submission.submit(
      {
        ...action(),
        arguments: { ...action().arguments, text: "changed" },
      } as ReturnType<typeof action>,
      context,
    ),
    /IDEMPOTENCY_CONFLICT/,
  );
});
test("admission rejects unknown operations/fields, huge text, and forged authorization", async (t) => {
  const f = fixture(t);
  for (const invalid of [
    { ...action(), authorized: true },
    { ...action(), operation: "shell.exec" },
    {
      ...action(),
      arguments: { space: action().arguments, text: "x".repeat(16001) },
    },
    { ...action(), arguments: { ...action().arguments, unknown: true } },
  ]) {
    const r = (await f.protocol.dispatch(
      { version: 1, method: "submit", action: invalid },
      principal,
    )) as { ok: boolean; error: { code: string } };
    assert.equal(r.ok, false);
    assert.equal(r.error.code, "INVALID_REQUEST");
  }
  assert.equal(f.store.scan("outbox").length, 0);
});
test("wrong principal, context, chat, line, reference ownership and expired contexts fail", async (t) => {
  const f = fixture(t);
  await assert.rejects(
    f.contexts.resolve({ ...principal, id: "intruder" }, context.contextId),
    /FORBIDDEN/,
  );
  await assert.rejects(
    f.submission.submit({ ...action(), contextId: "guessed" }, context),
    /FORBIDDEN/,
  );
  for (const changed of [{ spaceId: "elsewhere" }, { lineId: "other-line" }]) {
    const a = action();
    if (a.operation !== "text.send") throw Error();
    a.arguments.space.scope = { ...context.scope, ...changed };
    await assert.rejects(f.submission.submit(a, context), /SCOPE_MISMATCH/);
  }
  f.store.transaction((tx) => {
    const r = tx.get("references", context.scope.spaceId)!;
    r.ownedByPrincipalId = "intruder";
    r.revision++;
    tx.put("references", r, r.revision - 1);
  });
  await assert.rejects(
    f.submission.submit(action(), context),
    /RESOURCE_NOT_FOUND/,
  );
  f.clock.advance(context.expiresAt);
  await assert.rejects(
    f.contexts.resolve(principal, context.contextId),
    /CONTEXT_EXPIRED/,
  );
});
test("read/status/cancel/diagnostics enforce task identity and current generation", async (t) => {
  const f = fixture(t),
    request = await f.submission.submit(action(), context);
  const c = {
    ...context,
    contextId: "context-2",
    taskId: "task-2",
    scope: { ...context.scope, spaceId: "space-2" },
  };
  seed(f.store, c);
  await assert.rejects(
    f.submission.status(request.requestId, c),
    /RESOURCE_NOT_FOUND/,
  );
  await assert.rejects(
    f.submission.cancel(request.requestId, c),
    /RESOURCE_NOT_FOUND/,
  );
  f.store.transaction((tx) => {
    const task = tx.get("tasks", context.taskId)!;
    task.generation++;
    task.revision++;
    tx.put("tasks", task, task.revision - 1);
  });
  const response = (await f.protocol.dispatch(
    { version: 1, method: "diagnostics", contextId: context.contextId },
    principal,
  )) as { ok: boolean; error: { code: string } };
  assert.equal(response.error.code, "STALE_GENERATION");
  await assert.rejects(
    f.submission.status(request.requestId, context),
    /STALE_GENERATION/,
  );
});
test("revocation before execution prevents the handler invocation", async (t) => {
  const f = fixture(t),
    r = await f.submission.submit(action(), context);
  let calls = 0;
  f.store.transaction((tx) => {
    const c = tx.get("contexts", context.contextId)!;
    c.context.revokedAt = f.clock.now();
    c.revision++;
    tx.put("contexts", c, c.revision - 1);
  });
  await assert.rejects(
    f.executor.execute(
      r.requestId,
      binding(async () => {
        calls++;
        return outcome();
      }),
    ),
    /CONTEXT_REVOKED/,
  );
  assert.equal(calls, 0);
  assert.equal(f.recovery.recover().blocked, 1);
});
test("admin operations need an explicit host policy and approved recipients", async (t) => {
  const f = fixture(t);
  f.store.transaction((tx) => {
    const c = tx.get("contexts", context.contextId)!;
    c.context.permissions.push("space.create");
    c.revision++;
    tx.put("contexts", c, c.revision - 1);
  });
  await assert.rejects(
    f.submission.submit(
      {
        version: 1,
        contextId: context.contextId,
        idempotencyKey: "admin",
        operation: "space.create",
        arguments: { members: ["+15555550100"] },
      },
      context,
    ),
    /FORBIDDEN/,
  );
});
test("executor completed void is distinct from provider accepted and delivered", async (t) => {
  const f = fixture(t);
  const a = await f.submission.submit(action(), context);
  const result = await f.executor.execute(a.requestId, binding());
  assert.equal(result?.status, "executor-completed");
  assert.deepEqual(result?.references, []);
  assert.deepEqual(result?.observations, []);
  assert.deepEqual(result?.value, { type: "void" });
  const b = await f.submission.submit(action("key-2"), context);
  const accepted = await f.executor.execute(
    b.requestId,
    binding(async () => outcome("provider-accepted")),
  );
  assert.equal(accepted?.status, "provider-accepted");
  assert.equal(accepted?.observations[0]?.kind, "accepted");
});
test("capability unavailability blocks before a provider call", async (t) => {
  const f = fixture(t),
    a = await f.submission.submit(action(), context);
  let calls = 0;
  const b = binding(async () => {
    calls++;
    return outcome();
  });
  const cap = b.capability(context);
  b.capability = () => ({ ...cap, providerSupport: "unknown" });
  assert.equal((await f.executor.execute(a.requestId, b))?.status, "blocked");
  assert.equal(calls, 0);
  assert.equal(f.store.scan("attempts").length, 0);
});
test("per-line FIFO prevents overtaking; bounded concurrency does not duplicate a running request", async (t) => {
  const f = fixture(t, 1),
    first = await f.submission.submit(action(), context),
    second = await f.submission.submit(action("next"), context),
    started = deferred(),
    finish = deferred();
  assert.equal(f.claims.acquire(second.requestId, "other", 1000), null);
  const run = f.executor.execute(
    first.requestId,
    binding(async () => {
      started.resolve();
      await finish.promise;
      return outcome();
    }),
  );
  await started.promise;
  assert.equal(await f.executor.execute(second.requestId, binding()), null);
  assert.equal(await f.executor.execute(first.requestId, binding()), null);
  finish.resolve();
  await run;
  assert.equal(
    (await f.executor.execute(second.requestId, binding()))?.status,
    "executor-completed",
  );
});
test("heartbeat preserves the fence; expired owners cannot write or heartbeat after reclaim", async (t) => {
  const f = fixture(t),
    r = await f.submission.submit(action(), context),
    old = f.claims.acquire(r.requestId, "old", 1000)!;
  f.clock.advance(500);
  f.claims.heartbeat(r.requestId, old, 1000);
  assert.equal(
    f.store.transaction((tx) => tx.get("outbox", r.requestId)!.claim!.fence),
    old.fence,
  );
  f.clock.advance(1001);
  assert.equal(f.recovery.recover().requeued, 1);
  const current = f.claims.acquire(r.requestId, "new", 1000)!;
  assert.ok(current.fence > old.fence);
  assert.throws(
    () => f.claims.heartbeat(r.requestId, old, 1000),
    /STALE_FENCE/,
  );
  assert.throws(
    () => fencedStore(f.claims, r.requestId, old).transaction(() => {}),
    /STALE_FENCE/,
  );
});
test("pre-dispatch cancellation is cancelled; cancellation during transmission stays unknown", async (t) => {
  const f = fixture(t),
    a = await f.submission.submit(action(), context);
  await f.submission.cancel(a.requestId, context);
  assert.equal(await f.executor.execute(a.requestId, binding()), null);
  assert.equal(
    (await f.submission.status(a.requestId, context)).status,
    "cancelled",
  );
  const b = await f.submission.submit(action("race"), context),
    started = deferred(),
    finish = deferred();
  const run = f.executor.execute(
    b.requestId,
    binding(async () => {
      started.resolve();
      await finish.promise;
      return outcome("provider-accepted");
    }),
  );
  await started.promise;
  await f.submission.cancel(b.requestId, context);
  finish.resolve();
  await run;
  assert.equal(
    (await f.submission.status(b.requestId, context)).status,
    "unknown-outcome",
  );
  assert.equal(
    f.store.scan("children").find((c) => c.requestId === b.requestId)?.state,
    "unknown",
  );
});
test("revocation between multipart sends blocks the later callback and preserves the first result", async (t) => {
  const f = fixture(t),
    r = await f.submission.submit(action(), context);
  let sends = 0;
  await f.executor.execute(
    r.requestId,
    binding(async (_a, s) => {
      await executeChild(s, 0, async () => {
        sends++;
        return outcome();
      });
      f.store.transaction((tx) => {
        const c = tx.get("contexts", context.contextId)!;
        c.context.revokedAt = f.clock.now();
        c.revision++;
        tx.put("contexts", c, c.revision - 1);
      });
      return executeChild(s, 1, async () => {
        sends++;
        return outcome();
      });
    }, "durable-children"),
  );
  assert.equal(sends, 1);
  assert.equal(
    f.store.transaction(
      (tx) => tx.get("children", childIdentity(r.requestId, 0))!.state,
    ),
    "completed",
  );
  assert.equal(f.store.scan("attempts").length, 1);
});
test("later multipart provider failure retains prior references and checkpoints", async (t) => {
  const f = fixture(t),
    r = await f.submission.submit(action(), context),
    ref: ResourceRef = {
      version: 1,
      kind: "message",
      id: "part-1",
      scope: context.scope,
    };
  const result = await f.executor.execute(
    r.requestId,
    binding(async (_a, s) => {
      await executeChild(s, 0, async () => outcome("provider-accepted", [ref]));
      return executeChild(s, 1, async () => ({
        ...outcome("failed"),
        error: {
          code: "PROVIDER_FAILURE",
          message: "secret credential should not escape",
          retry: "never",
        },
      }));
    }, "durable-children"),
  );
  assert.equal(result?.status, "failed");
  assert.deepEqual(result?.references, [ref]);
  assert.equal(result?.error?.message, "PROVIDER_FAILURE");
  assert.equal(f.store.scan("checkpoints").length, 2);
});
test("crash process after possible send recovers unknown without a duplicate callback", async (t) => {
  const f = fixture(t),
    r = await f.submission.submit(action(), context);
  assert.equal((await worker("crash", f.path, r.requestId)).code, 23);
  assert.equal(readFileSync(f.path + ".transmissions", "utf8"), "one\n");
  f.clock.advance(1001);
  const reopened = new DurableSQLiteStore(f.path);
  t.after(() => reopened.close());
  const fresh = components(reopened, f.clock);
  assert.equal(fresh.recovery.recover().unknown, 1);
  assert.equal(
    (await fresh.submission.status(r.requestId, context)).status,
    "unknown-outcome",
  );
  let sends = 0;
  assert.equal(
    await fresh.executor.execute(
      r.requestId,
      binding(async () => {
        sends++;
        return outcome();
      }),
    ),
    null,
  );
  assert.equal(sends, 0);
  assert.equal(reopened.scan("children")[0]?.state, "unknown");
  assert.equal(fresh.recovery.retentionPolicy().automaticDeletion, false);
});
test("lease takeover while send is in flight cannot be overwritten by the old completion", async (t) => {
  const f = fixture(t),
    r = await f.submission.submit(action(), context),
    started = deferred(),
    finish = deferred();
  const run = f.executor.execute(
    r.requestId,
    binding(async () => {
      started.resolve();
      await finish.promise;
      return outcome("provider-accepted");
    }),
  );
  await started.promise;
  f.clock.advance(1001);
  assert.equal(f.recovery.recover().unknown, 1);
  finish.resolve();
  assert.equal(await run, null);
  assert.equal(
    (await f.submission.status(r.requestId, context)).status,
    "unknown-outcome",
  );
});
test("safe pre-dispatch failures can be retried explicitly after revalidation", async (t) => {
  const f = fixture(t),
    r = await f.submission.submit(action(), context);
  const result = await f.executor.execute(
    r.requestId,
    binding(async () => {
      throw new RuntimeFault("RATE_LIMITED", "safe-before-dispatch");
    }, "durable-children"),
  );
  assert.equal(result?.status, "blocked");
  assert.equal(f.store.scan("attempts").length, 0);
  f.recovery.retry(r.requestId, context);
  assert.equal(
    (await f.executor.execute(r.requestId, binding()))?.status,
    "executor-completed",
  );
});

test("provider deadline preserves uncertainty and blocks automatic replay", async (t) => {
  const f = fixture(t),
    r = await f.submission.submit(action(), context);
  const { DurableExecutor } = await import(
    "../../../src/runtime/core/index.js"
  );
  const { noNetwork } = await import("./fixture.js");
  const bounded = new DurableExecutor(f.claims, noNetwork, 1, 1000, 20);
  let calls = 0;
  const result = await bounded.execute(
    r.requestId,
    binding(async () => {
      calls++;
      return new Promise(() => {});
    }),
  );
  assert.equal(result?.status, "unknown-outcome");
  assert.equal(calls, 1);
  assert.equal(await bounded.execute(r.requestId, binding()), null);
});
test("abandoned child callback cannot convert an in-flight send into a safely retryable failure", async (t) => {
  const f = fixture(t),
    r = await f.submission.submit(action(), context),
    finish = deferred();
  let pending: Promise<unknown> | undefined;
  const result = await f.executor.execute(
    r.requestId,
    binding(async (_a, s) => {
      pending = executeChild(s, 0, async () => {
        await finish.promise;
        return outcome("provider-accepted");
      }).catch(() => {});
      return outcome();
    }, "durable-children"),
  );
  assert.equal(result?.status, "unknown-outcome");
  finish.resolve();
  await pending;
  assert.equal(
    (await f.submission.status(r.requestId, context)).status,
    "unknown-outcome",
  );
});
test("generation invalidation immediately before a later multipart send blocks that send", async (t) => {
  const f = fixture(t),
    r = await f.submission.submit(action(), context);
  let sends = 0;
  await f.executor.execute(
    r.requestId,
    binding(async (_a, s) => {
      await executeChild(s, 0, async () => {
        sends++;
        return outcome();
      });
      f.store.transaction((tx) => {
        const task = tx.get("tasks", context.taskId)!;
        task.generation++;
        task.revision++;
        tx.put("tasks", task, task.revision - 1);
      });
      return executeChild(s, 1, async () => {
        sends++;
        return outcome();
      });
    }, "durable-children"),
  );
  assert.equal(sends, 1);
  assert.equal(f.store.scan("attempts").length, 1);
  assert.equal(
    f.store.scan("outbox")[0]?.result.error?.code,
    "STALE_GENERATION",
  );
});
test("host-controlled engine processes committed requests only after explicit activation", async (t) => {
  const f = fixture(t),
    { DurableEngine } = await import("../../../src/runtime/core/index.js"),
    done = deferred();
  let sends = 0;
  const engine = new DurableEngine(f.submission, f.executor, f.recovery, [
    binding(async () => {
      sends++;
      done.resolve();
      return outcome();
    }),
  ]);
  const r = await engine.submit(action(), context);
  assert.equal(sends, 0);
  assert.equal((await engine.status(r.requestId, context)).status, "queued");
  await engine.recover();
  await engine.startOutbox();
  await done.promise;
  // Yield to the driver's persisted completion before orderly stop.
  await new Promise<void>((resolve) => setImmediate(resolve));
  await engine.stopOutbox();
  assert.equal(sends, 1);
  assert.equal(
    (await engine.status(r.requestId, context)).status,
    "executor-completed",
  );
  assert.equal(engine.ready(), false);
});
