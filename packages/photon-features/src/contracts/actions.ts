import { z } from "zod";
import {
  idSchema,
  spaceRefSchema,
  messageRefSchema,
  reactionRefSchema,
  attachmentRefSchema,
  pollRefSchema,
  optionRefSchema,
  cardRefSchema,
  sessionRefSchema,
  streamRefSchema,
} from "./resources.js";
import {
  assertJsonData,
  proseSchema,
  httpsSchema,
  mediaSchema,
  contactSchema,
  cardLayoutSchema,
  pollChoiceSchema,
  contentSchema,
  groupContentSchema,
  leafContentSchema,
} from "./content.js";
const obj = z.strictObject;
const space = { space: spaceRefSchema };
const message = { message: messageRefSchema };
const poll = { poll: pollRefSchema };
const members = z.array(z.string().min(1).max(254)).min(1).max(32);
export const operationArguments = {
  "typing.begin": obj({
    ...space,
    ttlMs: z.number().int().min(100).max(30000),
  }),
  "typing.end": obj({ ...space }),
  "text.send": obj({ ...space, text: proseSchema }),
  "text.stream": obj({ ...space, stream: streamRefSchema }),
  "markdown.send": obj({ ...space, text: proseSchema }),
  "link.send": obj({
    ...space,
    url: httpsSchema,
    title: z.string().max(300).optional(),
  }),
  "content.group": obj({ ...space, content: groupContentSchema }),
  "content.compose": obj({
    ...space,
    content: obj({
      type: z.literal("compose"),
      items: z
        .array(z.union([leafContentSchema, groupContentSchema]))
        .min(1)
        .max(16),
    }),
  }),
  "message.get": obj(message),
  "message.reply": obj({ ...message, content: leafContentSchema }),
  "message.react": obj({
    ...message,
    reaction: z.enum([
      "love",
      "like",
      "dislike",
      "laugh",
      "emphasize",
      "question",
    ]),
  }),
  "reaction.remove": obj({ reaction: reactionRefSchema }),
  "message.edit": obj({ ...message, text: proseSchema }),
  "message.unsend": obj(message),
  "message.markRead": obj(message),
  "attachment.send": obj({ ...space, media: mediaSchema }),
  "attachment.fetch": obj({ attachment: attachmentRefSchema }),
  "voice.send": obj({ ...space, media: mediaSchema }),
  "contact.send": obj({ ...space, contact: contactSchema }),
  "poll.create": obj({
    ...space,
    question: z.string().min(1).max(500),
    options: z.array(pollChoiceSchema).min(2).max(12),
  }),
  "poll.get": obj(poll),
  "poll.vote": obj({ ...poll, option: optionRefSchema }),
  "poll.unvote": obj({ ...poll, option: optionRefSchema }),
  "poll.addOption": obj({ ...poll, option: pollChoiceSchema }),
  "app.send": obj({ ...space, templateId: idSchema, url: httpsSchema }),
  "app.sendCustomized": obj({
    ...space,
    templateId: idSchema,
    url: httpsSchema,
    layout: cardLayoutSchema,
  }),
  "app.update": obj({
    card: cardRefSchema,
    session: sessionRefSchema,
    layout: cardLayoutSchema,
  }),
  "space.get": obj(space),
  "space.create": obj({ members, name: z.string().min(1).max(200).optional() }),
  "space.getName": obj(space),
  "space.rename": obj({ ...space, name: z.string().min(1).max(200) }),
  "space.getMembers": obj(space),
  "space.addMembers": obj({ ...space, members }),
  "space.removeMembers": obj({ ...space, members }),
  "space.leave": obj(space),
  "space.getAvatar": obj(space),
  "space.setAvatar": obj({ ...space, media: mediaSchema }),
  "space.clearAvatar": obj(space),
  "space.setBackground": obj({ ...space, media: mediaSchema }),
  "space.clearBackground": obj(space),
  "account.shareContact": obj(space),
  "effect.send": obj({
    ...space,
    content: obj({
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
  }),
  "metadata.get": obj({ ...message }),
  "custom.send": obj({ ...space, codecId: idSchema, resource: cardRefSchema }),
} as const;
export type Operation = keyof typeof operationArguments;
export const operations = Object.keys(operationArguments) as Operation[];
export type ActionFor<K extends Operation> = {
  version: 1;
  idempotencyKey: string;
  contextId: string;
  operation: K;
  arguments: z.infer<(typeof operationArguments)[K]>;
};
export type Action = { [K in Operation]: ActionFor<K> }[Operation];
export const actionSchemas = Object.fromEntries(
  operations.map((operation) => [
    operation,
    obj({
      version: z.literal(1),
      idempotencyKey: idSchema,
      contextId: idSchema,
      operation: z.literal(operation),
      arguments: operationArguments[operation],
    }),
  ]),
) as unknown as Record<Operation, z.ZodType<Action>>;
export const actionSchema = z.union(Object.values(actionSchemas));
/** Protocol byte limit applies before parsing, independent of string/codepoint bounds. */
export const MAX_REQUEST_BYTES = 262144;
export function parseAction(input: unknown): Action {
  const result = actionSchema.parse(input) as Action;
  const args = result.arguments;
  if (
    "poll" in args &&
    "option" in args &&
    "pollId" in args.option &&
    args.option.pollId !== args.poll.id
  )
    throw new Error("POLL_OPTION_MISMATCH");
  if (
    "card" in args &&
    "session" in args &&
    args.session.cardId !== args.card.id
  )
    throw new Error("CARD_SESSION_MISMATCH");
  if (
    "options" in args &&
    new Set(args.options.map((o) => o.key)).size !== args.options.length
  )
    throw new Error("DUPLICATE_OPTION");
  // Every nested resource is structurally scoped by WT-01 to the authenticated context.
  return result;
}

/** Public request name; the wire format remains compatible with existing version 1 callers. */
export type ActionRequest = Action;
/** Structural validation only. An authenticated resolver must still authorize this request. */
export function parseActionRequest(input: unknown): ActionRequest {
  assertJsonData(input, MAX_REQUEST_BYTES);
  return parseAction(input);
}
