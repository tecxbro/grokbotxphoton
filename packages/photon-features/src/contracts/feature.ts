import type { ActionFor, Operation } from "./actions.js";
import type { ExecutionServices } from "./services.js";
import type { OperationResult } from "./results.js";
/** One handler contract for every feature; registration never implies provider availability. */
export interface FeatureModule<K extends Operation = Operation> {
  readonly id: string;
  readonly owner: string;
  readonly handlers: Partial<{[P in K]: (action: ActionFor<P>, services: ExecutionServices) => Promise<OperationResult>}>;
}
