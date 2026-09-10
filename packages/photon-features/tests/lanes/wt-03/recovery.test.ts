import test from "node:test";
import assert from "node:assert/strict";
import { text, contact } from "spectrum-ts";
import { parseAction, type ContentSpec } from "../../../src/index.js";
import { fixture } from "./fixture.js";
const first = { type: "text" as const, text: "first" },
  second = { type: "text" as const, text: "second" };
test("part three preparation failure retries only part three using durable child outcomes", async (t) => {
  const f = fixture();
  t.after(() => f.close());
  const action = f.prepare("content.compose", {
    space: f.spaceRef,
    content: {
      type: "compose",
      items: [
        first,
        second,
        { type: "contact", contact: { name: "Ada", phones: [], emails: [] } },
      ],
    },
  });
  const result = await f.execute(action);
  assert.equal(result.status, "blocked");
  assert.equal(result.references.length, 2);
  assert.equal(f.calls.length, 2);
  f.extra.push({
    family: "contact",
    compile: async () => contact({ name: { first: "Ada" } }),
  });
  const retry = await f.execute(action);
  assert.equal(retry.status, "executor-completed");
  assert.equal(f.calls.length, 3);
  assert.equal(retry.references.length, 3);
  assert.deepEqual(retry.references.slice(0, 2), result.references);
});
test("ambiguous part three provider failure never repeats earlier or unknown children", async (t) => {
  const f = fixture();
  t.after(() => f.close());
  const action = f.prepare("content.compose", {
    space: f.spaceRef,
    content: {
      type: "compose",
      items: [first, second, { type: "text", text: "third" }],
    },
  });
  f.hooks.failAt("send-3");
  assert.equal((await f.execute(action)).status, "unknown-outcome");
  assert.equal((await f.execute(action)).status, "unknown-outcome");
  assert.equal(f.calls.length, 3);
  assert.deepEqual(
    f.store
      .transaction((tx) => tx.list("children", f.services.context.scope, 10))
      .map((c) => c.state)
      .sort(),
    ["completed", "completed", "unknown"],
  );
});
test("group call journals each actual returned child; ambiguous group failure blocks all replay", async (t) => {
  const f = fixture();
  t.after(() => f.close());
  f.extra.push({
    family: "contact",
    compile: async () => contact({ name: { first: "Ada" } }),
  });
  const content = {
    type: "group",
    items: [
      first,
      { type: "contact", contact: { name: "Ada", phones: [], emails: [] } },
    ],
  };
  const action = f.prepare("content.group", { space: f.spaceRef, content });
  const result = await f.execute(action);
  assert.equal(result.references.length, 2);
  assert.equal(f.calls.length, 1);
  const refs = f.store.transaction((tx) =>
    result.references.map((ref) => tx.get("references", ref.id)!),
  );
  assert.equal(new Set(refs.map((ref) => ref.providerId)).size, 2);
  const next = f.prepare("content.group", { space: f.spaceRef, content });
  f.hooks.failAt("send-2");
  assert.equal((await f.execute(next)).status, "unknown-outcome");
  assert.equal((await f.execute(next)).status, "unknown-outcome");
  assert.equal(f.calls.length, 2);
});
for (const items of [
  [first],
  [first, second],
  [first, { type: "link", url: "https://example.com" }],
])
  test(`group rejects unsupported combination ${JSON.stringify(items)}`, async (t) => {
    const f = fixture();
    t.after(() => f.close());
    const result = await f.execute(
      f.prepare("content.group", {
        space: f.spaceRef,
        content: { type: "group", items },
      }),
    );
    assert.equal(result.error?.code, "UNSUPPORTED");
    assert.equal(f.calls.length, 0);
  });
