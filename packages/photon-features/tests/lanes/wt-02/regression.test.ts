import test from 'node:test';
import assert from 'node:assert/strict';
import { Spectrum, definePlatform, type Space, type Message } from 'spectrum-ts';
import { z } from 'zod';
import { InboundRouter } from '../../../src/runtime/inbound/router.js';
import { recoverStream, advanceCheckpoint } from '../../../src/runtime/inbound/checkpoints.js';
import { appendReceipt, reconcileReceipt, summarizeReceipts, type ReceiptObservation } from '../../../src/contracts/receipts.js';
import { observeReceipt } from '../../../src/runtime/inbound/receipt-observer.js';
import { reconcileReceiptTarget } from '../../../src/runtime/inbound/receipt-reconcile.js';
import { messageRef } from '../../../src/runtime/inbound/normalize.js';
import { lookupNativeMessageState } from '../../../src/adapters/transport/native-state.js';
import { SpectrumOwner } from '../../../src/adapters/transport/spectrum-owner.js';
import { resolveProviderContext } from '../../../src/adapters/transport/provider-context.js';
import { fixture, scope, routes, chat, taskRoute, snapshot, deferred, settle } from './helpers.js';

function nativeOwner(getMessage: (id: string) => Promise<Message | undefined>) {
  return new SpectrumOwner({inbound: 'photon-stream', outbound: 'imessage', wake: 'existing-grok-task-handoff'}, routes,
    async () => ({messages: async function* () {}, space: async () => ({getMessage}) as Space, stop: async () => {}}));
}
function native(id = 'native', space?: Space) {
  return {...snapshot(id), direction: 'outbound', timestamp: new Date(100), space: space ?? {id: chat, platform: 'imessage', phone: '+15555550101'},
    isDelivered: true, dateDelivered: new Date(200), dateRead: new Date(300)} as unknown as Message;
}

test('operational events and outgoing echoes cannot be opted into conversation wakes', async () => {
  const f = fixture();
  try {
    const router = new InboundRouter(f.store, f.clock, {route: () => taskRoute, continuation: event => event.type !== 'reaction'},
      ['receipt', 'reaction', 'group', 'typing'].map(type => ({type: type as 'receipt'|'reaction'|'group'|'typing', reduce() {}})));
    for (const content of [{type: 'read', target: {id: 'native'}}, {type: 'reaction', target: {id: 'native'}, emoji: '👍'},
      {type: 'rename', displayName: 'x'}, {type: 'typing', state: 'start'}]) await router.accept(f.event(content.type, content));
    await router.accept({...f.event('echo'), direction: 'outbound'});
    assert.equal(f.store.transaction(tx => tx.list('handoffs', scope, 100).length), 0);
  } finally { f.close(); }
});

test('checkpoint cannot cross missing input and recovery preserves original read observation time', async () => {
  const f = fixture(); let rows: ReceiptObservation[] = [];
  const receipts = {writer: {recordReceipt(r: ReceiptObservation) { rows = appendReceipt(rows, r); }}};
  const router = new InboundRouter(f.store, f.clock, {route: () => taskRoute}, [{type: 'receipt', reduce() {}}]);
  try {
    const capturedAt = 100;
    f.captures.put({capturedAt, message: snapshot('early', {type: 'read', target: {id: 'native'}})});
    const options = {ids: [...f.captures.ids()], captures: f.captures, routes, clock: f.clock, receipts, accept: (event: Parameters<typeof router.accept>[0]) => router.accept(event)};
    let advanced = false;
    assert.throws(() => f.store.transaction(tx => advanceCheckpoint(tx, scope, ['missing'], () => {advanced = true;})), /NOT_DURABLE/);
    assert.equal(advanced, false);
    const first = await recoverStream(options); f.clock.advance(5000); await recoverStream(options);
    assert.deepEqual(first.unresolved, []); assert.equal(first.evidence.publicResumeCursor, false);
    assert.equal(rows.length, 1); assert.equal(rows[0]!.observedAt, capturedAt); assert.equal(rows[0]!.target, null);
    const ids = f.store.transaction(tx => tx.list('inbox', scope, 100).map(row => row.id));
    f.store.transaction(tx => advanceCheckpoint(tx, scope, ids, () => {advanced = true;})); assert.equal(advanced, true);
    const correlated = reconcileReceipt(rows[0]!, {providerId: 'native', reference: messageRef(scope, 'native')});
    assert.equal(correlated.observedAt, capturedAt); // Pure shared correlation; no claim of a production writer extension.
  } finally { f.close(); }
});

