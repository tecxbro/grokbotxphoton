import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { text, markdown } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { capabilitySchema, parseAction, resultSchema } from "../../../src/index.js";
import { nativeOperations, createNativeModule } from "../../../src/features/native/module.js";
import { effectMapping } from "../../../src/features/native/effects.js";
import { nativeContactHandler } from "../../../src/features/native/custom-handlers.js";
import { fixture, sample, spaceRef, staged, imageBytes } from "./fixture.js";

const expected = {
  "space.get": "space.get", "space.create": "space.create", "space.getName": "getDisplayName",
  "space.rename": "rename", "space.getMembers": "getMembers", "space.addMembers": "add",
  "space.removeMembers": "remove", "space.leave": "leave", "space.getAvatar": "getAvatar",
  "space.setAvatar": "avatar", "space.clearAvatar": "avatar", "space.setBackground": "background",
  "space.clearBackground": "background", "account.shareContact": "shareContactCard",
  "effect.send": "send", "metadata.get": "resolveMessage", "custom.send": "send",
};
for (const operation of nativeOperations) {
  test(`${operation}: F0 strict schema and pinned public dispatch`, async t => {
    const f = fixture(); t.after(f.close);
    const schemaFixture = JSON.parse(readFileSync(`packages/photon-features/tests/fixtures/${operation}.json`, "utf8"));
    assert.doesNotThrow(() => parseAction(schemaFixture.valid));
    assert.throws(() => parseAction(schemaFixture.rejected));
    const action = sample(operation);
    assert.throws(() => parseAction({ ...action, authorized: true }));
    assert.throws(() => parseAction({ ...action, arguments: { ...action.arguments, raw: { method: "POST" } } }));
    const result = await f.run(action);
    assert.equal(result.status, "executor-completed", JSON.stringify(result));
    assert.doesNotThrow(() => resultSchema.parse(result));
    assert.ok(f.calls.some(c => c.method === expected[operation]));
    const route = f.calls.find(c => c.method === (operation === "space.create" ? "space.create" : "space.get"));
    assert.deepEqual(route?.args[1], { phone: "+15555550002" });
    assert.deepEqual(result.observations, []);
    const capability = capabilitySchema.parse(f.module.capabilities.find(c => c.operation === operation));
    assert.deepEqual(capability.evidence.map(e => e.tier), ["unit", "sdk-contract"]);
    assert.equal(capability.availability.account, "unknown");
    for (const ref of result.references) {
      assert.equal(ref.scope.lineId, f.services.context.scope.lineId);
      assert.equal(ref.scope.accountId, f.services.context.scope.accountId);
      assert.equal(ref.scope.projectId, f.services.context.scope.projectId);
      assert.equal(ref.scope.provider, "imessage");
      if (operation !== "space.create") assert.equal(ref.scope.spaceId, f.services.context.scope.spaceId);
    }
  });
  test(`${operation}: missing permission and exact user intent reject before lookup`, async t => {
    const f = fixture(); t.after(f.close); const action = sample(operation);
    assert.equal((await f.run(action, false)).error?.code, "FORBIDDEN");
    assert.equal(f.calls.length, 0);
    f.services.context.permissions = [];
    assert.equal((await f.run(action)).error?.code, "FORBIDDEN");
    assert.equal(f.calls.length, 0);
  });
}

for (const dimension of ["projectId", "accountId", "lineId", "spaceId"] as const) {
  test(`reject cross-${dimension} references and provider binding`, async t => {
    const f = fixture(); t.after(f.close);
    const action = sample("space.rename");
    assert.ok(action.operation === "space.rename");
    action.arguments.space.scope = { ...action.arguments.space.scope, [dimension]: "foreign" };
    assert.equal((await f.run(action)).error?.code, "SCOPE_MISMATCH");
    assert.ok(!f.calls.some(c => c.method === "space.get"));
    f.binding.scope = { ...f.binding.scope, [dimension]: "foreign" };
    assert.equal((await f.run(sample("space.get"))).error?.code, "SCOPE_MISMATCH");
  });
}
test("provider resolver cannot return another line/chat or a local space", async t => {
  const f = fixture(); t.after(f.close);
  f.space.phone = "+15555550001";
  assert.equal((await f.run(sample("space.rename"))).error?.code, "SCOPE_MISMATCH");
  f.space.phone = f.binding.phone;
  f.binding.provider.space.get = async () => ({ ...f.space, id: "foreign-chat" });
  assert.equal((await f.run(sample("space.rename"))).error?.code, "SCOPE_MISMATCH");
  f.binding.provider.space.get = async () => ({ ...f.space, __platform: "local_imessage" });
  assert.equal((await f.run(sample("space.rename"))).error?.code, "UNSUPPORTED");
});

