import {
  MAX_REQUEST_BYTES,
  parseAction,
  parseActionRequest,
  resourceRefSchema,
  type Action,
  type ResourceRef,
} from "../../contracts/index.js";
import { fault } from "./errors.js";
export function admit(input: unknown): Action {
  try {
    if (Buffer.byteLength(JSON.stringify(input), "utf8") > MAX_REQUEST_BYTES)
      fault("INVALID_REQUEST");
    const action = parseAction(input);
    walk(action.arguments, (value) => {
      if (value.type === "poll" && Array.isArray(value.options)) {
        const keys = value.options.map((o) => (o as { key: string }).key);
        if (new Set(keys).size !== keys.length) fault("INVALID_REQUEST");
      }
    });
    return action;
  } catch {
    return fault("INVALID_REQUEST");
  }
}
/** Public admission boundary. Validation completes before authority lookup or I/O. */
export function admitRequest(input: unknown): Action {
  try {
    return parseActionRequest(input);
  } catch {
    return fault("INVALID_REQUEST");
  }
}
export function walk(
  value: unknown,
  visit: (value: Record<string, unknown>) => void,
): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
  } else if (value && typeof value === "object") {
    visit(value as Record<string, unknown>);
    for (const child of Object.values(value)) walk(child, visit);
  }
}
export function references(action: Action): ResourceRef[] {
  const refs: ResourceRef[] = [];
  walk(action.arguments, (value) => {
    if ("kind" in value && "scope" in value)
      refs.push(resourceRefSchema.parse(value));
  });
  return refs;
}
