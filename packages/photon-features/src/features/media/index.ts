export { createMediaModule } from "./module.js";
export { SafeMediaStager, type StagingOptions, type StagedMedia, type NativeMediaSource, type ResolvedMedia } from "./staging.js";
export { nativeMediaSource, mediaProvider, type MediaBindings, type NormalizedMediaLookup, type ScopedMediaBinding } from "./sdk.js";
export { compileContact, normalizeContact, importVCard, exportVCard } from "./contacts.js";
export type { SourceMetadata, MediaMetadata } from "./metadata.js";
export type { VoiceBehavior } from "./voice.js";
export { assertActionMediaAvailable } from "./retention.js";
