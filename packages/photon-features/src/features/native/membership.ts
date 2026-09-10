import { requireNative, validatedMembers } from "./guards.js";
import type { Action, OperationResult } from "../../contracts/index.js";
import type { NativeBinding, NativeDispatch, NativeSpace } from "./sdk.js";

type MembershipAction = Extract<Action, {
  operation: "space.getMembers" | "space.addMembers" | "space.removeMembers" | "space.leave";
}>;

/** Executes membership reads and writes after the module has enforced group,
 * route, capability, and exact-intent checks. Writes re-read membership to
 * reduce stale-administration mistakes immediately before dispatch. */
export async function executeMembershipOperation(
  action: MembershipAction,
  space: NativeSpace,
  binding: NativeBinding,
  result: OperationResult,
  dispatch: NativeDispatch,
): Promise<void> {
  if (action.operation === "space.getMembers") {
    result.value = { type: "members", members: (await space.getMembers()).map(user => user.id) };
    return;
  }
  const members = action.operation === "space.leave" ? [] : validatedMembers(action.arguments.members);
  if (action.operation === "space.addMembers")
    requireNative(!members.includes(binding.phone), "INVALID_REQUEST", "The bot is already a participant.");
  if (action.operation === "space.removeMembers")
    requireNative(!members.includes(binding.phone), "FORBIDDEN", "Use the explicitly authorized leave operation for the bot account.");
  await checkMembership(action.operation, members, space, binding);
  if (action.operation === "space.addMembers") await dispatch(() => space.add(members));
  else if (action.operation === "space.removeMembers") await dispatch(() => space.remove(members));
  else await dispatch(() => space.leave());
}

/** Pinned getMembers excludes the dedicated account itself. Revalidate immediately
 * before a write; Apple still decides races with concurrent membership changes. */
export async function checkMembership(
  operation: "space.addMembers" | "space.removeMembers" | "space.leave",
  members: readonly string[], space: NativeSpace, binding: NativeBinding,
): Promise<void> {
  const current = await binding.provider.getMembers(space);
  requireNative(current.every(user => user.service === "iMessage"), "UNAVAILABLE",
    "Group administration requires verified iMessage participants.");
  const ids = new Set(current.map(user => user.id.toLowerCase()));
  requireNative(ids.size === current.length, "UNAVAILABLE", "Group membership could not be resolved uniquely.");
  if (operation === "space.addMembers") {
    requireNative(ids.size >= 2, "UNSUPPORTED", "Adding members requires at least three current participants including the account.");
    requireNative(members.every(id => !ids.has(id.toLowerCase())), "INVALID_REQUEST", "A requested recipient is already a member.");
  } else {
    requireNative(ids.size >= 3, "UNSUPPORTED", "Removing members or leaving requires at least four current participants including the account.");
    if (operation === "space.removeMembers") {
      requireNative(members.every(id => ids.has(id.toLowerCase())), "INVALID_REQUEST", "A requested recipient is not a member.");
      requireNative(ids.size - members.length >= 2, "UNSUPPORTED", "Removal must leave at least three participants including the account.");
    }
  }
}
