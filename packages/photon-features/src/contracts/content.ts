import { z } from "zod";
import {
  attachmentRefSchema,
  cardRefSchema,
  idSchema,
  messageRefSchema,
} from "./resources.js";
export const proseSchema = z.string().min(1).max(16000);
export const httpsSchema = z
  .string()
  .max(2048)
  .url()
  .regex(/^https:\/\//);
// Media is always a host-owned staged resource. A caller cannot supply a path or fetch URL.
export const stagedMediaSchema = z.strictObject({
  stagingId: idSchema,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mimeType: z
    .string()
    .max(100)
    .regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/),
  bytes: z
    .number()
    .int()
    .positive()
    .max(25 * 1024 * 1024),
});
export const mediaSchema = z.union([stagedMediaSchema, attachmentRefSchema]);
export const contactSchema = z.strictObject({
  name: z.string().min(1).max(200),
  phones: z.array(z.string().regex(/^\+[1-9]\d{6,14}$/)).max(10),
  emails: z.array(z.string().email().max(254)).max(10),
});
export const pollChoiceSchema = z.strictObject({
  key: idSchema,
  label: z.string().min(1).max(200),
});
export const cardLayoutSchema = z.strictObject({
  caption: z.string().max(300),
  subcaption: z.string().max(300).optional(),
  image: mediaSchema.optional(),
});
export const leafContentSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("text"), text: proseSchema }),
  z.strictObject({ type: z.literal("markdown"), text: proseSchema }),
  z.strictObject({
    type: z.literal("link"),
    url: httpsSchema,
    title: z.string().max(300).optional(),
  }),
  z.strictObject({ type: z.literal("attachment"), media: mediaSchema }),
  z.strictObject({ type: z.literal("voice"), media: mediaSchema }),
  z.strictObject({ type: z.literal("contact"), contact: contactSchema }),
  z.strictObject({
    type: z.literal("poll"),
    question: z.string().min(1).max(500),
    options: z.array(pollChoiceSchema).min(2).max(12),
  }),
  z.strictObject({
    type: z.literal("app"),
    templateId: idSchema,
    url: httpsSchema,
    layout: cardLayoutSchema.optional(),
  }),
  z.strictObject({
    type: z.literal("registered-custom"),
    codecId: idSchema,
    resource: cardRefSchema,
  }),
]);
// Finite composition: at most 16 groups of 8 leaves. Wrappers cannot wrap wrappers.
export const groupContentSchema = z.strictObject({
  type: z.literal("group"),
  items: z.array(leafContentSchema).min(1).max(8),
});
export const contentSchema = z.union([
  leafContentSchema,
  groupContentSchema,
  z.strictObject({
    type: z.literal("compose"),
    items: z
      .array(z.union([leafContentSchema, groupContentSchema]))
      .min(1)
      .max(16),
  }),
  z.strictObject({
    type: z.literal("reply"),
    message: messageRefSchema,
    content: leafContentSchema,
  }),
  z.strictObject({
    type: z.literal("effect"),
    effect: z.enum([
      "slam",
      "loud",
      "gentle",
      "invisible-ink",
      "confetti",
      "balloons",
      "fireworks",
      "lasers",
      "celebration",
      "echo",
      "spotlight",
      "love",
      "shooting-star",
    ]),
    content: leafContentSchema,
  }),
]);
export type ContentSpec = z.infer<typeof contentSchema>;
export const voicePolicy = Object.freeze({
  version: 1,
  targetBubbleCharacters: 120,
  preferredMaximumCharacters: 150,
  blankLines: "complete thoughts",
  casing: "natural lowercase; preserve names/acronyms/code",
  splitting: "never arbitrarily split sentences, URLs, paths, commands or code",
  questionsPerTurn: 1,
  emDashes: false,
  tone: "friend-like, not customer support",
  structuredPayloads: "bypass prose formatting",
  formatterOwner: "wt-03",
  orchestratorGuidanceOwner: "wt-08",
});

/** Validate inert JSON before Zod touches values; accessors and SDK instances are not data. */
export function assertJsonData(value: unknown, maxBytes = 262144): void {
  const ancestors = new Set<object>();
  let bytes = 0;
  function visit(v: unknown, depth: number): void {
    if (depth > 16) throw new Error("CONTENT_TOO_DEEP");
    if (v === null || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) { bytes += 24; }
    else if (typeof v === "string") { bytes += Buffer.byteLength(JSON.stringify(v)); }
    else if (typeof v === "object") {
      const proto = Object.getPrototypeOf(v);
      if (!Array.isArray(v) && proto !== Object.prototype && proto !== null) throw new Error("NON_JSON_OBJECT");
      if (ancestors.has(v!)) throw new Error("CYCLIC_JSON");
      ancestors.add(v!);
      for (const key of Reflect.ownKeys(v!)) {
        if (Array.isArray(v) && key === "length") continue;
        if (Array.isArray(v) && (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key))) throw new Error("NON_JSON_ARRAY_PROPERTY");
        if (typeof key !== "string" || ["__proto__", "constructor", "prototype"].includes(key)) throw new Error("NON_JSON_KEY");
        const descriptor = Object.getOwnPropertyDescriptor(v, key)!;
        if (!descriptor.enumerable || !("value" in descriptor)) throw new Error("NON_JSON_PROPERTY");
        bytes += Buffer.byteLength(key) + 4;
        visit(descriptor.value, depth + 1);
      }
      ancestors.delete(v!);
    } else throw new Error("NON_JSON_VALUE");
    if (bytes > maxBytes) throw new Error("REQUEST_TOO_LARGE");
  }
  visit(value, 0);
}
/** Parse a bounded inert content tree; no SDK callbacks, paths or executable objects. */
export function parseContentSpec(input: unknown): ContentSpec {
  assertJsonData(input);
  return contentSchema.parse(input);
}
