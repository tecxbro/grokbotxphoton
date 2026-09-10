import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  operations,
  parseAction,
  actionSchemas,
  resourceRefSchema,
  assertScope,
  contentSchema,
  incomingEventSchema,
  resultSchema,
  contextSchema,
  foundationCapabilities,
  capabilitySchema,
  buildRegistry,
  verifyOwnership,
  operationOwners,
  type FeatureModule,
} from "../../../src/index.js";
import {
  scope,
  event,
  context,
  testFeature,
  productionShapeForRegistryTest,
} from "../../fixtures/harness.js";
for (const op of operations)
  test(`${op}: valid, missing required argument, unknown envelope/argument`, () => {
    const f = JSON.parse(
      readFileSync(
        new URL(`../../../../tests/fixtures/${op}.json`, import.meta.url),
        "utf8",
      ),
    );
    assert.equal(parseAction(f.valid).operation, op);
    assert.throws(() => parseAction(f.rejected));
    assert.throws(() => parseAction({ ...f.valid, admin: true }));
    assert.throws(() => parseAction({ ...f.valid, version: 2 }));
    assert.throws(() =>
      parseAction({
        ...f.valid,
        arguments: { ...f.valid.arguments, shell: "echo x" },
      }),
    );
    assert.equal(actionSchemas[op].safeParse(f.valid).success, true);
  });
test("reference round trip and all scope dimensions", () => {
  const ref = resourceRefSchema.parse({
    version: 1,
    id: "message-1",
    kind: "message",
    scope,
  });
  assert.deepEqual(
    resourceRefSchema.parse(JSON.parse(JSON.stringify(ref))),
    ref,
  );
  for (const key of ["projectId", "accountId", "lineId", "spaceId"] as const)
    assert.throws(() => assertScope(ref, { ...scope, [key]: "other" }));
  assert.equal(
    resourceRefSchema.safeParse({
      ...ref,
      scope: { ...scope, provider: "local_imessage" },
    }).success,
    false,
  );
  assert.equal(
    resourceRefSchema.safeParse({ ...ref, scope: { accountId: "account-1" } })
      .success,
    false,
  );
});
test("content rejects executable input, raw paths, wrapper nesting and overflow", () => {
  for (const value of [
    { type: "javascript", code: "alert(1)" },
    { type: "text", text: "hi", callback: () => {} },
    { type: "attachment", media: "/etc/passwd" },
    { type: "group", items: [] },
    { type: "group", items: Array(9).fill({ type: "text", text: "hi" }) },
    {
      type: "reply",
      message: event.type === "message" ? event.message : null,
      content: { type: "group", items: [{ type: "text", text: "hi" }] },
    },
    { type: "text", text: "x".repeat(16001) },
  ])
    assert.equal(contentSchema.safeParse(value).success, false);
});
test("context, incoming event, void result and capability dimensions", () => {
  contextSchema.parse(context);
  incomingEventSchema.parse(event);
  resultSchema.parse({
    version: 1,
    requestId: "r",
    status: "executor-completed",
    revision: 1,
    updatedAt: 10,
    references: [],
    value: { type: "void" },
    observations: [],
  });
  for (const c of foundationCapabilities()) {
    capabilitySchema.parse(c);
    assert.equal(c.implementation, "unimplemented");
    assert.equal(c.providerSupport, "unknown");
    assert.equal("supported" in c, false);
  }
});
test("registry ownership is complete and production registry fails closed", () => {
  assert.equal(operations.length, 44);
  assert.equal(Object.keys(operationOwners).length, 44);
  assert.throws(
    () => verifyOwnership({ "wt-03": ["text.send", "text.send"] }),
    /DUPLICATE/,
  );
  assert.throws(() => verifyOwnership({}), /MISSING/);
  assert.throws(() => buildRegistry([]), /MISSING_HANDLERS/);
  assert.equal(
    buildRegistry([], { requireComplete: false }).missing.length,
    44,
  );
  assert.throws(
    () =>
      buildRegistry([
        testFeature("wt-03", ["text.send"]) as unknown as FeatureModule,
      ]),
    /TEST_MODULE/,
  );
  const m = productionShapeForRegistryTest("text.send", "wt-03");
  assert.equal(buildRegistry([m], { requireComplete: false }).handlers.size, 1);
  assert.throws(
    () =>
      buildRegistry([{ ...m, handlers: [...m.handlers, ...m.handlers] }], {
        requireComplete: false,
      }),
    /DUPLICATE_HANDLER/,
  );
  assert.throws(
    () => buildRegistry([{ ...m, lane: "wt-04" }], { requireComplete: false }),
    /WRONG_OWNER/,
  );
});

test("every resource kind round trips and related parent identifiers are checked", () => {
  for (const op of operations) {
    const f = JSON.parse(
      readFileSync(
        new URL(`../../../../tests/fixtures/${op}.json`, import.meta.url),
        "utf8",
      ),
    );
    const walk = (v: unknown) => {
      if (!v || typeof v !== "object") return;
      if ("kind" in v) {
        const ref = resourceRefSchema.parse(v);
        assert.deepEqual(
          resourceRefSchema.parse(JSON.parse(JSON.stringify(ref))),
          ref,
        );
        assertScope(ref, scope);
      }
      for (const item of Object.values(v)) walk(item);
    };
    walk(f.valid.arguments);
  }
  const f = JSON.parse(
    readFileSync(
      new URL("../../../../tests/fixtures/poll.vote.json", import.meta.url),
      "utf8",
    ),
  );
  f.valid.arguments.option.pollId = "other";
  assert.throws(() => parseAction(f.valid), /POLL_OPTION_MISMATCH/);
});

test("fencing and lifecycle helpers distinguish cancellation and provider evidence", async () => {
  const { assertClaim, assertTransition } = await import(
    "../../../src/index.js"
  );
  const claim = { owner: "p", fence: 2, generation: 1, leaseUntil: 100 };
  assertClaim(
    claim,
    { owner: "p", fence: 2, generation: 1, cancelled: false },
    99,
  );
  assert.throws(
    () =>
      assertClaim(
        claim,
        { owner: "p", fence: 3, generation: 1, cancelled: false },
        99,
      ),
    /STALE_FENCE/,
  );
  assert.throws(
    () =>
      assertClaim(
        claim,
        { owner: "p", fence: 2, generation: 2, cancelled: false },
        99,
      ),
    /STALE_GENERATION/,
  );
  assert.throws(
    () =>
      assertClaim(
        claim,
        { owner: "p", fence: 2, generation: 1, cancelled: true },
        99,
      ),
    /CANCELLED/,
  );
  assertTransition("unknown-outcome", "observed-delivered");
  assert.throws(
    () => assertTransition("observed-read", "provider-accepted"),
    /LIFECYCLE/,
  );
});
test("production source has no imports of test fixtures", async () => {
  const { readdir } = await import("node:fs/promises");
  const root = new URL("../../../../src/", import.meta.url);
  const walk = async (dir: URL): Promise<void> => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const url = new URL(e.name + (e.isDirectory() ? "/" : ""), dir);
      if (e.isDirectory()) await walk(url);
      else if (e.name.endsWith(".ts"))
        assert.doesNotMatch(
          readFileSync(url, "utf8"),
          /(?:from\s+|import\s*\()["'][^"']*(?:tests|fixtures)[^"']*["']/,
        );
    }
  };
  await walk(root);
});
