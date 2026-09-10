import { text } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import type { ActionFor } from "../../contracts/actions.js";
import type { ExecutionServices } from "../../contracts/services.js";
import { requireThat } from "./errors.js";
import { resolveMessageTarget } from "./targets.js";
import { executeTextChild, type PublicTextMessageOptions } from "./sdk.js";
import { oneBubble } from "./voice-policy.js";
/** Reject known native ineligibility before dispatch; remaining edit counts/recipient constraints are provider-enforced. */
export async function executeEdit(
  action: ActionFor<"message.edit">,
  s: ExecutionServices,
  o: PublicTextMessageOptions,
) {
  const target = await resolveMessageTarget(
    action.arguments.message,
    s,
    o,
    true,
  );
  requireThat(
    ["text", "markdown"].includes(target.content.type),
    "UNSUPPORTED",
    "Only text targets can be edited here.",
  );
  const age = s.clock.now() - target.timestamp.getTime();
  requireThat(
    !imessage(target).dateRetracted &&
      Number.isFinite(age) &&
      age >= 0 &&
      age < 900000,
    "UNAVAILABLE",
    "Target is retracted or outside the edit window.",
  );
  const content = text(oneBubble(action.arguments.text));
  return executeTextChild(action, s, o, 0, action.arguments, () =>
    target.edit(content),
  );
}
/** Native unsend is a void control and never returns a replacement message identity. */
export async function executeUnsend(
  action: ActionFor<"message.unsend">,
  s: ExecutionServices,
  o: PublicTextMessageOptions,
) {
  const target = await resolveMessageTarget(
    action.arguments.message,
    s,
    o,
    true,
  );
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
    "Target content cannot be unsent here.",
  );
  const age = s.clock.now() - target.timestamp.getTime();
  requireThat(
    !imessage(target).dateRetracted &&
      Number.isFinite(age) &&
      age >= 0 &&
      age < 120000,
    "UNAVAILABLE",
    "Target is retracted or outside the unsend window.",
  );
  return executeTextChild(action, s, o, 0, action.arguments, () =>
    target.unsend(),
  );
}
