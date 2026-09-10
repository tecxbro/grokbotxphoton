import { z } from "zod";
import {
  incomingEventSchema,
  contentSchema,
  idSchema,
  sameScope,
  type IncomingEvent,
  type Scope,
  type ResourceRef,
  type ContentSpec,
} from "../../contracts/index.js";
import {
  opaqueId,
  isIMessagePlatform,
  scopeKey,
  type ProviderContext,
} from "../../adapters/transport/provider-context.js";

export const slimMessage = z.looseObject({
  id: z.string().min(1),
  platform: z.string().optional(),
  direction: z.string().optional(),
  timestamp: z.string().optional(),
  sender: z.looseObject({ id: z.string() }).optional(),
  space: z.looseObject({
    id: z.string().min(1),
    platform: z.string().optional(),
    phone: z.string().optional(),
  }),
  content: z.looseObject({ type: z.string() }),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CapturedMessage = z.infer<typeof slimMessage>;
export interface Correlations {
  /** WT-05 must supply native identity from its authoritative resource map.
   * Public PollChoice contains only a title; never correlate by title or parse SDK synthetic IDs. */
  poll?(
    message: CapturedMessage,
    scope: Scope,
  ):
    | {
        poll: Extract<ResourceRef, { kind: "poll" }>;
        option: Extract<ResourceRef, { kind: "poll-option" }>;
      }
    | undefined;
}
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const string = (value: unknown): string => {
  if (typeof value !== "string" || !value)
    throw new Error("UNSUPPORTED_PAYLOAD");
  return value;
};
const at = (value: unknown): number | null => {
  if (typeof value !== "string") return null;
  const n = Date.parse(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
};
export function messageRef(
  scope: Scope,
  id: string,
): Extract<ResourceRef, { kind: "message" }> {
  return {
    version: 1,
    kind: "message",
    scope,
    id: opaqueId("message", scopeKey(scope), id),
  };
}
function content(
  raw: Record<string, unknown>,
  scope: Scope,
  messageId: string,
  depth = 0,
): ContentSpec {
  if (depth > 3) throw new Error("UNSUPPORTED_PAYLOAD");
  const inner = () => content(object(raw.content), scope, messageId, depth + 1);
  const ref = () => messageRef(scope, string(object(raw.target).id));
  let value: unknown;
  switch (raw.type) {
    case "text":
      value = { type: "text", text: raw.text };
      break;
    case "markdown":
      value = { type: "markdown", text: raw.markdown };
      break;
    case "richlink":
      value = { type: "link", url: raw.url };
      break;
    case "attachment":
    case "voice":
      value = {
        type: raw.type,
        media: {
          version: 1,
          kind: "attachment",
          scope,
          id: opaqueId(
            "attachment",
            scopeKey(scope),
            messageId,
            raw.type === "attachment" ? string(raw.id) : "voice",
          ),
          messageId,
        },
      };
      break;
    case "poll":
      value = {
        type: "poll",
        question: raw.title,
        options: Array.isArray(raw.options)
          ? raw.options.map((o, i) => ({
              key: `option-${i}`,
              label: object(o).title,
            }))
          : [],
      };
      break;
    case "reply":
      value = { type: "reply", message: ref(), content: inner() };
      break;
    case "effect":
      value = { type: "effect", effect: raw.effect, content: inner() };
      break;
    case "group":
      value = {
        type: "group",
        items: Array.isArray(raw.items)
          ? raw.items.map((i) =>
              content(object(object(i).content), scope, messageId, depth + 1),
            )
          : [],
      };
      break;
    case "contact": {
      const name = object(raw.name);
      // F0 supports a deliberately small contact. Richer records remain fully
      // captured and unresolved rather than losing labels, addresses or photos.
      if (
        Object.keys(raw).some(
          (k) => !["type", "name", "phones", "emails"].includes(k),
        ) ||
        Object.keys(name).some((k) => k !== "formatted")
      )
        throw new Error("UNSUPPORTED_PAYLOAD");
      const values = (list: unknown) => {
        if (list === undefined) return [];
        if (
          !Array.isArray(list) ||
          list.some((v) => Object.keys(object(v)).some((k) => k !== "value"))
        )
          throw new Error("UNSUPPORTED_PAYLOAD");
        return list.map((v) => object(v).value);
      };
      value = {
        type: "contact",
        contact: {
          name: name.formatted,
          phones: values(raw.phones),
          emails: values(raw.emails),
        },
      };
      break;
    }
    // App content needs WT-06's registered template/resource mapping.
    default:
      throw new Error("UNSUPPORTED_PAYLOAD");
  }
  return contentSchema.parse(value);
}
export function normalizeCaptured(
  input: unknown,
  quarantineId: string,
  routes: ProviderContext,
  receivedAt: number,
  correlations: Correlations = {},
): IncomingEvent {
  const m = slimMessage.parse(input);
  if (
    !isIMessagePlatform(m.platform) ||
    (m.space.platform && !isIMessagePlatform(m.space.platform))
  )
    throw new Error("UNBOUND_PROVIDER_ROUTE");
  const scope = routes.inbound(string(m.space.phone), m.space.id);
  const c = m.content,
    target = () => messageRef(scope, string(object(c.target).id));
  const original = messageRef(scope, m.id);
  // Content and supplied provider revision participate: edits/receipts/votes are
  // events in their own right. Arrival and webhook signing times never participate.
  const editedAt = m.metadata?.dateEdited ?? m.dateEdited;
  const revision = typeof editedAt === "string" ? editedAt : undefined;
  const base = {
    version: 1 as const,
    eventId: opaqueId(
      "event",
      scopeKey(scope),
      m.id,
      c,
      m.timestamp,
      m.direction,
      m.sender?.id,
      m.metadata,
    ),
    providerEventId: idSchema.safeParse(m.id).success ? m.id : undefined,
    scope,
    receivedAt,
    occurredAt: at(m.timestamp),
    direction:
      m.direction === "outbound" ? ("outbound" as const) :
      m.direction === "inbound" ? ("inbound" as const) : ("system" as const),
    ordering: {
      source: "spectrum.messages",
      ...(revision ? { revision } : {}),
    },
    targets: [] as ResourceRef[],
  };
  const unresolved = (
    reason: Extract<IncomingEvent, { type: "unresolved" }>["reason"],
  ): IncomingEvent =>
    incomingEventSchema.parse({
      ...base,
      type: "unresolved",
      reason,
      quarantineId,
    });
  if (m.direction !== "inbound" && m.direction !== "outbound")
    return unresolved("unsupported-payload");
  const actor = m.sender?.id ? opaqueId("actor", m.sender.id) : undefined;
  try {
    let event: unknown;
    switch (c.type) {
      case "read":
        event = {
          ...base,
          type: "receipt",
          message: target(),
          targets: [target()],
          receipt: "read",
          recipientId: actor,
        };
        break;
      case "reaction":
        if (!actor || typeof c.emoji !== "string" || !c.emoji)
          return unresolved("unsupported-payload");
        event = {
          ...base,
          type: "reaction",
          message: target(),
          targets: [target()],
          actorId: actor,
          reaction: c.emoji,
          change: "added",
        };
        break;
      case "poll_option": {
        const refs = correlations.poll?.(m, scope);
        if (!refs) return unresolved("unknown-target");
        if (
          !actor ||
          !sameScope(refs.poll.scope, scope) ||
          !sameScope(refs.option.scope, scope) ||
          refs.option.pollId !== refs.poll.id ||
          typeof c.selected !== "boolean"
        )
          return unresolved("unsupported-payload");
        event = {
          ...base,
          type: "poll",
          ...refs,
          targets: [refs.poll, refs.option],
          actorId: actor,
          change: c.selected ? "vote" : "unvote",
        };
        break;
      }
      case "rename":
        event = {
          ...base,
          type: "group",
          change: "renamed",
          name: c.displayName,
        };
        break;
      case "addMember":
      case "removeMember":
        event = {
          ...base,
          type: "group",
          change: c.type === "addMember" ? "members-added" : "members-removed",
          members: Array.isArray(c.members)
            ? c.members.map((id) => opaqueId("actor", string(id)))
            : undefined,
        };
        break;
      case "leaveSpace":
        event = {
          ...base,
          type: "group",
          change: "left",
          members: actor ? [actor] : undefined,
        };
        break;
      case "avatar":
        event = { ...base, type: "group", change: "avatar-changed" };
        break;
      case "typing":
        if (!actor || !["start", "stop"].includes(String(c.state)))
          return unresolved("unsupported-payload");
        event = {
          ...base,
          type: "typing",
          actorId: actor,
          active: c.state === "start",
        };
        break;
      case "unsend":
        return unresolved("unsupported-payload"); // F0 requires content even for unsent; no invented content.
      default: {
        if (!actor) return unresolved("unsupported-payload");
        const edited = c.type === "edit";
        const msg = edited ? target() : original;
        event = {
          ...base,
          type: "message",
          senderId: actor,
          message: msg,
          targets: edited ? [msg] : [],
          content: content(edited ? object(c.content) : c, scope, msg.id),
          change: edited || revision ? "edited" : "created",
        };
      }
    }
    return incomingEventSchema.parse(event);
  } catch {
    return unresolved("unsupported-payload");
  }
}

/** Normalize only authenticated, already captured input; the capture preserves
 * provider fields that the shared event union cannot yet represent. */
export const normalizeInboundEvent = normalizeCaptured;
