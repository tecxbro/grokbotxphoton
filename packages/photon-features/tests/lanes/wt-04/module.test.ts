import test from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fixture, scope, context, claim, spaceRef, attachmentRef, png, mp4 } from "./helpers.js";
import { buildRegistry, parseAction, resultSchema, type Action } from "../../../src/index.js";
import { createMediaModule, nativeMediaSource, compileContact, importVCard, exportVCard } from "../../../src/features/media/index.js";
import { compileVoice } from "../../../src/features/media/voice.js";
import { compileAttachment } from "../../../src/features/media/attachments.js";

function request(operation: string, args: unknown): Action {
  return parseAction({ version: 1, idempotencyKey: `req-${operation}`, contextId: context.contextId, operation, arguments: args });
}

test("real SDK builders and all four handlers execute with injected, scoped provider context", async () => {
  const f = await fixture();
  try {
    const media = await f.media.stageNative(attachmentRef, context, claim);
    const audioFile = join(f.input, "note.m4a"); await writeFile(audioFile, mp4);
    const audio = await f.media.stageFile(audioFile, { mimeType: "audio/mp4", name: "note.m4a", duration: 2 }, context, claim);
    const module = createMediaModule({ bindings: async () => f.binding });
    const registry = buildRegistry([module], { requireComplete: false });
    assert.equal(registry.handlers.size, 4); assert.equal(registry.compilers.size, 3);
    const actions = [request("attachment.send", { space: spaceRef, media }), request("voice.send", { space: spaceRef, media: audio }), request("contact.send", { space: spaceRef, contact: { name: "Ada Lovelace", phones: ["+15555550123"], emails: ["ada@example.com"] } }), request("attachment.fetch", { attachment: attachmentRef })];
    for (const action of actions) {
      f.seed(action); const result = await registry.handlers.get(action.operation)!.execute(action, f.services);
      resultSchema.parse(result);
      assert.equal(result.requestId, action.idempotencyKey);
      assert.equal(result.status, action.operation === "attachment.fetch" ? "executor-completed" : "provider-accepted");
      assert(!result.observations.some(o => o.kind === "delivered" || o.kind === "read"));
      if (action.operation === "attachment.fetch") assert.equal(result.value?.type, "media");
    }
    assert.deepEqual(f.calls.map(c => c.type), ["attachment", "voice", "contact"]);
    const attached = f.calls[0]!;
    assert.equal(attached.type, "attachment");
    if (attached.type === "attachment") { assert.deepEqual(await attached.read(), png); assert.equal(attached.id, media.stagingId); }
    const sentVoice = f.calls[1]!; if (sentVoice.type === "voice") assert.equal(sentVoice.duration, 2);
  } finally { f.close(); }
});

test("native retrieval verifies resource, parent conversation and serving phone before getAttachment", async () => {
  const f = await fixture(); let calls = 0;
  try {
    const provider = f.binding.provider;
    const bindings = async () => ({ ...f.binding, provider: { getAttachment: async (id: string, phone?: string) => {
      calls++; assert.equal(id, attachmentRef.id); assert.equal(phone, f.binding.phone); return provider.getAttachment(id, phone);
    } } });
    const source = nativeMediaSource(f.services.resources, bindings, f.store);
    const resolved = await source.open(attachmentRef, context, AbortSignal.timeout(1000));
    assert.deepEqual(resolved.metadata.source, attachmentRef); await resolved.stream.cancel();
    assert.equal(calls, 1);
    await assert.rejects(source.open({ ...attachmentRef, scope: { ...scope, lineId: "wrong" } }, context, AbortSignal.timeout(1000)));
    const wrongPhone = nativeMediaSource(f.services.resources, async () => ({ ...f.binding, phone: "+15555559999" }), f.store);
    await assert.rejects(wrongPhone.open(attachmentRef, context, AbortSignal.timeout(1000)), /line scope/);
    const unrelated = nativeMediaSource({ ...f.services.resources, message: async () => ({ ...f.parent, content: { type: "text", text: "unrelated" } }) }, bindings, f.store);
    await assert.rejects(unrelated.open(attachmentRef, context, AbortSignal.timeout(1000)), /absent/);
    const wrongParent = nativeMediaSource({ ...f.services.resources, message: async () => ({ ...f.parent, id: "other" }) }, bindings, f.store);
    await assert.rejects(wrongParent.open(attachmentRef, context, AbortSignal.timeout(1000)), /parent scope/);
    assert.equal(calls, 1);
  } finally { f.close(); }
});

test("contact subset and vCard round trip use actual pinned public contact/fromVCard/toVCard", async () => {
  const person = { name: "Ada Lovelace", phones: ["+15555550123"], emails: ["ada@example.com"] };
  const card = await exportVCard(person);
  assert.deepEqual(importVCard(Buffer.from(card)), person);
  const content = await compileContact(person).build();
  assert.equal(content.type, "contact");
  if (content.type === "contact") { assert.equal(content.name?.formatted, person.name); assert.deepEqual(content.phones, [{ value: person.phones[0] }]); }
  assert.throws(() => importVCard(Buffer.from(card.replace("END:VCARD", "PHOTO:https://127.0.0.1/secret\r\nEND:VCARD"))), /outside F0/);
  assert.throws(() => importVCard(Buffer.from(card + card)), /invalid vCard/);
  assert.throws(() => compileContact({ ...person, name: "Ada\nINJECT" }), /name/);
  assert.throws(() => compileContact({ ...person, phones: ["wrong"] }));
});