test("all group-only operations reject direct conversations", async t => {
  const f = fixture(); t.after(f.close); f.space.type = "dm";
  for (const operation of ["space.getName", "space.rename", "space.getMembers", "space.addMembers", "space.removeMembers",
    "space.leave", "space.getAvatar", "space.setAvatar", "space.clearAvatar"] as const) {
    assert.equal((await f.run(sample(operation))).error?.code, "UNSUPPORTED", operation);
  }
  assert.ok(!f.calls.some(c => ["rename", "add", "remove", "leave", "avatar", "getMembers", "getAvatar", "getDisplayName"].includes(c.method)));
});
test("shared/missing account prerequisites never configure or allocate a line", async t => {
  const f = fixture(); t.after(f.close);
  f.binding.accountReady = false;
  for (const op of nativeOperations) assert.equal((await f.run(sample(op))).error?.code, "UNAVAILABLE", op);
  f.binding.accountReady = true; f.binding.dedicated = false; f.binding.phone = "shared"; f.space.phone = "shared";
  const create = sample("space.create"); assert.ok(create.operation === "space.create");
  create.arguments.members = ["+15555550100", "+15555550101"];
  assert.equal((await f.run(create)).error?.code, "UNAVAILABLE");
  for (const op of ["space.rename", "space.addMembers", "space.leave", "space.setAvatar"] as const)
    assert.equal((await f.run(sample(op))).error?.code, "UNAVAILABLE");
  assert.equal((await f.run(sample("space.get"))).status, "executor-completed");
  f.binding.availableOperations = [];
  assert.equal((await f.run(sample("account.shareContact"))).error?.code, "UNAVAILABLE");
});
test("creation uses exact recipients and line; generated reference is durable and scoped", async t => {
  const f = fixture(); t.after(f.close); const action = sample("space.create"); assert.ok(action.operation === "space.create");
  action.arguments.members = ["+15555550100", "person@example.com"];
  action.arguments.name = "Requested group";
  const result = await f.run(action);
  assert.equal(result.status, "executor-completed");
  assert.deepEqual(f.calls.find(c => c.method === "space.create")?.args, [action.arguments.members, { phone: f.binding.phone }]);
  assert.deepEqual(f.calls.find(c => c.method === "rename")?.args, ["Requested group"]);
  const ref = result.references[0]!;
  assert.equal(ref.scope.spaceId, ref.id);
  const stored = f.store.transaction(tx => tx.get("references", ref.id));
  assert.equal(stored?.providerId, "iMessage;+;new-group");
  assert.deepEqual(stored?.reference, ref);
});
test("creation cannot name a DM or bypass additional rename permission", async t => {
  const f = fixture(); t.after(f.close); const action = sample("space.create"); assert.ok(action.operation === "space.create");
  action.arguments.name = "Name";
  assert.equal((await f.run(action)).error?.code, "UNSUPPORTED");
  action.arguments.members.push("+15555550101");
  f.services.context.permissions = ["space.create"];
  assert.equal((await f.run(action)).error?.code, "FORBIDDEN");
  assert.ok(!f.calls.some(c => c.method === "space.create"));
});
test("new recipients cannot reuse another recipient's trusted grant", async t => {
  const f = fixture(); t.after(f.close); const action = sample("space.addMembers");
  f.grant(action); assert.ok(action.operation === "space.addMembers"); action.arguments.members = ["+15555550888"];
  assert.equal((await f.run(action, false)).error?.code, "FORBIDDEN");
  assert.equal(f.calls.length, 0);
});
test("invalid, duplicate, and own-account recipients are rejected", async t => {
  const f = fixture(); t.after(f.close);
  for (const op of ["space.create", "space.addMembers", "space.removeMembers"] as const) {
    for (const members of [["555-0100"], ["+15555550100", "+15555550100"], [f.binding.phone]]) {
      const action = sample(op); assert.ok("members" in action.arguments); action.arguments.members = members;
      assert.notEqual((await f.run(action)).status, "executor-completed");
    }
  }
  assert.ok(!f.calls.some(c => ["space.create", "add", "remove"].includes(c.method)));
});