test('recovery aborts receipt write failure before inbox acceptance and leaves raw capture', async () => {
  const f = fixture(); let accepted = 0;
  try {
    f.captures.put({capturedAt: 100, message: snapshot('early', {type: 'read', target: {id: 'native'}})});
    await assert.rejects(recoverStream({ids: f.captures.ids(), captures: f.captures, routes, clock: f.clock,
      receipts: {writer: {recordReceipt() {throw new Error('receipt-disk');}}}, accept: async () => {accepted++;}}), /receipt-disk/);
    assert.equal(accepted, 0); assert.equal([...f.captures.ids()].length, 1);
  } finally { f.close(); }
});

test('native reconciliation is exact, idempotent and does not infer individual group readers', async () => {
  const offline = await offlineSpace();
  let rows: ReceiptObservation[] = [], calls = 0;
  const sdk = nativeOwner(async id => {calls++; assert.equal(id, 'native'); return native('native', offline.space);});
  const target = {scope, conversationId: chat, providerTargetId: 'native', reference: messageRef(scope, 'native')};
  try {
    await sdk.start(); const writer = {recordReceipt(r: ReceiptObservation) {rows = appendReceipt(rows, r);}};
    await reconcileReceiptTarget(sdk, target, writer, {now: () => 1000});
    await reconcileReceiptTarget(sdk, target, writer, {now: () => 2000});
    assert.equal(calls, 2); assert.equal(rows.length, 2); assert.deepEqual(summarizeReceipts(rows, target.reference).readers, []);
    assert.equal(rows[0]!.observedAt, 1000); assert.equal(rows[0]!.providerAt, 200);
    await observeReceipt({...snapshot('native'), direction: 'outbound', metadata: {isDelivered: false}}, routes, 3000, {writer});
    assert.equal(summarizeReceipts(rows, target.reference).reading, 'observed');
  } finally { await sdk.stop(); await offline.app.stop(); }
});

test('missing native targets and wrong returned line remain unavailable rather than evidence', async () => {
  const offline = await offlineSpace('+15555550102');
  let answer: Message | undefined;
  const sdk = nativeOwner(async () => answer);
  try {
    await sdk.start(); const target = {scope, conversationId: chat, providerTargetId: 'native'};
    assert.equal((await lookupNativeMessageState(sdk, target)).status, 'missing');
    answer = native('native', offline.space);
    const result = await lookupNativeMessageState(sdk, target); assert.equal(result.status, 'unavailable');
    assert.throws(() => resolveProviderContext(sdk, {...scope, lineId: 'line-2'}, chat), /SCOPE_MISMATCH/);
    assert.equal(resolveProviderContext(sdk, scope, chat).ready(), true);
    assert.equal((await resolveProviderContext(sdk, scope, chat).lookupNativeMessageState('native')).status, 'unavailable');
  } finally { await sdk.stop(); await offline.app.stop(); }
});

test('hung lookup is bounded and cannot stack repeated calls or persist late evidence', async () => {
  const gate = deferred<Message | undefined>(); let calls = 0;
  const sdk = nativeOwner(async () => {calls++; return gate.promise;});
  try {
    await sdk.start(); const target = {scope, conversationId: chat, providerTargetId: 'native'};
    const first = await lookupNativeMessageState(sdk, target, {timeoutMs: 10});
    assert.deepEqual(first, {status: 'unavailable', reason: 'timeout'});
    const next = await lookupNativeMessageState(sdk, target, {timeoutMs: 10});
    assert.deepEqual(next, {status: 'unavailable', reason: 'lookup-in-flight'}); assert.equal(calls, 1);
    gate.resolve(native()); await settle();
    const abort = new AbortController(); abort.abort();
    assert.deepEqual(await lookupNativeMessageState(sdk, target, {signal: abort.signal}), {status: 'unavailable', reason: 'cancelled'});
    assert.equal(calls, 1);
  } finally { gate.resolve(undefined); await sdk.stop(); }
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

test('lookup timeout during space resolution cannot start a late native query', async () => {
  const gate = deferred<Space>(); let calls = 0;
  const sdk = new SpectrumOwner({inbound: 'photon-stream', outbound: 'imessage', wake: 'existing-grok-task-handoff'}, routes,
    async () => ({messages: async function* () {}, space: () => gate.promise, stop: async () => {}}));
  try {
    await sdk.start();
    assert.deepEqual(await lookupNativeMessageState(sdk, {scope, conversationId: chat, providerTargetId: 'native'}, {timeoutMs: 10}),
      {status: 'unavailable', reason: 'timeout'});
    gate.resolve({getMessage: async () => {calls++; return undefined;}} as unknown as Space);
    await settle(); assert.equal(calls, 0);
  } finally { await sdk.stop(); }
});
