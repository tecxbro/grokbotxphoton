import type { ActionFor } from "../../contracts/actions.js";
import type { ExecutionServices } from "../../contracts/services.js";
import { resolveContents } from "spectrum-ts";
import { compileComposition, validateContent } from "./composition.js";
import { resolveMessageTarget } from "./targets.js";
import { executeTextChild, type PublicTextMessageOptions } from "./sdk.js";
/** Reply to the resolved SDK target; threading is never silently downgraded to a plain send. */
export async function executeReply(
  action: ActionFor<"message.reply">,
  s: ExecutionServices,
  o: PublicTextMessageOptions,
) {
  validateContent({
    type: "reply",
    message: action.arguments.message,
    content: action.arguments.content,
  });
  const target = await resolveMessageTarget(action.arguments.message, s, o);
  const built = await resolveContents([
    await compileComposition(action.arguments.content, s, o),
  ]);
  s.assertActiveClaim();
  return executeTextChild(action, s, o, 0, action.arguments, () =>
    target.reply({ build: async () => built[0]! }),
  );
}
