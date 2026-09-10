import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createInteractionAdapter, type AppBackendContract, type AuthenticatedInteraction } from '../../../src/features/cards/interaction-adapter.js';
import { unverifiedInteractionReducer } from '../../../src/features/cards/reducer.js';
import { key } from '../../../src/features/cards/state.js';
import { fixture } from './fixture.js';

// Isolated wire protocol fixture only: not a claim about any deployed backend.
const fixtureKey = Buffer.from('test-only-authentication-key');
const sign = (body: Uint8Array) => createHmac('sha256', fixtureKey).update(body).digest('hex');
const backend: AppBackendContract = { id: 'fixture-hmac-v1', source: 'isolated-test-protocol:no-deployed-backend',
  async authenticate({ body, headers }) {
    const actual = Buffer.from(headers['x-fixture-signature'] ?? '', 'hex'), expected = Buffer.from(sign(body), 'hex');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('unauthorized');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
  } };
function request(value: unknown) { const body = Buffer.from(JSON.stringify(value)); return { body, headers: { 'x-fixture-signature': sign(body) } }; }
async function setup() {
  const f = fixture(), sent = await f.execute(f.sendAction()), data = f.session(sent.references);
  const assertion: AuthenticatedInteraction = { version: 1, eventId: 'backend-event-1', session: data.session, scope: data.card.scope,
    taskId: data.taskId, generation: data.generation, participantId: 'participant-1', nonce: data.callback!.nonce,
    actionId: 'confirm', selection: ['choice-1'], occurredAt: f.clock.now() };
  const wakes: string[] = [];
  const adapter = () => createInteractionAdapter({ backend, transactions: f.s.transactions, clock: f.clock,
    wake: { wake: async p => {
      // Assert commit visibility from the real store before any wake side effect.
      const handoff = f.s.transactions.transaction(tx => tx.get('handoffs', p.handoffId));
      assert.ok(handoff); assert.equal(handoff.state, 'pending'); wakes.push(p.handoffId); return { status: 'accepted' };
    } } });
  return { f, sent, data, assertion, wakes, adapter };
}
test('missing real backend stays blocked and performs no wake', async t => {
  const { f, assertion, wakes } = await setup(); t.after(() => f.close());
  const adapter = createInteractionAdapter({ transactions: f.s.transactions, clock: f.clock, wake: { wake: async () => { wakes.push('wrong'); return { status: 'accepted' }; } } });
  assert.deepEqual(await adapter.accept(request(assertion)), { status: 'blocked', blockerId: 'app_backend_contract_missing' }); assert.deepEqual(wakes, []);
});
test('authenticated callback atomically records state and continuation, then wakes; event and nonce replay are durable', async t => {
  const { f, assertion, wakes, adapter } = await setup(); t.after(() => f.close());
  const accepted = await adapter().accept(request(assertion)); assert.equal(accepted.status, 'committed'); assert.equal(wakes.length, 1);
  f.reopen();
  assert.equal((await adapter().accept(request(assertion))).status, 'replayed');
  assert.equal((await adapter().accept(request({ ...assertion, eventId: 'new-id-same-nonce' }))).status, 'replayed');
  assert.equal(wakes.length, 1);
});
for (const change of ['scope', 'session-scope', 'line', 'participant', 'task', 'generation', 'nonce', 'action', 'expiry', 'future', 'cancelled-task'] as const)
  test(`rejects authenticated callback with wrong ${change}`, async t => {
    const { f, assertion, wakes, adapter } = await setup(); t.after(() => f.close());
    const input = structuredClone(assertion);
    if (change === 'scope') input.scope.spaceId = 'different-conversation';
    if (change === 'session-scope') input.session.scope.spaceId = 'different-conversation';
    if (change === 'line') input.scope.lineId = 'different-line';
    if (change === 'participant') input.participantId = 'intruder';
    if (change === 'task') input.taskId = 'different-task';
    if (change === 'generation') input.generation = 2;
    if (change === 'nonce') input.nonce = 'wrong-nonce';
    if (change === 'action') input.actionId = 'delete';
    if (change === 'expiry') f.clock.advance(60001);
    if (change === 'future') input.occurredAt += 30001;
    if (change === 'cancelled-task') f.s.transactions.transaction(tx => { const task = tx.get('tasks', input.taskId)!; tx.put('tasks', { ...task, revision: task.revision + 1, cancelledAt: f.clock.now() }, task.revision); });
    assert.equal((await adapter().accept(request(input))).status, 'rejected'); assert.deepEqual(wakes, []);
  });
