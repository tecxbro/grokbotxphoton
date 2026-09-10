import type { MediaStream } from "./safety.js";
import { randomUUID } from "node:crypto";
import { mkdir, open, realpath, rename, unlink, lstat, opendir } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import {
  assertScope, sameScope, stagedMediaSchema, type Claim, type Clock, type ContentSpec,
  type MediaStager, type StagedMediaRecord, type TransactionStore, type TrustedContext,
} from "../../index.js";
import { openApprovedFile } from "./file-access.js";
import { createGuardedFetcher, type FetchPolicy } from "./guarded-fetch.js";
import { metadataSchema, mediaCheckpointSchema, type MediaMetadata, type SourceMetadata } from "./metadata.js";
import { scopeHasConsumers } from "./retention.js";
import { Capacity, MAX_MEDIA_BYTES, consume, reject, sha256, validateBytes, validMime } from "./safety.js";

type Media = Extract<ContentSpec, { type: "attachment" }>["media"];
export type StagedMedia = Extract<Media, { stagingId: string }>;
export interface NativeMediaSource {
  open(ref: Extract<Media, { kind: "attachment" }>, context: TrustedContext, signal: AbortSignal): Promise<{
    stream: MediaStream; metadata: SourceMetadata;
  }>;
}
export interface StagingOptions {
  directory: string;
  approvedRoots: readonly string[];
  urls: FetchPolicy;
  store: TransactionStore;
  clock: Clock;
  native: NativeMediaSource;
  maxBytes?: number;
  timeoutMs?: number;
  concurrency?: number;
}
export interface ResolvedMedia { bytes: Uint8Array; mimeType: string; metadata?: (MediaMetadata | SourceMetadata) & { retrieval?: import("spectrum-ts/providers/imessage").IMessageAttachmentMetadata } }

