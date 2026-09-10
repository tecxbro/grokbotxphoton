import { metadataSchema, type SourceMetadata } from "./metadata.js";
import type { Attachment, Content, SpectrumInstance } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { assertScope, sameScope, type ResourceResolver, type Scope, type TrustedContext, type TransactionStore, type ResourceRef } from "../../index.js";
import { abortable, MAX_MEDIA_BYTES, mediaName, reject, validMime } from "./safety.js";
import type { NativeMediaSource } from "./staging.js";

/** Public SDK probe and adapter: uses the host's existing Spectrum instance. */
export interface NativeAttachmentProvider {
  getAttachment(guid: string, phone?: string): Promise<Attachment | undefined>;
}
export function mediaProvider(app: SpectrumInstance): NativeAttachmentProvider {
  const provider = imessage(app);
  return { getAttachment: (guid, phone) => provider.getAttachment(guid, phone) };
}
export interface ScopedMediaBinding {
  scope: Scope;
  phone: string;
  conversationId: string;
  provider: Pick<ReturnType<typeof mediaProvider>, "getAttachment">;
}
export type MediaBindings = (context: TrustedContext) => Promise<ScopedMediaBinding>;
function findMediaContent(content: Content, id: string, depth = 0): Extract<Content, { type: "attachment" | "voice" }> | undefined {
  if (depth > 3) return undefined;
  if (content.type === "attachment" || content.type === "voice") return content.id === id ? content : undefined;
  if (content.type === "group") {
    for (const item of content.items) { const found = findMediaContent(item.content, id, depth + 1); if (found) return found; }
  }
  if (content.type === "reply") return findMediaContent(content.content, id, depth + 1);
  return undefined;
}
function containsAttachment(content: Content, id: string): boolean { return !!findMediaContent(content, id); }
export type NormalizedMediaLookup = (ref: Extract<ResourceRef, { kind: "attachment" }>, context: TrustedContext) => Promise<SourceMetadata | undefined>;
export function nativeMediaSource(resources: ResourceResolver, bindings: MediaBindings, store: TransactionStore, normalized?: NormalizedMediaLookup): NativeMediaSource {
  return {
    async open(ref, context, signal) {
      assertScope(ref, context.scope);
      const authoritative = await abortable(resources.resolve(ref, context), signal);
      if (authoritative.kind !== "attachment" || authoritative.id !== ref.id || authoritative.messageId !== ref.messageId) reject("attachment reference mismatch");
      assertScope(authoritative, context.scope);
      const mapping = mappedResource(ref, context, store);
      const parentRef = { version: 1 as const, kind: "message" as const, id: ref.messageId, scope: ref.scope };
      const parentMapping = mappedResource(parentRef, context, store);
      const spaceMapping = mappedResource({ version: 1, kind: "space", id: context.scope.spaceId, scope: context.scope }, context, store);
      const parent = await abortable(resources.message({ version: 1, kind: "message", id: ref.messageId, scope: ref.scope }, context), signal);
      if (parent.platform !== "imessage" || parent.id !== parentMapping.providerId || parent.space.id !== spaceMapping.providerId) reject("attachment parent scope");
      const binding = await abortable(bindings(context), signal);
      if (!sameScope(binding.scope, context.scope) || !binding.phone || parent.space.id !== binding.conversationId || imessage(parent.space).phone !== binding.phone) reject("attachment line scope");
      const metadata = imessage(parent).attachmentMetadata?.find(item => item.guid === mapping.providerId);
      if (!metadata && !containsAttachment(parent.content, mapping.providerId)) reject("attachment absent from parent");
      const item: Attachment | undefined = await abortable(binding.provider.getAttachment(mapping.providerId, binding.phone), signal);
      if (!item || item.id !== mapping.providerId) reject("attachment unavailable");
      validMime(item.mimeType);
      mediaName(item.mimeType, item.name);
      if (item.size !== undefined && (item.size <= 0 || item.size > MAX_MEDIA_BYTES)) reject("byte limit");
      const incoming = normalized ? await abortable(normalized(ref, context), signal) : undefined;
      if (incoming) {
        metadataSchema.parse({ ...incoming, version: 1, stagingId: "00000000-0000-4000-8000-000000000000" });
        if (!incoming.source || !sameScope(incoming.source.scope, ref.scope) || incoming.source.id !== ref.id ||
          incoming.source.messageId !== ref.messageId || incoming.providerHandle !== mapping.providerId ||
          (incoming.providerMessageId !== undefined && incoming.providerMessageId !== parent.id) ||
          (incoming.providerConversationId !== undefined && incoming.providerConversationId !== parent.space.id) ||
          incoming.mimeType !== item.mimeType || (incoming.size !== undefined && item.size !== undefined && incoming.size !== item.size)) reject("normalized metadata mismatch");
      }
      const opening = item.stream();
      opening.then(stream => { if (signal.aborted) void stream.cancel().catch(() => {}); }).catch(() => {});
      const stream = await abortable(opening, signal);
      return { stream, metadata: { ...incoming, mimeType: item.mimeType, name: incoming?.name ?? item.name, size: item.size ?? incoming?.size,
        ...(parent.content.type === "voice" && parent.content.id === mapping.providerId ? { duration: parent.content.duration ?? incoming?.duration } : {}),
        source: ref, providerHandle: item.id, providerMessageId: parent.id, providerConversationId: parent.space.id } };
    },
  };
}