test('strict schema/body/header bounds and real fixture authentication reject malformed/unauthorized callbacks', async t => {
  const { f, assertion, wakes, adapter } = await setup(); t.after(() => f.close());
  const a = adapter();
  const malformed = Buffer.from('{bad-json');
  const requests: { body: Uint8Array; headers: Record<string, string> }[] = [request({ ...assertion, extra: 'forbidden' }), request({ ...assertion, selection: Array(33).fill('x') }),
    { body: malformed, headers: { 'x-fixture-signature': sign(malformed) } },
    { ...request(assertion), headers: { 'x-fixture-signature': '00' } },
    { body: Buffer.alloc(16385), headers: {} }, { body: Buffer.alloc(0), headers: {} },
    { ...request(assertion), headers: { huge: 'x'.repeat(2049) } }];
  for (const r of requests) assert.equal((await a.accept(r)).status, 'rejected');
  assert.deepEqual(wakes, []);
});
test('callback transaction failure rolls back nonce/state/handoff and never wakes; retry can commit', async t => {
  const { f, assertion, wakes, adapter } = await setup(); t.after(() => f.close());
  f.failTransactionAt('handoffs');
  assert.deepEqual(await adapter().accept(request(assertion)), { status: 'rejected', reason: 'transaction_failed' });
  assert.deepEqual(wakes, []);
  assert.equal(f.s.transactions.transaction(tx => tx.get('inbox', key('callback-event', backend.id + ':' + assertion.eventId))), undefined);
  assert.equal((await adapter().accept(request(assertion))).status, 'committed'); assert.equal(wakes.length, 1);
});
test('unknown session and missing task/card remain durable unresolved records without wake', async t => {
  const { f, assertion, wakes, adapter } = await setup(); t.after(() => f.close());
  const unknown = structuredClone(assertion); unknown.session.id = 'unknown-session';
  assert.equal((await adapter().accept(request(unknown))).status, 'unresolved');
  f.reopen(); assert.equal(f.s.transactions.transaction(tx => tx.list('unresolved', assertion.scope, 100)).length, 1);
  const realStore = f.s.transactions;
  for (const missing of ['tasks', 'cards']) {
    f.s.transactions = { close: () => {}, transaction: fn => realStore.transaction(tx => fn({ ...tx,
      get: (name, id) => name === missing ? undefined : tx.get(name, id) })) };
    assert.equal((await adapter().accept(request({ ...assertion, eventId: 'unknown-' + missing }))).status, 'unresolved');
  }
  assert.deepEqual(wakes, []);
});
test('generic app-interaction events cannot bypass the authenticated return path', async t => {
  const { f, assertion, wakes } = await setup(); t.after(() => f.close());
  f.s.transactions.transaction(tx => unverifiedInteractionReducer.reduce({ version: 1, eventId: 'generic-event', scope: assertion.scope,
    type: 'app-interaction', direction: 'inbound', occurredAt: f.clock.now(), receivedAt: f.clock.now(), ordering: { source: 'photon' }, targets: [],
    interactionId: assertion.eventId, session: assertion.session, actionId: assertion.actionId, selection: [] }, tx));
  assert.equal(f.s.transactions.transaction(tx => tx.list('unresolved', assertion.scope, 100))[0]!.reason, 'app_backend_authentication_required');
  assert.deepEqual(wakes, []);
});
test('failed/unknown wake leaves a committed pending continuation for shared recovery', async t => {
  const { f, assertion } = await setup(); t.after(() => f.close());
  const a = createInteractionAdapter({ backend, transactions: f.s.transactions, clock: f.clock,
    wake: { wake: async () => { throw new Error('unavailable'); } } });
  const result = await a.accept(request(assertion)); assert.equal(result.status, 'committed');
  if (result.status === 'committed') { assert.equal(result.wake, 'unknown'); assert.equal(f.s.transactions.transaction(tx => tx.get('handoffs', result.handoffId))!.state, 'pending'); }
});
