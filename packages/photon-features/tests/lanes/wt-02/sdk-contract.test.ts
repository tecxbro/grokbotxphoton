import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Spectrum, definePlatform, typing, read, type Message, type Space } from 'spectrum-ts';
import { imessage } from 'spectrum-ts/providers/imessage';
import { z } from 'zod';
import { createHmac } from 'node:crypto';
import { lookupNativeMessageState } from '../../../src/adapters/transport/native-state.js';
import { SpectrumOwner } from '../../../src/adapters/transport/spectrum-owner.js';
import { routes, scope, chat, deferred, settle } from './helpers.js';

const local = () => definePlatform('wt02_offline_contract', {
  config: z.object({}), lifecycle: {createClient: async () => ({})},
  user: {resolve: async ({input}) => ({id: input.userID})},
  space: {create: async () => ({id: 'offline-space'})},
  async *messages() {}, send: async () => undefined,
});

test('installed SDK is exactly pinned and exports provider narrowing/content builders', async () => {
  const manifest = JSON.parse(readFileSync(new URL('../../../../../../node_modules/spectrum-ts/package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.version, '12.8.0');
  assert.equal(typeof imessage, 'function'); assert.equal(typeof imessage.is, 'function');
  assert.equal(typeof read, 'function'); assert.equal(typeof typing('stop').build, 'function');
});

test('actual SDK unsupported typing no-ops and undefined send result is not delivery evidence', async () => {
  const provider = local(); const app = await Spectrum({providers: [provider.config()]});
  try {
    const space = await provider(app).space.create('reader');
    assert.equal(await space.startTyping(), undefined);
    assert.equal(await space.stopTyping(), undefined);
    assert.equal(await space.send(typing()), undefined);
  } finally { await app.stop(); await app.stop(); }
});

test('actual SDK webhook returns before its async durable callback resolves', async () => {
  const provider = local(), secret = 'test-only';
  const app = await Spectrum({providers: [provider.config()], webhookSecret: secret});
  const gate = deferred(); let persisted = false;
  try {
    const body = JSON.stringify({event: 'messages', message: {id: 'm', direction: 'inbound', platform: 'wt02_offline_contract',
      sender: {id: 'reader'}, space: {id: 'offline-space', platform: 'wt02_offline_contract'}, timestamp: new Date().toISOString(), content: {type: 'text', text: 'test'}}});
    const timestamp = String(Math.floor(Date.now()/1000));
    const signature = 'v0=' + createHmac('sha256', secret).update(`v0:${timestamp}:${body}`).digest('hex');
    const result = await app.webhook(new Request('https://example.invalid', {method: 'POST', body,
      headers: {'x-spectrum-timestamp': timestamp, 'x-spectrum-signature': signature}}), async () => {await gate.promise; persisted = true;});
    assert.equal(result.status, 200); assert.equal(persisted, false);
    gate.resolve(); await settle(); assert.equal(persisted, true);
  } finally { gate.resolve(); await app.stop(); }
});

test('native lookup uses documented Space.getMessage and scoped imessage narrowing', async () => {
  const selected: string[] = [];
  const offline = await offlineSpace();
  const message = {id: 'native', platform: 'imessage', direction: 'outbound', timestamp: new Date(100), sender: undefined,
    space: offline.space, content: {type: 'text', text: 'test'}, isDelivered: true, dateDelivered: new Date(200)} as unknown as Message;
  const owner = new SpectrumOwner({inbound: 'photon-stream', outbound: 'imessage', wake: 'existing-grok-task-handoff'}, routes,
    async () => ({messages: async function* () {}, space: async (id, route) => {
      selected.push(id, route.phone); return {getMessage: async (target: string) => {selected.push(target); return message;}} as Space;
    }, stop: async () => {}}));
  try {
    await owner.start();
    const state = await lookupNativeMessageState(owner, {scope, conversationId: chat, providerTargetId: 'native'});
    assert.equal(state.status, 'found');
    if (state.status === 'found') assert.equal((state.message.metadata as {isDelivered: boolean}).isDelivered, true);
    assert.deepEqual(selected, [chat, '+15555550101', 'native']);
  } finally { await owner.stop(); await offline.app.stop(); }
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
