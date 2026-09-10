import test from 'node:test';
import assert from 'node:assert/strict';
import { imessage } from 'spectrum-ts/providers/imessage';
import { decodeSession, encodeSession, recoveryCodec } from '../../../src/features/cards/session-codec.js';
import { fixture } from './fixture.js';

test('versioned codec round-trips only bounded data, rejects credentials, methods and unknown versions', async t => {
  const f = fixture(); t.after(() => f.close()); const sent = await f.execute(f.sendAction()), data = f.session(sent.references);
  const json = encodeSession(data);
  assert.deepEqual(decodeSession(json), data); assert.equal(recoveryCodec.validate(data), true);
  assert.throws(() => decodeSession(JSON.stringify({ ...data, version: 2 })));
  assert.throws(() => encodeSession(Object.assign({}, data, { token: 'never-persist-this' })));
  assert.throws(() => encodeSession(Object.assign({}, data, { send: () => {} })));
  assert.throws(() => decodeSession(' '.repeat(32769)));
  assert.throws(() => decodeSession(JSON.stringify({ ...data, session: { ...data.session, cardId: 'different-card' } })));
  assert.equal(json.includes('TESTTEAM01'), false);
  assert.equal(await recoveryCodec.reconcile(data, f.s), 'unknown');
});
test('SQLite reopen plus shared public getMessage resolver preserves the original target when its real handle survives', async t => {
  const f = fixture(); t.after(() => f.close()); const sent = await f.execute(f.sendAction());
  const original = f.native.messages.get(f.session(sent.references).providerMessageId)!;
  f.reopen();
  const result = await f.execute(f.updateAction(sent.references));
  assert.equal(result.status, 'executor-completed');
  const edit = f.native.calls[1]!; assert.equal(edit.type, 'edit');
  if (edit.type === 'edit') assert.equal(edit.target, original);
  assert.equal(f.session(sent.references).cardRevision, 1);
});
test('full handle loss after restart explicitly requires_original_session, never fabricates metadata or sends', async t => {
  const f = fixture(); t.after(() => f.close()); const sent = await f.execute(f.sendAction());
  f.native.messages.clear(); f.reopen();
  const result = await f.execute(f.updateAction(sent.references));
  assert.equal(result.status, 'blocked'); assert.equal(result.error?.blockerId, 'requires_original_session');
  assert.equal(f.native.calls.length, 1);
});
test('rehydration without provider session or with different metadata is unsupported', async t => {
  const f = fixture(); t.after(() => f.close()); const sent = await f.execute(f.sendAction());
  const original = imessage(f.native.messages.get(f.session(sent.references).providerMessageId)!);
  const metadata = original.miniAppCardSession!;
  delete original.miniAppCardSession; f.reopen();
  assert.equal((await f.execute(f.updateAction(sent.references))).error?.blockerId, 'requires_original_session');
  assert.equal(original.miniAppCardSession, undefined);
  original.miniAppCardSession = { ...metadata, sessionId: 'different-provider-session' };
  assert.equal((await f.execute(f.updateAction(sent.references))).error?.blockerId, 'requires_original_session');
  assert.equal(f.native.calls.length, 1);
});
test('dispatching/unknown checkpoint survives restart and cannot be treated as safe to retry', async t => {
  const f = fixture(); t.after(() => f.close()); const sent = await f.execute(f.sendAction());
  f.native.hook = async () => { throw new Error('connection lost'); };
  assert.equal((await f.execute(f.updateAction(sent.references))).status, 'unknown-outcome');
  f.reopen();
  assert.equal((await f.execute(f.updateAction(sent.references))).error?.blockerId, 'card_update_outcome_unknown');
  assert.equal(f.native.calls.length, 2);
});
