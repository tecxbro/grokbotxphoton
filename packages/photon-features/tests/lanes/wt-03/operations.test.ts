import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveContents, text, contact } from "spectrum-ts";
import {
  buildRegistry,
  parseAction,
  resultSchema,
  capabilitySchema,
  type Operation,
  type ContentSpec,
} from "../../../src/index.js";
import { ownedOperations } from "../../../src/features/text-messages/module.js";
import { formatProse } from "../../../src/features/text-messages/voice-policy.js";
import { fixture } from "./fixture.js";
for (const operation of ownedOperations) {
  test(`${operation}: valid F0 fixture and invalid arguments`, () => {
    const file = new URL(
      `../../../../tests/fixtures/${operation}.json`,
      import.meta.url,
    );
    const { valid: action, rejected } = JSON.parse(readFileSync(file, "utf8"));
    assert.throws(() => parseAction(rejected));
    assert.equal(parseAction(action).operation, operation);
    assert.throws(() =>
      parseAction({
        ...action,
        arguments: { ...action.arguments, code: "execute()" },
      }),
    );
    assert.throws(() => parseAction({ ...action, arguments: {} }));
  });
  test(`${operation}: executable handler and schema-valid result`, async (t) => {
    const f = fixture();
    t.after(() => f.close());
    const args: Record<(typeof ownedOperations)[number], unknown> = {
      "text.send": { space: f.spaceRef, text: "hello Ada" },
      "text.stream": { space: f.spaceRef, stream: f.streamRef },
      "markdown.send": { space: f.spaceRef, text: "**Ada**" },
      "link.send": { space: f.spaceRef, url: "https://example.com/A" },
      "content.group": {
        space: f.spaceRef,
        content: {
          type: "group",
          items: [
            { type: "text", text: "Ada" },
            {
              type: "contact",
              contact: { name: "Ada", phones: [], emails: [] },
            },
          ],
        },
      },
      "content.compose": {
        space: f.spaceRef,
        content: {
          type: "compose",
          items: [
            { type: "text", text: "one" },
            { type: "text", text: "two" },
          ],
        },
      },
      "message.get": { message: f.messageRef },
      "message.reply": {
        message: f.messageRef,
        content: { type: "text", text: "hello" },
      },
      "message.react": { message: f.messageRef, reaction: "love" },
      "reaction.remove": { reaction: f.reactionRef },
      "message.edit": { message: f.messageRef, text: "new text" },
      "message.unsend": { message: f.messageRef },
      "message.markRead": { message: f.messageRef },
    };
    if (operation === "message.edit" || operation === "message.unsend")
      f.target.direction = "outbound";
    f.extra.push({
      family: "contact",
      compile: async () => contact({ name: { first: "Ada" } }),
    });
    const result = await f.execute(f.prepare(operation, args[operation]));
    assert.equal(result.status, "executor-completed", JSON.stringify(result));
    resultSchema.parse(result);
    assert.ok(result.references.length);
    if (
      [
        "message.edit",
        "message.unsend",
        "message.markRead",
        "reaction.remove",
      ].includes(operation)
    ) {
      assert.deepEqual(result.value, { type: "void" });
      assert.deepEqual(result.references, [
        operation === "reaction.remove" ? f.reactionRef : f.messageRef,
      ]);
    }
    if (operation !== "message.get") {
      const calls = f.calls.length;
      const parent = f.store.transaction(
        (tx) => tx.list("outbox", f.services.context.scope, 10)[0]!,
      );
      assert.equal(
        (await f.execute(parent.action)).status,
        "executor-completed",
      );
      assert.equal(f.calls.length, calls);
    }
  });
}
test("registry registers all 13 operations with truthful capabilities", (t) => {
  const f = fixture();
  t.after(() => f.close());
  const registry = buildRegistry([f.module], { requireComplete: false });
  assert.equal(registry.handlers.size, 13);
  f.module.capabilities.forEach((c) => {
    capabilitySchema.parse(c);
    assert.equal(c.availability.account, "unknown");
    assert.equal(
      c.evidence.some((e) => e.tier === "live"),
      false,
    );
  });
  assert.equal(
    f.module.capabilities.find((c) => c.operation === "text.stream")!
      .providerSupport,
    "fallback",
  );
});
test("plain prose bubbles and structured content remain distinct", async (t) => {
  const f = fixture();
  t.after(() => f.close());
  const result = await f.execute(
    f.prepare("text.send", {
      space: f.spaceRef,
      text: "Thanks Ada.\n\nI checked NASA and https://example.com/ABC.",
    }),
  );
  assert.equal(result.references.length, 2);
  assert.deepEqual(
    f.calls.map((c) => c.content),
    [
      { type: "text", text: "thanks Ada." },
      { type: "text", text: "i checked NASA and https://example.com/ABC." },
    ],
  );
  const source = "# The API\n\n`RunTHIS()` — Keep Case? Next?";
  await f.execute(
    f.prepare("markdown.send", { space: f.spaceRef, text: source }),
  );
  assert.deepEqual(f.calls.at(-1)!.content, {
    type: "markdown",
    markdown: source,
  });
});
test("voice policy preserves names, acronyms, URLs, paths, commands and fenced code without arbitrary splits", () => {
  const input =
    'Thanks Ada and Will. NASA uses https://example.com/Path?A=B /Users/Ada/File.ts `RunTHIS()`\n\n```ts\nconst URL = "A";\n\nRunTHIS();\n```';
  const result = formatProse(input);
  assert.equal(result.bubbles.length, 2);
  assert.ok(result.bubbles[0]!.startsWith("thanks Ada and Will. NASA"));
  assert.ok(result.bubbles[1]!.includes("\n\nRunTHIS();"));
  assert.ok(
    result.bubbles[0]!.includes(
      "https://example.com/Path?A=B /Users/Ada/File.ts `RunTHIS()`",
    ),
  );
  assert.deepEqual(formatProse("$ RunTHIS --Case").bubbles, [
    "$ RunTHIS --Case",
  ]);
  const long = "Ada " + "a".repeat(200);
  assert.deepEqual(formatProse(long).bubbles, [long]);
  assert.equal(formatProse(long).warnings.length, 1);
  assert.throws(() => formatProse("ready? what next?"));
  assert.equal(formatProse("hey — done").bubbles[0], "hey, done");
});
test("URL-only richlink and missing provider result are never reported as confirmed rendering", async (t) => {
  const f = fixture();
  t.after(() => f.close());
  const titled = await f.execute(
    f.prepare("link.send", {
      space: f.spaceRef,
      url: "https://example.com",
      title: "custom",
    }),
  );
  assert.equal(titled.error?.code, "UNSUPPORTED");
  assert.equal(f.calls.length, 0);
  f.noMessage();
  const result = await f.execute(
    f.prepare("link.send", { space: f.spaceRef, url: "https://example.com" }),
  );
  assert.equal(result.status, "unknown-outcome");
  assert.deepEqual(result.observations, []);
});
for (const change of [
  "chat",
  "line",
  "provider",
  "scope",
  "native-id",
  "owner",
  "direction",
] as const)
  test(`target rejects wrong ${change}`, async (t) => {
    const f = fixture();
    t.after(() => f.close());
    f.target.direction = "outbound";
    let ref = f.messageRef;
    if (change === "chat") Object.assign(f.space, { id: "another-chat" });
    if (change === "line") f.space.phone = "+15555550200";
    if (change === "provider") f.target.platform = "local_imessage";
    if (change === "scope")
      ref = { ...ref, scope: { ...ref.scope, lineId: "other" } };
    if (change === "native-id") Object.assign(f.target, { id: "guessed" });
    if (change === "owner")
      f.store.transaction((tx) => {
        const old = tx.get("references", ref.id)!;
        tx.put(
          "references",
          {
            ...old,
            revision: old.revision + 1,
            ownedByPrincipalId: "someone-else",
          },
          old.revision,
        );
      });
    if (change === "direction") f.target.direction = "inbound";
    const result = await f.execute(
      f.prepare("message.edit", { message: ref, text: "changed" }),
    );
    assert.notEqual(result.status, "executor-completed");
    assert.equal(f.calls.length, 0);
  });
