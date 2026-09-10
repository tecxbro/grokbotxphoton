import { text } from "spectrum-ts";
import type { Action } from "../../contracts/actions.js";
import type { ExecutionServices } from "../../contracts/services.js";
import type { OperationResult } from "../../contracts/results.js";
import { compileComposition } from "./composition.js";
import {
  executeTextChild,
  textResult,
  textFailure,
  type PublicTextMessageOptions,
} from "./sdk.js";
import { resolveTextSpace } from "./targets.js";
import { formatMessageBubbles } from "./voice-policy.js";
/** Format only plain prose; each intended bubble has a stable shared child index. */
export async function executeTextOperation(
  action: Extract<
    Action,
    { operation: "text.send" | "markdown.send" | "link.send" }
  >,
  s: ExecutionServices,
  o: PublicTextMessageOptions,
): Promise<OperationResult> {
  const inputs =
    action.operation === "text.send"
      ? formatMessageBubbles(action.arguments.text).bubbles.map((value) =>
          text(value),
        )
      : [
          await compileComposition(
            action.operation === "markdown.send"
              ? { type: "markdown", text: action.arguments.text }
              : {
                  type: "link",
                  url: action.arguments.url,
                  ...(action.arguments.title === undefined
                    ? {}
                    : { title: action.arguments.title }),
                },
            s,
            o,
          ),
        ];
  const space = await resolveTextSpace(action.arguments.space, s, o);
  const result = textResult(action, s);
  for (let i = 0; i < inputs.length; i++) {
    let child: OperationResult;
    try {
      child = await executeTextChild(action, s, o, i, { bubble: i }, () =>
        space.send(inputs[i]!),
      );
    } catch (error) {
      return textFailure(result, error);
    }
    result.references.push(...child.references);
    result.observations.push(...child.observations);
    result.updatedAt = child.updatedAt;
    if (
      ![
        "executor-completed",
        "provider-accepted",
        "observed-delivered",
        "observed-read",
      ].includes(child.status)
    )
      return {
        ...child,
        requestId: result.requestId,
        references: result.references,
        observations: result.observations,
      };
  }
  result.status = result.references.length
    ? "provider-accepted"
    : "executor-completed";
  return result;
}
