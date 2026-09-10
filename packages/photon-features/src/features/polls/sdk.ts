import { poll, option, type ContentBuilder, type Space } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";

/** Public Spectrum 12.8.0 builders. Caller keys are not native option identifiers. */
export function compilePoll(question: string, choices: readonly { key: string; label: string }[]): ContentBuilder {
  if (!question.trim() || new Set(choices.map(o => o.key)).size !== choices.length ||
      choices.some(o => !o.label.trim())) throw new Error("INVALID_REQUEST");
  return poll(question, choices.map(o => option(o.label)));
}

export function checkedSpace(space: Space): Space {
  if (space.__platform !== "imessage" || !imessage(space).phone) throw new Error("UNSUPPORTED");
  return space;
}

import type { ActionFor } from "../../contracts/actions.js";
import type { ResourceResolver } from "../../contracts/ports.js";

/** A trusted closure over the shared SDK owner, captured by the handler (F0 execution.md).
 * No credentials, client constructor, advanced extension or subscription is accepted here.
 */
export interface PollProviderBinding {
  resolveSpace: ResourceResolver["space"];
}
export type PollAction = { [K in "poll.create" | "poll.get" | "poll.vote" | "poll.unvote" | "poll.addOption"]: ActionFor<K> }[
  "poll.create" | "poll.get" | "poll.vote" | "poll.unvote" | "poll.addOption"
];
export type PollMapping =
  | { kind: "create"; content: ContentBuilder }
  | { kind: "blocked"; blockerId: "wt-05-advanced-polls"; reason: string };

/** Map only public pinned APIs. F0 approves no native management extension.
 * In particular, native unvote takes just the poll GUID, unlike the wire action.
 */
export function mapPollOperation(action: PollAction): PollMapping {
  if (action.operation === "poll.create") return {
    kind: "create", content: compilePoll(action.arguments.question, action.arguments.options),
  };
  return { kind: "blocked", blockerId: "wt-05-advanced-polls",
    reason: "F0 has no approved shared advanced poll binding; native management requires shared integration." };
}