test("F0 finite nesting, wrapper combinations and size bounds are enforced", () => {
  const f = fixture();
  try {
    const base = {
      version: 1,
      idempotencyKey: "x",
      contextId: "context-1",
      operation: "content.compose",
      arguments: {
        space: f.spaceRef,
        content: {
          type: "compose",
          items: [{ type: "compose", items: [first] }],
        },
      },
    };
    assert.throws(() => parseAction(base));
    assert.throws(() =>
      parseAction({
        ...base,
        arguments: {
          space: f.spaceRef,
          content: { type: "compose", items: Array(17).fill(first) },
        },
      }),
    );
    assert.throws(() =>
      parseAction({
        ...base,
        arguments: {
          space: f.spaceRef,
          content: {
            type: "compose",
            items: [{ type: "reply", message: f.messageRef, content: first }],
          },
        },
      }),
    );
  } finally {
    f.close();
  }
});
test("nested poll duplicate keys and missing compilers fail before dispatch", async (t) => {
  const f = fixture();
  t.after(() => f.close());
  const result = await f.execute(
    f.prepare("content.compose", {
      space: f.spaceRef,
      content: {
        type: "compose",
        items: [
          first,
          {
            type: "poll",
            question: "pick",
            options: [
              { key: "a", label: "one" },
              { key: "a", label: "two" },
            ],
          },
        ],
      },
    }),
  );
  assert.equal(result.error?.code, "INVALID_REQUEST");
  assert.equal(f.calls.length, 0);
});
test("stale fence and cancellation cannot dispatch or overwrite shared journal", async (t) => {
  const f = fixture();
  t.after(() => f.close());
  const action = f.prepare("text.send", { space: f.spaceRef, text: "hello" });
  f.services.claim = { ...f.services.claim, fence: 0 };
  assert.equal((await f.execute(action)).error?.code, "STALE_FENCE");
  assert.equal(f.calls.length, 0);
  f.abort.abort();
  assert.equal((await f.execute(action)).error?.code, "CANCELLED");
});
test("compiler output cannot smuggle a control into a group", async (t) => {
  const f = fixture();
  t.after(() => f.close());
  f.extra.push({
    family: "contact",
    compile: async () => (await import("spectrum-ts")).read(f.target),
  });
  const result = await f.execute(
    f.prepare("content.group", {
      space: f.spaceRef,
      content: {
        type: "group",
        items: [
          first,
          { type: "contact", contact: { name: "Ada", phones: [], emails: [] } },
        ],
      },
    }),
  );
  assert.equal(result.error?.code, "UNSUPPORTED");
  assert.equal(f.calls.length, 0);
});
test("one question per compose turn is checked across all text children", async (t) => {
  const f = fixture();
  t.after(() => f.close());
  const result = await f.execute(
    f.prepare("content.compose", {
      space: f.spaceRef,
      content: {
        type: "compose",
        items: [
          { type: "text", text: "ready?" },
          { type: "text", text: "what next?" },
        ],
      },
    }),
  );
  assert.equal(result.error?.code, "INVALID_REQUEST");
  assert.equal(f.calls.length, 0);
});
test("lost lease after dispatch preserves an unknown child, never completion or replay", async (t) => {
  const f = fixture();
  t.after(() => f.close());
  const original = f.space.send.bind(f.space);
  f.space.send = (async (input: Parameters<typeof original>[0]) => {
    const result = await original(input);
    f.store.transaction((tx) => {
      const old = tx.list("outbox", f.services.context.scope, 10)[0]!;
      tx.put(
        "outbox",
        {
          ...old,
          revision: old.revision + 1,
          claim: { ...old.claim!, fence: 2 },
        },
        old.revision,
      );
    });
    return result;
  }) as typeof f.space.send;
  const action = f.prepare("text.send", { space: f.spaceRef, text: "hello" });
  assert.equal((await f.execute(action)).status, "unknown-outcome");
  assert.equal(
    f.store.transaction(
      (tx) => tx.list("children", f.services.context.scope, 10)[0]!.state,
    ),
    "dispatching",
  );
  f.services.claim = { ...f.services.claim, fence: 2 };
  assert.equal((await f.execute(action)).status, "unknown-outcome");
  assert.equal(f.calls.length, 1);
});
