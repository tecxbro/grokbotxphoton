import type { ActionFor } from "../../contracts/actions.js";
import type { ExecutionServices } from "../../contracts/services.js";
import { requireThat } from "./errors.js";
import { resolveMessageTarget, resolveReactionTarget } from "./targets.js";
import {
  executeTextChild,
  tapbacks,
  type PublicTextMessageOptions,
} from "./sdk.js";
/** Preserve the SDK reaction handle and stable parent reference for later authorized removal. */
export async function executeReaction(
  action: ActionFor<"message.react">,
  s: ExecutionServices,
  o: PublicTextMessageOptions,
) {
  const target = await resolveMessageTarget(action.arguments.message, s, o);
  requireThat(
    target.content.type !== "reaction",
    "UNSUPPORTED",
    "Reactions cannot target reactions.",
  );
  return executeTextChild(
    action,
    s,
    o,
    0,
    action.arguments,
    () => target.react(tapbacks[action.arguments.reaction]),
    action.arguments.message.id,
  );
}
/** Remove only an actual bot-owned reaction; the SDK uses its own original parent metadata. */
export async function removeOwnReaction(
  action: ActionFor<"reaction.remove">,
  s: ExecutionServices,
  o: PublicTextMessageOptions,
) {
  const target = await resolveReactionTarget(action.arguments.reaction, s, o);
  return executeTextChild(action, s, o, 0, action.arguments, () =>
    target.unsend(),
  );
}
