import { errorSchema, type RuntimeError } from "../../contracts/index.js";
export class RuntimeFault extends Error {
  constructor(
    readonly code: RuntimeError["code"],
    readonly retry: RuntimeError["retry"] = "never",
  ) {
    super(code);
  }
}
export function fault(code: RuntimeError["code"]): never {
  throw new RuntimeFault(code);
}
export function publicError(error: unknown): RuntimeError {
  const code = error instanceof RuntimeFault ? error.code : "INTERNAL";
  return errorSchema.parse({
    code,
    message: code,
    retry: error instanceof RuntimeFault ? error.retry : "never",
  });
}
