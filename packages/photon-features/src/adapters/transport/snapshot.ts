import type { Content, Message } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";

/** Only public fields; functions, SDK/client internals and lazy I/O never enter storage. */
export function snapshotMessage(
  message: Message,
  depth = 0,
): Record<string, unknown> {
  if (depth > 8) throw new Error("CONTENT_DEPTH_EXCEEDED");
  const native =
    message.platform === "imessage" ? imessage(message) : undefined;
  return {
    id: message.id,
    platform: message.platform,
    direction: message.direction,
    timestamp: message.timestamp?.toISOString(),
    sender: message.sender ? { id: message.sender.id } : undefined,
    space: {
      id: message.space.id,
      platform: message.platform,
      phone:
        message.platform === "imessage"
          ? imessage(message.space).phone
          : undefined,
    },
    content: snapshotContent(message.content, depth),
    metadata: native
      ? {
          dateEdited: native.dateEdited?.toISOString(),
          dateDelivered: native.dateDelivered?.toISOString(),
          dateRead: native.dateRead?.toISOString(),
          dateRetracted: native.dateRetracted?.toISOString(),
          isDelivered: native.isDelivered,
          sendErrorCode: native.sendErrorCode,
          attachmentMetadata: native.attachmentMetadata,
        }
      : undefined,
  };
}
function snapshotContent(c: Content, depth: number): unknown {
  if (depth > 8) throw new Error("CONTENT_DEPTH_EXCEEDED");
  switch (c.type) {
    case "reaction":
      return { type: c.type, emoji: c.emoji, target: { id: c.target.id } };
    case "read":
    case "unsend":
      return { type: c.type, target: { id: c.target.id } };
    case "edit":
    case "reply":
      return {
        type: c.type,
        target: { id: c.target.id },
        content: snapshotContent(c.content, depth + 1),
      };
    case "group":
      return {
        type: c.type,
        items: c.items.map((m) => snapshotMessage(m, depth + 1)),
      };
    case "attachment":
      return {
        type: c.type,
        id: c.id,
        name: c.name,
        mimeType: c.mimeType,
        size: c.size,
      };
    case "voice":
      return {
        type: c.type,
        name: c.name,
        mimeType: c.mimeType,
        size: c.size,
        duration: c.duration,
      };
    case "app":
      return { type: c.type, live: c.live, lazyUrl: true, lazyLayout: true };
    case "streamText":
      return { type: c.type, singleConsumptionStream: true };
    case "effect":
      return {
        type: c.type,
        effect: c.effect,
        content: snapshotContent(c.content, depth + 1),
      };
    // Content records are schema validated SDK values. Custom data stays in private capture only.
    default:
      return JSON.parse(
        JSON.stringify(c, (_key, value: unknown) =>
          typeof value === "function"
            ? undefined
            : typeof value === "bigint"
              ? String(value)
              : value,
        ),
      );
  }
}