/** Logical F0 IDs are never passed to the SDK as provider IDs. */
export function mappedResource(ref: ResourceRef, context: TrustedContext, store: TransactionStore) {
  assertScope(ref, context.scope);
  const mapping = store.transaction(tx => tx.get("references", ref.id));
  if (!mapping || !sameScope(mapping.scope, context.scope) || !sameScope(mapping.reference.scope, context.scope) ||
    mapping.reference.kind !== ref.kind || mapping.reference.id !== ref.id ||
    (ref.kind === "attachment" && (mapping.reference.kind !== "attachment" || mapping.reference.messageId !== ref.messageId)) ||
    mapping.ownedByPrincipalId !== context.principalId || mapping.taskId !== context.taskId ||
    mapping.generation !== context.generation || !mapping.providerId) reject("resource mapping unavailable");
  return mapping;
}

import { createHash, randomUUID } from "node:crypto";
import { attachment, voice, type ContentBuilder, type Space, type Message } from "spectrum-ts";
import { parseActionRequest, type ActionFor } from "../../contracts/actions.js";
import type { ExecutionServices as PublicServices } from "../../contracts/services.js";
import type { OperationResult } from "../../contracts/results.js";
import { resolveMediaResource, type GuardedMediaStager } from "./staging.js";
import { compileContact } from "./contacts.js";
import type { VoiceBehavior } from "./voice.js";
import { retainResource } from "./retention.js";

