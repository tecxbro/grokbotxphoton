import test from "node:test";
import assert from "node:assert/strict";
import { createServer, get } from "node:http";
import { Readable } from "node:stream";
import { once } from "node:events";
import { approvedUrl, createGuardedFetcher, isPublicAddress } from "../../../src/features/media/guarded-fetch.js";
import { consume } from "../../../src/features/media/safety.js";
import { stream } from "./helpers.js";
const policy = { approvedHosts: ["media.example", "next.example"] };
const publicAddress = { address: "93.184.216.34", family: 4 };

test("rejects credentials, schemes, literals, ports, deceptive hosts and metadata URLs", () => {
  for (const url of ["file:///etc/passwd", "http://media.example/a", "data:text/plain,a", "https://user:secret@media.example/a", "https://media.example:444/a", "https://169.254.169.254/latest/meta-data", "https://[::1]/a", "https://media.example.evil/a", "https://media.example./a"]) {
    assert.throws(() => approvedUrl(url, policy));
  }
  assert.equal(approvedUrl("https://media.example/photo.png", policy).hostname, "media.example");
});

test("address policy rejects private, mapped, metadata, multicast and transition networks", () => {
  for (const address of ["0.0.0.0", "10.0.0.1", "127.0.0.1", "100.64.1.1", "169.254.169.254", "172.31.0.1", "192.168.0.1", "192.0.0.1", "198.19.0.1", "224.0.0.1", "255.255.255.255", "::1", "::", "::ffff:127.0.0.1", "::ffff:7f00:1", "fe80::1", "fc00::1", "2002:7f00:1::", "2001::1", "2001:db8::1", "3fff::1", "bad"]) assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress(publicAddress.address), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
});

test("the connection receives the validated address without a second DNS lookup", async () => {
  let lookups = 0, requests = 0;
  const fetcher = createGuardedFetcher(policy, {
    lookup: async () => ++lookups === 1 ? [publicAddress] : [{ address: "127.0.0.1", family: 4 }],
    request: async (url, pinned) => {
      requests++; assert.equal(url.hostname, "media.example"); assert.deepEqual(pinned, publicAddress);
      return { status: 200, mimeType: "text/plain", stream: stream(Buffer.from("ok")), close() {} };
    },
  });
  const response = await fetcher("https://media.example/file", AbortSignal.timeout(1000)); response.close();
  assert.equal(lookups, 1); assert.equal(requests, 1);
});

test("redirects are reauthorized and address changes to private destinations stop before connection", async () => {
  let lookups = 0, requests = 0, closed = 0;
  const fetcher = createGuardedFetcher(policy, {
    lookup: async () => ++lookups === 1 ? [publicAddress] : [{ address: "169.254.169.254", family: 4 }],
    request: async () => { requests++; return { status: 302, location: "https://next.example/file", mimeType: "", stream: stream(Buffer.from("redirect")), close() { closed++; } }; },
  });
  await assert.rejects(fetcher("https://media.example/file", AbortSignal.timeout(1000)), /nonpublic/);
  assert.equal(requests, 1); assert.equal(closed, 1);
});

test("private answers in a mixed DNS set and direct private redirects are rejected", async () => {
  let requests = 0;
  const fetcher = createGuardedFetcher(policy, { lookup: async () => [publicAddress, { address: "::ffff:a00:1", family: 6 }], request: async () => { requests++; throw new Error("unexpected"); } });
  await assert.rejects(fetcher("https://media.example/file", AbortSignal.timeout(1000)), /nonpublic/);
  assert.equal(requests, 0);
  const redirected = createGuardedFetcher(policy, { lookup: async () => [publicAddress], request: async () => ({ status: 302, location: "https://127.0.0.1/secret", mimeType: "", stream: stream(Buffer.from("r")), close() {} }) });
  await assert.rejects(redirected("https://media.example/file", AbortSignal.timeout(1000)), /URL not approved/);
});

