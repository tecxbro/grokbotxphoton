import { createHash } from "node:crypto";

export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
export class MediaError extends Error {
  constructor(readonly reason: string) { super(`Media rejected: ${reason}`); }
}
export function reject(reason: string): never { throw new MediaError(reason); }
export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export const mimeExtensions = {
  "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
  "image/heic": "heic", "image/heif": "heif", "video/mp4": "mp4", "video/quicktime": "mov",
  "video/webm": "webm", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav",
  "audio/x-wav": "wav", "audio/ogg": "ogg", "audio/webm": "webm", "audio/aac": "aac",
  "application/pdf": "pdf", "application/octet-stream": "bin", "text/plain": "txt",
  "text/vcard": "vcf", "text/x-vcard": "vcf",
} as const;
export function validMime(mime: string): string {
  if (!Object.hasOwn(mimeExtensions, mime)) reject("unsupported MIME");
  return mime;
}
export function mediaName(mime: string, name?: string): string {
  validMime(mime);
  const extension = mimeExtensions[mime as keyof typeof mimeExtensions];
  if (name !== undefined && (!name || name.length > 200 || /[\x00-\x1f\x7f/\\]/.test(name) || name === "." || name === "..")) reject("invalid name");
  // Upload names determine native MIME inference. Preserve original metadata separately.
  return name?.toLowerCase().endsWith(`.${extension}`) ? name : `media.${extension}`;
}
export function validateBytes(bytes: Uint8Array, mime: string, limit = MAX_MEDIA_BYTES): void {
  validMime(mime);
  if (!bytes.length || bytes.length > limit) reject("byte limit");
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start: number, end: number) => b.toString("ascii", start, end);
  const iso = ["image/heic", "image/heif", "video/mp4", "audio/mp4", "video/quicktime"].includes(mime);
  const checks: Record<string, () => boolean> = {
    "image/png": () => b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
    "image/jpeg": () => b[0] === 255 && b[1] === 216 && b[2] === 255,
    "image/gif": () => ["GIF87a", "GIF89a"].includes(ascii(0, 6)),
    "image/webp": () => ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP",
    "audio/wav": () => ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE",
    "audio/x-wav": () => ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE",
    "audio/ogg": () => ascii(0, 4) === "OggS",
    "audio/mpeg": () => ascii(0, 3) === "ID3" || (b[0] === 255 && ((b[1] ?? 0) & 224) === 224),
    "audio/aac": () => b[0] === 255 && ((b[1] ?? 0) & 246) === 240,
    "application/pdf": () => ascii(0, 5) === "%PDF-",
    "video/webm": () => b.subarray(0, 4).equals(Buffer.from([26,69,223,163])),
    "audio/webm": () => b.subarray(0, 4).equals(Buffer.from([26,69,223,163])),
  };
  if (iso && ascii(4, 8) !== "ftyp") reject("MIME signature mismatch");
  if (checks[mime] && !checks[mime]!()) reject("MIME signature mismatch");
  if (mime.startsWith("text/")) {
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(b); } catch { return reject("invalid UTF-8"); }
    if (text.includes("\0")) reject("invalid text");
    if (mime.includes("vcard") && (!text.startsWith("BEGIN:VCARD") || !text.trimEnd().endsWith("END:VCARD"))) reject("invalid vCard");
  }
}
export class Capacity {
  private active = 0;
  constructor(readonly maximum = 4) {
    if (!Number.isInteger(maximum) || maximum < 1 || maximum > 32) reject("invalid concurrency limit");
  }
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.maximum) reject("concurrency limit");
    this.active++;
    try { return await fn(); } finally { this.active--; }
  }
}
export async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let abort!: () => void;
  const cancelled = new Promise<never>((_, fail) => {
    abort = () => fail(new MediaError("download interrupted or timed out"));
    signal.addEventListener("abort", abort, { once: true });
  });
  try { return await Promise.race([promise, cancelled]); }
  finally { signal.removeEventListener("abort", abort); }
}
export interface MediaStream {
  getReader(): {
    read(): Promise<{ done: boolean; value?: unknown }>;
    cancel(reason?: unknown): Promise<void>;
    releaseLock(): void;
  };
  cancel(reason?: unknown): Promise<void>;
}
/** Consume bounded chunks; cancellation never waits indefinitely for a broken producer. */
export async function consume(
  stream: MediaStream, limit: number, signal: AbortSignal,
  write: (chunk: Uint8Array) => Promise<void>,
): Promise<number> {
  const reader = stream.getReader();
  let size = 0;
  try {
    while (true) {
      const next = await abortable(reader.read(), signal);
      if (next.done) break;
      if (!(next.value instanceof Uint8Array)) reject("nonbinary stream");
      size += next.value.byteLength;
      if (size > limit) reject("byte limit");
      for (let offset = 0; offset < next.value.length; offset += 65536) {
        signal.throwIfAborted();
        await write(next.value.subarray(offset, offset + 65536));
      }
    }
    if (!size) reject("empty resource");
    return size;
  } catch (error) {
    void reader.cancel(error).catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
}
