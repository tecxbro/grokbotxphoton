import { operations, type Operation } from "../contracts/actions.js";
import type { FeatureModule } from "../contracts/feature.js";
import { operationOwners } from "./index.js";
/** Explicit injection only; inherited feature modules are not guessed or silently loaded. */
export function registerFeatureModules(modules: readonly FeatureModule[], requireComplete = false) {
  const handlers = new Map<Operation, NonNullable<FeatureModule["handlers"][Operation]>>();
  const ids = new Set<string>();
  for (const module of modules) {
    if (ids.has(module.id)) throw new Error("DUPLICATE_MODULE");
    ids.add(module.id);
    for (const [name, handler] of Object.entries(module.handlers)) {
      const op = name as Operation;
      if (!operations.includes(op) || operationOwners[op] !== module.owner) throw new Error("WRONG_OWNER");
      if (typeof handler !== "function") throw new Error("INVALID_HANDLER");
      if (handlers.has(op)) throw new Error("DUPLICATE_HANDLER");
      handlers.set(op, handler);
    }
  }
  const missing = operations.filter(op => !handlers.has(op));
  if (requireComplete && missing.length) throw new Error(`MISSING_HANDLERS:${missing.join(",")}`);
  return {handlers, missing};
}