test("reaction removal uses the exact returned authorized handle and target metadata", async (t) => {
  const f = fixture();
  t.after(() => f.close());
  const result = await f.execute(
    f.prepare("message.react", { message: f.messageRef, reaction: "like" }),
  );
  const removed = await f.execute(
    f.prepare("reaction.remove", { reaction: result.references[0] }),
  );
  assert.equal(removed.status, "executor-completed");
  const handle = f.calls.at(-1)!.target!;
  assert.equal(handle.content.type, "reaction");
  if (handle.content.type === "reaction") {
    assert.equal(handle.content.emoji, "👍");
    assert.equal(handle.content.target, f.target);
  }
  f.reaction.content = { type: "text", text: "not a reaction" };
  const invalid = await f.execute(
    f.prepare("reaction.remove", { reaction: f.reactionRef }),
  );
  assert.equal(invalid.error?.code, "UNAVAILABLE");
});
for (const operation of ["message.edit", "message.unsend"] as const)
  test(`${operation}: explicit eligibility failure and uncertain provider failure`, async (t) => {
    const f = fixture();
    t.after(() => f.close());
    f.target.direction = "outbound";
    f.target.timestamp = new Date(-1000000);
    const args = {
      message: f.messageRef,
      ...(operation === "message.edit" ? { text: "new" } : {}),
    };
    assert.equal(
      (await f.execute(f.prepare(operation, args))).error?.code,
      "UNAVAILABLE",
    );
    assert.equal(f.calls.length, 0);
    f.target.timestamp = new Date(9000);
    f.hooks.failAt(operation === "message.edit" ? "edit" : "unsend");
    const result = await f.execute(f.prepare(operation, args));
    assert.equal(result.status, "unknown-outcome");
  });
test("outbound mark-read and poll unsend are rejected before SDK no-op paths", async (t) => {
  const f = fixture();
  t.after(() => f.close());
  f.target.direction = "outbound";
  assert.equal(
    (await f.execute(f.prepare("message.markRead", { message: f.messageRef })))
      .error?.code,
    "FORBIDDEN",
  );
  f.target.content = (
    await resolveContents([
      (await import("spectrum-ts")).poll("pick", "a", "b"),
    ])
  )[0]!;
  assert.equal(
    (await f.execute(f.prepare("message.unsend", { message: f.messageRef })))
      .error?.code,
    "UNSUPPORTED",
  );
  assert.equal(f.calls.length, 0);
});
