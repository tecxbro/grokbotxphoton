import test from "node:test";
import assert from "node:assert/strict";
import { writeFile, readFile, readdir, symlink, link, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { fixture, png, stream, context, claim, scope, attachmentRef, spaceRef } from "./helpers.js";
import { SafeMediaStager, assertActionMediaAvailable } from "../../../src/features/media/index.js";
import { openApprovedFile } from "../../../src/features/media/file-access.js";
import { parseAction, type Action } from "../../../src/index.js";
import { scopeHasConsumers } from "../../../src/features/media/retention.js";

const action = (media: unknown): Action => parseAction({ version: 1, idempotencyKey: "request-media", contextId: context.contextId, operation: "attachment.send", arguments: { space: spaceRef, media } });

test("staging persists integrity, metadata and scoped references across service restart", async () => {
  const f = await fixture();
  try {
    const path = join(f.input, "pixel.png"); await writeFile(path, png);
    const media = await f.media.stageFile(path, { name: "pixel.png", mimeType: "image/png", size: png.length }, context, claim);
    const restarted = await SafeMediaStager.create(f.config);
    const resolved = await restarted.resolve(media, context);
    assert.deepEqual(resolved.bytes, png); assert.equal(resolved.metadata?.name, "pixel.png");
    assert.equal(f.store.transaction(tx => tx.get("stagedMedia", media.stagingId))?.sha256, media.sha256);
    await assert.rejects(restarted.resolve(media, { ...context, scope: { ...scope, lineId: "another" } }), /scope/);
    await assert.rejects(restarted.resolve({ ...media, sha256: "a".repeat(64) }, context), /mismatch/);
    await writeFile(join(f.staging, `${media.stagingId}.bin`), Buffer.concat([png, Buffer.from("tamper")]));
    await assert.rejects(restarted.resolve(media, context), /integrity/);
  } finally { f.close(); }
});

test("missing files, traversal, symlinks, hardlinks and a swap during open are rejected", async () => {
  const f = await fixture();
  try {
    const target = join(f.input, "target"), outside = join(f.dir, "secret");
    await writeFile(target, png); await writeFile(outside, "secret");
    await assert.rejects(openApprovedFile(join(f.input, "missing"), [f.input]));
    await assert.rejects(openApprovedFile(`${f.input}/../secret`, [f.input]), /invalid path/);
    await assert.rejects(openApprovedFile(outside, [f.input]), /outside/);
    const alias = join(f.input, "alias"); await symlink(target, alias);
    await assert.rejects(openApprovedFile(alias, [f.input]), /symlink/);
    await unlink(alias); await link(outside, alias);
    await assert.rejects(openApprovedFile(alias, [f.input]), /private regular file/);
    await unlink(alias);
    await assert.rejects(openApprovedFile(target, [f.input], async () => {
      await rename(target, `${target}.old`); await symlink(outside, target);
    }));
    assert.equal(await readFile(outside, "utf8"), "secret");
  } finally { f.close(); }
});

test("an already-open approved handle cannot be retargeted by a subsequent path swap", async () => {
  const f = await fixture();
  try {
    const path = join(f.input, "source"), outside = join(f.dir, "secret");
    await writeFile(path, png); await writeFile(outside, "secret");
    const file = await openApprovedFile(path, [f.input]);
    try { await rename(path, `${path}.old`); await symlink(outside, path); assert.deepEqual(await file.readFile(), png); }
    finally { await file.close(); }
  } finally { f.close(); }
});

test("invalid MIME, mismatched signatures and oversized files leave no partial resources", async () => {
  const f = await fixture({ maxBytes: 100 });
  try {
    const file = join(f.input, "file"); await writeFile(file, "not audio");
    await assert.rejects(f.media.stageFile(file, { mimeType: "bad/mime" }, context, claim));
    await assert.rejects(f.media.stageFile(file, { mimeType: "audio/mp4" }, context, claim), /signature/);
    await writeFile(file, Buffer.alloc(101));
    await assert.rejects(f.media.stageFile(file, { mimeType: "application/octet-stream" }, context, claim), /limit/);
    assert.deepEqual(await readdir(f.staging), []);
  } finally { f.close(); }
});

test("native metadata preserves source, stable ID, duration and retrieval handle", async () => {
  const f = await fixture({ native: { open: async ref => ({ stream: stream(png), metadata: { mimeType: "image/png", name: "photo.png", source: ref, providerHandle: "native-handle", size: png.length, duration: 1.25 } }) } });
  try {
    const media = await f.media.stageNative(attachmentRef, context, claim);
    const result = await f.media.resolve(media, context);
    assert.equal(result.metadata?.providerHandle, "native-handle");
    assert.equal(result.metadata?.duration, 1.25);
    assert.deepEqual(result.metadata?.source, attachmentRef);
  } finally { f.close(); }
});

for (const mode of ["oversize", "interrupted", "timeout"] as const) test(`native ${mode} cancels and removes partial files`, async () => {
  let cancelled = false;
  const input = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(Buffer.alloc(mode === "oversize" ? 101 : 1));
    if (mode === "interrupted") setTimeout(() => controller.error(new Error("interrupted")), 2);
  }, cancel() { cancelled = true; } });
  const f = await fixture({ maxBytes: 100, timeoutMs: 30, native: { open: async () => ({ stream: input, metadata: { mimeType: "application/octet-stream" } }) } });
  const keepAlive = setTimeout(() => {}, 100);
  try {
    await assert.rejects(f.media.stageNative(attachmentRef, context, claim));
    assert.deepEqual(await readdir(f.staging), []);
    if (mode !== "interrupted") assert.equal(cancelled, true);
  } finally { clearTimeout(keepAlive); f.close(); }
});

