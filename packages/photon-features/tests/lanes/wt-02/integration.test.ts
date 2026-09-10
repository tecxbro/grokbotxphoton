import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Spectrum, definePlatform, type Message, type Space } from 'spectrum-ts';
import { z } from 'zod';
import { InboundRouter, routeInboundEvent } from '../../../src/runtime/inbound/router.js';
import { TextBatcher } from '../../../src/runtime/inbound/batching.js';
import { WakeDispatcher, configuredGrokWake, dispatchWake } from '../../../src/runtime/inbound/wake-dispatcher.js';
import { NativeWebhookIngress, acceptVerifiedWebhook } from '../../../src/adapters/transport/webhook-ingress.js';
import { SpectrumOwner, startSpectrumOwner, stopSpectrumOwner } from '../../../src/adapters/transport/spectrum-owner.js';
import { subscribeMessageEvents } from '../../../src/adapters/transport/message-events.js';
import { createTypingFeatureModule } from '../../../src/runtime/typing/operations.js';
import { TypingLeases } from '../../../src/runtime/typing/leases.js';
import { makeServices, scope as serviceScope } from '../../fixtures/runtime-services.js';
import { fixture, routes, scope, chat, taskRoute, snapshot, deferred, settle, scoped } from './helpers.js';

function signed(body: string, now: number) {
  const timestamp = String(Math.floor(now/1000));
  return new Request('https://example.invalid', {method: 'POST', body, headers: {'content-type': 'application/json',
    'x-spectrum-timestamp': timestamp, 'x-spectrum-signature': 'v0=' + createHmac('sha256', 'test-secret').update(`v0:${timestamp}:${body}`).digest('hex')}});
}
function owner() {
  return new SpectrumOwner({inbound: 'photon-webhook', outbound: 'imessage', wake: 'existing-grok-task-handoff'}, routes,
    async () => ({messages: async function* () {}, space: async () => {throw new Error('unused');}, stop: async () => {}}));
}

test('shared SQLite handoff is committed before wake and failed wakes retry by durable identity', async () => {
  const f = fixture();
  try {
    const router = new InboundRouter(f.store, f.clock, {route: () => taskRoute}, []);
    await routeInboundEvent(router, f.event()); f.clock.advance(2000);
    const [id] = new TextBatcher(router).tick(scope); let calls = 0;
    const wake = configuredGrokWake({async notifyExistingTask(pointer) {
      assert.deepEqual(Object.keys(pointer).sort(), ['generation', 'handoffId', 'taskId']);
      assert.ok(f.store.transaction(tx => tx.get('handoffs', pointer.handoffId)));
      return ++calls === 1 ? 'failed' : 'accepted';
    }});
    const dispatcher = new WakeDispatcher(f.store, f.clock, wake);
    assert.equal((await dispatchWake(dispatcher, scope, taskRoute))[0]!.status, 'failed');
    assert.equal((await dispatchWake(dispatcher, scope, taskRoute))[0]!.status, 'accepted');
    assert.equal(f.store.transaction(tx => tx.get('handoffs', id!)!.state), 'pending');
    assert.equal(f.store.transaction(tx => tx.listWork(scope, taskRoute.principalId, taskRoute.taskId, 1, f.clock.now(), 10))[0]!.id, id);
    assert.throws(() => configuredGrokWake(), /GROK_WAKE_NOT_CONFIGURED/);
  } finally { f.close(); }
});

test('webhook acknowledgement awaits shared receipt writer then durable inbox, including failures', async () => {
  const f = fixture(), sdk = owner(), gate = deferred(); let fail = true, records = 0, accepted = 0;
  try {
    await sdk.start();
    const ingress = new NativeWebhookIngress(sdk, f.captures, f.clock, 'test-secret', {}, {writer: {async recordReceipt() {
      records++; await gate.promise; if (fail) throw new Error('disk');
    }}});
    await ingress.start(async () => { accepted++; });
    const m = snapshot('read-event', {type: 'read', target: {id: 'target'}});
    const body = JSON.stringify({event: 'messages', message: m, space: m.space});
    let completed = false;
    const pending = acceptVerifiedWebhook(ingress, signed(body, f.clock.now())).then(r => {completed = true; return r;});
    await settle(); assert.equal(completed, false); gate.resolve();
    assert.equal((await pending).status, 503); assert.equal(accepted, 0);
    fail = false;
    assert.equal((await acceptVerifiedWebhook(ingress, signed(body, f.clock.now()))).status, 200);
    assert.equal(records, 2); assert.equal(accepted, 1);
    await ingress.stop();
  } finally { gate.resolve(); await sdk.stop(); f.close(); }
});

test('tampered, alternate, mismatched and unavailable receipt webhooks never acknowledge', async () => {
  const f = fixture(), sdk = owner();
  try {
    await sdk.start(); const ingress = new NativeWebhookIngress(sdk, f.captures, f.clock, 'test-secret');
    await ingress.start(async () => {throw new Error('inbox-disk-failure');});
    const m = snapshot(), body = JSON.stringify({event: 'messages', message: m, space: m.space});
    const good = signed(body, f.clock.now());
    assert.equal((await ingress.handle(new Request(good.url, {method: 'POST', headers: good.headers, body: body+' '}))).status, 401);
    assert.equal((await ingress.handle(signed(JSON.stringify({event: 'fusor', data: m}), f.clock.now()))).status, 400);
    assert.equal((await ingress.handle(signed(JSON.stringify({event: 'messages', message: m, space: {...m.space, phone: '+15555550102'}}), f.clock.now()))).status, 422);
    assert.equal((await ingress.handle(signed(body, f.clock.now()))).status, 503);
    const receipt = snapshot('read', {type: 'read', target: {id: 'native'}});
    assert.equal((await ingress.handle(signed(JSON.stringify({event: 'messages', message: receipt, space: receipt.space}), f.clock.now()))).status, 503);
    await ingress.stop();
  } finally { await sdk.stop(); f.close(); }
});

