import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, readdir, writeFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { SQLiteStore } from "../../../src/state/sqlite.js";
import { makeServices } from "../../fixtures/runtime-services.js";
import type { ExecutionServices } from "../../../src/contracts/services.js";
import type { UnitOfWork } from "../../../src/contracts/store.js";
import { GuardedMediaStager, type NativeMediaSource } from "../../../src/features/media/staging.js";
import { releaseResource, RETAINED } from "../../../src/features/media/retention.js";
import { Capacity, consume } from "../../../src/features/media/safety.js";
import { fetchApprovedResource, createGuardedFetcher, type PinnedRequest } from "../../../src/features/media/guarded-fetch.js";

const stream = (bytes: Uint8Array) => new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes); c.close(); } });

async function diskFixture(native?: NativeMediaSource, limits: { maxBytes?: number; timeoutMs?: number; capacity?: Capacity } = {}) {
  await mkdir(resolve(".photon-local"), { recursive: true });
  const directory = await mkdtemp(resolve(".photon-local/wt04-restart-")), path = join(directory, "state.sqlite");
  let store = new SQLiteStore(path);
  const f = makeServices(), context = f.services.context;
  const ref = { version: 1 as const, kind: "attachment" as const, id: "native", messageId: "parent", scope: context.scope };
  f.resources.set(ref.id, ref);
  const bytes = Buffer.from("restart fixture");
  // Test adapter restricts the existing durable store to the exact public domain surface.
  const transaction = ((run: (unit: UnitOfWork) => unknown) => store.transaction(tx => run({
    get: tx.get.bind(tx), put: tx.put.bind(tx), createContinuation() { throw new Error("unused"); },
  }))) as ExecutionServices["transaction"];
  const services: ExecutionServices = { ...f.services, transaction };
  const config = { services, directory: join(directory, "staging"), approvedRoots: [directory], urls: { approvedHosts: [] }, ...limits,
    native: native ?? { async open() { return { stream: stream(bytes), metadata: { mimeType: "text/plain", name: "original.txt", size: bytes.length,
      duration: 1.25, source: ref, providerHandle: "provider-native", providerMessageId: "provider-parent", providerConversationId: "provider-chat",
      retrieval: { guid: "provider-native", fileName: "original.txt", mimeType: "text/plain", totalBytes: bytes.length,
        transferState: "finished", uti: "public.plain-text", isSticker: false, isHidden: false } } }; } } };
  const media = await GuardedMediaStager.create(config);
  return { directory, ref, config, media, services, bytes,
    async restart() { store.close(); store = new SQLiteStore(path); return GuardedMediaStager.create(config); },
    async close() { store.close(); await rm(directory, { recursive: true, force: true }); } };
}

test("shared SQLite resources and native metadata survive restart without private checkpoints", async () => {
  const f = await diskFixture();
  try {
    const media = await f.media.stage({ type: "native", attachment: f.ref });
    const restarted = await f.restart();
    const result = await restarted.resolve(media, f.services.context);
    assert.deepEqual(result.bytes, f.bytes);
    assert.equal(result.metadata?.name, "original.txt"); assert.equal(result.metadata?.duration, 1.25);
    assert.deepEqual(result.metadata?.source, f.ref); assert.equal(result.metadata?.providerHandle, "provider-native");
    assert.equal(result.metadata?.retrieval?.uti, "public.plain-text");
    assert.equal(f.services.transaction(unit => unit.get("stagedMedia", media.stagingId))?.expiresAt, RETAINED);
    assert.equal(await restarted.clean(media), false);
    assert.deepEqual((await restarted.resolve(media, f.services.context)).bytes, f.bytes);
  } finally { await f.close(); }
});

test("retention release and tombstone retries require quiescence and reject subsequent reads", async () => {
  const f = await diskFixture();
  try {
    const media = await f.media.stage({ type: "native", attachment: f.ref });
    const reading = f.media.resolve(media, f.services.context);
    assert.equal(await f.media.clean(media, () => true), false);
    await reading;
    assert.equal(f.services.transaction(unit => releaseResource(unit, media, f.services.context, 1)), false);
    f.services.transaction(unit => releaseResource(unit, media, f.services.context, 1, () => true));
    assert.equal(await f.media.clean(media, () => false), false);
    assert.equal(await f.media.clean(media, () => true), true);
    await assert.rejects(f.media.resolve(media, f.services.context), /released/);
    const restarted = await f.restart(); assert.equal(await restarted.clean(media), true);
    assert.deepEqual(await readdir(f.config.directory), []);
  } finally { await f.close(); }
});

test("metadata corruption cannot silently alter identity after durable staging", async () => {
  const f = await diskFixture();
  try {
    const media = await f.media.stage({ type: "native", attachment: f.ref });
    const files = await readdir(f.config.directory), name = files.find(n => n.endsWith(".json"))!;
    const path = join(f.config.directory, name), original = await readFile(path, "utf8");
    await writeFile(path, original.replace("original.txt", "modified.txt"));
    await assert.rejects(f.media.resolve(media, f.services.context), /metadata integrity/);
  } finally { await f.close(); }
});

