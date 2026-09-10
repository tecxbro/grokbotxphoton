import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseActionRequest } from "../../../src/contracts/actions.js";
import { parseContentSpec } from "../../../src/contracts/content.js";
import { ownedOperations } from "../../../src/features/text-messages/module.js";
import {
  formatMessageBubbles,
  validateVoicePolicy,
} from "../../../src/features/text-messages/voice-policy.js";
import {
  validateContent,
  compileComposition,
} from "../../../src/features/text-messages/composition.js";
import { makeServices } from "../../fixtures/runtime-services.js";
import type { PublicTextMessageOptions } from "../../../src/features/text-messages/sdk.js";

for (const operation of ownedOperations)
  test(`schema ${operation}: valid fixture, unknown key and executable rejection`, () => {
    const fixture = JSON.parse(
      readFileSync(
        `packages/photon-features/tests/fixtures/${operation}.json`,
        "utf8",
      ),
    ).valid;
    assert.equal(parseActionRequest(fixture).operation, operation);
    assert.throws(() =>
      parseActionRequest({
        ...fixture,
        arguments: { ...fixture.arguments, extra: true },
      }),
    );
    assert.throws(() =>
      parseActionRequest({
        ...fixture,
        arguments: { ...fixture.arguments, callback: () => {} },
      }),
    );
  });
test("voice preserves names, acronyms, URLs, paths, commands and coherent long thoughts", () => {
  const value =
    "Hello Ada, NASA has a plan.\n\nThe URL is https://example.com/Ada?q=one?two and /Users/Ada/X.\n\n`echo NASA — OK?`";
  const { bubbles } = formatMessageBubbles(value);
  assert.equal(bubbles[0], "hello Ada, NASA has a plan.");
  assert.ok(bubbles[1]!.includes("https://example.com/Ada?q=one?two"));
  assert.equal(bubbles[2], "`echo NASA — OK?`");
  assert.equal(
    formatMessageBubbles("The " + "long ".repeat(40) + "sentence.").bubbles
      .length,
    1,
  );
  assert.ok(
    validateVoicePolicy("The " + "long ".repeat(40) + "sentence.").warnings
      .length,
  );
  assert.throws(() => formatMessageBubbles("Ready? Sure?"));
  assert.equal(formatMessageBubbles("Hello — Ada").bubbles[0], "hello, Ada");
});
test("bounded composition rejects nesting, wrapper recursion, excessive items and oversized JSON", () => {
  assert.throws(() =>
    parseContentSpec({ type: "group", items: [{ type: "group", items: [] }] }),
  );
  assert.throws(() =>
    parseContentSpec({
      type: "compose",
      items: Array(17).fill({ type: "text", text: "x" }),
    }),
  );
  assert.throws(() =>
    parseContentSpec({
      type: "effect",
      effect: "slam",
      content: {
        type: "effect",
        effect: "slam",
        content: { type: "text", text: "x" },
      },
    }),
  );
  assert.throws(() =>
    parseContentSpec({ type: "text", text: "x".repeat(262145) }),
  );
  assert.throws(() =>
    validateContent({
      type: "group",
      items: [
        { type: "text", text: "a" },
        { type: "text", text: "b" },
      ],
    }),
  );
});
test("structured prose bypasses formatting and duplicate or missing family compilers fail", async () => {
  const { services } = makeServices();
  const options = {} as PublicTextMessageOptions;
  const built = await compileComposition(
    { type: "text", text: "HELLO — Ready? Sure?" },
    services,
    options,
  );
  const { resolveContents } = await import("spectrum-ts");
  assert.deepEqual(await resolveContents([built]), [
    { type: "text", text: "HELLO — Ready? Sure?" },
  ]);
  await assert.rejects(() =>
    compileComposition(
      { type: "link", url: "https://example.com", title: "not supported" },
      services,
      options,
    ),
  );
  await assert.rejects(() =>
    compileComposition(
      { type: "contact", contact: { name: "Ada", phones: [], emails: [] } },
      services,
      options,
    ),
  );
});
