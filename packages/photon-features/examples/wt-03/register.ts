import type {
  Action,
  ContentCompiler,
  ExecutionServices,
  Scope,
  TrustedContext,
} from "../../src/index.js";
import {
  createTextMessageModule,
  type Binding,
} from "../../src/features/text-messages/module.js";
/** Host composition supplies these bindings. This example does not start a client or send. */
export function registerTextMessages(host: {
  currentRequestId(action: Action, services: ExecutionServices): string;
  verifiedBinding(context: TrustedContext): Binding;
  registeredCompilers(): readonly ContentCompiler[];
}) {
  return createTextMessageModule({
    requestId: host.currentRequestId,
    binding: host.verifiedBinding,
    compilers: host.registeredCompilers,
  });
}
export function exampleText(scope: Scope): Action {
  return {
    version: 1,
    contextId: "authorized-context",
    idempotencyKey: "status-update-1",
    operation: "text.send",
    arguments: {
      space: { version: 1, kind: "space", id: "registered-space", scope },
      text: "i checked the route with Ada.\n\nwant me to send the details?",
    },
  };
}
