import { z } from "zod";
import { nativeContactCard } from "spectrum-ts/providers/imessage";
import type { ContentInput } from "spectrum-ts";
import type { Action, ContentCompiler, ExecutionServices } from "../../contracts/index.js";
import { cardRefSchema, contentSchema, sameScope } from "../../contracts/index.js";
import { requireNative, resolveReference } from "./guards.js";

export const nativeContactHandler = Object.freeze({
  id: "native-account-contact-v1",
  permissions: ["custom.send", "account.shareContact"] as const,
  providerMapping: "spectrum-ts/providers/imessage.nativeContactCard()",
  sdkVersion: "12.8.0",
  evidence: "tests/lanes/wt-07/unit.test.ts",
});

/** Resolves one named, versioned handler. No caller-supplied callback, method,
 * endpoint, or raw provider payload can extend this allowlist. */
export function resolveCustomHandler(codecId: string): typeof nativeContactHandler {
  requireNative(codecId === nativeContactHandler.id, "UNSUPPORTED", "Unknown native custom handler.");
  return nativeContactHandler;
}
// No generic handler callback, provider dictionary, arbitrary method or endpoint.
export const customSchema = z.strictObject({
  type: z.literal("registered-custom"),
  codecId: z.literal(nativeContactHandler.id),
  resource: cardRefSchema,
});
export const customCompiler: ContentCompiler = {
  family: "registered-custom",
  async compile(input, services) {
    const content = contentSchema.parse(input);
    requireNative(content.type === "registered-custom", "INVALID_REQUEST", "Expected registered custom content.");
    resolveCustomHandler(content.codecId);
    const parsed = customSchema.parse(content);
    requireNative(nativeContactHandler.permissions.every(p => services.context.permissions.includes(p)),
      "FORBIDDEN", "Native account contact sharing permission is required.");
    await resolveReference(parsed.resource, services);
    const card = services.transactions.transaction(tx => tx.get("cards", parsed.resource.id));
    requireNative(card && card.templateId === nativeContactHandler.id &&
      card.reference.messageId === parsed.resource.messageId &&
      card.reference.id === parsed.resource.id &&
      sameScope(card.scope, parsed.resource.scope),
    "FORBIDDEN", "The native contact handler requires a host-registered card resource.");
    return nativeContactCard();
  },
};

/** Executes the allowlisted native account-contact wrapper after separately
 * authorizing the underlying account identity share. */
export async function executeCustomHandler(
  action: Extract<Action, { operation: "custom.send" }>,
  services: ExecutionServices,
  authorizeAccountShare: () => Promise<void>,
  send: (content: ContentInput, expectsMessage: boolean) => Promise<void>,
): Promise<void> {
  resolveCustomHandler(action.arguments.codecId);
  await authorizeAccountShare();
  await send(await customCompiler.compile({
    type: "registered-custom",
    codecId: action.arguments.codecId,
    resource: action.arguments.resource,
  }, services), false);
}