export type MediaOperation = "attachment.send" | "attachment.fetch" | "voice.send" | "contact.send";
export type MediaAction<K extends MediaOperation = MediaOperation> = { [P in K]: ActionFor<P> }[K];
/** Inject the already-owned provider, scoped SDK resolvers and native phone; never create another client. */
export interface MediaProviderContext extends ScopedMediaBinding {
  space(ref: ResourceRef): Promise<Space>;
  message(ref: ResourceRef): Promise<Message>;
}
export interface MediaOperationOptions {
  provider(context: TrustedContext): Promise<MediaProviderContext>;
  /** Required host policy: native voice support or explicitly labelled ordinary audio fallback. */
  voiceBehavior: VoiceBehavior;
  stageAttachment?(ref: Extract<ResourceRef, { kind: "attachment" }>, services: PublicServices): ReturnType<GuardedMediaStager["stage"]>;
}
/** Domain reference lookup only; every logical/native mapping remains scoped to the current task. */
export function mappedMediaReference(ref: ResourceRef, services: PublicServices) {
  services.assertActiveClaim(); assertScope(ref, services.context.scope);
  const row = services.transaction(unit => unit.get("references", ref.id));
  const context = services.context;
  if (!row || !sameScope(row.scope, context.scope) || !sameScope(row.reference.scope, context.scope) ||
    row.reference.id !== ref.id || row.reference.kind !== ref.kind ||
    (ref.kind === "attachment" && (row.reference.kind !== "attachment" || row.reference.messageId !== ref.messageId)) ||
    row.ownedByPrincipalId !== context.principalId || row.taskId !== context.taskId ||
    row.generation !== context.generation || !row.providerId) reject("resource mapping unavailable");
  return row;
}
async function resolvedReference(ref: ResourceRef, services: PublicServices): Promise<void> {
  assertScope(ref, services.context.scope);
  const authoritative = await services.resolveResource(ref);
  services.assertActiveClaim(); services.signal.throwIfAborted(); assertScope(authoritative, services.context.scope);
  if (authoritative.kind !== ref.kind || authoritative.id !== ref.id ||
    (ref.kind === "attachment" && (authoritative.kind !== "attachment" || authoritative.messageId !== ref.messageId))) reject("resource reference mismatch");
}
/** Native downloads use the pinned public getAttachment/stream APIs and check the parent chat and line first. */
export function publicNativeMediaSource(services: PublicServices,
  provider: MediaOperationOptions["provider"]): NativeMediaSource {
  return { async open(ref, context, signal) {
    if (context.contextId !== services.context.contextId || !sameScope(context.scope, services.context.scope)) reject("resource scope");
    await resolvedReference(ref, services);
    const parentRef = { version: 1 as const, kind: "message" as const, id: ref.messageId, scope: ref.scope };
    const spaceRef = { version: 1 as const, kind: "space" as const, id: ref.scope.spaceId, scope: ref.scope };
    await resolvedReference(parentRef, services); await resolvedReference(spaceRef, services);
    const mapping = mappedMediaReference(ref, services), parentMapping = mappedMediaReference(parentRef, services);
    const spaceMapping = mappedMediaReference(spaceRef, services);
    const binding = await abortable(provider(context), signal); services.assertActiveClaim();
    if (!sameScope(binding.scope, ref.scope) || !binding.phone || binding.conversationId !== spaceMapping.providerId) reject("attachment line scope");
    const parent = await abortable(binding.message(parentRef), signal); services.assertActiveClaim();
    if (parent.platform !== "imessage" || parent.id !== parentMapping.providerId || parent.space.id !== spaceMapping.providerId ||
      parent.space.__platform !== "imessage" || imessage(parent.space).phone !== binding.phone) reject("attachment parent scope");
    const retrieval = imessage(parent).attachmentMetadata?.find(item => item.guid === mapping.providerId);
    if (!retrieval && !containsAttachment(parent.content, mapping.providerId)) reject("attachment absent from parent");
    if (retrieval && retrieval.transferState !== "finished") reject("attachment not ready");
    const item = await abortable(binding.provider.getAttachment(mapping.providerId, binding.phone), signal);
    services.assertActiveClaim();
    if (!item || item.id !== mapping.providerId) reject("attachment unavailable");
    validMime(item.mimeType); mediaName(item.mimeType, item.name);
    if (item.size !== undefined && (!Number.isSafeInteger(item.size) || item.size <= 0 || item.size > MAX_MEDIA_BYTES)) reject("byte limit");
    if (retrieval && (retrieval.mimeType !== item.mimeType || (item.size !== undefined && retrieval.totalBytes !== item.size))) reject("retrieval metadata mismatch");
    const opening = item.stream();
    opening.then(stream => { if (signal.aborted) void stream.cancel().catch(() => {}); }).catch(() => {});
    const stream = await abortable(opening, signal);
    try { services.assertActiveClaim(); signal.throwIfAborted(); }
    catch (error) { void stream.cancel().catch(() => {}); throw error; }
    const original = findMediaContent(parent.content, item.id);
    return { stream, metadata: { mimeType: item.mimeType, name: item.name, size: item.size,
      source: ref, providerHandle: item.id, providerMessageId: parent.id, providerConversationId: parent.space.id,
      ...(original?.type === "voice" ? { duration: original.duration } : {}),
      ...(retrieval ? { retrieval } : {}) } };
  } };
}
/** Bounded, inert SDK input. Buffer builders cannot delegate an unrestricted path/URL fetch. */
export async function mediaOperationContent(action: MediaAction<Exclude<MediaOperation, "attachment.fetch">>,
  services: PublicServices, behavior: VoiceBehavior): Promise<ContentBuilder> {
  if (action.operation === "contact.send") return compileContact(action.arguments.contact);
  const media = action.arguments.media, resolved = await resolveMediaResource(media, services);
  const id = resolved.metadata?.providerHandle ?? ("kind" in media ? media.id : media.stagingId);
  const options = { id, name: mediaName(resolved.mimeType, resolved.metadata?.name), mimeType: resolved.mimeType };
  const bytes = Buffer.from(resolved.bytes);
  if (action.operation === "voice.send") {
    if (!resolved.mimeType.startsWith("audio/")) reject("voice requires existing audio");
    if (behavior !== "native" && behavior !== "audio-attachment") reject("voice policy required");
    return behavior === "native" ? voice(bytes, { ...options, duration: resolved.metadata?.duration }) : attachment(bytes, options);
  }
  return attachment(bytes, options);
}
/** Four-operation mapping; consequential sends are exclusively dispatched by the shared executor. */
export async function mapMediaOperation(action: MediaAction, services: PublicServices,
  options: MediaOperationOptions): Promise<OperationResult> {
  const parsed = parseActionRequest(action);
  if (!["attachment.send", "attachment.fetch", "voice.send", "contact.send"].includes(parsed.operation)) throw new Error("INVALID_REQUEST");
  action = parsed as MediaAction;
  services.assertActiveClaim(); services.signal.throwIfAborted();
  if (action.contextId !== services.context.contextId || !services.context.permissions.includes(action.operation)) throw new Error("FORBIDDEN");
  const digest = createHash("sha256").update(JSON.stringify(action)).digest("hex");
  const base = (): OperationResult => ({ version: 1, requestId: action.idempotencyKey, revision: 0,
    status: "executor-completed", updatedAt: services.clock.now(), references: [], observations: [] });
  if (action.operation === "attachment.fetch") {
    await resolvedReference(action.arguments.attachment, services);
    if (!options.stageAttachment) return { ...base(), status: "blocked", error: {
      code: "UNAVAILABLE", message: "Host must bind guarded attachment staging.", retry: "never" } };
    const media = await options.stageAttachment(action.arguments.attachment, services);
    services.assertActiveClaim(); services.signal.throwIfAborted();
    services.transaction(unit => retainResource(unit, media, services.context));
    return { ...base(), references: [action.arguments.attachment], value: { type: "media", media } };
  }
  await resolvedReference(action.arguments.space, services);
  if (action.arguments.space.id !== services.context.scope.spaceId) throw new Error("SCOPE_MISMATCH");
  const mapping = mappedMediaReference(action.arguments.space, services);
  const binding = await options.provider(services.context); services.assertActiveClaim();
  const space = await binding.space(action.arguments.space); services.assertActiveClaim();
  if (!sameScope(binding.scope, services.context.scope) || !binding.phone || space.__platform !== "imessage" ||
    space.id !== mapping.providerId || space.id !== binding.conversationId || imessage(space).phone !== binding.phone) throw new Error("SCOPE_MISMATCH");
  const builder = await mediaOperationContent(action, services, options.voiceBehavior);
  // Build before dispatch: malformed contact/audio input is a pre-dispatch error, not an ambiguous send.
  const built = await builder.build(); services.assertActiveClaim(); services.signal.throwIfAborted();
  return services.executeChild({ index: 0, key: `wt04:${digest}`, argumentsDigest: digest, async dispatch(signal) {
    services.assertActiveClaim(); services.signal.throwIfAborted(); signal.throwIfAborted();
    if (mappedMediaReference(action.arguments.space, services).providerId !== space.id) throw new Error("SCOPE_MISMATCH");
    const unknown = (): OperationResult => ({ ...base(), status: "unknown-outcome", error: {
      code: "UNKNOWN_OUTCOME", message: "Media send requires reconciliation before retry.", retry: "reconcile-first" },
      observations: [{ kind: "unknown", source: "sdk-return", at: services.clock.now() }] });
    try {
      const message = await space.send({ build: async () => built });
      if (!message || typeof message.id !== "string" || !message.id || message.id.length > 500 || message.platform !== "imessage" || message.space.id !== space.id ||
        message.space.__platform !== "imessage" || imessage(message.space).phone !== binding.phone) return unknown();
      const reference = { version: 1 as const, kind: "message" as const, id: `message:${randomUUID()}`, scope: services.context.scope };
      services.transaction(unit => unit.put("references", { id: reference.id, reference, providerId: message.id,
        scope: services.context.scope, revision: 0, ownedByPrincipalId: services.context.principalId,
        taskId: services.context.taskId, generation: services.context.generation }, null));
      return { ...base(), status: "provider-accepted", references: [reference], value: { type: "void" },
        observations: [{ kind: "accepted", source: "sdk-return", at: services.clock.now() }],
        capability: { operation: action.operation, providerSupport: action.operation === "voice.send" && options.voiceBehavior === "audio-attachment" ? "fallback" : "native",
          implementation: "implemented", availability: { account: "unknown", conversation: "unknown", checkedAt: null },
          direction: { inbound: "not-applicable", outbound: "implemented" }, evidence: [], sdkVersion: "12.8.0",
          sources: ["https://photon.codes/docs/spectrum-ts/content/attachments.md", "https://photon.codes/docs/spectrum-ts/content/voice.md", "https://photon.codes/docs/spectrum-ts/content/contacts.md"], blockers: [] } };
    } catch { return unknown(); }
  } });
}
