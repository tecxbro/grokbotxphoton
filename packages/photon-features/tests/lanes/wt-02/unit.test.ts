import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInboundEvent, messageRef } from '../../../src/runtime/inbound/normalize.js';
import { opaqueId, scopeKey } from '../../../src/adapters/transport/provider-context.js';
import { observeReceipt } from '../../../src/runtime/inbound/receipt-observer.js';
import { appendReceipt, summarizeReceipts, type ReceiptObservation } from '../../../src/contracts/receipts.js';
import { InboundRouter } from '../../../src/runtime/inbound/router.js';
import { TextBatcher, appendToBatch, releaseReadyBatch } from '../../../src/runtime/inbound/batching.js';
import { TypingLeases, acquireTypingLease, releaseTypingLease, expireLeases } from '../../../src/runtime/typing/leases.js';
import { fixture, snapshot, routes, scope, taskRoute, FakeTimers, settle } from './helpers.js';

test('event identity preserves persisted legacy keys, ignores observation time and separates edits/readers', () => {
  const raw = snapshot();
  const norm = (input: unknown, at = 100) => normalizeInboundEvent(input, 'capture-1', routes, at);
  assert.equal(norm(raw).eventId, norm(raw, 200).eventId);
  const captured = {...raw, metadata: {isDelivered: false}};
  assert.equal(norm(captured).eventId, opaqueId('event', scopeKey(scope), captured.id, captured.content,
    captured.timestamp, captured.direction, captured.sender.id, captured.metadata));
  assert.notEqual(norm(raw).eventId, norm({...raw, metadata: {dateEdited: '2026-09-09T00:00:00Z'}}).eventId);
  const read = snapshot('r1', {type: 'read', target: {id: 'target'}});
  assert.notEqual(norm(read).eventId, norm({...read, sender: {id: 'reader-2'}}).eventId);
  assert.equal(norm({...raw, direction: 'unknown'}).direction, 'system');
});

test('structured data stays captured/unresolved and references remain scoped', () => {
  const norm = (c: Record<string, unknown>) => normalizeInboundEvent(snapshot('m', c), 'raw-capture', routes, 100);
  assert.equal(norm({type: 'poll_option', selected: true, title: 'same title'}).type, 'unresolved');
  assert.equal(norm({type: 'unsend', target: {id: 'm'}}).type, 'unresolved');
  assert.equal(norm({type: 'future-event', data: {nested: 'retained in capture'}}).type, 'unresolved');
  assert.equal(norm({type: 'attachment', id: 'a', name: 'a.heic', mimeType: 'image/heic'}).type, 'message');
  assert.equal(norm({type: 'rename', displayName: 'Group'}).type, 'group');
});

test('durable text bursts release at the two-second boundary without merging individual inputs', async () => {
  const f = fixture();
  try {
    const router = new InboundRouter(f.store, f.clock, {route: () => taskRoute}, []);
    const batcher = new TextBatcher(router);
    await appendToBatch(router, f.event('one'));
    f.clock.advance(500); await appendToBatch(router, f.event('two'));
    f.clock.advance(1999); assert.deepEqual(releaseReadyBatch(batcher, scope), []);
    f.clock.advance(1); const ids = releaseReadyBatch(batcher, scope);
    assert.equal(ids.length, 1);
    assert.equal(f.store.transaction(tx => tx.get('handoffs', ids[0]!)!.eventIds.length), 2);
    assert.equal(f.store.transaction(tx => tx.list('inbox', scope, 100).length), 2);
  } finally { f.close(); }
});

test('early receipts retain real target/reader/time and duplicate arrival is idempotent', async () => {
  let rows: ReceiptObservation[] = [];
  const writer = {recordReceipt(r: ReceiptObservation) { rows = appendReceipt(rows, r); }};
  const read = snapshot('read-1', {type: 'read', target: {id: 'native-target'}});
  await observeReceipt(read, routes, 100, {writer}, {partId: 'part-2'});
  await observeReceipt(read, routes, 200, {writer}, {partId: 'part-2'});
  assert.equal(rows.length, 1); assert.equal(rows[0]!.target, null);
  assert.equal(rows[0]!.readerId, read.sender.id); assert.equal(rows[0]!.providerAt, Date.parse(read.timestamp));
  assert.equal(rows[0]!.observedAt, 100); assert.equal(rows[0]!.partId, 'part-2');
  await observeReceipt({...read, id: 'read-2', sender: undefined}, routes, 300, {writer});
  assert.equal(rows[1]!.readerId, null);
  await assert.rejects(observeReceipt(read, routes, 400, {writer, resolveTarget: () => ({providerId: 'wrong', reference: messageRef(scope, 'native-target')})}), /TARGET_MISMATCH/);
});

test('native read does not synthesize delivery, acceptance, readers or unread', async () => {
  let rows: ReceiptObservation[] = [];
  const target = messageRef(scope, 'native-target');
  const acquisition = {writer: {recordReceipt(r: ReceiptObservation) { rows = appendReceipt(rows, r); }},
    resolveTarget: () => ({providerId: 'native-target', reference: target})};
  const raw = {...snapshot('native-target'), direction: 'outbound', metadata: {dateRead: '2026-09-09T00:00:00Z'}};
  await observeReceipt(raw, routes, 100, acquisition);
  await observeReceipt({...raw, metadata: {}}, routes, 200, acquisition);
  const state = summarizeReceipts(rows, target);
  assert.equal(state.reading, 'observed'); assert.equal(state.delivery, 'unknown');
  assert.deepEqual(state.readers, []); assert.deepEqual(state.accepted, []);
  assert.equal(rows.length, 1);
});

test('typing token/generation, explicit expiry, cancellation and restart do not replay stale starts', async () => {
  const f = fixture(); const calls: string[] = [];
  const timers = new FakeTimers(f.clock);
  const resolve = async () => ({startTyping: async () => {calls.push('start');}, stopTyping: async () => {calls.push('stop');}});
  const leases = new TypingLeases(f.clock, resolve, timers);
  try {
    const old = acquireTypingLease(leases, scope, 1, 1000)!; await settle();
    acquireTypingLease(leases, scope, 2, 1000); releaseTypingLease(leases, old); await settle();
    assert.deepEqual(calls, ['start']);
    f.clock.advance(1000); expireLeases(leases); await settle(); assert.deepEqual(calls, ['start', 'stop']);
    const abort = new AbortController();
    acquireTypingLease(leases, scope, 3, 1000, {delayMs: 200, signal: abort.signal}); abort.abort();
    await timers.advance(200); assert.equal(calls.length, 2);
    const restarted = new TypingLeases(f.clock, resolve, timers); expireLeases(restarted); await settle();
    assert.equal(calls.length, 2); restarted.shutdown();
  } finally { leases.shutdown(); await leases.drain(); f.close(); }
});


test('malformed read targets and conflicting reuse of a source event cannot create receipt evidence', async () => {
  let rows: ReceiptObservation[] = [];
  const writer = {recordReceipt(r: ReceiptObservation) { rows = appendReceipt(rows, r); }};
  await assert.rejects(observeReceipt(snapshot('r', {type: 'read'}), routes, 100, {writer}), /RECEIPT_TARGET_REQUIRED/);
  assert.equal(rows.length, 0);
  const raw = snapshot('r', {type: 'read', target: {id: 'native'}});
  await observeReceipt(raw, routes, 100, {writer});
  await assert.rejects(observeReceipt({...raw, sender: {id: 'different-reader'}}, routes, 200, {writer}), /EVIDENCE_ID_CONFLICT/);
  assert.equal(rows.length, 1);
});
