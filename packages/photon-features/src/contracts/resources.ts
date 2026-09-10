import { z } from "zod";
export const idSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_:+.@/-]+$/);
export const scopeSchema = z.strictObject({
  projectId: idSchema,
  provider: z.literal("imessage"),
  accountId: idSchema,
  lineId: idSchema,
  spaceId: idSchema,
});
export type Scope = z.infer<typeof scopeSchema>;
const base = { version: z.literal(1), id: idSchema, scope: scopeSchema };
export const spaceRefSchema = z.strictObject({
  ...base,
  kind: z.literal("space"),
});
export const messageRefSchema = z.strictObject({
  ...base,
  kind: z.literal("message"),
});
export const attachmentRefSchema = z.strictObject({
  ...base,
  kind: z.literal("attachment"),
  messageId: idSchema,
});
export const reactionRefSchema = z.strictObject({
  ...base,
  kind: z.literal("reaction"),
  messageId: idSchema,
});
export const pollRefSchema = z.strictObject({
  ...base,
  kind: z.literal("poll"),
  messageId: idSchema,
});
export const optionRefSchema = z.strictObject({
  ...base,
  kind: z.literal("poll-option"),
  pollId: idSchema,
});
export const cardRefSchema = z.strictObject({
  ...base,
  kind: z.literal("card"),
  messageId: idSchema,
});
export const sessionRefSchema = z.strictObject({
  ...base,
  kind: z.literal("card-session"),
  cardId: idSchema,
});
export const streamRefSchema = z.strictObject({
  ...base,
  kind: z.literal("stream"),
  generation: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
});
export const resourceRefSchema = z.discriminatedUnion("kind", [
  spaceRefSchema,
  messageRefSchema,
  attachmentRefSchema,
  reactionRefSchema,
  pollRefSchema,
  optionRefSchema,
  cardRefSchema,
  sessionRefSchema,
  streamRefSchema,
]);
export type ResourceRef = z.infer<typeof resourceRefSchema>;
export function sameScope(a: Scope, b: Scope): boolean {
  return (
    ["projectId", "provider", "accountId", "lineId", "spaceId"] as const
  ).every((k) => a[k] === b[k]);
}
/** Structural comparison only. WT-01 must resolve authoritative records before use. */
export function assertScope(ref: ResourceRef, scope: Scope): void {
  if (!sameScope(ref.scope, scope)) throw new Error("SCOPE_MISMATCH");
}