test("voice sends real audio and reports explicit regular-attachment fallback", async () => {
  const f = await fixture();
  try {
    const image = await f.media.stageNative(attachmentRef, context, claim);
    await assert.rejects(compileVoice(image, f.services, "native"), /audio/);
    const audioFile = join(f.input, "audio.m4a"); await writeFile(audioFile, mp4);
    const audio = await f.media.stageFile(audioFile, { mimeType: "audio/mp4" }, context, claim);
    assert.equal((await (await compileVoice(audio, f.services, "native")).build()).type, "voice");
    assert.equal((await (await compileVoice(audio, f.services, "audio-attachment")).build()).type, "attachment");
    const module = createMediaModule({ bindings: async () => f.binding, voiceBehavior: "audio-attachment" });
    const action = request("voice.send", { space: spaceRef, media: audio }); f.seed(action);
    const result = await module.handlers.find(h => h.operation === action.operation)!.execute(action, f.services);
    assert.equal(result.capability?.providerSupport, "fallback"); assert.equal(f.calls[0]?.type, "attachment");
  } finally { f.close(); }
});

for (const type of ["void", "throw"] as const) test(`SDK ${type} is unknown outcome, never safe automatic replay`, async () => {
  const f = await fixture();
  try {
    const action = request("contact.send", { space: spaceRef, contact: { name: "Ada", phones: [], emails: [] } }); f.seed(action);
    f.space.send = (async () => { if (type === "throw") throw new Error("secret provider failure"); return undefined; }) as unknown as typeof f.space.send;
    const module = createMediaModule({ bindings: async () => f.binding });
    const result = await module.handlers.find(h => h.operation === action.operation)!.execute(action, f.services);
    assert.equal(result.status, "unknown-outcome"); assert.equal(result.error?.retry, "reconcile-first");
    assert(!JSON.stringify(result).includes("secret provider"));
    assert.equal(await module.recoveryCodecs[0]!.reconcile(null, f.services), "unknown");
  } finally { f.close(); }
});

test("compiler resolves bytes before building; cancelled leases block dispatch after async staging", async () => {
  const f = await fixture();
  try {
    const media = await f.media.stageNative(attachmentRef, context, claim);
    const action = request("attachment.send", { space: spaceRef, media }); f.seed(action);
    const built = await compileAttachment(media, f.services);
    const content = await built.build(); if (content.type === "attachment") assert.deepEqual(await content.read(), png);
    const stager = { resolve: async () => {
      f.store.transaction(tx => { const row = tx.get("outbox", action.idempotencyKey)!; tx.put("outbox", { ...row, revision: row.revision + 1, cancellationRequestedAt: f.clock.now() }, row.revision); });
      return { bytes: png, mimeType: "image/png" };
    } };
    const module = createMediaModule({ bindings: async () => f.binding });
    const result = await module.handlers[0]!.execute(action, { ...f.services, media: stager });
    assert.equal(result.error?.code, "CANCELLED"); assert.equal(f.calls.length, 0);
  } finally { f.close(); }
});

test("model JSON cannot embed binary, local paths, URLs, contact raw fields or text voice data", () => {
  for (const media of [{ bytes: "AAAA", mimeType: "image/png" }, "/tmp/a", "https://media.example/a", { text: "say this" }]) assert.throws(() => request("attachment.send", { space: spaceRef, media }));
  assert.throws(() => request("contact.send", { space: spaceRef, contact: { name: "Ada", phones: [], emails: [], raw: { secret: true } } }));
});

test("logical resource IDs map to distinct native IDs and normalized input metadata survives", async () => {
  const f = await fixture();
  try {
    const nativeConversation = "any;-;+15555550199", nativeMessage = "native-message-guid";
    const ref = { ...attachmentRef, id: "logical-attachment" };
    Object.defineProperty(f.space, "id", { value: nativeConversation });
    f.store.transaction(tx => {
      for (const [id, providerId] of [[scope.spaceId, nativeConversation], [attachmentRef.messageId, nativeMessage]]) {
        const row = tx.get("references", id!)!; tx.put("references", { ...row, revision: row.revision + 1, providerId: providerId! }, row.revision);
      }
      tx.put("references", { id: ref.id, reference: ref, providerId: attachmentRef.id, scope, revision: 0,
        ownedByPrincipalId: context.principalId, taskId: context.taskId, generation: context.generation }, null);
    });
    const resources = { ...f.services.resources, message: async () => ({ ...f.parent, id: nativeMessage }) };
    const bindings = async () => ({ ...f.binding, conversationId: nativeConversation });
    const source = nativeMediaSource(resources, bindings, f.store, async () => ({ source: ref, providerHandle: attachmentRef.id,
      providerMessageId: nativeMessage, providerConversationId: nativeConversation, mimeType: "image/png", name: "original.png", size: png.length, duration: 3 }));
    const result = await source.open(ref, context, AbortSignal.timeout(1000));
    assert.equal(result.metadata.source?.id, "logical-attachment");
    assert.equal(result.metadata.providerHandle, attachmentRef.id); assert.equal(result.metadata.name, "original.png");
    assert.equal(result.metadata.providerConversationId, nativeConversation); assert.equal(result.metadata.duration, 3);
    await result.stream.cancel();
    const wrongMetadata = nativeMediaSource(resources, bindings, f.store, async () => ({ source: ref, providerHandle: "wrong", mimeType: "image/png" }));
    await assert.rejects(wrongMetadata.open(ref, context, AbortSignal.timeout(1000)), /normalized metadata/);
  } finally { f.close(); }
});