test("read operations have no provider/account side effects", async t => {
  const f = fixture(); t.after(f.close);
  for (const op of ["space.get", "space.getName", "space.getMembers", "space.getAvatar", "metadata.get"] as const)
    assert.equal((await f.run(sample(op))).status, "executor-completed");
  assert.ok(f.calls.every(c => ["binding", "resolve", "resolveSpace", "space.get", "getDisplayName", "getMembers", "getAvatar", "resolveMessage", "retainAvatar"].includes(c.method)));
});
test("image setters use the shared guarded media port and exact buffer shapes", async t => {
  const f = fixture(); t.after(f.close);
  for (const op of ["space.setAvatar", "space.setBackground"] as const) {
    assert.equal((await f.run(sample(op))).status, "executor-completed");
    const call = f.calls.find(c => c.method === (op === "space.setAvatar" ? "avatar" : "background"));
    assert.deepEqual(call?.args, [imageBytes, { mimeType: "image/png" }]);
  }
  assert.equal(f.calls.filter(c => c.method === "media.resolve").length, 2);
});
test("shared media rejection and integrity mismatch never dispatch", async t => {
  const f = fixture(); t.after(f.close);
  const action = sample("space.setAvatar"); assert.ok(action.operation === "space.setAvatar");
  action.arguments.media = { ...staged, sha256: "a".repeat(64) };
  assert.equal((await f.run(action)).error?.code, "MEDIA_REJECTED");
  f.behavior.mediaFailure = true;
  assert.notEqual((await f.run(sample("space.setBackground"))).status, "executor-completed");
  assert.ok(!f.calls.some(c => c.method === "avatar" || c.method === "background"));
});
test("cross-line media references fail before the media port", async t => {
  const f = fixture(); t.after(f.close); const action = sample("space.setBackground"); assert.ok(action.operation === "space.setBackground");
  action.arguments.media = { version: 1, kind: "attachment", id: "a-1", messageId: "m-1", scope: { ...spaceRef.scope, lineId: "other-line" } };
  assert.equal((await f.run(action)).error?.code, "SCOPE_MISMATCH");
  assert.ok(!f.calls.some(c => c.method === "media.resolve"));
});
test("avatar reads return a retained resource or null; missing retention blocks", async t => {
  const f = fixture(); t.after(f.close);
  assert.deepEqual((await f.run(sample("space.getAvatar"))).value, { type: "media", media: staged });
  delete f.deps.retainAvatar;
  assert.equal((await f.run(sample("space.getAvatar"))).status, "blocked");
  f.behavior.noAvatar = true;
  assert.deepEqual((await f.run(sample("space.getAvatar"))).value, { type: "media", media: null });
});

