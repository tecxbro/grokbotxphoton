import test from 'node:test';
import assert from 'node:assert/strict';
import { publicFixture } from './unit.test.js';
import { applyCardInteraction } from '../../../src/features/cards/reducer.js';
import { normalizeInteraction } from '../../../src/features/cards/interaction-adapter.js';
import { decodeSession } from '../../../src/features/cards/session-codec.js';

test('child execution replays the same provider result with no duplicate send/update', async () => {
  const f = publicFixture(), action = f.send(), sent = await f.execute(action);
  assert.deepEqual(await f.execute(action), sent); assert.equal(f.native.calls.length, 1);
  const update = f.update(sent), updated = await f.execute(update);
  assert.deepEqual(await f.execute(update), updated); assert.equal(f.native.calls.length, 2);
  assert.equal(f.childCalls(), 4);
});
test('authenticated durable callback consumes session and creates one continuation atomically', async () => {
  const f = publicFixture(), sent = await f.execute(f.send()), input = await f.assertion(sent);
  let capturedSelection: string[] = [];
  const captured = async (event: typeof input) => { capturedSelection = event.selection; return true; };
  assert.equal((await applyCardInteraction(input, f.snapshot(sent), f.services, captured)).status, 'committed');
  assert.deepEqual(capturedSelection, ['yes']); assert.equal(f.continuations.length, 1);
  assert.equal((await applyCardInteraction(input, f.snapshot(sent), f.services, captured)).status, 'replayed');
  assert.equal((await applyCardInteraction(await f.assertion(sent, { eventId: 'different-event' }), f.snapshot(sent), f.services, captured)).status, 'replayed');
  assert.equal(f.continuations.length, 1);
});
test('callback continuation failure rolls back session consumption and allows retry', async () => {
  const f = publicFixture(), sent = await f.execute(f.send()), input = await f.assertion(sent), transaction = f.services.transaction;
  f.services.transaction = run => transaction(unit => run({ ...unit, createContinuation() { throw Error('injected transaction failure'); } }));
  await assert.rejects(applyCardInteraction(input, f.snapshot(sent), f.services, async () => true), /injected/);
  f.services.transaction = transaction;
  const data = decodeSession(f.snapshot(sent));
  assert.equal(transaction(unit => unit.get('sessions', data.session.id))?.revision, 0);
  assert.equal(f.continuations.length, 0);
  assert.equal((await applyCardInteraction(input, f.snapshot(sent), f.services, async () => true)).status, 'committed');
});
test('uncaptured events, unauthenticated normalization and post-auth mutation cannot wake work', async () => {
  const f = publicFixture(), sent = await f.execute(f.send()), input = await f.assertion(sent);
  await assert.rejects(applyCardInteraction(input, f.snapshot(sent), f.services), /capture/);
  await assert.rejects(applyCardInteraction(input, f.snapshot(sent), f.services, async () => false), /capture/);
  await assert.rejects(applyCardInteraction(normalizeInteraction(input), f.snapshot(sent), f.services, async () => true), /authenticated/);
  input.selection.push('tampered');
  await assert.rejects(applyCardInteraction(input, f.snapshot(sent), f.services, async () => true), /authenticated/);
  assert.equal(f.continuations.length, 0);
});
for (const [name, changes] of [
  ['participant', { participantId: 'intruder' }], ['line', { scope: { projectId: 'project-1', provider: 'imessage', accountId: 'account-1', lineId: 'wrong', spaceId: 'space-1' } }],
  ['chat', { scope: { projectId: 'project-1', provider: 'imessage', accountId: 'account-1', lineId: 'line-1', spaceId: 'wrong' } }],
  ['task', { taskId: 'wrong' }], ['generation', { generation: 0 }], ['nonce', { nonce: 'wrong' }], ['action', { actionId: 'wrong' }],
  ['future timestamp', { occurredAt: 1000000 }],
] as const) test('callback rejects wrong ' + name, async () => {
  const f = publicFixture(), sent = await f.execute(f.send());
  await assert.rejects(applyCardInteraction(await f.assertion(sent, changes), f.snapshot(sent), f.services, async () => true));
  assert.equal(f.continuations.length, 0);
});
test('unknown session is unresolved, missing backend does not prevent static send', async () => {
  const f = publicFixture(), sent = await f.execute(f.send()), input = await f.assertion(sent);
  assert.deepEqual(await applyCardInteraction(input, undefined, f.services, async () => true), { status: 'unresolved' });
  assert.equal((await f.execute(f.send('universal'))).status, 'provider-accepted');
});
test('expiry and cancellation after capture fence reduction before commit', async () => {
  for (const cancel of [false, true]) {
    const f = publicFixture(); f.options.templates[1]!.interactions!.ttlMs = 100;
    const sent = await f.execute(f.send()), input = await f.assertion(sent);
    await assert.rejects(applyCardInteraction(input, f.snapshot(sent), f.services, async () => {
      if (cancel) f.abort.abort(); else f.clock.advance(101); return true;
    }), cancel ? /CANCELLED/ : /expired/); assert.equal(f.continuations.length, 0);
  }
});

