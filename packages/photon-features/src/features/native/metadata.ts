import { imessage } from "spectrum-ts/providers/imessage";
import type { Message } from "spectrum-ts";
import type { Action, ExecutionServices, OperationResult } from "../../contracts/index.js";
import { nativeSpace, requireNative } from "./guards.js";
import type { NativeBinding } from "./sdk.js";

function time(date: Date | undefined): number | null {
  const value = date?.getTime();
  return value !== undefined && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function metadata(message: Message, binding: NativeBinding, spaceId: string): OperationResult["value"] {
  requireNative(imessage.is(message), "UNSUPPORTED", "Cloud iMessage metadata is required.");
  nativeSpace(message.space, binding, spaceId);
  // F0's deliberate allowlist excludes native text, handles, attachments, secrets and raw rows.
  return { type: "metadata", sentAt: time(message.timestamp), editedAt: time(message.dateEdited),
    isFromMe: message.direction === "outbound" };
}

/** Resolves the exact scoped message and exposes only the F0 metadata allowlist;
 * native text, participants, attachment rows, tokens, and SDK internals remain hidden. */
export async function getCuratedMetadata(
  action: Extract<Action, { operation: "metadata.get" }>,
  services: ExecutionServices,
  binding: NativeBinding,
  spaceId: string,
): Promise<OperationResult["value"]> {
  const message = await services.resources.message(action.arguments.message, services.context);
  return metadata(message, binding, spaceId);
}