test("DNS lookup timeout and redirect loops are bounded", async () => {
  const keepAlive = setTimeout(() => {}, 100);
  try {
    const stalled = createGuardedFetcher(policy, { lookup: () => new Promise(() => {}) });
    await assert.rejects(stalled("https://media.example/file", AbortSignal.timeout(20)), /timed out/);
    let requests = 0;
    const loop = createGuardedFetcher({ ...policy, maxRedirects: 2 }, { lookup: async () => [publicAddress], request: async () => { requests++; return { status: 302, location: "/same", mimeType: "", stream: stream(Buffer.from("r")), close() {} }; } });
    await assert.rejects(loop("https://media.example/file", AbortSignal.timeout(1000)), /redirect limit/);
    assert.equal(requests, 3);
  } finally { clearTimeout(keepAlive); }
});

for (const mode of ["missing-length", "claimed-large", "interrupted", "timeout"] as const) test(`local download ${mode} remains bounded`, async () => {
  const server = createServer((_req, res) => {
    res.setHeader("Content-Type", "application/octet-stream");
    if (mode === "claimed-large") res.setHeader("Content-Length", "999999999");
    if (mode === "missing-length" || mode === "claimed-large") { res.write(Buffer.alloc(80)); res.end(Buffer.alloc(80)); }
    else if (mode === "interrupted") { res.write(Buffer.alloc(1)); setTimeout(() => res.destroy(new Error("test interruption")), 5); }
    else res.write(Buffer.alloc(1));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert(address && typeof address === "object");
  let read = 0;
  try {
    const response = await new Promise<import("node:http").IncomingMessage>((resolve, reject) => { const request = get(`http://127.0.0.1:${address.port}/`, resolve); request.on("error", reject); });
    await assert.rejects(consume(Readable.toWeb(response), 100, AbortSignal.timeout(40), async chunk => { read += chunk.length; }));
    assert(read <= 100);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("a lying content length never substitutes for actual stream byte accounting", async () => {
  // A transport may expose chunks inconsistent with its header; the consumer ignores claimed lengths.
  const response = { headers: { "content-length": "1" }, stream: stream(Buffer.alloc(120), 17) };
  let written = 0;
  await assert.rejects(consume(response.stream, 100, AbortSignal.timeout(1000), async chunk => { written += chunk.length; }), /byte limit/);
  assert(written <= 100);
});

test("the actual HTTPS adapter pins lookup and rejects a changed connected peer", async () => {
  const { createPinnedRequest } = await import("../../../src/features/media/guarded-fetch.js");
  const { EventEmitter } = await import("node:events");
  let destroyed = false;
  const mockRequest = ((_url: URL, options: import("node:https").RequestOptions, callback: (response: import("node:http").IncomingMessage) => void) => {
    assert.equal(options.agent, false); assert.equal(options.servername, "media.example");
    // No new system DNS query can occur; both Node lookup forms use the validated address.
    const lookup = options.lookup as (host: string, opts: object, cb: (...args: unknown[]) => void) => void;
    lookup("media.example", { all: true }, (error, addresses) => { assert.equal(error, null); assert.deepEqual(addresses, [publicAddress]); });
    lookup("media.example", {}, (error, address, family) => { assert.equal(error, null); assert.equal(address, publicAddress.address); assert.equal(family, 4); });
    const request = Object.assign(new EventEmitter(), {
      end() { queueMicrotask(() => callback({ socket: { remoteAddress: "127.0.0.1" }, destroy() { destroyed = true; } } as unknown as import("node:http").IncomingMessage)); },
      destroy() { destroyed = true; },
    });
    return request;
  }) as unknown as typeof import("node:https").request;
  await assert.rejects(createPinnedRequest(mockRequest)(new URL("https://media.example/file"), publicAddress, AbortSignal.timeout(1000)), /ADDRESS_CHANGED/);
  assert.equal(destroyed, true);
});
