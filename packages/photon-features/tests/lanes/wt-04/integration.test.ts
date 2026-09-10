import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { attachment, voice, type Content, type ContentInput, type Space, type Message } from "spectrum-ts";
import { makeServices } from "../../fixtures/runtime-services.js";
import { createFeatureModule } from "../../../src/features/media/module.js";
import { GuardedMediaStager, stageMediaResource } from "../../../src/features/media/staging.js";
import { publicNativeMediaSource, type MediaProviderContext, type MediaOperationOptions } from "../../../src/features/media/sdk.js";
import { resultSchema } from "../../../src/contracts/results.js";
import { parseActionRequest, type ActionFor } from "../../../src/contracts/actions.js";
import type { ResourceRef } from "../../../src/contracts/references.js";

async function fixture() {
  const f = makeServices();
  const services: import("../../../src/contracts/services.js").ExecutionServices = { ...f.services, context: { ...f.services.context, permissions: ["attachment.send", "attachment.fetch", "voice.send", "contact.send"] } };
  // Shared fixture compares JSON key insertion order. This owned adapter uses structural identity.
  services.resolveResource = async ref => {
    services.assertActiveClaim();
    const stored = f.resources.get(ref.id); assert(stored, "RESOURCE_NOT_FOUND");
    assert.deepEqual(ref, stored, "resource scope or parent mismatch"); return structuredClone(stored);
  };
  const scope = services.context.scope;
  const spaceRef = { version: 1 as const, kind: "space" as const, id: scope.spaceId, scope };
  const parentRef = { version: 1 as const, kind: "message" as const, id: "parent", scope };
  const attachmentRef = { version: 1 as const, kind: "attachment" as const, id: "logical-attachment", messageId: parentRef.id, scope };
  for (const [ref, id] of [[spaceRef, "native-chat"], [parentRef, "native-message"], [attachmentRef, "native-file"]] as const) {
    f.resources.set(ref.id, ref);
    services.transaction(unit => unit.put("references", { id: ref.id, reference: ref, providerId: id, scope, revision: 0,
      ownedByPrincipalId: services.context.principalId, taskId: services.context.taskId, generation: services.context.generation }, null));
  }
  const bytes = Buffer.from("download fixture"), calls: Content[] = [];
  const space = { id: "native-chat", __platform: "imessage", phone: "+15555550100", async send(input: ContentInput) {
    if (typeof input === "string") throw new Error("unexpected text");
    const content = await input.build(); calls.push(content);
    return { id: "native-sent", platform: "imessage", space, content } as Message;
  } } as unknown as Space;
  const content = await attachment(bytes, { id: "native-file", name: "source.txt", mimeType: "text/plain" }).build();
  const parent = { sender: undefined, direction: "inbound", timestamp: new Date(100), id: "native-message", platform: "imessage", space, content, attachmentMetadata: [{ guid: "native-file",
    fileName: "source.txt", mimeType: "text/plain", totalBytes: bytes.length, transferState: "finished",
    uti: "public.plain-text", isHidden: false, isSticker: false }] } as unknown as Message;
  let retrievals = 0;
  const binding: MediaProviderContext = { scope, phone: "+15555550100", conversationId: "native-chat",
    space: async () => space, message: async () => parent,
    provider: { async getAttachment(id, phone) { retrievals++; assert.equal(id, "native-file"); assert.equal(phone, "+15555550100");
      return content.type === "attachment" ? content : undefined; } } };
  await mkdir(resolve(".photon-local"), { recursive: true });
  const directory = await mkdtemp(resolve(".photon-local/wt04-public-"));
  const options = { services, directory: join(directory, "staging"), approvedRoots: [directory], urls: { approvedHosts: [] },
    native: publicNativeMediaSource(services, async () => binding) };
  const media = await GuardedMediaStager.create(options); services.media = media;
  const config: MediaOperationOptions = { provider: async () => binding, voiceBehavior: "native",
    stageAttachment: ref => media.stage({ type: "native", attachment: ref }) };
  const module = createFeatureModule(config);
  function action<K extends "attachment.send" | "attachment.fetch" | "voice.send" | "contact.send">(operation: K, args: unknown): ActionFor<K> {
    return parseActionRequest({ version: 1, idempotencyKey: `test-${operation}`, contextId: services.context.contextId, operation, arguments: args }) as ActionFor<K>;
  }
  return { ...f, services, scope, space, spaceRef, attachmentRef, binding, directory, media, config, module, action, calls, bytes,
    retrievals: () => retrievals, close: () => rm(directory, { recursive: true, force: true }) };
}

test("public module fetch/send uses scoped native retrieval, shared resolve and one executor child", async () => {
  const f = await fixture();
  try {
    assert.equal(f.module.owner, "wt-04");
    assert.deepEqual(Object.keys(f.module.handlers).sort(), ["attachment.fetch", "attachment.send", "contact.send", "voice.send"]);
    const fetch = await f.module.handlers["attachment.fetch"]!(f.action("attachment.fetch", { attachment: f.attachmentRef }), f.services);
    resultSchema.parse(fetch); assert.equal(fetch.status, "executor-completed");
    assert(fetch.value?.type === "media" && fetch.value.media);
    const staged = fetch.value.media;
    const resolved = await f.services.media.resolve(staged, f.services.context);
    assert.deepEqual(resolved.bytes, f.bytes); assert.equal(f.retrievals(), 1);
    const action = f.action("attachment.send", { space: f.spaceRef, media: staged });
    const result = await f.module.handlers["attachment.send"]!(action, f.services); resultSchema.parse(result);
    assert.equal(result.status, "provider-accepted"); assert.equal(f.children.size, 1);
    await f.module.handlers["attachment.send"]!(action, f.services);
    assert.equal(f.calls.length, 1);
    const sent = f.calls[0]; assert(sent?.type === "attachment");
    assert.equal(sent.id, "native-file"); assert.equal(sent.name, "source.txt"); assert.deepEqual(await sent.read(), f.bytes);
  } finally { await f.close(); }
});

