import { randomUUID } from "node:crypto";
import { imessage } from "spectrum-ts/providers/imessage";
import {
  assertClaim, assertScope, parseAction, sameScope, type Action, type Capability,
  type ContentSpec, type ExecutionServices, type FeatureModule, type OperationResult,
  type OutboxRecord, type RuntimeError,
} from "../../index.js";
import { compileAttachment, sendAttachment, fetchAttachment } from "./attachments.js";
import { compileContact, sendContact } from "./contacts.js";
import { mediaCheckpointSchema } from "./metadata.js";
import { mappedResource, type MediaBindings } from "./sdk.js";
import { SafeMediaStager } from "./staging.js";
import { compileVoice, sendVoiceNote, type VoiceBehavior } from "./voice.js";
import { MediaError } from "./safety.js";

const operations = ["attachment.send", "attachment.fetch", "voice.send", "contact.send"] as const;
function ownedRequest(action: Action, services: ExecutionServices): OutboxRecord {
  const candidates = services.transactions.transaction(tx => tx.list("outbox", services.context.scope, 1000));
  if (candidates.length === 1000) throw new Error("UNAVAILABLE");
  const records = candidates.filter(r => r.action.idempotencyKey === action.idempotencyKey && r.action.contextId === action.contextId);
  const record = records.length === 1 ? records[0] : undefined;
  if (!record || JSON.stringify(record.action) !== JSON.stringify(action)) throw new Error("INVALID_REQUEST");
  verify(record, action, services);
  return record;
}
function verify(record: OutboxRecord, action: Action, services: ExecutionServices): void {
  const context = services.context, now = services.clock.now();
  services.signal.throwIfAborted();
  if (context.revokedAt !== null) throw new Error("CONTEXT_REVOKED");
  if (context.expiresAt <= now) throw new Error("CONTEXT_EXPIRED");
  if (context.contextId !== action.contextId || !context.permissions.includes(action.operation) ||
    !sameScope(record.scope, context.scope) || record.principalId !== context.principalId || record.taskId !== context.taskId) throw new Error("FORBIDDEN");
  if (!record.claim || record.result.status !== "queued") throw new Error("STALE_FENCE");
  assertClaim(services.claim, { owner: record.claim.owner, fence: record.claim.fence, generation: record.generation,
    cancelled: record.cancellationRequestedAt !== null }, now);
  if (record.generation !== context.generation || record.claim.leaseUntil <= now) throw new Error("STALE_GENERATION");
}
function capability(operation: string, voiceBehavior: VoiceBehavior): Capability {
  return { operation, providerSupport: operation === "voice.send" && voiceBehavior === "audio-attachment" ? "fallback" : "native",
    implementation: "implemented", availability: { account: "unknown", conversation: "unknown", checkedAt: null },
    direction: { inbound: "not-applicable", outbound: operation === "attachment.fetch" ? "not-applicable" : "implemented" },
    evidence: [], sdkVersion: "12.8.0", sources: ["https://photon.codes/docs/spectrum-ts/content/attachments", "https://photon.codes/docs/spectrum-ts/content/voice", "https://photon.codes/docs/spectrum-ts/content/contacts"], blockers: [] };
}
export function createMediaModule(options: { bindings: MediaBindings; voiceBehavior?: VoiceBehavior }): FeatureModule {
  const behavior = options.voiceBehavior ?? "native";
  const compile = async (content: ContentSpec, services: ExecutionServices) => {
    if (content.type === "attachment") return compileAttachment(content.media, services);
    if (content.type === "voice") return compileVoice(content.media, services, behavior);
    if (content.type === "contact") return compileContact(content.contact);
    throw new Error("INVALID_REQUEST");
  };
  return {
    id: "wt04.media", lane: "wt-04", mode: "production",
    handlers: operations.map(operation => ({ operation, recoveryCodec: { id: "wt04.media-dispatch", version: 1 },
      async execute(input, services): Promise<OperationResult> {
        const action = parseAction(input);
        if (action.operation !== operation) throw new Error("INVALID_REQUEST");
        // F0 provides no requestId in ExecutionServices. Resolve the authoritative outbox row, never invent one.
        const record = ownedRequest(action, services);
        const result: OperationResult = { version: 1, requestId: record.id, status: "executor-completed",
          revision: record.result.revision + 1, updatedAt: services.clock.now(), references: [], observations: [],
          capability: capability(operation, behavior) };
        let dispatched = false;
        try {
          if (action.operation === "attachment.fetch") {
            if (!(services.media instanceof SafeMediaStager)) throw new Error("UNAVAILABLE");
            const media = await services.media.stageNative(action.arguments.attachment, services.context, services.claim, services.signal);
            return { ...result, updatedAt: services.clock.now(), value: { type: "media", media }, references: [action.arguments.attachment] };
          }
          if (action.operation !== "attachment.send" && action.operation !== "voice.send" && action.operation !== "contact.send") throw new Error("INVALID_REQUEST");
          const args = action.arguments;
          assertScope(args.space, services.context.scope);
          const resolved = await services.resources.resolve(args.space, services.context);
          assertScope(resolved, services.context.scope);
          if (resolved.kind !== "space" || resolved.id !== args.space.id || resolved.id !== services.context.scope.spaceId) throw new Error("SCOPE_MISMATCH");
          const mapping = mappedResource(args.space, services.context, services.transactions);
          const space = await services.resources.space(args.space, services.context);
          const binding = await options.bindings(services.context);
          if (!sameScope(binding.scope, services.context.scope) || space.__platform !== "imessage" || space.id !== mapping.providerId || space.id !== binding.conversationId ||
            !binding.phone || imessage(space).phone !== binding.phone) throw new Error("SCOPE_MISMATCH");
          const content = action.operation === "contact.send" ? { type: "contact" as const, contact: action.arguments.contact }
            : { type: action.operation === "voice.send" ? "voice" as const : "attachment" as const, media: action.arguments.media };
          const built = await compile(content, services);
          ownedRequest(action, services); // Recheck lease/cancellation after asynchronous staging.
          dispatched = true;
          const message = await space.send(built);
          result.updatedAt = services.clock.now();
          if (!message) return { ...result, status: "unknown-outcome", error: { code: "UNKNOWN_OUTCOME", message: "SDK returned no message; reconcile before retry.", retry: "reconcile-first" }, observations: [{ kind: "unknown", source: "sdk-return", at: result.updatedAt }] };
          if (message.platform !== "imessage" || message.space.id !== space.id) throw new Error("SCOPE_MISMATCH");
          const reference = { version: 1 as const, kind: "message" as const, id: `message:${randomUUID()}`, scope: services.context.scope };
          services.transactions.transaction(tx => tx.put("references", { id: reference.id, reference, providerId: message.id,
            scope: services.context.scope, revision: 0, ownedByPrincipalId: services.context.principalId,
            taskId: services.context.taskId, generation: services.context.generation }, null));
          result.references = [reference];
          result.observations = [{ kind: "accepted", source: "sdk-return", at: result.updatedAt }];
          result.status = "provider-accepted";
          result.value = { type: "void" };
          return result;
        } catch (error) {
          const recognized = ["FORBIDDEN", "CONTEXT_EXPIRED", "CONTEXT_REVOKED", "STALE_FENCE", "STALE_GENERATION", "CANCELLED", "SCOPE_MISMATCH", "UNAVAILABLE"] as const;
          const reason = error instanceof Error ? error.message : "";
          const code: RuntimeError["code"] = dispatched ? "UNKNOWN_OUTCOME" : error instanceof MediaError ? "MEDIA_REJECTED"
            : recognized.find(value => value === reason) ?? "PROVIDER_FAILURE";
          return { ...result, updatedAt: services.clock.now(), status: dispatched ? "unknown-outcome" : "failed",
            error: { code, message: dispatched ? "Media send outcome requires reconciliation." : "Media operation failed before dispatch.", retry: dispatched ? "reconcile-first" : code === "MEDIA_REJECTED" ? "never" : "safe-before-dispatch" } };
        }
      },
    })),
    compilers: ["attachment", "voice", "contact"].map(family => ({ family: family as ContentSpec["type"], compile })),
    // WT-02 owns the message reducer. Its adapter calls nativeMediaSource/normalizeContact through the handoff API.
    reducers: [], capabilities: operations.map(op => capability(op, behavior)),
    recoveryCodecs: [
      { id: "wt04.media-dispatch", version: 1, validate: value => value === null, reconcile: async () => "unknown" },
      { id: "wt04.media-metadata", version: 1, validate: value => mediaCheckpointSchema.safeParse(value).success, reconcile: async () => "unknown" },
    ],
  };
}

import type { FeatureModule as PublicFeatureModule } from "../../contracts/feature.js";
import type { MediaOperation, MediaOperationOptions } from "./sdk.js";
/** Register this F0 module explicitly in integration; legacy createMediaModule remains compatibility-only. */
export function createFeatureModule(options: MediaOperationOptions): PublicFeatureModule<MediaOperation> {
  return { id: "wt04.media", owner: "wt-04", handlers: {
    "attachment.send": (action, services) => sendAttachment(action, services, options),
    "attachment.fetch": (action, services) => fetchAttachment(action, services, options),
    "voice.send": (action, services) => sendVoiceNote(action, services, options),
    "contact.send": (action, services) => sendContact(action, services, options),
  } };
}
