import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { app, edit, richlink, type Space, type Message } from 'spectrum-ts';
import { customizedMiniApp, imessage } from 'spectrum-ts/providers/imessage';
import { FakeSpace } from './fixture.js';

/** Compile-only public call shapes. Never instantiate a Spectrum/provider client. */
export async function publicProbe(space: Space, message: Message) {
  const original = await space.send(app('https://fixture.invalid/app'));
  await space.send(edit(app('https://fixture.invalid/updated', { live: true }), original));
  await space.send(customizedMiniApp({ appName: 'Fixture', extensionBundleId: 'invalid.fixture.messages',
    teamId: 'TESTTEAM01', appStoreId: 123, live: true, url: 'https://fixture.invalid/app', layout: { caption: 'Fixture' } }));
  const restored = await space.getMessage(message.id);
  if (restored?.platform === 'imessage') return imessage(restored).miniAppCardSession;
  return undefined;
}
test('pins exact installed SDK and uses public builders for distinct app/richlink/customized shapes', async () => {
  const require = createRequire(import.meta.url);
  const path = require.resolve('spectrum-ts').replace(/dist\/index\.js$/, 'package.json');
  assert.equal(JSON.parse(readFileSync(path, 'utf8')).version, '12.8.0');
  const universal = await app('https://fixture.invalid/app', { live: true }).build();
  assert.equal(universal.type, 'app');
  if (universal.type === 'app') { assert.equal(await universal.url(), 'https://fixture.invalid/app'); assert.equal(universal.live, true); }
  assert.equal((await richlink('https://fixture.invalid/app').build()).type, 'richlink');
  const custom = await customizedMiniApp({ appName: 'Fixture', teamId: 'TESTTEAM01', extensionBundleId: 'invalid.fixture.messages',
    url: 'https://fixture.invalid/app', layout: { caption: 'Hi' } }).build();
  assert.deepEqual(custom, { type: 'customized-mini-app', __platform: 'imessage', appName: 'Fixture', teamId: 'TESTTEAM01',
    extensionBundleId: 'invalid.fixture.messages', url: 'https://fixture.invalid/app', layout: { caption: 'Hi' } });
});
test('real edit builder retains original object and rejects inbound targets', async () => {
  const space = new FakeSpace(), original = await space.send(app('https://fixture.invalid/app'));
  const built = await edit(app('https://fixture.invalid/next'), original).build();
  assert.equal(built.type, 'edit'); if (built.type === 'edit') assert.equal(built.target, original);
  original!.direction = 'inbound';
  await assert.rejects(edit(app('https://fixture.invalid/next'), original).build(), /outbound/);
});
