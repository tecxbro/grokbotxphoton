import type {
  ExecutionServices,
  OperationResult,
} from "../../contracts/index.js";
import { fault } from "./errors.js";
export type ChildDispatch = (
  index: number,
  send: () => Promise<OperationResult>,
) => Promise<OperationResult>;
const boundaries = new WeakMap<ExecutionServices, ChildDispatch>();
export function bindBoundary(
  services: ExecutionServices,
  dispatch: ChildDispatch,
): () => void {
  boundaries.set(services, dispatch);
  return () => {
    boundaries.delete(services);
  };
}
/** WT-01 adapter pending a shared F0 service seam. Invoke once per consequential SDK call. */
export function executeChild(
  services: ExecutionServices,
  index: number,
  send: () => Promise<OperationResult>,
): Promise<OperationResult> {
  const run = boundaries.get(services);
  if (!run) return fault("UNIMPLEMENTED");
  return run(index, send);
}
