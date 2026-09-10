import test from 'node:test';
import assert from 'node:assert/strict';
import { publicFixture } from './unit.test.js';
import { CardRuntime } from '../../../src/features/cards/operations.js';
import { decodeSession, restoreCardSession } from '../../../src/features/cards/session-codec.js';
import { imessage } from 'spectrum-ts/providers/imessage';

test('repeated updates use refreshed session on the same original bubble', async () => {
  const f = publicFixture(), sent = await f.execute(f.send());
  for (const revision of [0, 2, 4]) assert.equal((await f.execute(f.update(sent, revision))).status, 'executor-completed');
  const original = [...f.native.messages.values()][0]!;
  assert.equal(f.native.messages.size, 1); assert.equal(decodeSession(f.snapshot(sent)).cardRevision, 6);
  for (const call of f.native.calls.slice(1)) { assert.equal(call.type, 'edit'); if (call.type === 'edit') assert.equal(call.target, original); }
});
test('two admitted updates serialize; stale intent does not dispatch', async () => {
  const f = publicFixture(), sent = await f.execute(f.send());
  const results = await Promise.all([f.execute(f.update(sent)), f.execute(f.update(sent))]);
  assert.deepEqual(results.map(r => r.status), ['executor-completed', 'failed']);
  assert.equal(results[1]?.error?.code, 'IDEMPOTENCY_CONFLICT'); assert.equal(f.native.calls.length, 2);
});
test('cold module restart requires the original session and never sends a replacement', async () => {
  const f = publicFixture(), sent = await f.execute(f.send()), cold = new CardRuntime(f.options);
  const result = await f.execute(f.update(sent), cold); assert.equal(result.error?.blockerId, 'requires_original_session');
  const json = f.snapshot(sent), original = [...f.native.messages.values()][0]!;
  delete imessage(original).miniAppCardSession;
  assert.throws(() => restoreCardSession(json, original), /session/); assert.equal(f.native.calls.length, 1);
});
test('cancellation or stale generation before and after preparation prevents effects', async () => {
  for (const stage of ['before', 'resolve', 'generation'] as const) {
    const f = publicFixture();
    if (stage === 'before') f.abort.abort();
    else f.options.space = async () => { if (stage === 'resolve') f.abort.abort(); else f.authoritative.generation++; return f.native; };
    const result = await f.execute(f.send()); assert.ok(['cancelled', 'failed'].includes(result.status)); assert.equal(f.native.calls.length, 0);
  }
});
test('in-flight cancellation preserves uncertainty and durable reservation across modules', async () => {
  const f = publicFixture(), sent = await f.execute(f.send());
  f.native.hook = async () => { f.authoritative.cancelled = true; };
  const result = await f.execute(f.update(sent)); assert.equal(result.status, 'unknown-outcome');
  f.authoritative.cancelled = false; f.native.hook = undefined;
  const next = await f.execute(f.update(sent), new CardRuntime(f.options));
  assert.equal(next.error?.blockerId, 'card_update_outcome_unknown'); assert.equal(f.native.calls.length, 2);
});
test('provider exception or post-send commit failure never authorizes a retry', async () => {
  for (const failure of ['provider', 'transaction'] as const) {
    const f = publicFixture(), action = f.send();
    if (failure === 'provider') f.native.hook = async () => { throw Error('uncertain network write'); };
    else { f.native.hook = async () => { f.services.transaction = () => { throw Error('commit failed'); }; }; }
    const result = await f.execute(action); assert.equal(result.status, 'unknown-outcome'); assert.equal(result.error?.retry, 'reconcile-first');
    assert.deepEqual(await f.execute(action), result); assert.equal(f.native.calls.length, 1);
  }
});
test('shared child boundary failure after dispatch remains unknown', async () => {
  const f = publicFixture(), executeChild = f.services.executeChild;
  f.services.executeChild = async child => { await executeChild(child); throw Error('child persistence unavailable'); };
  assert.equal((await f.execute(f.send())).status, 'unknown-outcome'); assert.equal(f.native.calls.length, 1);
});
test('universal updates require the configured URL mapper and retain original message', async () => {
  const f = publicFixture(); f.options.templates[0]!.updateUrl = async () => 'https://fixture.invalid/next';
  const sent = await f.execute(f.send('universal'));
  assert.equal((await f.execute(f.update(sent))).status, 'executor-completed'); assert.equal(f.native.messages.size, 1);
});

test('extension configuration changes cannot silently replace original app identity', async () => {
  const f = publicFixture(), sent = await f.execute(f.send());
  f.options.templates[1]!.extension!.extensionBundleId = 'invalid.other.messages';
  const result = await f.execute(f.update(sent)); assert.equal(result.error?.blockerId, 'card_template_changed'); assert.equal(f.native.calls.length, 1);
});
test('parallel modules share durable reservation even with retained original handles', async () => {
  const f = publicFixture(), sent = await f.execute(f.send()), other = new CardRuntime(f.options);
  other.remember(decodeSession(f.snapshot(sent)), [...f.native.messages.values()][0]!);
  let entered!: () => void, release!: () => void;
  const enteredPromise = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  f.native.hook = async content => { if (content.type === 'edit') { entered(); await gate; } };
  const pending = f.execute(f.update(sent)); await enteredPromise;
  const concurrent = await f.execute(f.update(sent), other);
  assert.equal(concurrent.error?.blockerId, 'card_update_outcome_unknown');
  release(); assert.equal((await pending).status, 'executor-completed'); assert.equal(f.native.calls.length, 2);
});

test('reference remapping during asynchronous media preparation is fenced before send', async () => {
  const f = publicFixture(), action = f.send();
  if (action.operation !== 'app.sendCustomized') throw Error();
  action.arguments.layout.image = { stagingId: 'image-1', sha256: 'a'.repeat(64), mimeType: 'image/jpeg', bytes: 1 };
  f.services.media.resolve = async () => {
    f.services.transaction(unit => { const row = unit.get('references', action.arguments.space.id)!;
      unit.put('references', { ...row, providerId: 'different-chat', revision: row.revision + 1 }, row.revision); });
    return { bytes: new Uint8Array([1]), mimeType: 'image/jpeg' };
  };
  const result = await f.execute(action);
  assert.equal(result.error?.code, 'SCOPE_MISMATCH'); assert.equal(f.native.calls.length, 0);
});
