import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Content, ContentInput, Message, Space } from "spectrum-ts";
import { attachment } from "spectrum-ts";
import { context as baseContext, scope, FixedClock, storeFixture } from "../../fixtures/harness.js";
import { type Action, type Claim, type ExecutionServices, type ResourceRef, type TrustedContext, type OperationResult } from "../../../src/index.js";
import { SafeMediaStager, type NativeMediaSource, type ScopedMediaBinding } from "../../../src/features/media/index.js";
export { scope };
export const context: TrustedContext = { ...baseContext, permissions: ["attachment.send", "attachment.fetch", "voice.send", "contact.send"] };
export const claim: Claim = { owner: "wt04-test", leaseUntil: 100000, fence: 1, generation: 1 };
export const spaceRef = { version: 1, kind: "space", id: scope.spaceId, scope } as const;
export const attachmentRef = { version: 1, kind: "attachment", id: "native-file", messageId: "parent-message", scope } as const;
export const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1cAAAAASUVORK5CYII=", "base64");
export const mp4 = Buffer.from([0,0,0,24,102,116,121,112,77,52,65,32,0,0,0,0,77,52,65,32,109,112,52,50]);
export function stream(bytes: Uint8Array, chunkSize = 13): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream({ pull(controller) {
    if (index >= bytes.length) { controller.close(); return; }
    controller.enqueue(bytes.subarray(index, index += chunkSize));
  } });
}
export async function fixture(options: { maxBytes?: number; timeoutMs?: number; concurrency?: number; native?: NativeMediaSource } = {}) {
  const f = storeFixture(), clock = new FixedClock();
  const input = join(f.dir, "approved"), staging = join(f.dir, "staging");
  await mkdir(input, { mode: 0o700 });
  const calls: Content[] = [];
  const space = { __platform: "imessage", id: scope.spaceId, phone: "+15555550100",
    async send(input: ContentInput) {
      if (typeof input === "string") throw new Error("text unexpected");
      const content = await input.build(); calls.push(content);
      return makeMessage(content, "sent-message");
    },
  } as unknown as Space;
  function makeMessage(content: Content, id = "parent-message"): Message {
    return { id, platform: "imessage", space, content, direction: "inbound", timestamp: new Date(10000), sender: undefined } as Message;
  }
  const original = await attachment(png, { id: attachmentRef.id, name: "pixel.png", mimeType: "image/png" }).build();
  const parent = makeMessage(original);
  const resources = {
    resolve: async (ref: ResourceRef) => ref,
    space: async () => space,
    message: async () => parent,
  };
  const binding: ScopedMediaBinding = { scope, conversationId: scope.spaceId, phone: "+15555550100", provider: {
    getAttachment: async () => original.type === "attachment" ? original : undefined,
  } };
  const native: NativeMediaSource = options.native ?? { open: async ref => ({ stream: stream(png), metadata: {
    source: ref, providerHandle: ref.id, name: "pixel.png", mimeType: "image/png", size: png.length,
  } }) };
  const config = { directory: staging, approvedRoots: [input], urls: { approvedHosts: ["media.example"] }, store: f.store, clock, native, ...options };
  f.store.transaction(tx => {
    for (const reference of [spaceRef, attachmentRef, { version: 1 as const, kind: "message" as const, id: attachmentRef.messageId, scope }]) {
      tx.put("references", { id: reference.id, reference, providerId: reference.id, scope, revision: 0,
        ownedByPrincipalId: context.principalId, taskId: context.taskId, generation: context.generation }, null);
    }
  });
  const media = await SafeMediaStager.create(config);
  const services: ExecutionServices = { context, resources, media, clock, claim, transactions: f.store,
    signal: new AbortController().signal, streams: { async open() { throw new Error("unused"); } } };
  function seed(action: Action, status: OperationResult["status"] = "queued") {
    const result: OperationResult = { version: 1, requestId: action.idempotencyKey, status, revision: 0, updatedAt: clock.now(), references: [], observations: [] };
    f.store.transaction(tx => tx.put("outbox", { id: action.idempotencyKey, scope, revision: 0, action,
      principalId: context.principalId, taskId: context.taskId, generation: 1, argumentDigest: "test", result,
      claim, cancellationRequestedAt: null }, null));
  }
  return { ...f, clock, input, staging, calls, space, parent, binding, services, config, media, seed };
}