for (const effectName of Object.keys(effectMapping) as (keyof typeof effectMapping)[]) {
  test(`effect mapping ${effectName} builds with the actual pinned SDK`, async t => {
    const f = fixture(); t.after(f.close); const action = sample("effect.send"); assert.ok(action.operation === "effect.send");
    action.arguments.content.effect = effectName;
    assert.equal((await f.run(action)).status, "executor-completed");
    assert.equal((f.built[0] as { effect: string }).effect, effectMapping[effectName]);
  });
}
test("effect aliases explicitly map to the SDK constants", () => {
  assert.equal(effectMapping["invisible-ink"], imessage.effect.message.invisible);
  assert.equal(effectMapping.love, imessage.effect.message.heart);
  assert.equal(effectMapping["shooting-star"], imessage.effect.message.sparkles);
});
test("effects reject unsupported leaves, nested wrappers, and wrong compiler families", async t => {
  const f = fixture(); t.after(f.close); const action = sample("effect.send"); assert.ok(action.operation === "effect.send");
  action.arguments.content.content = { type: "link", url: "https://example.com" };
  assert.equal((await f.run(action)).error?.code, "UNSUPPORTED");
  assert.throws(() => parseAction({ ...action, arguments: { ...action.arguments, content: { ...action.arguments.content,
    content: action.arguments.content } } }));
  const module = createNativeModule({ ...f.deps, compilers: [{ family: "text", compile: async () => markdown("wrong family") }] });
  const wrong = await module.handlers.find(h => h.operation === "effect.send")!.execute(sample("effect.send"), f.services);
  assert.equal(wrong.error?.code, "FORBIDDEN"); // No exact grant yet.
  f.grant(sample("effect.send"));
  const plain = await module.handlers.find(h => h.operation === "effect.send")!.execute(sample("effect.send"), f.services);
  assert.equal(plain.error?.code, "UNSUPPORTED");
  assert.ok(!f.calls.some(c => c.method === "send"));
});
test("metadata allowlist redacts all content, contacts and provider internals", async t => {
  const f = fixture(); t.after(f.close); const result = await f.run(sample("metadata.get"));
  assert.deepEqual(result.value, { type: "metadata", sentAt: 1234, editedAt: 2345, isFromMe: true });
  assert.doesNotMatch(JSON.stringify(result), /private|secret|nativeText|token/);
  const wrongLine = { ...f.space, phone: "+15555550999" };
  f.message.space = wrongLine;
  assert.equal((await f.run(sample("metadata.get"))).error?.code, "SCOPE_MISMATCH");
  f.message.space = { ...f.space, id: "foreign-chat" };
  assert.equal((await f.run(sample("metadata.get"))).error?.code, "SCOPE_MISMATCH");
});
test("custom handler is named, resource-backed and requires account-sharing intent/permission", async t => {
  const f = fixture(); t.after(f.close); const action = sample("custom.send"); assert.ok(action.operation === "custom.send");
  f.grant(action);
  assert.equal((await f.run(action, false)).error?.code, "FORBIDDEN");
  f.services.context.permissions = ["custom.send"];
  assert.equal((await f.run(action)).error?.code, "FORBIDDEN");
  f.services.context.permissions.push("account.shareContact");
  const result = await f.run(action);
  assert.equal(result.status, "executor-completed");
  assert.deepEqual(f.built[0], { type: "contactCard", __platform: "imessage", __fireAndForget: true });
  action.arguments.codecId = "arbitrary-handler";
  assert.equal((await f.run(action)).error?.code, "UNSUPPORTED");
  assert.throws(() => parseAction({ ...action, arguments: { ...action.arguments, endpoint: "/send", raw: {} } }));
});
test("custom resource cross-scope and wrong host registration reject", async t => {
  const f = fixture(); t.after(f.close); const action = sample("custom.send"); assert.ok(action.operation === "custom.send");
  action.arguments.resource.scope = { ...action.arguments.resource.scope, spaceId: "foreign-space" };
  assert.equal((await f.run(action)).error?.code, "SCOPE_MISMATCH");
  action.arguments.resource.scope = spaceRef.scope;
  f.store.transaction(tx => { const card = tx.get("cards", "card-1")!; tx.put("cards", { ...card, revision: 1, templateId: "other-template" }, 0); });
  assert.equal((await f.run(action)).error?.code, "FORBIDDEN");
  assert.equal(f.built.length, 0);
});
test("composition cannot bypass native permission, capability, or explicit content intent", async t => {
  const f = fixture(); t.after(f.close); const compiler = f.registry.compilers.get("effect")!;
  const action = sample("effect.send"); assert.ok(action.operation === "effect.send");
  f.services.context.permissions = [];
  await assert.rejects(compiler.compile(action.arguments.content, f.services), /permission/);
  f.services.context.permissions = ["effect.send"];
  f.behavior.denyContent = true;
  await assert.rejects(compiler.compile(action.arguments.content, f.services), /intent/);
  f.behavior.denyContent = false;
  f.binding.availableOperations = [];
  await assert.rejects(compiler.compile(action.arguments.content, f.services), /capability/);
});
test("normalized group reducer is registered without subscription or automatic reply", t => {
  const f = fixture(); t.after(f.close);
  assert.equal(f.module.reducers.length, 1);
  assert.equal(f.registry.reducers.has("group"), true);
  assert.equal(f.calls.length, 0);
  assert.equal(f.registry.handlers.size, 17);
});
test("void operations never invent provider acceptance and dispatch failures are ambiguous", async t => {
  const f = fixture(); t.after(f.close);
  assert.deepEqual((await f.run(sample("space.rename"))).observations, []);
  f.behavior.failWrite = true;
  const result = await f.run(sample("space.leave"));
  assert.equal(result.status, "unknown-outcome");
  assert.equal(result.error?.retry, "reconcile-first");
  assert.doesNotMatch(JSON.stringify(result), /secret-token|15555559999/);
  const codec = f.module.recoveryCodecs[0]!;
  assert.equal(codec.validate({ version: 1 }), true);
  assert.equal(codec.validate({ raw: "anything" }), false);
  assert.equal(await codec.reconcile({ version: 1 }, f.services), "unknown");
});
test("silent missing send evidence is not successful effect delivery", async t => {
  const f = fixture(); t.after(f.close); f.behavior.noSendResult = true;
  const result = await f.run(sample("effect.send"));
  assert.equal(result.status, "unknown-outcome");
  assert.deepEqual(result.observations, []);
});
test("expired context, revoked context, cancellation and stale lease reject", async t => {
  const f = fixture(); t.after(f.close); const action = sample("space.rename");
  f.services.context.expiresAt = 1;
  assert.equal((await f.run(action)).error?.code, "CONTEXT_EXPIRED");
  f.services.context.expiresAt = 200000; f.services.context.revokedAt = 999;
  assert.equal((await f.run(action)).error?.code, "CONTEXT_REVOKED");
  f.services.context.revokedAt = null; f.services.claim.leaseUntil = 1;
  assert.equal((await f.run(action)).error?.code, "STALE_FENCE");
  f.services.claim.leaseUntil = 100000; f.controller.abort();
  assert.equal((await f.run(action)).error?.code, "CANCELLED");
  assert.equal(f.calls.length, 0);
});
test("cancellation during staging is checked before native dispatch", async t => {
  const f = fixture(); t.after(f.close);
  f.services.media.resolve = async () => { f.controller.abort(); return { bytes: imageBytes, mimeType: "image/png" }; };
  const result = await f.run(sample("space.setAvatar"));
  assert.equal(result.status, "cancelled");
  assert.ok(!f.calls.some(c => c.method === "avatar"));
});


