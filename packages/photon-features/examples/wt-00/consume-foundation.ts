/** Lane starting point: no runtime activation and no SDK construction. */
import {
  buildRegistry,
  foundationCapabilities,
  parseAction,
  type FeatureModule,
} from "../../src/index.js";
export function validateLane(module: FeatureModule, input: unknown) {
  const action = parseAction(input);
  const registry = buildRegistry([module], { requireComplete: false });
  return {
    operation: action.operation,
    handler: registry.handlers.get(action.operation),
    capabilities: foundationCapabilities(),
  };
}
