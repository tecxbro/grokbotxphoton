import { createHash } from "node:crypto";
import {
  sameScope, type Action, type ExecutionServices, type OperationResult, type ResourceRef,
} from "../../contracts/index.js";
import { nativeSpace, requireNative, resolveReference, validatedMembers } from "./guards.js";
import type { NativeBinding, NativeDispatch, NativeSpace } from "./sdk.js";

type SpaceLookupAction = Extract<Action, {
  operation: "space.get" | "space.getName" | "space.rename";
}>;
type SpaceCreateAction = Extract<Action, { operation: "space.create" }>;

/** Executes already-resolved conversation reads and name changes. Provider
 * failures before a mutation dispatch remain ordinary read/provider failures. */
export async function executeSpaceLookup(
  action: SpaceLookupAction,
  space: NativeSpace,
  result: OperationResult,
  dispatch: NativeDispatch,
): Promise<void> {
  switch (action.operation) {
    case "space.get":
      return;
    case "space.getName":
      result.value = { type: "name", name: (await space.getDisplayName()) ?? null };
      return;
    case "space.rename":
      await dispatch(() => space.rename(action.arguments.name));
  }
}

/** Creates a DM or dedicated-line group from the exact authorized recipient
 * set and persists only an opaque F0 reference to the returned chat. */
export async function createSpace(
  action: SpaceCreateAction,
  services: ExecutionServices,
  binding: NativeBinding,
  result: OperationResult,
  dispatch: NativeDispatch,
): Promise<void> {
  const members = validatedMembers(action.arguments.members);
  if (members.length > 1)
    requireNative(binding.dedicated, "UNAVAILABLE", "Group creation requires an existing dedicated line.");
  requireNative(!members.includes(binding.phone), "INVALID_REQUEST", "Do not include the bot account in recipients.");
  if (action.arguments.name !== undefined) {
    requireNative(members.length > 1, "UNSUPPORTED", "A direct conversation cannot be named.");
    requireNative(services.context.permissions.includes("space.rename"), "FORBIDDEN", "Naming a new group requires rename permission.");
    requireNative(binding.availableOperations.includes("space.rename"), "UNAVAILABLE", "Native capability has not been established for this account.");
  }
  const created = nativeSpace(await dispatch(() => binding.provider.space.create(
    members.length === 1 ? members[0]! : members,
    { phone: binding.phone },
  )), binding);
  requireNative(created.type === (members.length > 1 ? "group" : "dm"), "SCOPE_MISMATCH", "Created conversation type mismatch.");
  result.references.push(remember("space", created.id, services, true));
  if (action.arguments.name !== undefined)
    await dispatch(() => created.rename(action.arguments.name!));
}

export async function getSpace(ref: ResourceRef, services: ExecutionServices, binding: NativeBinding, beforeRead: () => void): Promise<NativeSpace> {
  beforeRead();
  await resolveReference(ref, services);
  beforeRead();
  const resolved = nativeSpace(await services.resources.space(ref, services.context), binding);
  beforeRead();
  // Always pass the serving phone. SDK omission can select a random/first line.
  return nativeSpace(await binding.provider.space.get(resolved.id, { phone: binding.phone }), binding, resolved.id);
}

/** Durable opaque IDs avoid putting Apple chat GUIDs (containing semicolons) in F0 IDs. */
export function remember(
  kind: "space" | "message", providerId: string, services: ExecutionServices,
  newConversation = false,
): ResourceRef {
  const context = services.context;
  const digest = createHash("sha256").update(JSON.stringify([kind, context.scope, providerId])).digest("hex");
  const id = `native-${kind}-${digest}`;
  const scope = { ...context.scope, ...(newConversation ? { spaceId: id } : {}) };
  const reference: ResourceRef = { version: 1, kind, id, scope };
  services.transactions.transaction(tx => {
    const previous = tx.get("references", id);
    if (previous) {
      requireNative(previous.providerId === providerId && previous.ownedByPrincipalId === context.principalId &&
        previous.taskId === context.taskId && previous.generation === context.generation &&
        sameScope(previous.scope, scope) && sameScope(previous.reference.scope, scope) &&
        previous.reference.kind === kind && previous.reference.id === id,
      "FORBIDDEN", "Resource is owned by a different execution context.");
      return;
    }
    tx.put("references", { id, scope, revision: 0, reference, providerId,
      ownedByPrincipalId: context.principalId, taskId: context.taskId, generation: context.generation }, null);
  });
  return reference;
}
