import { z } from "zod";
import { contentSchema, stagedMediaSchema } from "./content.js";
import { idSchema, resourceRefSchema, optionRefSchema } from "./resources.js";
export const lifecycleSchema = z.enum([
  "queued",
  "executor-completed",
  "provider-accepted",
  "observed-delivered",
  "observed-read",
  "blocked",
  "failed",
  "cancelled",
  "unknown-outcome",
]);
export type Lifecycle = z.infer<typeof lifecycleSchema>;
export const errorSchema = z.strictObject({
  code: z.enum([
    "INVALID_REQUEST",
    "UNAUTHENTICATED",
    "FORBIDDEN",
    "CONTEXT_EXPIRED",
    "CONTEXT_REVOKED",
    "SCOPE_MISMATCH",
    "STALE_GENERATION",
    "STALE_FENCE",
    "IDEMPOTENCY_CONFLICT",
    "UNIMPLEMENTED",
    "UNSUPPORTED",
    "UNAVAILABLE",
    "RATE_LIMITED",
    "RESOURCE_NOT_FOUND",
    "MEDIA_REJECTED",
    "CANCELLED",
    "PROVIDER_FAILURE",
    "UNKNOWN_OUTCOME",
    "INTERNAL",
  ]),
  message: z.string().max(500),
  retry: z.enum(["never", "safe-before-dispatch", "reconcile-first"]),
  blockerId: idSchema.optional(),
});
export const capabilitySchema = z.strictObject({
  operation: idSchema,
  providerSupport: z.enum(["native", "fallback", "unsupported", "unknown"]),
  availability: z.strictObject({
    account: z.enum(["available", "unavailable", "unknown"]),
    conversation: z.enum(["available", "unavailable", "unknown"]),
    checkedAt: z.number().int().nonnegative().nullable(),
  }),
  implementation: z.enum(["unimplemented", "partial", "implemented"]),
  direction: z.strictObject({
    inbound: z.enum([
      "implemented",
      "unimplemented",
      "not-applicable",
      "unknown",
    ]),
    outbound: z.enum([
      "implemented",
      "unimplemented",
      "not-applicable",
      "unknown",
    ]),
  }),
  evidence: z
    .array(
      z.strictObject({
        tier: z.enum(["unit", "sdk-contract", "live"]),
        reference: z.string().max(1000),
        observedAt: z.number().int().nonnegative(),
        sdkVersion: z.string().max(50),
      }),
    )
    .max(100),
  sdkVersion: z.string().max(50),
  sources: z.array(z.string().max(1000)).max(100),
  blockers: z.array(z.string().max(500)).max(30),
});
export type Capability = z.infer<typeof capabilitySchema>;
export const observationSchema = z.strictObject({
  kind: z.enum(["accepted", "delivered", "read", "rejected", "unknown"]),
  source: z.enum(["sdk-return", "receipt-event", "reconciliation"]),
  at: z.number().int().nonnegative(),
  eventId: idSchema.optional(),
  providerCode: z.string().max(100).optional(),
});
export const resultSchema = z.strictObject({
  version: z.literal(1),
  requestId: idSchema,
  status: lifecycleSchema,
  revision: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  references: z.array(resourceRefSchema).max(128),
  value: z
    .discriminatedUnion("type", [
      z.strictObject({ type: z.literal("void") }),
      z.strictObject({
        type: z.literal("message"),
        content: contentSchema,
        senderId: idSchema.nullable(),
        direction: z.enum(["inbound", "outbound"]),
      }),
      z.strictObject({
        type: z.literal("poll"),
        question: z.string().max(500),
        options: z
          .array(
            z.strictObject({
              reference: optionRefSchema,
              label: z.string().max(200),
              votes: z.number().int().nonnegative().nullable(),
            }),
          )
          .max(100),
      }),
      z.strictObject({
        type: z.literal("media"),
        media: stagedMediaSchema.nullable(),
      }),
      z.strictObject({
        type: z.literal("name"),
        name: z.string().max(200).nullable(),
      }),
      z.strictObject({
        type: z.literal("members"),
        members: z.array(idSchema).max(1000),
      }),
      z.strictObject({
        type: z.literal("metadata"),
        sentAt: z.number().int().nonnegative().nullable(),
        editedAt: z.number().int().nonnegative().nullable(),
        isFromMe: z.boolean(),
      }),
    ])
    .optional(),
  error: errorSchema.optional(),
  capability: capabilitySchema.optional(),
  observations: z.array(observationSchema).max(100),
});
export type OperationResult = z.infer<typeof resultSchema>;
export type RuntimeError = z.infer<typeof errorSchema>;

/** An error's retry classification does not authorize retry after an ambiguous dispatch. */
export type OperationError = RuntimeError;