test("queued, retryable, accepted and unknown requests retain resources until final release", async () => {
  const f = await fixture();
  try {
    const media = await f.media.stageNative(attachmentRef, context, claim), request = action(media); f.seed(request);
    f.clock.advance(86400001);
    for (const status of ["queued", "blocked", "provider-accepted", "unknown-outcome"] as const) {
      f.store.transaction(tx => { const row = tx.get("outbox", request.idempotencyKey)!; tx.put("outbox", { ...row, revision: row.revision + 1, result: { ...row.result, status } }, row.revision); });
      assert.equal(await f.media.collect(media, context), false);
      assert.deepEqual((await f.media.resolve(media, context)).bytes, png);
    }
    f.store.transaction(tx => { const row = tx.get("outbox", request.idempotencyKey)!; tx.put("outbox", { ...row, revision: row.revision + 1, result: { ...row.result, status: "observed-read" } }, row.revision); });
    assert.equal(await f.media.collect(media, context), true);
    await assert.rejects(f.media.resolve(media, context), /released/);
    assert.throws(() => f.store.transaction(tx => assertActionMediaAvailable(tx, request, context)), /unavailable/);
    assert.deepEqual(await readdir(f.staging), []);
    assert.equal(await f.media.collect(media, context), true);
    await assert.rejects(f.media.collect(media, { ...context, principalId: "another" }), /scope/);
  } finally { f.close(); }
});

test("durable read pins prevent cleanup by another instance and survive crashes conservatively", async () => {
  const f = await fixture();
  try {
    const media = await f.media.stageNative(attachmentRef, context, claim);
    const other = await SafeMediaStager.create(f.config);
    const reading = f.media.resolve(media, context);
    assert.equal(await other.collect(media, context), false);
    await reading;
    const id = `wt04:metadata:${media.stagingId}`;
    f.store.transaction(tx => { const row = tx.get("checkpoints", id)!; const payload = JSON.parse(row.payloadJson); payload.readers = [randomUUID()]; tx.put("checkpoints", { ...row, revision: row.revision + 1, payloadJson: JSON.stringify(payload) }, row.revision); });
    assert.equal(await other.collect(media, context), false);
  } finally { f.close(); }
});

