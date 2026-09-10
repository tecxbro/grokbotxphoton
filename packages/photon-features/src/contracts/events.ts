import { z } from "zod";
import {
  idSchema,
  scopeSchema,
  resourceRefSchema,
  messageRefSchema,
  pollRefSchema,
  optionRefSchema,
  sessionRefSchema,
} from "./resources.js";
import { contentSchema } from "./content.js";
const base = {
  version: z.literal(1),
  eventId: idSchema,
  providerEventId: idSchema.optional(),
  direction: z.enum(["inbound", "outbound", "system"]),
  scope: scopeSchema,
  occurredAt: z.number().int().nonnegative().nullable(),
  receivedAt: z.number().int().nonnegative(),
  ordering: z.strictObject({
    source: idSchema,
    sequence: z.string().max(100).optional(),
    revision: z.string().max(100).optional(),
  }),
  targets: z.array(resourceRefSchema).max(128),
};
export const incomingEventSchema = z.discriminatedUnion("type", [
  z.strictObject({
    ...base,
    type: z.literal("message"),
    senderId: idSchema,
    message: messageRefSchema,
    content: contentSchema,
    change: z.enum(["created", "edited", "unsent"]),
  }),
  z.strictObject({
    ...base,
    type: z.literal("receipt"),
    message: messageRefSchema,
    receipt: z.enum(["accepted", "delivered", "read", "failed"]),
    recipientId: idSchema.optional(),
  }),
  z.strictObject({
    ...base,
    type: z.literal("reaction"),
    message: messageRefSchema,
    actorId: idSchema,
    reaction: z.string().min(1).max(64),
    change: z.enum(["added", "removed"]),
  }),
  z.strictObject({
    ...base,
    type: z.literal("poll"),
    poll: pollRefSchema,
    option: optionRefSchema,
    actorId: idSchema,
    change: z.enum(["vote", "unvote", "option-added"]),
  }),
  z.strictObject({
    ...base,
    type: z.literal("group"),
    change: z.enum([
      "created",
      "renamed",
      "members-added",
      "members-removed",
      "left",
      "avatar-changed",
      "background-changed",
    ]),
    members: z.array(idSchema).max(1000).optional(),
    name: z.string().max(200).optional(),
  }),
  z.strictObject({
    ...base,
    type: z.literal("app-interaction"),
    interactionId: idSchema,
    session: sessionRefSchema,
    actionId: idSchema,
    selection: z.array(idSchema).max(32),
  }),
  z.strictObject({
    ...base,
    type: z.literal("typing"),
    actorId: idSchema,
    active: z.boolean(),
  }),
  z.strictObject({
    ...base,
    type: z.literal("unresolved"),
    reason: z.enum([
      "unknown-target",
      "unknown-event-type",
      "missing-scope",
      "unsupported-payload",
    ]),
    quarantineId: idSchema,
  }),
]);
export type IncomingEvent = z.infer<typeof incomingEventSchema>;

/** Typed provider input; unresolved correlation is durable work, never a guessed target. */
export type InboundEvent = IncomingEvent;
export type UnresolvedEvent = Extract<InboundEvent, {type: "unresolved"}>;
