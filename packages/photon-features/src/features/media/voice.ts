import { attachment, voice, type ContentBuilder } from "spectrum-ts";
import type { ContentSpec, ExecutionServices } from "../../index.js";
import { resolveMedia } from "./attachments.js";
import { mediaName, reject } from "./safety.js";

export type VoiceBehavior = "native" | "audio-attachment";
/** Host selects a verified behavior. Never silently retry a possibly dispatched voice as an attachment. */
export async function compileVoice(media: Extract<ContentSpec, { type: "voice" }>["media"], services: ExecutionServices, behavior: VoiceBehavior): Promise<ContentBuilder> {
  const resolved = await resolveMedia(media, services);
  if (!resolved.mimeType.startsWith("audio/")) reject("voice requires existing audio");
  const bytes = Buffer.from(resolved.bytes);
  const options = { mimeType: resolved.mimeType, name: mediaName(resolved.mimeType, resolved.metadata?.name), duration: resolved.metadata?.duration };
  return behavior === "native" ? voice(bytes, options) : attachment(bytes, options);
}

import type { ActionFor } from "../../contracts/actions.js";
import type { ExecutionServices as PublicServices } from "../../contracts/services.js";
import { mapMediaOperation, type MediaOperationOptions } from "./sdk.js";
/** Sends an existing audio resource; host-selected ordinary attachment fallback is reported explicitly. */
export function sendVoiceNote(action: ActionFor<"voice.send">, services: PublicServices, options: MediaOperationOptions) {
  return mapMediaOperation(action, services, options);
}