for (const failure of ["timeout", "oversize", "interrupted"] as const) test(`public staging ${failure} removes partial resources and survives restart`, async () => {
  let cancelled = false;
  const input = new ReadableStream<Uint8Array>({ start(c) {
    c.enqueue(Buffer.alloc(failure === "oversize" ? 101 : 1));
    if (failure === "interrupted") setTimeout(() => c.error(new Error("interrupted")), 5);
  }, cancel() { cancelled = true; } });
  const f = await diskFixture({ async open(ref) { return { stream: input, metadata: { mimeType: "application/octet-stream", source: ref } }; } }, { maxBytes: 100, timeoutMs: 40 });
  const alive = setTimeout(() => {}, 200);
  try {
    await assert.rejects(f.media.stage({ type: "native", attachment: f.ref }));
    assert.deepEqual(await readdir(f.config.directory), []);
    if (failure !== "interrupted") assert.equal(cancelled, true);
    await f.restart(); assert.deepEqual(await readdir(f.config.directory), []);
  } finally { clearTimeout(alive); await f.close(); }
});

test("shared capacity rejects a second scoped import while the first is active", async () => {
  let finish!: () => void, opened!: () => void;
  const ready = new Promise<void>(done => { opened = done; });
  const f = await diskFixture({ async open(ref) { return { metadata: { mimeType: "text/plain", source: ref },
    stream: new ReadableStream<Uint8Array>({ start(c) { finish = () => { c.enqueue(Buffer.from("ok")); c.close(); }; opened(); } }) }; } }, { capacity: new Capacity(1) });
  try {
    const first = f.media.stage({ type: "native", attachment: f.ref });
    const other = await GuardedMediaStager.create(f.config);
    await assert.rejects(other.stage({ type: "native", attachment: f.ref }), /concurrency/);
    await ready; finish(); await first;
  } finally { await f.close(); }
});

const policy = { approvedHosts: ["fixture.example", "redirect.example"] };
const publicAddress = { address: "93.184.216.34", family: 4 };
const url = "https://fixture.example/media";

test("guarded bounded fetch counts real bytes despite misleading length claims", async () => {
  let closed = 0;
  const response = await fetchApprovedResource(url, policy, new AbortController().signal, { maxBytes: 100 }, {
    lookup: async () => [publicAddress], request: async () => ({ status: 200, mimeType: "application/octet-stream",
      headers: { "content-length": "1" }, stream: stream(Buffer.alloc(101)), close() { closed++; } }),
  });
  await assert.rejects(consume(response.stream, 1000, AbortSignal.timeout(1000), async () => {}), /byte limit/);
  assert.equal(closed, 1);
});

test("guarded fetch retains slots for unread bodies and releases all on abort", async () => {
  const controller = new AbortController(), responses = [];
  const dependencies = { lookup: async () => [publicAddress], request: (async () => ({ status: 200, mimeType: "text/plain",
    stream: stream(Buffer.from("ok")), close() {} })) satisfies PinnedRequest };
  try {
    for (let i = 0; i < 4; i++) responses.push(await fetchApprovedResource(url, policy, controller.signal, {}, dependencies));
    await assert.rejects(fetchApprovedResource(url, policy, controller.signal, {}, dependencies), /concurrency/);
    controller.abort();
    const next = await fetchApprovedResource(url, policy, new AbortController().signal, {}, dependencies); next.close();
  } finally { for (const response of responses) response.close(); }
});

test("late network resolution after a timeout closes the abandoned response", async () => {
  let finish!: (response: Awaited<ReturnType<PinnedRequest>>) => void, closed = 0;
  const fetch = createGuardedFetcher(policy, { lookup: async () => [publicAddress], request: () => new Promise(done => { finish = done; }) });
  const controller = new AbortController(), pending = fetch(url, controller.signal);
  await new Promise<void>(done => setImmediate(done)); controller.abort();
  await assert.rejects(pending);
  finish({ status: 200, mimeType: "text/plain", stream: stream(Buffer.from("ok")), close() { closed++; } });
  await new Promise<void>(done => setImmediate(done)); assert.equal(closed, 1);
});

test("every redirect re-resolves addresses and rejects mixed public/private DNS before connecting", async () => {
  let requests = 0, lookups = 0, closed = 0;
  const fetch = createGuardedFetcher(policy, { lookup: async () => ++lookups === 1 ? [publicAddress] : [publicAddress, { address: "169.254.169.254", family: 4 }],
    request: async () => { requests++; return { status: 302, location: "https://redirect.example/a", mimeType: "text/plain",
      stream: stream(Buffer.from("redirect")), close() { closed++; } }; } });
  await assert.rejects(fetch(url, AbortSignal.timeout(1000)), /nonpublic/);
  assert.equal(requests, 1); assert.equal(closed, 1);
});


test("staging directory capacity bounds retained and abandoned files", async () => {
  const f = await diskFixture();
  try {
    const stager = await GuardedMediaStager.create({ ...f.config, maxDirectoryEntries: 3 });
    await stager.stage({ type: "native", attachment: f.ref });
    await assert.rejects(stager.stage({ type: "native", attachment: f.ref }), /storage limit/);
    assert.equal((await readdir(f.config.directory)).length, 2);
  } finally { await f.close(); }
});

test("bounded fetch times out a stalled body and closes the transport", async () => {
  let closed = false;
  const alive = setTimeout(() => {}, 200);
  try {
    const response = await fetchApprovedResource(url, policy, new AbortController().signal, { timeoutMs: 25 }, {
      lookup: async () => [publicAddress], request: async () => ({ status: 200, mimeType: "text/plain",
        stream: new ReadableStream<Uint8Array>(), close() { closed = true; } }),
    });
    await assert.rejects(consume(response.stream, 100, AbortSignal.timeout(1000), async () => {}));
    assert.equal(closed, true);
  } finally { clearTimeout(alive); }
});
