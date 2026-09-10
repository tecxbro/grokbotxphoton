import { z } from "zod";
import { idSchema, scopeSchema, resourceRefSchema, sameScope } from "./resources.js";
import { operations } from "./actions.js";
export const principalSchema = z.strictObject({
  id: idSchema,
  osUid: z.number().int().nonnegative(),
  credentialId: idSchema,
  authenticatedAt: z.number().int().nonnegative(),
});
export type AuthenticatedPrincipal = z.infer<typeof principalSchema>;
export const contextSchema = z.strictObject({
  version: z.literal(1),
  contextId: idSchema,
  principalId: idSchema,
  scope: scopeSchema,
  taskId: idSchema,
  generation: z.number().int().nonnegative(),
  permissions: z
    .array(
      z.enum(
        operations as [
          (typeof operations)[number],
          ...(typeof operations)[number][],
        ],
      ),
    )
    .max(44),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  revokedAt: z.number().int().nonnegative().nullable(),
});
export type TrustedContext = z.infer<typeof contextSchema>;

export type { ContextResolver } from "./ports.js";
/** Validate authoritative context every time; an opaque ID is never an authorization grant. */
export function assertTrustedContext(context: TrustedContext, principal: AuthenticatedPrincipal, action: import("./actions.js").ActionRequest, now: number): void {
  contextSchema.parse(context);
  principalSchema.parse(principal);
  if (context.principalId !== principal.id || context.contextId !== action.contextId) throw new Error("FORBIDDEN");
  if (context.revokedAt !== null) throw new Error("CONTEXT_REVOKED");
  if (context.issuedAt > now || context.expiresAt <= now || context.expiresAt <= context.issuedAt) throw new Error("CONTEXT_EXPIRED");
  if (!context.permissions.includes(action.operation)) throw new Error("FORBIDDEN");
  const walk = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if ("scope" in value) {
      const ref = resourceRefSchema.parse(value);
      if (!sameScope(ref.scope, context.scope)) throw new Error("SCOPE_MISMATCH");
      if (ref.kind === "stream" && (ref.generation !== context.generation || ref.expiresAt <= now)) throw new Error("STALE_GENERATION");
    }
    for (const child of Object.values(value)) walk(child);
  };
  walk(action.arguments);
}
