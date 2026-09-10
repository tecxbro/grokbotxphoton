import { text } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import {
  contentSchema,
  type Action,
  type ContentCompiler,
  type OperationResult,
} from "../../index.js";
import { Journal } from "./journal.js";
import { targetMessage } from "./targets.js";
import { requireThat } from "./errors.js";
import { tapbacks, checkMessage } from "./sdk.js";
import { oneBubble } from "./voice-policy.js";
export async function executeMessageAction(
  action: Action,
  journal: Journal,
  compiler: ContentCompiler,
): Promise<OperationResult> {
  const s = journal.services,
    options = journal.options;
  if (action.operation === "reaction.remove") {
    const ref = action.arguments.reaction;
    await journal.run(
      0,
      1,
      action.arguments,
      async () => {
        const handle = await targetMessage(ref, s, options, true);
        return () => handle.unsend();
      },
      ref,
    );
    return { ...journal.result(), value: { type: "void" } };
  }
  requireThat(
    "message" in action.arguments,
    "INVALID_REQUEST",
    "Message target required.",
  );
  const ref = action.arguments.message;
  if (action.operation === "message.get") {
    const resolved = await targetMessage(ref, s, options);
    const target = await resolved.space.getMessage(resolved.id);
    requireThat(
      target,
      "RESOURCE_NOT_FOUND",
      "The provider could not retrieve the target message.",
    );
    checkMessage(target, s, options);
    requireThat(
      target.id === resolved.id,
      "SCOPE_MISMATCH",
      "Provider retrieval returned a different target.",
    );
    const spec =
      target.content.type === "text"
        ? { type: "text", text: target.content.text }
        : target.content.type === "markdown"
          ? { type: "markdown", text: target.content.markdown }
          : target.content.type === "richlink"
            ? { type: "link", url: target.content.url }
            : undefined;
    journal.references.push(ref);
    // Non-prose messages still return their actual target and public metadata; never forge a serializable media payload.
    const parsed = contentSchema.safeParse(spec);
    return {
      ...journal.result(),
      value: parsed.success
        ? {
            type: "message",
            content: parsed.data,
            direction: target.direction,
            senderId: target.sender?.id ?? null,
          }
        : {
            type: "metadata",
            sentAt: Number.isFinite(target.timestamp.getTime())
              ? target.timestamp.getTime()
              : null,
            editedAt: imessage(target).dateEdited?.getTime() ?? null,
            isFromMe: target.direction === "outbound",
          },
    };
  }
  const control =
    action.operation === "message.edit" ||
    action.operation === "message.unsend" ||
    action.operation === "message.markRead";
  await journal.run(
    0,
    1,
    action.arguments,
    async () => {
      const target = await targetMessage(
        ref,
        s,
        options,
        action.operation === "message.edit" ||
          action.operation === "message.unsend",
      );
      switch (action.operation) {
        case "message.reply": {
          requireThat(
            action.arguments.content.type !== "poll",
            "UNSUPPORTED",
            "iMessage polls cannot be replied with.",
          );
          const content = await compiler.compile(action.arguments.content, s);
          return () => target.reply(content);
        }
        case "message.react": {
          requireThat(
            [
              "text",
              "markdown",
              "attachment",
              "voice",
              "contact",
              "richlink",
              "app",
            ].includes(target.content.type),
            "UNSUPPORTED",
            "This target does not support tapbacks in this lane.",
          );
          return () => target.react(tapbacks[action.arguments.reaction]);
        }
        case "message.edit": {
          requireThat(
            target.content.type === "text" ||
              target.content.type === "markdown",
            "UNSUPPORTED",
            "Only text messages can be edited here.",
          );
          requireThat(
            !imessage(target).dateRetracted,
            "UNAVAILABLE",
            "Target has already been retracted.",
          );
          const age = s.clock.now() - target.timestamp.getTime();
          requireThat(
            Number.isFinite(age) && age >= 0 && age < 15 * 60 * 1000,
            "UNAVAILABLE",
            "Target is outside the iMessage edit window.",
          );
          const content = text(oneBubble(action.arguments.text));
          // Apple's edit-count and recipient eligibility remain provider-enforced, never inferred from optional metadata.
          return () => target.edit(content);
        }
        case "message.unsend": {
          requireThat(
            [
              "text",
              "markdown",
              "attachment",
              "voice",
              "contact",
              "richlink",
              "app",
            ].includes(target.content.type),
            "UNSUPPORTED",
            "This content cannot be unsent through message.unsend.",
          );
          requireThat(
            !imessage(target).dateRetracted,
            "UNAVAILABLE",
            "Target has already been retracted.",
          );
          const age = s.clock.now() - target.timestamp.getTime();
          requireThat(
            Number.isFinite(age) && age >= 0 && age < 120000,
            "UNAVAILABLE",
            "Target is outside the iMessage unsend window.",
          );
          return () => target.unsend();
        }
        case "message.markRead":
          requireThat(
            target.direction === "inbound",
            "FORBIDDEN",
            "Only an inbound target may mark its conversation read.",
          );
          return () => target.read();
        default:
          throw new Error("Unexpected WT-03 target action.");
      }
    },
    control ? ref : undefined,
    action.operation === "message.react" ? ref.id : undefined,
  );
  return {
    ...journal.result(),
    ...(control ? { value: { type: "void" as const } } : {}),
  };
}
