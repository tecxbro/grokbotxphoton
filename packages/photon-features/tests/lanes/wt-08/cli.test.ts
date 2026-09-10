import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { writeFileSync, chmodSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { run, readJson } from '../../../src/cli/main.js';
import { commandRequest } from '../../../src/cli/commands.js';
import { localRequest, validateResponse } from '../../../src/cli/local-client.js';
import { responseExit } from '../../../src/cli/output.js';
import { LocalProtocol, listenLocal, foundationCapabilities, type ProtocolServices } from '../../../src/index.js';
import { storeFixture, seedHandoff, context, principal, FixedClock, queued } from '../../fixtures/harness.js';
const action = JSON.parse(readFileSync(new URL('../../../../tests/fixtures/text.send.json', import.meta.url), 'utf8')).valid;
async function fixture() {
  const f = storeFixture(); chmodSync(f.dir, 0o700); seedHandoff(f.store);
  const socket = join(f.dir, 'runtime.sock'), credentialFile = join(f.dir, 'credential');
  const token = 'a'.repeat(64); writeFileSync(credentialFile, token, { mode: 0o600 });
  let mutations = 0;
  const clock = new FixedClock();
  const services: ProtocolServices = { store: f.store, clock,
    contexts: { resolve: async () => structuredClone(context), authorize: async () => {} },
    submission: { submit: async () => { mutations++; return queued(); },
      status: async (id, c) => { if (id !== 'request-1' || c.principalId !== principal.id) throw new Error('FORBIDDEN'); return queued(); },
      cancel: async () => { mutations++; return { ...queued(), status: 'cancelled' }; } },
    capabilities: foundationCapabilities, diagnostics: () => ({ ready: false, activation: 'disabled' }) };
  const listener = await listenLocal(socket, [{ token, principal }], new LocalProtocol(services));
  const env = { GROK_PHOTON_SOCKET: socket, GROK_PHOTON_CREDENTIAL_FILE: credentialFile, GROK_PHOTON_CONTEXT_ID: context.contextId };
  async function cli(args: string[], input = '') {
    let stdout = '', stderr = '';
    const exit = await run(args, env, Readable.from([input]), { write: (s: any) => { stdout += s; return true; } }, { write: (s: any) => { stderr += s; return true; } });
    assert.equal(stdout.trim().split('\n').length, 1);
    assert.ok(!stdout.includes(token) && !stderr.includes(token));
    return { exit, stdout, stderr, result: JSON.parse(stdout) };
  }
  return { ...f, services, cli, clock, socket, credentialFile, token, mutations: () => mutations,
    close: async () => { await listener.close(); f.close(); } };
}
test('strict stdin, UTF-8 and bounds; stable exit and separate output', async () => {
  const f = await fixture();
  try {
    for (const input of ['{', '{}{}', 'null', JSON.stringify({ ...action, token: 'secret' }), JSON.stringify({ ...action, arguments: { ...action.arguments, extra: true } })]) {
      const r = await f.cli(['execute', '--json-stdin'], input); assert.equal(r.exit, 2); assert.equal(r.result.error.code, 'INVALID_REQUEST'); assert.ok(r.stderr);
    }
    assert.equal((await f.cli(['execute', '--json-stdin'], ' '.repeat(262145))).exit, 2);
    await assert.rejects(readJson(Readable.from([Buffer.from([0xff])])), /INVALID_REQUEST/);
    assert.equal((await f.cli(['execute', '--json-stdin'], JSON.stringify(action))).exit, 0);
    assert.equal(f.mutations(), 1);
    assert.equal((await f.cli(['execute', '--json-stdin'], JSON.stringify({ ...action, contextId: 'another' }))).exit, 4);
    for (const args of [['status', '--json'], ['doctor', '--json', '--recipient', 'someone'], ['doctor', '--json', '--json'], ['work.list', '--json', '--limit', '1e2'], ['execute', '--json-stdin', '--token', 'x']]) assert.equal((await f.cli(args, JSON.stringify(action))).exit, 2);
  } finally { await f.close(); }
});
test('doctor and capabilities read-only; scoped authenticated status and cancellation', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.cli(['doctor', '--json'])).exit, 3);
    const discovery = await f.cli(['capabilities', '--json']); assert.equal(discovery.exit, 0); assert.equal(discovery.result.result.length, 44);
    assert.equal((await f.cli(['status', '--request-id', 'guessed', '--json'])).exit, 4);
    assert.equal((await f.cli(['status', '--request-id', 'request-1', '--json'])).exit, 0);
    assert.equal(f.mutations(), 0);
    assert.equal((await f.cli(['cancel', '--request-id', 'request-1', '--json'])).exit, 5);
    writeFileSync(f.credentialFile, 'b'.repeat(64));
    assert.equal((await f.cli(['status', '--request-id', 'request-1', '--json'])).exit, 4);
  } finally { await f.close(); }
});
test('work list, claim, actual events, heartbeat, stale fence, ack and generation', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.cli(['work.list', '--json'])).result.result.work.length, 1);
    const claim = await f.cli(['work.claim', '--handoff-id', 'handoff-1', '--lease-ms', '1000', '--json']);
    assert.equal(claim.result.result.events[0].eventId, 'event-1');
    const fence = String(claim.result.result.handoff.claim.fence);
    assert.equal((await f.cli(['work.heartbeat', '--handoff-id', 'handoff-1', '--fence', fence, '--lease-ms', '1000', '--json'])).exit, 0);
    f.clock.advance(1001);
    assert.equal((await f.cli(['work.ack', '--handoff-id', 'handoff-1', '--fence', fence, '--json'])).result.error.code, 'STALE_FENCE');
    const next = await f.cli(['work.claim', '--handoff-id', 'handoff-1', '--lease-ms', '1000', '--json']);
    assert.equal((await f.cli(['work.ack', '--handoff-id', 'handoff-1', '--fence', String(next.result.result.handoff.claim.fence), '--json'])).exit, 0);
    assert.equal((await f.cli(['work.list', '--json'])).result.result.work.length, 0);
    f.services.contexts.resolve = async () => ({ ...context, generation: 2 });
    assert.equal((await f.cli(['work.claim', '--handoff-id', 'handoff-1', '--lease-ms', '1000', '--json'])).result.error.code, 'RESOURCE_NOT_FOUND');
  } finally { await f.close(); }
});
test('unsafe credential and socket files rejected without exposing contents', async () => {
  const f = await fixture();
  try {
    chmodSync(f.credentialFile, 0o644); assert.equal((await f.cli(['doctor', '--json'])).exit, 4);
    chmodSync(f.credentialFile, 0o600);
    const linked = join(f.dir, 'linked'); symlinkSync(f.credentialFile, linked);
    await assert.rejects(localRequest(commandRequest(['doctor', '--json'], 'context-1'), { socket: f.socket, credentialFile: linked }), /HOST_UNAVAILABLE/);
    await assert.rejects(localRequest(commandRequest(['doctor', '--json'], 'context-1'), { socket: join(f.dir, 'missing.sock'), credentialFile: f.credentialFile }), /HOST_UNAVAILABLE/);
  } finally { await f.close(); }
});
test('host response validation rejects credentials and extra payload; timeout never retries', async () => {
  const f = storeFixture(); chmodSync(f.dir, 0o700);
  const path = join(f.dir, 'test.sock'), credentialFile = join(f.dir, 'token'); writeFileSync(credentialFile, 'a'.repeat(64), { mode: 0o600 });
  let calls = 0;
  const peers = new Set<any>();
  const server = createServer(s => { peers.add(s); s.on('close', () => peers.delete(s)); s.on('data', () => calls++); });
  await new Promise<void>(r => server.listen(path, r)); chmodSync(path, 0o600);
  try {
    const request = commandRequest(['doctor', '--json'], 'context-1');
    await assert.rejects(localRequest(request, { socket: path, credentialFile, timeoutMs: 30 }), /TRANSPORT_UNCERTAIN/);
    assert.equal(calls, 1);
    assert.throws(() => validateResponse({ version: 1, ok: true, result: { ready: true, activation: 'enabled', token: 'secret' } }, request));
    for (const status of ['queued', 'executor-completed', 'provider-accepted', 'observed-delivered', 'observed-read']) assert.equal(responseExit({ version: 1, ok: true, result: { ...queued(), status: status as ReturnType<typeof queued>['status'] } }), 0);
    for (const status of ['blocked', 'failed', 'cancelled', 'unknown-outcome']) assert.equal(responseExit({ version: 1, ok: true, result: { ...queued(), status: status as ReturnType<typeof queued>['status'] } }), 5);
  } finally { for (const s of peers) s.destroy(); await new Promise<void>(r => server.close(() => r())); f.close(); }
});

test('CLI runs through an executable symlink and keeps machine output clean', async () => {
  const f = storeFixture();
  try {
    const alias = join(f.dir, 'grok-photon');
    symlinkSync(new URL('../../../src/cli/main.js', import.meta.url).pathname, alias);
    const result = spawnSync(process.execPath, [alias, 'doctor', '--json'], { env: {}, encoding: 'utf8' });
    assert.equal(result.status, 2); assert.equal(JSON.parse(result.stdout).error.code, 'INVALID_CONFIGURATION');
    assert.equal(result.stdout.trim().split('\n').length, 1);
  } finally { f.close(); }
});
