import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Message, Space } from 'spectrum-ts';
import {
  appendReceipt,
  parseAction,
  reconcileReceipt,
  summarizeReceipts,
  type ReceiptObservation,
  type ResourceRef,
} from '../../src/index.js';
import { snapshotMessage } from '../../src/adapters/transport/snapshot.js';
import { ProviderContext } from '../../src/adapters/transport/provider-context.js';
import { normalizeCaptured } from '../../src/runtime/inbound/normalize.js';
import { InboundRouter } from '../../src/runtime/inbound/router.js';
import { runtime, action, context, scope } from '../lanes/wt-09/harness.js';

const target: Extract<ResourceRef, { kind: 'message' }> = {
  version: 1,
  kind: 'message',
  id: 'message-1',
  scope,
};

function observation(
  evidenceId: string,
  kind: ReceiptObservation['kind'],
  fields: Partial<ReceiptObservation> = {},
): ReceiptObservation {
  return {
    evidenceId,
    scope,
    target,
    providerTargetId: 'provider-message-1',
    partId: null,
    kind,
    readerId: null,
    providerAt: null,
    observedAt: 10000,
    source: kind === 'accepted' ? 'sdk-return' : 'provider-event',
    sourceRevision: null,
    ...fields,
  };
}

test('queue, provider acceptance, delivery and read are independent evidence dimensions', async t => {
  const r = runtime();
  t.after(() => r.close());
  const queued = await r.submission.submit(action(), context);
  assert.equal(queued.status, 'queued');

  const accepted = observation('accepted-1', 'accepted', { providerAt: 9000 });
  const acceptedOnly = summarizeReceipts([accepted], target);
  assert.equal(acceptedOnly.accepted.length, 1);
  assert.equal(acceptedOnly.delivery, 'unknown');
  assert.equal(acceptedOnly.reading, 'unknown');

  const readOnly = summarizeReceipts([
    observation('read-1', 'read', { readerId: 'reader-1', providerAt: 9500 }),
  ], target);
  assert.equal(readOnly.reading, 'observed');
  assert.equal(readOnly.delivery, 'unknown', 'read-before-delivery must not fabricate delivery');
  assert.equal(readOnly.delivered.length, 0);
  assert.equal(summarizeReceipts([], target).reading, 'unknown', 'missing receipt is unknown, not unread');
});

test('early and duplicate evidence correlates only to the exact message, part, line and chat', () => {
  const early = observation('early-read', 'read', {
    target: null,
    partId: 'part-2',
    readerId: 'reader-1',
    providerAt: 8000,
  });
  const ledger = appendReceipt([], early);
  assert.equal(appendReceipt(ledger, { ...early, observedAt: 11000 }).length, 1);
  const resolved = reconcileReceipt(early, { providerId: 'provider-message-1', reference: target });
  assert.equal(resolved.providerAt, 8000);
  assert.equal(resolved.observedAt, 10000);
  assert.equal(summarizeReceipts([resolved], target, 'part-1').reading, 'unknown');
  assert.equal(summarizeReceipts([resolved], target, 'part-2').reading, 'observed');

  assert.throws(
    () => reconcileReceipt(early, { providerId: 'other-message', reference: target }),
    /RECEIPT_TARGET_MISMATCH/,
  );
  assert.throws(
    () => reconcileReceipt(early, {
      providerId: 'provider-message-1',
      reference: { ...target, scope: { ...scope, lineId: 'other-line' } },
    }),
    /RECEIPT_TARGET_MISMATCH/,
  );
  assert.equal(
    summarizeReceipts([resolved], { ...target, scope: { ...scope, spaceId: 'other-chat' } }, 'part-2').reading,
    'unknown',
  );
});

test('duplicate readers, stale snapshots and group ambiguity cannot overstate read evidence', () => {
  const observations = [
    observation('read-a', 'read', { readerId: 'reader-1', providerAt: 9000 }),
    observation('read-b', 'read', { readerId: 'reader-1', providerAt: 9000, observedAt: 11000 }),
    observation('read-group-unknown', 'read', { readerId: null, source: 'snapshot', observedAt: 12000 }),
    observation('late-stale-accepted', 'accepted', { source: 'snapshot', observedAt: 13000 }),
  ];
  const summary = summarizeReceipts(observations, target);
  assert.deepEqual(summary.readers, ['reader-1']);
  assert.equal(summary.reading, 'observed');
  assert.equal(summary.delivery, 'unknown');
  assert.notEqual(summary.readers.length, 3, 'unknown group readers are not fabricated');
});

