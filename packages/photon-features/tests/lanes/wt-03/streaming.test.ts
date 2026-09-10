import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture.js";
for (const mode of [
  "normal",
  "oversize",
  "too-many-chunks",
  "empty",
  "error",
  "cancel",
] as const)
  test(`registered stream ${mode}: bounded, buffered and single consumption`, async (t) => {
    const f = fixture();
    t.after(() => f.close());
    let opens = 0,
      reads = 0;
    f.services.streams.open = async () => {
      opens++;
      return (async function* () {
        assert.equal(f.calls.length, 0);
        reads++;
        if (mode === "oversize") yield "a".repeat(16001);
        else if (mode === "too-many-chunks")
          for (let i = 0; i < 4097; i++) yield "";
        else if (mode === "error") throw new Error("PRIVATE_TOKEN");
        else if (mode === "cancel") {
          f.abort.abort();
          yield "no";
        } else if (mode === "normal") {
          yield "hello ";
          assert.equal(f.calls.length, 0);
          yield "Ada";
        }
      })();
    };
    const action = f.prepare("text.stream", {
      space: f.spaceRef,
      stream: f.streamRef,
    });
    const result = await f.execute(action);
    if (mode === "normal") {
      assert.equal(result.status, "executor-completed");
      assert.equal(result.capability?.providerSupport, "fallback");
      assert.equal(f.calls.length, 1);
    } else {
      assert.notEqual(result.status, "executor-completed");
      assert.equal(f.calls.length, 0);
      assert.ok(!JSON.stringify(result).includes("PRIVATE_TOKEN"));
    }
    await f.execute(action);
    assert.equal(opens, 1);
    assert.equal(reads, 1);
  });
test("stream cancellation interrupts a pending next and asks its producer to close", async (t) => {
  const f = fixture();
  t.after(() => f.close());
  let closed = false;
  f.services.streams.open = async () => ({
    [Symbol.asyncIterator]: () => ({
      next: () => new Promise(() => {}),
      return: async () => {
        closed = true;
        return { done: true, value: undefined };
      },
    }),
  });
  const work = f.execute(
    f.prepare("text.stream", { space: f.spaceRef, stream: f.streamRef }),
  );
  setTimeout(() => f.abort.abort(), 10);
  const result = await work;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(result.error?.code, "CANCELLED");
  assert.equal(closed, true);
  assert.equal(f.calls.length, 0);
});
for (const mode of [
  "missing",
  "expired",
  "wrong-generation",
  "wrong-scope",
] as const)
  test(`stream rejects ${mode} reference before open`, async (t) => {
    const f = fixture();
    t.after(() => f.close());
    let opens = 0;
    f.services.streams.open = async () => {
      opens++;
      throw new Error("should not open");
    };
    const ref = {
      ...f.streamRef,
      ...(mode === "missing"
        ? { id: "not-registered" }
        : mode === "expired"
          ? { expiresAt: 1 }
          : mode === "wrong-generation"
            ? { generation: 2 }
            : { scope: { ...f.streamRef.scope, accountId: "other" } }),
    };
    const result = await f.execute(
      f.prepare("text.stream", { space: f.spaceRef, stream: ref }),
    );
    assert.notEqual(result.status, "executor-completed");
    assert.equal(opens, 0);
  });
test("expiry timeout cancels a hanging producer before dispatch", async (t) => {
  const f = fixture();
  t.after(() => f.close());
  const ref = { ...f.streamRef, expiresAt: f.clock.now() + 10 };
  f.store.transaction((tx) => {
    const old = tx.get("streams", ref.id)!;
    tx.put(
      "streams",
      { ...old, revision: old.revision + 1, reference: ref },
      old.revision,
    );
  });
  f.services.streams.open = async () => ({
    [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) }),
  });
  const result = await f.execute(
    f.prepare("text.stream", { space: f.spaceRef, stream: ref }),
  );
  assert.equal(result.error?.code, "CANCELLED");
  assert.equal(f.calls.length, 0);
});