test('one stream subscription captures read before shared writer and exposes receive failure', async () => {
  const f = fixture(); const offline = await offlineSpace(); let constructed = 0, subscribed = 0, written = 0;
  const raw = snapshot('read', {type: 'read', target: {id: 'native'}});
  const message = {...raw, space: offline.space, timestamp: new Date(raw.timestamp)} as unknown as Message;
  const sdk = new SpectrumOwner({inbound: 'photon-stream', outbound: 'imessage', wake: 'existing-grok-task-handoff'}, routes,
    async () => {constructed++; return {messages: () => {subscribed++; return (async function* (): AsyncGenerator<[Space, Message]> {yield [message.space, message];})();},
      space: async () => {throw new Error('unused');}, stop: async () => {}};});
  try {
    await Promise.all([startSpectrumOwner(sdk), startSpectrumOwner(sdk)]);
    const options = {owner: sdk, captures: f.captures, clock: f.clock, accept: async () => {throw new Error('inbox-failed');},
      receipts: {writer: {recordReceipt() {assert.equal([...f.captures.ids()].length, 1); written++;}}}, report: () => {}};
    const subscription = subscribeMessageEvents(options);
    assert.throws(() => subscribeMessageEvents(options), /COMPETING_RECEIVE_PATH/);
    await assert.rejects(subscription.completion, /inbox-failed/);
    assert.equal(constructed, 1); assert.equal(subscribed, 1); assert.equal(written, 1); assert.equal(sdk.ready(), false);
  } finally { await stopSpectrumOwner(sdk); await offline.app.stop(); f.close(); }
});

test('current typing feature uses F0 services, fences after resolve and never claims visibility', async () => {
  const f = makeServices(); const calls: string[] = [];
  const leases = new TypingLeases(f.clock, async () => ({startTyping: async () => {calls.push('start');}, stopTyping: async () => {calls.push('stop');}}));
  const space = scoped(serviceScope); f.resources.set(space.id, space);
  const module = createTypingFeatureModule(leases, () => ({requestId: 'request-typing', resultRevision: 0, expiresAt: 5000, assertCurrent() {}}));
  const action = {version: 1 as const, contextId: 'context-1', idempotencyKey: 'typing-1', operation: 'typing.begin' as const, arguments: {space, ttlMs: 1000}};
  try {
    const result = await module.handlers['typing.begin']!(action, f.services); await settle();
    assert.equal(result.status, 'executor-completed'); assert.deepEqual(result.observations, []);
    assert.equal(f.children.size, 1); assert.deepEqual(calls, ['start']);
    assert.equal(leases.evidence().visible, 'unknown');
    f.authoritative.fence = 2;
    await assert.rejects(module.handlers['typing.begin']!(action, f.services), /STALE_FENCE/);
  } finally { leases.shutdown(); await leases.drain(); }
});

test('typing unavailable/disconnected is explicit and delayed resource resolution rechecks claim', async () => {
  const f = makeServices(); const space = scoped(serviceScope); f.resources.set(space.id, space);
  const leases = new TypingLeases(f.clock, async () => {throw new Error('should not resolve');});
  const module = createTypingFeatureModule(leases, () => ({requestId: 'request-typing', resultRevision: 0, expiresAt: 5000, assertCurrent() {}}));
  const action = {version: 1 as const, contextId: 'context-1', idempotencyKey: 'typing-1', operation: 'typing.begin' as const, arguments: {space, ttlMs: 1000}};
  leases.connectionLost();
  const unavailable = await module.handlers['typing.begin']!(action, f.services);
  assert.equal(unavailable.error?.code, 'UNAVAILABLE'); assert.deepEqual(unavailable.observations, []);
  const gate = deferred<typeof space>(); f.services.resolveResource = () => gate.promise;
  const attempt = module.handlers['typing.begin']!(action, f.services);
  f.authoritative.fence = 3; gate.resolve(space);
  await assert.rejects(attempt, /STALE_FENCE/); leases.shutdown();
});


test('official standalone iMessage wire spelling routes through the same signed ingress', async () => {
  const f = fixture(), sdk = owner(); let accepted = 0;
  try {
    await sdk.start(); const ingress = new NativeWebhookIngress(sdk, f.captures, f.clock, 'test-secret');
    await ingress.start(async event => {assert.deepEqual(event.scope, scope); accepted++;});
    const m = {...snapshot(), platform: 'iMessage', space: {...snapshot().space, platform: 'iMessage'}};
    assert.equal((await ingress.handle(signed(JSON.stringify({event: 'messages', message: m, space: m.space}), f.clock.now()))).status, 200);
    assert.equal(accepted, 1); await ingress.stop();
  } finally { await sdk.stop(); f.close(); }
});


// Real public Space construction for provider narrowing, with an offline provider.
async function offlineSpace(phone = '+15555550101') {
  const provider = definePlatform('imessage', {
    config: z.object({}), lifecycle: {createClient: async () => ({})},
    user: {resolve: async ({input}) => ({id: input.userID})},
    space: {schema: z.object({id: z.string(), phone: z.string()}), create: async () => ({id: chat, phone})},
    async *messages() {}, send: async () => undefined,
  });
  const app = await Spectrum({providers: [provider.config()]});
  return {app, space: await provider(app).space.create('reader')};
}