test('pinned SDK exposes delivery as message metadata, not an invented delivered event', () => {
  const spaceValue = {
    id: 'provider-chat',
    __platform: 'imessage',
    phone: 'offline-line',
    send: async () => undefined,
  } as unknown as Space;
  const message = {
    id: 'provider-message-1',
    __platform: 'imessage',
    platform: 'imessage',
    direction: 'outbound',
    sender: undefined,
    timestamp: new Date(7000),
    content: { type: 'text', text: 'hello' },
    space: spaceValue,
    dateDelivered: new Date(8000),
    dateRead: new Date(9000),
    isDelivered: true,
  } as unknown as Message;
  const snapshot = snapshotMessage(message);
  assert.deepEqual(snapshot.metadata, {
    dateEdited: undefined,
    dateDelivered: new Date(8000).toISOString(),
    dateRead: new Date(9000).toISOString(),
    dateRetracted: undefined,
    isDelivered: true,
    sendErrorCode: undefined,
    attachmentMetadata: undefined,
  });

  const routes = new ProviderContext('project-1', [
    { accountId: 'account-1', lineId: 'line-1', phone: 'offline-line' },
  ]);
  const event = normalizeCaptured({
    id: 'provider-message-1',
    platform: 'imessage',
    direction: 'outbound',
    space: { id: 'provider-chat', platform: 'imessage', phone: 'offline-line' },
    content: { type: 'text', text: 'hello' },
    metadata: { dateDelivered: new Date(8000).toISOString() },
  }, 'capture-1', routes, 10000);
  assert.equal(event.type, 'unresolved', 'outbound metadata is reconciled separately; no delivered event is invented');
});

test('actual inbound normalization and router dedupe receipts without conversational replies', async t => {
  const r = runtime();
  t.after(() => r.close());
  const routes = new ProviderContext('project-1', [
    { accountId: 'account-1', lineId: 'line-1', phone: 'offline-line' },
  ]);
  const raw = {
    id: 'read-event-1',
    platform: 'imessage',
    direction: 'inbound',
    sender: { id: 'reader-1' },
    space: { id: 'provider-chat', platform: 'imessage', phone: 'offline-line' },
    timestamp: new Date(9000).toISOString(),
    content: { type: 'read', target: { id: 'provider-message-1' } },
  };
  const event = normalizeCaptured(raw, 'capture-1', routes, 10000);
  assert.equal(event.type, 'receipt');
  const router = new InboundRouter(
    r.store,
    r.clock,
    { route: () => ({ taskId: context.taskId, generation: 1, principalId: context.principalId }) },
    [],
  );
  await router.accept(event);
  await router.accept({ ...event, receivedAt: 12000 });
  assert.equal(r.store.scan('inbox').length, 1);
  assert.equal(r.store.scan('handoffs').length, 0, 'receipts must not wake conversational replies');
  assert.equal(r.store.scan('inbox')[0]!.state, 'unresolved', 'missing receipt reducer remains visible');
});

test('restart preserves unresolved evidence and exact correlation', t => {
  const r = runtime();
  t.after(() => r.close());
  const path = join(r.dir, 'receipts.sqlite');
  const migration = readFileSync(new URL('../../../src/state/migrations/0001-initial.sql', import.meta.url), 'utf8');
  const early = observation('restart-read', 'read', { target: null, readerId: 'reader-1', providerAt: 8000 });
  let db = new DatabaseSync(path);
  db.exec(migration);
  db.prepare(
    'INSERT INTO receipt_observations(scope,evidence_id,target_id,provider_target_id,kind,observed_at,source,body) VALUES(?,?,?,?,?,?,?,?)',
  ).run(JSON.stringify(scope), early.evidenceId, null, early.providerTargetId, early.kind, early.observedAt, early.source, JSON.stringify(early));
  db.close();

  db = new DatabaseSync(path);
  const row = db.prepare('SELECT body FROM receipt_observations WHERE evidence_id=?').get(early.evidenceId)!;
  db.close();
  const recovered = JSON.parse(String(row.body)) as ReceiptObservation;
  const resolved = reconcileReceipt(recovered, { providerId: 'provider-message-1', reference: target });
  assert.equal(summarizeReceipts([resolved], target).reading, 'observed');
  assert.equal(resolved.providerAt, 8000);
});

test('message.markRead is a control action and cannot create recipient-read evidence', () => {
  const markRead = parseAction(action('message.markRead'));
  assert.equal(markRead.operation, 'message.markRead');
  assert.equal(summarizeReceipts([], target).reading, 'unknown');
});

test('assembled runtime must expose durable receipt recording before product acceptance', t => {
  const r = runtime();
  t.after(() => r.close());
  assert.equal(
    typeof (r.store as unknown as { recordReceipt?: unknown }).recordReceipt,
    'function',
    'WT-02/WT-01 must implement StateStore.recordReceipt and reconcile normalized receipts on the assembled path',
  );
});