/** Implements F0 MediaStager; creation/import methods are trusted-host APIs, never action JSON. */
export class SafeMediaStager implements MediaStager {
  private readonly capacity: Capacity;
  private readonly maxBytes: number;
  private readonly timeoutMs: number;
  private readonly fetchUrl;
  private constructor(private readonly options: StagingOptions, private readonly directory: string) {
    this.maxBytes = options.maxBytes ?? MAX_MEDIA_BYTES;
    this.timeoutMs = options.timeoutMs ?? 30000;
    if (!Number.isInteger(this.maxBytes) || this.maxBytes < 1 || this.maxBytes > MAX_MEDIA_BYTES ||
      !Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 120000) reject("invalid limits");
    this.capacity = new Capacity(options.concurrency);
    this.fetchUrl = createGuardedFetcher(options.urls);
  }
  static async create(options: StagingOptions): Promise<SafeMediaStager> {
    await mkdir(options.directory, { recursive: true, mode: 0o700 });
    const directory = await realpath(options.directory);
    const stat = await lstat(directory);
    if (!stat.isDirectory() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()) reject("staging directory must be private");
    return new SafeMediaStager(options, directory);
  }
  private signal(signal?: AbortSignal): AbortSignal {
    return AbortSignal.any([AbortSignal.timeout(this.timeoutMs), ...(signal ? [signal] : [])]);
  }
  private authorize(record: StagedMediaRecord, context: TrustedContext): void {
    if (!sameScope(record.scope, context.scope) || record.principalId !== context.principalId ||
      record.taskId !== context.taskId || record.generation !== context.generation) reject("resource scope");
    // expiresAt=0 is a durable tombstone; wall-clock expiry alone cannot evict pending retries.
    if (record.expiresAt === 0 || record.relativePath !== `${record.id}.bin`) reject("released resource");
  }
  private async persist(stream: MediaStream, metadata: SourceMetadata, context: TrustedContext, claim: Claim, signal: AbortSignal): Promise<StagedMedia> {
    const id = randomUUID();
    const meta = metadataSchema.parse({ ...metadata, version: 1, stagingId: id });
    validMime(meta.mimeType);
    if (meta.source) assertScope(meta.source, context.scope);
    if (meta.size !== undefined && meta.size > this.maxBytes) reject("byte limit");
    const path = join(this.directory, `${id}.part`), final = join(this.directory, `${id}.bin`);
    const file = await open(path, "wx", 0o600);
    let committed = false;
    try {
      const size = await consume(stream, this.maxBytes, signal, async chunk => {
        let offset = 0;
        while (offset < chunk.length) {
          const { bytesWritten } = await file.write(chunk, offset, chunk.length - offset);
          if (!bytesWritten) reject("interrupted file write");
          offset += bytesWritten;
        }
      });
      await file.sync();
      await file.close();
      // The F0 output contract requires bytes. Materialization occurs only after bounded streaming.
      const verified = await this.readFile(path, signal);
      validateBytes(verified, meta.mimeType, this.maxBytes);
      if (verified.length !== size || (meta.size !== undefined && size !== meta.size)) reject("size mismatch");
      const media = { stagingId: id, sha256: sha256(verified), mimeType: meta.mimeType, bytes: size };
      await rename(path, final);
      const directory = await open(this.directory, "r");
      try { await directory.sync(); } finally { await directory.close(); }
      this.options.store.transaction(tx => {
        tx.put("stagedMedia", { id, scope: context.scope, revision: 0, principalId: context.principalId,
          taskId: context.taskId, generation: context.generation, relativePath: `${id}.bin`,
          sha256: media.sha256, mimeType: media.mimeType, bytes: size,
          expiresAt: this.options.clock.now() + 86400000 }, null);
        tx.put("checkpoints", { id: `wt04:metadata:${id}`, scope: context.scope, revision: 0,
          requestId: id, codecId: "wt04.media-metadata", codecVersion: 1,
          payloadJson: JSON.stringify({ metadata: meta, readers: [] }), nextChildIndex: 0, claim }, null);
      });
      committed = true;
      return media;
    } finally {
      await file.close().catch(() => {});
      await unlink(path).catch(() => {});
      if (!committed) await unlink(final).catch(() => {});
    }
  }
  private async readFile(path: string, signal: AbortSignal, roots = [this.directory]): Promise<Buffer> {
    const file = await openApprovedFile(path, roots);
    const chunks: Buffer[] = [];
    try {
      if ((await file.stat()).size > this.maxBytes) reject("byte limit");
      const stream = Readable.toWeb(file.createReadStream({ autoClose: false, highWaterMark: 65536 }));
      await consume(stream, this.maxBytes, signal, async chunk => { chunks.push(Buffer.from(chunk)); });
      return Buffer.concat(chunks);
    } finally { await file.close(); }
  }
  stageFile(path: string, metadata: SourceMetadata, context: TrustedContext, claim: Claim, signal?: AbortSignal): Promise<StagedMedia> {
    return this.capacity.run(async () => {
      const deadline = this.signal(signal);
      const file = await openApprovedFile(path, this.options.approvedRoots);
      try {
        if ((await file.stat()).size > this.maxBytes) reject("byte limit");
        return await this.persist(Readable.toWeb(file.createReadStream({ autoClose: false, highWaterMark: 65536 })), metadata, context, claim, deadline);
      } finally { await file.close(); }
    });
  }
  stageUrl(url: string, context: TrustedContext, claim: Claim, signal?: AbortSignal): Promise<StagedMedia> {
    return this.capacity.run(async () => {
      const deadline = this.signal(signal);
      const download = await this.fetchUrl(url, deadline);
      try { return await this.persist(download.stream, { mimeType: download.mimeType }, context, claim, deadline); }
      finally { download.close(); }
    });
  }
  stageNative(ref: Extract<Media, { kind: "attachment" }>, context: TrustedContext, claim: Claim, signal?: AbortSignal): Promise<StagedMedia> {
    return this.capacity.run(async () => {
      assertScope(ref, context.scope);
      const deadline = this.signal(signal);
      const source = await this.options.native.open(ref, context, deadline);
      try { return await this.persist(source.stream, source.metadata, context, claim, deadline); }
      finally { void source.stream.cancel().catch(() => {}); }
    });
  }
  resolve(media: Media, context: TrustedContext): Promise<ResolvedMedia> {
    return this.resolveWithSignal(media, context);
  }
  resolveWithSignal(media: Media, context: TrustedContext, signal?: AbortSignal): Promise<ResolvedMedia> {
    return this.capacity.run(async () => {
      const deadline = this.signal(signal);
      if ("kind" in media) {
        assertScope(media, context.scope);
        const source = await this.options.native.open(media, context, deadline);
        const chunks: Buffer[] = [];
        try {
          validMime(source.metadata.mimeType);
          await consume(source.stream, this.maxBytes, deadline, async chunk => { chunks.push(Buffer.from(chunk)); });
        } catch (error) { void source.stream.cancel().catch(() => {}); throw error; }
        const bytes = Buffer.concat(chunks);
        validateBytes(bytes, source.metadata.mimeType, this.maxBytes);
        if (source.metadata.size !== undefined && source.metadata.size !== bytes.length) reject("size mismatch");
        return { bytes, mimeType: source.metadata.mimeType, metadata: source.metadata };
      }
      stagedMediaSchema.parse(media);
      const readerId = randomUUID();
      const record = this.options.store.transaction(tx => {
        const stored = tx.get("stagedMedia", media.stagingId);
        if (!stored) return reject("resource not found");
        this.authorize(stored, context);
        if (stored.sha256 !== media.sha256 || stored.mimeType !== media.mimeType || stored.bytes !== media.bytes) reject("resource mismatch");
        const checkpoint = tx.get("checkpoints", `wt04:metadata:${stored.id}`);
        if (!checkpoint) reject("missing resource metadata");
        const payload = mediaCheckpointSchema.parse(JSON.parse(checkpoint.payloadJson));
        if (payload.readers.length >= 1000) reject("reader limit");
        payload.readers.push(readerId);
        tx.put("checkpoints", { ...checkpoint, revision: checkpoint.revision + 1, payloadJson: JSON.stringify(payload) }, checkpoint.revision);
        return stored;
      });
      try {
        const bytes = await this.readFile(join(this.directory, record.relativePath), deadline);
        validateBytes(bytes, record.mimeType, this.maxBytes);
        if (bytes.length !== record.bytes || sha256(bytes) !== record.sha256) reject("resource integrity");
        const checkpoint = this.options.store.transaction(tx => tx.get("checkpoints", `wt04:metadata:${record.id}`));
        const metadata = checkpoint ? mediaCheckpointSchema.parse(JSON.parse(checkpoint.payloadJson)).metadata : undefined;
        return { bytes, mimeType: record.mimeType, metadata };
      } finally {
        this.options.store.transaction(tx => {
          const checkpoint = tx.get("checkpoints", `wt04:metadata:${record.id}`);
          if (!checkpoint) reject("missing resource metadata");
          const payload = mediaCheckpointSchema.parse(JSON.parse(checkpoint.payloadJson));
          payload.readers = payload.readers.filter(id => id !== readerId);
          tx.put("checkpoints", { ...checkpoint, revision: checkpoint.revision + 1, payloadJson: JSON.stringify(payload) }, checkpoint.revision);
        });
      }
    });
  }
  /** Host maintenance: durable readers and shared consumers pin resources. Tombstone commits before unlink. */
  async collect(media: StagedMedia, context: TrustedContext): Promise<boolean> {
    const record = this.options.store.transaction(tx => {
      const stored = tx.get("stagedMedia", media.stagingId);
      if (!stored) return undefined;
      if (!sameScope(stored.scope, context.scope) || stored.principalId !== context.principalId ||
        stored.taskId !== context.taskId || stored.generation !== context.generation) reject("resource scope");
      if (stored.expiresAt === 0) return stored; // Retry a prior interrupted unlink.
      this.authorize(stored, context);
      const checkpoint = tx.get("checkpoints", `wt04:metadata:${stored.id}`);
      if (!checkpoint || mediaCheckpointSchema.parse(JSON.parse(checkpoint.payloadJson)).readers.length || scopeHasConsumers(tx, context.scope)) return undefined;
      tx.put("stagedMedia", { ...stored, expiresAt: 0, revision: stored.revision + 1 }, stored.revision);
      return stored;
    });
    if (!record) return false;
    // UUID-only generated paths; never use a caller's path, even from a corrupted record.
    if (!/^[a-f0-9-]{36}$/.test(record.id)) reject("invalid staged ID");
    await unlink(join(this.directory, `${record.id}.bin`)).catch(error => { if (error.code !== "ENOENT") throw error; });
    return true;
  }
}

