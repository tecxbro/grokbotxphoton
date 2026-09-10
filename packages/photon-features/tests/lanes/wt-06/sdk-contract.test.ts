import test from 'node:test';
import assert from 'node:assert/strict';
import { app, edit, richlink, type Space, type Message } from 'spectrum-ts';
import { customizedMiniApp, imessage } from 'spectrum-ts/providers/imessage';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { publicFixture } from './unit.test.js';
import { decodeSession } from '../../../src/features/cards/session-codec.js';
import { createFeatureModule } from '../../../src/features/cards/module.js';
import type { FeatureModule } from '../../../src/contracts/feature.js';
import { registerFeatureModules } from '../../../src/registry/modules.js';

/** Compile-only public contract probe. No network/provider is instantiated. */
export async function exactPublicCardContract(space: Space, original: Message) {
  const sent = await space.send(app('https://fixture.invalid/card'));
  const outcome = await space.send(edit(customizedMiniApp({ appName: 'Fixture', teamId: 'TESTTEAM01',
    extensionBundleId: 'invalid.fixture.messages', url: 'https://fixture.invalid/card', layout: { caption: 'Next' } }), original));
  const refetched = await space.getMessage(original.id);
  return { sent, outcome, metadata: refetched?.platform === 'imessage' ? imessage(refetched).miniAppCardSession : undefined };
}
test('installed public SDK remains exactly 12.8.0', () => {
  const require = createRequire(import.meta.url);
  const entry = require.resolve('spectrum-ts');
  assert.equal(JSON.parse(readFileSync(entry.replace(/dist\/index\.js$/, 'package.json'), 'utf8')).version, '12.8.0');
});
test('public module registers three owned F0 handlers', () => {
  const f = publicFixture(), module: FeatureModule = createFeatureModule(f.options);
  assert.equal(module.owner, 'wt-06'); assert.equal(Object.keys(module.handlers).length, 3);
  assert.doesNotThrow(() => registerFeatureModules([module]));
});
test('real builders keep URL fallback, static, live and customized content distinct', async () => {
  assert.equal((await richlink('https://fixture.invalid/card').build()).type, 'richlink');
  const staticCard = await app('https://fixture.invalid/card').build(), live = await app('https://fixture.invalid/card', { live: true }).build();
  assert.equal(staticCard.type, 'app'); assert.equal(live.type, 'app');
  if (live.type === 'app') assert.equal(live.live, true);
  const custom = await customizedMiniApp({ appName: 'Fixture', teamId: 'TESTTEAM01', extensionBundleId: 'invalid.fixture.messages',
    url: 'https://fixture.invalid/card', layout: { caption: 'Test' } }).build();
  assert.equal(custom.type, 'customized-mini-app');
});
test('actual edit builder retains original object and void updates refresh provider metadata', async () => {
  const f = publicFixture(), sent = await f.execute(f.send());
  const original = [...f.native.messages.values()][0]!;
  const built = await edit(app('https://fixture.invalid/next'), original).build();
  assert.equal(built.type, 'edit'); if (built.type === 'edit') assert.equal(built.target, original);
  const result = await f.execute(f.update(sent));
  assert.equal(result.status, 'executor-completed'); assert.deepEqual(result.value, { type: 'void' });
  assert.deepEqual(result.references, sent.references); assert.deepEqual(result.observations, []);
  assert.equal(decodeSession(f.snapshot(sent)).metadata?.targetMessageGuid, imessage(original).miniAppCardSession?.targetMessageGuid);
  assert.notEqual(decodeSession(f.snapshot(sent)).metadata?.targetMessageGuid, original.id);
});
test('undefined send is an unknown result, never a successful card', async () => {
  const f = publicFixture(); f.native.returnUndefined = true;
  const result = await f.execute(f.send()); assert.equal(result.status, 'unknown-outcome'); assert.equal(result.references.length, 0);
});
