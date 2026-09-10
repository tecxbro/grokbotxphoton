import { attachment, type ContentBuilder } from "spectrum-ts";
import type { ContentSpec, ExecutionServices } from "../../index.js";
import { SafeMediaStager, type ResolvedMedia } from "./staging.js";
import { mediaName, validateBytes } from "./safety.js";

export async function resolveMedia(media: Extract<ContentSpec, { type: "attachment" }>["media"], services: ExecutionServices): Promise<ResolvedMedia> {
  services.signal.throwIfAborted();
  const resolved = services.media instanceof SafeMediaStager
    ? await services.media.resolveWithSignal(media, services.context, services.signal)
    : await services.media.resolve(media, services.context);
  validateBytes(resolved.bytes, resolved.mimeType);
  services.signal.throwIfAborted();
  return resolved;
}
export async function compileAttachment(media: Extract<ContentSpec, { type: "attachment" }>["media"], services: ExecutionServices): Promise<ContentBuilder> {
  const resolved = await resolveMedia(media, services);
  return attachment(Buffer.from(resolved.bytes), {
    id: "kind" in media ? media.id : media.stagingId,
    mimeType: resolved.mimeType, name: mediaName(resolved.mimeType, resolved.metadata?.name),
  });
}

import type { ActionFor } from "../../contracts/actions.js";
import type { ExecutionServices as PublicServices } from "../../contracts/services.js";
import { mapMediaOperation, type MediaOperationOptions } from "./sdk.js";
/** Public handler: scoped staged bytes enter the shared child dispatch boundary. */
export function sendAttachment(action: ActionFor<"attachment.send">, services: PublicServices, options: MediaOperationOptions) {
  return mapMediaOperation(action, services, options);
}
/** Public read handler: returns a durable staged descriptor, preserving source metadata in staging. */
export function fetchAttachment(action: ActionFor<"attachment.fetch">, services: PublicServices, options: MediaOperationOptions) {
  return mapMediaOperation(action, services, options);
}