import type { ExecutionServices as PublicServices } from "../../contracts/services.js";
import { authorizedMedia, retainResource, cleanExpiredResources, RETAINED, type NoMediaConsumers } from "./retention.js";
import { abortable } from "./safety.js";

import { z } from "zod";
/** Bounded native metadata, stored verbatim as data; never used as a path or downloader input. */
export const resourceMetadataSchema = metadataSchema.extend({ retrieval: z.strictObject({
  guid: z.string().min(1).max(200), fileName: z.string().max(1000), mimeType: z.string().max(100),
  totalBytes: z.number().int().nonnegative().max(MAX_MEDIA_BYTES), uti: z.string().max(200),
  transferState: z.enum(["unknown", "pending", "transferring", "failed", "finished"]),
  isHidden: z.boolean(), isSticker: z.boolean(),
  companionKind: z.enum(["unknown", "live-photo-video"]).optional(), originalGuid: z.string().max(200).optional(),
}).optional() });

/** Trusted host import only; no inline buffers, paths or URLs are accepted by action JSON. */
export type MediaResourceSource =
  | { type: "file"; path: string; metadata: SourceMetadata }
  | { type: "url"; url: string }
  | { type: "native"; attachment: Extract<Media, { kind: "attachment" }> };
export interface GuardedStagingOptions {
  directory: string;
  approvedRoots: readonly string[];
  urls: FetchPolicy;
  services: Pick<PublicServices, "context" | "transaction" | "assertActiveClaim" | "clock" | "signal" | "resolveResource">;
  native: NativeMediaSource;
  maxBytes?: number;
  timeoutMs?: number;
  /** Maximum directory entries, including partial and metadata files; fail closed at capacity. */
  maxDirectoryEntries?: number;
  /** Reuse one capacity across scoped ports in the single host to bound aggregate memory. */
  capacity?: Capacity;
}