test("unresolved input and truncated shared scans fail closed for retention", async () => {
  const f = await fixture();
  try {
    f.store.transaction(tx => tx.put("unresolved", { id: "unresolved", scope, revision: 0, eventId: "unknown-event", reason: "unsupported", checkpointId: null }, null));
    assert.equal(f.store.transaction(tx => scopeHasConsumers(tx, scope)), true);
    const media = await f.media.stageNative(attachmentRef, context, claim);
    assert.equal(await f.media.collect(media, context), false);
  } finally { f.close(); }
});

test("concurrency rejects excess work without an unbounded queue", async () => {
  let release!: () => void;
  const paused = new ReadableStream<Uint8Array>({ start(controller) { release = () => { controller.enqueue(png); controller.close(); }; } });
  const f = await fixture({ concurrency: 1, native: { open: async () => ({ stream: paused, metadata: { mimeType: "image/png" } }) } });
  try {
    const first = f.media.stageNative(attachmentRef, context, claim);
    await assert.rejects(f.media.stageNative(attachmentRef, context, claim), /concurrency/);
    release(); await first;
  } finally { f.close(); }
});

test("a saturated outbox scan blocks cleanup even if its visible prefix is final", async () => {
  const f = await fixture();
  try {
    f.store.transaction(tx => {
      for (let index = 0; index < 1000; index++) {
        const id = `final-${index}`;
        tx.put("outbox", { id, scope, revision: 0, action: parseAction({ version: 1, idempotencyKey: id, contextId: context.contextId, operation: "contact.send", arguments: { space: spaceRef, contact: { name: "Ada", phones: [], emails: [] } } }),
          principalId: context.principalId, taskId: context.taskId, generation: 1, argumentDigest: "test", claim: null,
          cancellationRequestedAt: null, result: { version: 1, requestId: id, status: "observed-read", revision: 0, updatedAt: 10000, references: [], observations: [] } }, null);
      }
    });
    assert.equal(f.store.transaction(tx => scopeHasConsumers(tx, scope)), true);
  } finally { f.close(); }
});

test("ancestor directory replacement between inspection and open cannot redirect a file read", async () => {
  const { mkdir } = await import("node:fs/promises");
  const f = await fixture();
  try {
    const inside = join(f.input, "nested"), outside = join(f.dir, "outside");
    await mkdir(inside); await mkdir(outside);
    await writeFile(join(inside, "file"), png); await writeFile(join(outside, "file"), "secret");
    await assert.rejects(openApprovedFile(join(inside, "file"), [f.input], async () => {
      await rename(inside, `${inside}.old`); await symlink(outside, inside);
    }), /changed during open/);
    assert.equal(await readFile(join(outside, "file"), "utf8"), "secret");
  } finally { f.close(); }
});

test("generic files, images, video, audio and vCard resources retain their MIME", async () => {
  const f = await fixture();
  try {
    const samples = [
      ["text/plain", Buffer.from("hello")], ["application/octet-stream", Buffer.from([0,1,2])],
      ["application/pdf", Buffer.from("%PDF-1.4\n%%EOF")], ["image/jpeg", Buffer.from([255,216,255,217])],
      ["video/mp4", Buffer.from([0,0,0,12,102,116,121,112,105,115,111,109])],
      ["audio/wav", Buffer.from("RIFF0000WAVE0000")],
      ["text/vcard", Buffer.from("BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ada\r\nEND:VCARD\r\n")],
    ] as const;
    for (const [mimeType, bytes] of samples) {
      const path = join(f.input, "sample"); await writeFile(path, bytes);
      const media = await f.media.stageFile(path, { mimeType }, context, claim);
      const result = await f.media.resolve(media, context); assert.equal(result.mimeType, mimeType); assert.deepEqual(result.bytes, bytes);
    }
  } finally { f.close(); }
});
