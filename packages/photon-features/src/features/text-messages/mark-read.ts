import type { ActionFor } from "../../contracts/actions.js";
import type { ExecutionServices } from "../../contracts/services.js";
import { requireThat } from "./errors.js";
import { resolveMessageTarget } from "./targets.js";
import { executeTextChild, type PublicTextMessageOptions } from "./sdk.js";
/** Cloud iMessage marks inbound conversation state; this is never an outbound recipient-read observation. */
export async function executeMarkRead(
  action: ActionFor<"message.markRead">,
  s: ExecutionServices,
  o: PublicTextMessageOptions,
) {
  const target = await resolveMessageTarget(action.arguments.message, s, o);
  requireThat(
    target.direction === "inbound",
    "FORBIDDEN",
    "Mark-read requires an authorized inbound message.",
  );
  return executeTextChild(action, s, o, 0, action.arguments, () =>
    target.read(),
  );
}