/** Public F0 port. Uses only stagedMedia through UnitOfWork, never private execution/checkpoint tables. */
export class GuardedMediaStager implements MediaStager {
  private readonly capacity: Capacity;
  private readonly maxBytes: number;
  private readonly timeoutMs: number;
  private readonly fetchUrl;
  private readonly readers = new Set<string>();
  private constructor(private readonly options: GuardedStagingOptions, private readonly directory: string) {
    this.maxBytes = options.maxBytes ?? MAX_MEDIA_BYTES;
    this.timeoutMs = options.timeoutMs ?? 30000;
    if (!Number.isSafeInteger(this.maxBytes) || this.maxBytes < 1 || this.maxBytes > MAX_MEDIA_BYTES ||
      !Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 120000) reject("invalid limits");
    if (!Number.isSafeInteger(options.maxDirectoryEntries ?? 768) || (options.maxDirectoryEntries ?? 768) < 3 ||
      (options.maxDirectoryEntries ?? 768) > 10000) reject("invalid storage limit");
    this.capacity = options.capacity ?? new Capacity();
    this.fetchUrl = createGuardedFetcher(options.urls);
  }
  /** The directory and its ancestors belong to the trusted runtime OS identity. */
  static async create(options: GuardedStagingOptions): Promise<GuardedMediaStager> {
    options.services.assertActiveClaim();
    await mkdir(options.directory, { recursive: true, mode: 0o700 });
    const directory = await realpath(options.directory), stat = await lstat(directory);
    if (!stat.isDirectory() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()) reject("staging directory must be private");
    options.services.assertActiveClaim();
    return new GuardedMediaStager(options, directory);
  }
  private authorize(context: TrustedContext): void {
    const bound = this.options.services.context;
    if (!sameScope(bound.scope, context.scope) || bound.contextId !== context.contextId ||
      bound.principalId !== context.principalId || bound.taskId !== context.taskId || bound.generation !== context.generation) reject("resource scope");
    this.options.services.assertActiveClaim();
    this.options.services.signal.throwIfAborted();
  }
  private deadline(): AbortSignal {
    return AbortSignal.any([this.options.services.signal, AbortSignal.timeout(this.timeoutMs)]);
  }
  private async bytes(path: string, signal: AbortSignal, limit = this.maxBytes): Promise<Buffer> {
    const file = await openApprovedFile(path, [this.directory]);
    const chunks: Buffer[] = [];
    try {
      if ((await file.stat()).size > limit) reject("byte limit");
      await consume(Readable.toWeb(file.createReadStream({ autoClose: false, highWaterMark: 65536 })), limit, signal,
        async chunk => { chunks.push(Buffer.from(chunk)); });
      return Buffer.concat(chunks);
    } finally { await file.close(); }
  }
  private async storageAvailable(signal: AbortSignal): Promise<void> {
    let count = 0;
    const directory = await opendir(this.directory);
    for await (const _entry of directory) {
      signal.throwIfAborted();
      if (++count >= (this.options.maxDirectoryEntries ?? 768) - 2) reject("staging storage limit");
    }
  }
  /** Imports bounded bytes, fsyncs immutable files, then publishes the descriptor atomically. */
  async stage(source: MediaResourceSource, context = this.options.services.context): Promise<StagedMedia> {
    return this.capacity.run(async () => {
      this.authorize(context);
      const signal = this.deadline();
      await this.storageAvailable(signal); this.authorize(context);
      let stream: MediaStream, metadata: SourceMetadata;
      let close: () => Promise<unknown> = async () => {};
      if (source.type === "file") {
        const file = await openApprovedFile(source.path, this.options.approvedRoots);
        close = () => file.close();
        stream = Readable.toWeb(file.createReadStream({ autoClose: false, highWaterMark: 65536 }));
        metadata = source.metadata;
      } else if (source.type === "url") {
        const download = await this.fetchUrl(source.url, signal);
        close = async () => download.close(); stream = download.stream; metadata = { mimeType: download.mimeType };
      } else if (source.type === "native") {
        assertScope(source.attachment, context.scope);
        const authorized = await abortable(this.options.services.resolveResource(source.attachment), signal);
        if (authorized.kind !== "attachment" || authorized.id !== source.attachment.id || authorized.messageId !== source.attachment.messageId) reject("attachment reference mismatch");
        assertScope(authorized, context.scope); this.authorize(context);
        const opening = this.options.native.open(source.attachment, context, signal);
        opening.then(item => { if (signal.aborted) void item.stream.cancel().catch(() => {}); }).catch(() => {});
        const native = await abortable(opening, signal);
        stream = native.stream; metadata = native.metadata; close = async () => { void stream.cancel().catch(() => {}); };
      } else return reject("invalid source");
      const id = randomUUID(), partial = join(this.directory, `${id}.part`);
      let output: string | undefined, metadataPath: string | undefined, published = false;
      let file: Awaited<ReturnType<typeof open>> | undefined;
      try {
        this.authorize(context); signal.throwIfAborted();
        const meta = resourceMetadataSchema.parse({ ...metadata, version: 1, stagingId: id });
        validMime(meta.mimeType);
        if (meta.source) assertScope(meta.source, context.scope);
        if (source.type === "native" && (!meta.source || meta.source.id !== source.attachment.id || meta.source.messageId !== source.attachment.messageId)) reject("native metadata identity");
        if (meta.size !== undefined && meta.size > this.maxBytes) reject("byte limit");
        file = await open(partial, "wx", 0o600);
        const size = await consume(stream, this.maxBytes, signal, async chunk => {
          let offset = 0;
          while (offset < chunk.length) {
            const { bytesWritten } = await file!.write(chunk, offset, chunk.length - offset);
            if (!bytesWritten) reject("interrupted file write"); offset += bytesWritten;
          }
        });
        await file.sync(); await file.close(); file = undefined;
        const bytes = await this.bytes(partial, signal);
        validateBytes(bytes, meta.mimeType, this.maxBytes);
        if (bytes.length !== size || (meta.size !== undefined && meta.size !== size)) reject("size mismatch");
        const metadataBytes = Buffer.from(JSON.stringify({ ...meta, size }));
        const name = `${id}.${sha256(metadataBytes)}`;
        output = join(this.directory, `${name}.bin`); metadataPath = join(this.directory, `${name}.json`);
        const metadataFile = await open(metadataPath, "wx", 0o600);
        try { await metadataFile.writeFile(metadataBytes); await metadataFile.sync(); } finally { await metadataFile.close(); }
        await rename(partial, output);
        const dir = await open(this.directory, "r"); try { await dir.sync(); } finally { await dir.close(); }
        const media: StagedMedia = { stagingId: id, sha256: sha256(bytes), mimeType: meta.mimeType, bytes: size };
        this.authorize(context); signal.throwIfAborted();
        this.options.services.transaction(unit => {
          this.authorize(context);
          unit.put("stagedMedia", { id, scope: context.scope, revision: 0, principalId: context.principalId,
            taskId: context.taskId, generation: context.generation, relativePath: `${name}.bin`, sha256: media.sha256, mimeType: media.mimeType, bytes: media.bytes,
            expiresAt: RETAINED }, null);
        });
        published = true; return media;
      } finally {
        await file?.close().catch(() => {});
        await close().catch(() => {});
        await unlink(partial).catch(() => {});
        if (!published) {
          if (output) await unlink(output).catch(() => {});
          if (metadataPath) await unlink(metadataPath).catch(() => {});
        }
      }
    });
  }
  /** Frozen MediaStager.resolve for all consumers; native refs are first staged durably. */
  async resolve(media: Media, context: TrustedContext): Promise<ResolvedMedia> {
    this.authorize(context);
    if ("kind" in media) return this.resolve(await this.stage({ type: "native", attachment: media }, context), context);
    return this.capacity.run(async () => {
      this.authorize(context);
      const signal = this.deadline(), reader = randomUUID();
      const row = this.options.services.transaction(unit => {
        retainResource(unit, media, context); return authorizedMedia(unit, media, context);
      });
      const name = this.checkedName(row);
      this.readers.add(reader);
      try {
        const bytes = await this.bytes(join(this.directory, `${name}.bin`), signal);
        if (bytes.length !== media.bytes || sha256(bytes) !== media.sha256) reject("resource integrity");
        validateBytes(bytes, row.mimeType, this.maxBytes);
        const metadataBytes = await this.bytes(join(this.directory, `${name}.json`), signal, 16384);
        if (sha256(metadataBytes) !== name.split(".")[1]) reject("metadata integrity");
        const metadata = resourceMetadataSchema.parse(JSON.parse(metadataBytes.toString("utf8")));
        if (metadata.stagingId !== row.id || metadata.mimeType !== row.mimeType || metadata.size !== row.bytes) reject("metadata mismatch");
        this.authorize(context); signal.throwIfAborted();
        return { bytes, mimeType: row.mimeType, metadata };
      } finally { this.readers.delete(reader); }
    });
  }
  private checkedName(row: StagedMediaRecord): string {
    const match = /^([a-f0-9-]{36})\.([a-f0-9]{64})\.bin$/.exec(row.relativePath);
    if (!match || match[1] !== row.id) return reject("invalid staged path");
    return row.relativePath.slice(0, -4);
  }
  /** Runtime maintenance must fence other processes/readers and action admission in noConsumers. */
  async clean(media: StagedMedia, noConsumers?: NoMediaConsumers): Promise<boolean> {
    const { services } = this.options; this.authorize(services.context);
    const row = services.transaction(unit => {
      if (this.readers.size) return undefined;
      const record = authorizedMedia(unit, media, services.context); this.checkedName(record);
      return cleanExpiredResources(unit, media, services.context, services.clock.now(), noConsumers);
    });
    if (!row) return false;
    const name = this.checkedName(row);
    for (const suffix of ["bin", "json"]) await unlink(join(this.directory, `${name}.${suffix}`)).catch(error => {
      if (error.code !== "ENOENT") throw error;
    });
    return true;
  }
}
/** Host-only import entry point; consumer features only receive the frozen resolve port. */
export function stageMediaResource(stager: GuardedMediaStager, source: MediaResourceSource): Promise<StagedMedia> {
  return stager.stage(source);
}
/** Rechecks the public claim around every await without requiring sibling private imports. */
export async function resolveMediaResource(media: Media, services: PublicServices): Promise<ResolvedMedia> {
  services.assertActiveClaim(); services.signal.throwIfAborted();
  if ("kind" in media) {
    const ref = await services.resolveResource(media);
    if (ref.kind !== "attachment" || ref.id !== media.id || ref.messageId !== media.messageId) reject("attachment reference mismatch");
    assertScope(ref, services.context.scope); services.assertActiveClaim();
  } else services.transaction(unit => retainResource(unit, media, services.context));
  const resolved = await services.media.resolve(media, services.context);
  services.assertActiveClaim(); services.signal.throwIfAborted();
  validateBytes(resolved.bytes, resolved.mimeType);
  return resolved;
}

/** Host composition shares this capacity across every scoped staging port. */
export function createMediaResourceCapacity(maximum = 4): Capacity { return new Capacity(maximum); }