for (const behavior of ["native", "audio-attachment"] as const) test(`public voice policy ${behavior} sends an existing audio resource`, async () => {
  const f = await fixture();
  try {
    const path = join(f.directory, "voice.wav"); await writeFile(path, "RIFF0000WAVEaudio");
    const media = await stageMediaResource(f.media, { type: "file", path, metadata: { mimeType: "audio/wav", name: "voice.wav", duration: 3.25 } });
    const module = createFeatureModule({ ...f.config, voiceBehavior: behavior });
    const result = await module.handlers["voice.send"]!(f.action("voice.send", { space: f.spaceRef, media }), f.services);
    assert.equal(result.status, "provider-accepted");
    assert.equal(result.capability?.providerSupport, behavior === "native" ? "native" : "fallback");
    const sent = f.calls[0]; assert.equal(sent?.type, behavior === "native" ? "voice" : "attachment");
    if (sent?.type === "voice") assert.equal(sent.duration, 3.25);
  } finally { await f.close(); }
});

test("contact sends via shared executor and ambiguous SDK results are never resent", async () => {
  const f = await fixture();
  try {
    const action = f.action("contact.send", { space: f.spaceRef, contact: { name: "Ada", phones: [], emails: [] } });
    let sends = 0;
    f.space.send = (async () => { sends++; throw new Error("transport broke after dispatch"); }) as Space["send"];
    const first = await f.module.handlers["contact.send"]!(action, f.services);
    assert.equal(first.status, "unknown-outcome"); assert.equal(first.error?.retry, "reconcile-first");
    const retry = await f.module.handlers["contact.send"]!(action, f.services);
    assert.deepEqual(retry, first); assert.equal(sends, 1);
  } finally { await f.close(); }
});

for (const change of ["cancel", "fence", "generation"] as const) test(`public handler blocks dispatch after asynchronous ${change}`, async () => {
  const f = await fixture();
  try {
    const original = f.binding.space;
    f.binding.space = async ref => {
      if (change === "cancel") f.abort.abort();
      if (change === "fence") f.authoritative.fence++;
      if (change === "generation") f.authoritative.generation++;
      return original(ref);
    };
    await assert.rejects(f.module.handlers["contact.send"]!(f.action("contact.send", { space: f.spaceRef, contact: { name: "Ada", phones: [], emails: [] } }), f.services), /CANCELLED|STALE_FENCE|STALE_GENERATION/);
    assert.equal(f.calls.length, 0); assert.equal(f.children.size, 0);
  } finally { await f.close(); }
});

for (const mismatch of ["phone", "chat", "parent", "attachment", "scope"] as const) test(`public retrieval rejects wrong ${mismatch} before downloading`, async () => {
  const f = await fixture();
  try {
    if (mismatch === "phone") f.binding.phone = "+15555559999";
    if (mismatch === "chat") f.binding.conversationId = "other-chat";
    if (mismatch === "parent") {
      const original = await f.binding.message(f.attachmentRef);
      f.binding.message = async () => ({ ...original, id: "wrong-message" });
    }
    if (mismatch === "attachment") {
      const original = await f.binding.message(f.attachmentRef);
      f.binding.message = async () => ({ ...original, content: { type: "text", text: "unrelated" }, attachmentMetadata: [] } as unknown as Message);
    }
    const ref: ResourceRef = mismatch === "scope" ? { ...f.attachmentRef, scope: { ...f.scope, lineId: "other-line" } } : f.attachmentRef;
    await assert.rejects(f.module.handlers["attachment.fetch"]!(f.action("attachment.fetch", { attachment: ref }), f.services), /scope|absent|SCOPE_MISMATCH/);
    assert.equal(f.retrievals(), 0);
  } finally { await f.close(); }
});


test("public contact success is executor-recorded provider acceptance only", async () => {
  const f = await fixture();
  try {
    const result = await f.module.handlers["contact.send"]!(f.action("contact.send", { space: f.spaceRef,
      contact: { name: "Ada", phones: ["+15555550123"], emails: ["ada@example.com"] } }), f.services);
    resultSchema.parse(result); assert.equal(result.status, "provider-accepted");
    assert.equal(f.calls[0]?.type, "contact"); assert.equal(f.children.size, 1);
    assert.deepEqual(result.observations.map(o => o.kind), ["accepted"]);
  } finally { await f.close(); }
});

test("native retrieval preserves known duration inside a reply", async () => {
  const f = await fixture();
  try {
    const audio = Buffer.from("RIFF0000WAVEnote");
    const content = await voice(audio, { name: "note.wav", mimeType: "audio/wav", duration: 7 }).build();
    assert(content.type === "voice");
    const original = await f.binding.message(f.attachmentRef);
    const parent = { ...original, content: { type: "reply", target: original, content: { ...content, id: "native-file" } }, attachmentMetadata: [] } as unknown as Message;
    f.binding.message = async () => parent;
    const file = await attachment(audio, { id: "native-file", name: "note.wav", mimeType: "audio/wav" }).build();
    f.binding.provider.getAttachment = async () => file.type === "attachment" ? file : undefined;
    const result = await f.media.stage({ type: "native", attachment: f.attachmentRef });
    assert.equal((await f.media.resolve(result, f.services.context)).metadata?.duration, 7);
  } finally { await f.close(); }
});