test("membership preflight rejects small groups, wrong service, existing adds and absent removals", async t => {
  const f = fixture(); t.after(f.close);
  f.behavior.members = ["+15555550100", "+15555550101"];
  for (const op of ["space.removeMembers", "space.leave"] as const)
    assert.equal((await f.run(sample(op))).error?.code, "UNSUPPORTED");
  f.behavior.members = ["+15555550100"];
  assert.equal((await f.run(sample("space.addMembers"))).error?.code, "UNSUPPORTED");
  f.behavior.members = ["+15555550100", "+15555550101", "+15555550102"];
  f.behavior.service = "SMS";
  assert.equal((await f.run(sample("space.leave"))).error?.code, "UNAVAILABLE");
  f.behavior.service = "unknown";
  assert.equal((await f.run(sample("space.addMembers"))).error?.code, "UNAVAILABLE");
  f.behavior.service = "iMessage";
  const add = sample("space.addMembers"); assert.ok(add.operation === "space.addMembers");
  add.arguments.members = ["+15555550100"];
  assert.equal((await f.run(add)).error?.code, "INVALID_REQUEST");
  const remove = sample("space.removeMembers"); assert.ok(remove.operation === "space.removeMembers");
  remove.arguments.members = ["+15555550999"];
  assert.equal((await f.run(remove)).error?.code, "INVALID_REQUEST");
  remove.arguments.members = ["+15555550100", "+15555550101"];
  assert.equal((await f.run(remove)).error?.code, "UNSUPPORTED");
  assert.ok(!f.calls.some(c => ["add", "remove", "leave"].includes(c.method)));
});
test("reads and writes route correctly when each of two dedicated lines is selected", async t => {
  for (const phone of ["+15555550001", "+15555550002"]) {
    const f = fixture(); t.after(f.close);
    f.space.phone = phone; f.binding.phone = phone;
    for (const operation of ["space.get", "space.rename", "space.create", "metadata.get"] as const)
      assert.equal((await f.run(sample(operation))).status, "executor-completed");
    const routed = f.calls.filter(c => c.method === "space.get" || c.method === "space.create");
    assert.equal(routed.length, 4);
    assert.ok(routed.every(c => (c.args[1] as { phone: string }).phone === phone));
  }
});
test("effects delegate markdown and attachment leaves through common compilers", async t => {
  const f = fixture(); t.after(f.close); const action = sample("effect.send"); assert.ok(action.operation === "effect.send");
  for (const leaf of [{ type: "markdown", text: "**hello**" }, { type: "attachment", media: staged }] as const) {
    action.arguments.content.content = leaf;
    assert.equal((await f.run(action)).status, "executor-completed");
    assert.equal((f.built.at(-1) as { content: { type: string } }).content.type, leaf.type);
  }
  assert.equal(f.calls.filter(c => c.method === "media.resolve").length, 1);
});
test("unsupported appearance formats and oversized buffers fail closed", async t => {
  const f = fixture(); t.after(f.close);
  f.services.media.resolve = async () => ({ bytes: imageBytes, mimeType: "image/gif" });
  assert.equal((await f.run(sample("space.setBackground"))).error?.code, "MEDIA_REJECTED");
  f.services.media.resolve = async () => ({ bytes: new Uint8Array(25 * 1024 * 1024 + 1), mimeType: "image/png" });
  assert.equal((await f.run(sample("space.setAvatar"))).error?.code, "MEDIA_REJECTED");
  assert.ok(!f.calls.some(c => c.method === "avatar" || c.method === "background"));
});
test("clear appearance actions use the reserved clear sentinel without staging", async t => {
  const f = fixture(); t.after(f.close);
  for (const op of ["space.clearAvatar", "space.clearBackground"] as const)
    assert.equal((await f.run(sample(op))).status, "executor-completed");
  assert.ok(f.calls.filter(c => c.method === "avatar" || c.method === "background").every(c => c.args[0] === "clear"));
  assert.ok(!f.calls.some(c => c.method === "media.resolve"));
});
test("custom compiler enforces the host allowlist within composition", async t => {
  const f = fixture(); t.after(f.close); const compiler = f.registry.compilers.get("registered-custom")!;
  const action = sample("custom.send"); assert.ok(action.operation === "custom.send");
  const content = { type: "registered-custom", codecId: action.arguments.codecId, resource: action.arguments.resource } as const;
  f.services.context.permissions = ["custom.send"];
  await assert.rejects(compiler.compile(content, f.services), /permission/);
  f.services.context.permissions.push("account.shareContact");
  f.behavior.denyContent = true;
  await assert.rejects(compiler.compile(content, f.services), /intent/);
  f.behavior.denyContent = false;
  await assert.rejects(compiler.compile({ ...content, codecId: "unknown" }, f.services), /Unknown/);
  const built = await compiler.compile(content, f.services);
  assert.ok(typeof built !== "string");
  assert.deepEqual(await built.build(), { type: "contactCard", __platform: "imessage", __fireAndForget: true });
});
test("partial create-plus-rename retains the new reference and cannot be blindly retried", async t => {
  const f = fixture(); t.after(f.close); const action = sample("space.create"); assert.ok(action.operation === "space.create");
  action.arguments.members.push("+15555550101"); action.arguments.name = "Group";
  let writes = 0;
  f.behavior.writeHook = () => { if (++writes === 2) throw Error("secret partial failure"); };
  const result = await f.run(action);
  assert.equal(result.status, "unknown-outcome");
  assert.equal(result.references.length, 1);
  assert.equal(result.error?.retry, "reconcile-first");
});
test("read failure returns redacted provider failure without mutation ambiguity", async t => {
  const f = fixture(); t.after(f.close);
  f.space.getDisplayName = async () => { throw Error("credentials in provider error"); };
  const result = await f.run(sample("space.getName"));
  assert.equal(result.error?.code, "PROVIDER_FAILURE");
  assert.equal(result.status, "failed");
  assert.doesNotMatch(JSON.stringify(result), /credentials/);
});

test("context expiry during route resolution prevents provider lookup", async t => {
  const f = fixture(); t.after(f.close);
  f.services.resources.space = async () => { f.clock.advance(300000); return f.space; };
  const result = await f.run(sample("space.getName"));
  assert.equal(result.error?.code, "CONTEXT_EXPIRED");
  assert.ok(!f.calls.some(c => c.method === "space.get" || c.method === "getDisplayName"));
});
test("context revocation during a read prevents disclosure", async t => {
  const f = fixture(); t.after(f.close);
  f.space.getDisplayName = async () => { f.services.context.revokedAt = 10000; return "private group title"; };
  const result = await f.run(sample("space.getName"));
  assert.equal(result.error?.code, "CONTEXT_REVOKED");
  assert.equal(result.value, undefined);
});
