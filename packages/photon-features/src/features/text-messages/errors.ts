import type { RuntimeError } from "../../index.js";
export class FeatureError extends Error {
  constructor(
    public readonly code: RuntimeError["code"],
    message: string,
  ) {
    super(message);
  }
}
export function requireThat(
  value: unknown,
  code: RuntimeError["code"],
  message: string,
): asserts value {
  if (!value) throw new FeatureError(code, message);
}