import { SQLiteStore } from '../../../src/state/sqlite.js';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import type { UnitOfWork } from '../../../src/contracts/store.js';
import { CardRuntime } from '../../../src/features/cards/operations.js';

test('SQLite domain transaction survives reopening and rolls back failed callback continuation', async () => {
  const f = publicFixture();
  const root = resolve(process.cwd(), '.photon-local'); mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(resolve(root, 'wt06-domain-')), path = resolve(dir, 'state.sqlite');
  let store = new SQLiteStore(path), failContinuation = true;
  const space = f.send(); if (space.operation !== 'app.sendCustomized') throw Error();
  const row = f.services.transaction(unit => unit.get('references', space.arguments.space.id))!;
  store.transaction(tx => tx.put('references', row, null));
  // Test-only adapter around the existing SQLite primitives. Production F0 service
  // composition is a separate integration gate; features see only UnitOfWork.
  f.services.transaction = run => store.transaction(tx => {
    f.services.assertActiveClaim();
    const unit: UnitOfWork = { get: tx.get, put: tx.put, createContinuation(spec) {
      if (failContinuation) throw Error('SQLite continuation failure');
      tx.put('handoffs', { id: spec.id, scope: f.services.context.scope, revision: 0,
        taskId: f.services.context.taskId, generation: f.services.context.generation, principalId: f.services.context.principalId,
        eventIds: [...spec.eventIds], state: 'pending', claim: null, createdAt: f.clock.now() }, null);
    } };
    return run(unit);
  });
  try {
    const sent = await f.execute(space), input = await f.assertion(sent), data = decodeSession(f.snapshot(sent));
    await assert.rejects(applyCardInteraction(input, f.snapshot(sent), f.services, async () => true), /SQLite continuation failure/);
    store.close(); store = new SQLiteStore(path);
    assert.equal(store.transaction(tx => tx.get('sessions', data.session.id))?.revision, 0);
    failContinuation = false;
    const result = await applyCardInteraction(input, f.snapshot(sent), f.services, async () => true);
    assert.equal(result.status, 'committed');
    store.close(); store = new SQLiteStore(path);
    assert.equal(store.transaction(tx => tx.get('sessions', data.session.id))?.revision, 1);
    assert.equal(store.transaction(tx => tx.list('handoffs', data.card.scope, 10)).length, 1);
    f.native.hook = async () => { throw Error('provider response lost'); };
    assert.equal((await f.execute(f.update(sent))).status, 'unknown-outcome');
    store.close(); store = new SQLiteStore(path);
    const resumed = await f.execute(f.update(sent), new CardRuntime(f.options));
    assert.equal(resumed.error?.blockerId, 'card_update_outcome_unknown');
    assert.equal(store.transaction(tx => tx.get('cards', data.card.id))?.revision, 1);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('missing authoritative session stays unresolved despite a retained host snapshot', async () => {
  const f = publicFixture(), sent = await f.execute(f.send()), input = await f.assertion(sent), transaction = f.services.transaction;
  f.services.transaction = run => transaction(unit => run({ ...unit, get(table, id) { return table === 'sessions' ? undefined : unit.get(table, id); } }));
  assert.deepEqual(await applyCardInteraction(input, f.snapshot(sent), f.services, async () => true), { status: 'unresolved' });
  assert.equal(f.continuations.length, 0);
});
