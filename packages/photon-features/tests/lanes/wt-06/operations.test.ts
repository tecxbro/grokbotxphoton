import test from 'node:test';
import assert from 'node:assert/strict';
import { imessage } from 'spectrum-ts/providers/imessage';
import { buildRegistry, resultSchema } from '../../../src/index.js';
import { cardContent } from '../../../src/features/cards/sdk.js';
import { createCardsModule, cardCapabilityReport } from '../../../src/features/cards/module.js';
import { fixture, templates } from './fixture.js';

test('registers exactly three handlers and keeps all four capability categories separate', t => {
  const f = fixture(); t.after(() => f.close());
  const registry = buildRegistry([f.module], { requireComplete: false });
  assert.deepEqual([...registry.handlers.keys()], ['app.send', 'app.sendCustomized', 'app.update']);
  const report = cardCapabilityReport(f.options);
  assert.equal(report.richLinkPreview.owner, 'wt-03');
  assert.equal(report.staticCard.implemented, true);
  assert.equal(report.authenticatedCallback.backendConfigured, false);
  assert.deepEqual(report.liveRendering.configuredTemplates, []);
  assert.equal(report.restartRestoration.supportedFromCheckpointAlone, false);
});
test('universal cards do not require extension/backend config; customized cards do', async t => {
  const config = templates(); delete config[1]!.extension;
  const f = fixture(config); t.after(() => f.close());
  const universal = await f.execute(f.sendAction('universal'));
  assert.equal(universal.status, 'provider-accepted'); resultSchema.parse(universal);
  assert.equal(f.native.calls[0]!.type, 'app');
  const custom = await f.execute(f.sendAction());
  assert.equal(custom.status, 'blocked'); assert.equal(custom.error?.blockerId, 'customized_extension_missing');
  assert.equal(f.native.calls.length, 1);
});
test('customized staged image maps caption to the pinned required imageTitle field', async t => {
  const f = fixture(); t.after(() => f.close());
  const layout = { caption: 'Status image', image: { stagingId: 'fixture-image', sha256: 'a'.repeat(64), mimeType: 'image/png', bytes: 3 } };
  const built = await (await cardContent(f.options.templates[1]!, 'https://fixture.invalid/card', layout, f.s)).build();
  const value = JSON.parse(JSON.stringify(built));
  assert.equal(value.layout.imageTitle, 'Status image'); assert.equal(value.layout.caption, 'Status image');
  await assert.rejects(cardContent(f.options.templates[1]!, 'https://fixture.invalid/card', { ...layout, caption: '' }, f.s), /nonempty caption/);
});
test('customized update retains original target and refreshes metadata on successful void', async t => {
  const f = fixture(); t.after(() => f.close());
  const sent = await f.execute(f.sendAction()); assert.equal(sent.status, 'provider-accepted');
  const old = f.session(sent.references), original = f.native.messages.get(old.providerMessageId)!;
  const result = await f.execute(f.updateAction(sent.references));
  assert.equal(result.status, 'executor-completed'); resultSchema.parse(result);
  assert.deepEqual(result.references, sent.references); assert.deepEqual(result.value, { type: 'void' });
  assert.deepEqual(result.observations, []);
  const edit = f.native.calls[1]!; assert.equal(edit.type, 'edit');
  if (edit.type !== 'edit') throw new Error('expected edit');
  assert.equal(edit.target, original); assert.equal(original.id, old.providerMessageId);
  assert.equal(f.native.messages.size, 1);
  const next = f.session(sent.references);
  assert.equal(next.cardRevision, 1); assert.notDeepEqual(next.metadata, old.metadata);
  assert.deepEqual(next.metadata, imessage(original).miniAppCardSession);
  assert.equal((await f.execute(f.updateAction(sent.references))).status, 'executor-completed');
});
test('universal update is blocked without real URL mapping and works through registered mapping', async t => {
  const f = fixture(); t.after(() => f.close());
  const sent = await f.execute(f.sendAction('universal'));
  const missing = await f.execute(f.updateAction(sent.references));
  assert.equal(missing.error?.blockerId, 'universal_update_url_required'); assert.equal(f.native.calls.length, 1);
  f.options.templates[0]!.updateUrl = async layout => `https://fixture.invalid/card?caption=${encodeURIComponent(layout.caption)}`;
  assert.equal((await f.execute(f.updateAction(sent.references))).status, 'executor-completed');
  assert.equal(f.session(sent.references).url, 'https://fixture.invalid/card?caption=After');
});
test('live flag requires configured evidence and is never inferred from a send', async t => {
  const config = templates(); config[0]!.live = { installedExtensionVerified: false, evidence: '' };
  const f = fixture(config); t.after(() => f.close());
  assert.equal((await f.execute(f.sendAction('universal'))).error?.blockerId, 'live_extension_unverified');
  config[0]!.live = { installedExtensionVerified: true, evidence: 'fixture-only-installed-extension' };
  assert.equal((await f.execute(f.sendAction('universal'))).status, 'provider-accepted');
  const content = f.native.calls[0]!; assert.equal(content.type, 'app');
  if (content.type === 'app') assert.equal(content.live, true);
  assert.equal(cardCapabilityReport(f.options).liveRendering.liveVerified, false);
});
test('undefined send, uncertain dispatch and duplicate request do not invent card references', async t => {
  const f = fixture(); t.after(() => f.close()); f.native.returnUndefined = true;
  const action = f.sendAction();
  for (let n = 0; n < 2; n++) { const result = await f.execute(action); assert.equal(result.status, 'unknown-outcome'); assert.deepEqual(result.references, []); }
  assert.equal(f.native.calls.length, 1);
});
test('same-card concurrent requests cannot silently overwrite a completed revision', async t => {
  const f = fixture(); t.after(() => f.close()); const sent = await f.execute(f.sendAction());
  const results = await Promise.all([f.execute(f.updateAction(sent.references)), f.execute(f.updateAction(sent.references))]);
  assert.deepEqual(results.map(r => r.status), ['executor-completed', 'failed']);
  assert.equal(results[1]!.error?.code, 'IDEMPOTENCY_CONFLICT'); assert.equal(f.native.calls.length, 2);
});
test('delayed admission intent cannot overwrite newer state and missing revision binding blocks', async t => {
  const f = fixture(); t.after(() => f.close()); const sent = await f.execute(f.sendAction());
  const delayed = f.updateAction(sent.references), newer = f.updateAction(sent.references);
  assert.equal((await f.execute(newer)).status, 'executor-completed');
  assert.equal((await f.execute(delayed)).error?.code, 'IDEMPOTENCY_CONFLICT');
  delete f.options.updateRevision;
  assert.equal((await f.execute(f.updateAction(sent.references))).error?.blockerId, 'card_update_revision_required');
  assert.equal(f.native.calls.length, 2);
});
test('second module is excluded by durable in-flight marker, including after lease expiry', async t => {
  const f = fixture(); t.after(() => f.close()); const sent = await f.execute(f.sendAction());
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(r => { entered = r; }), hold = new Promise<void>(r => { release = r; });
  f.native.hook = async c => { if (c.type === 'edit') { entered(); await hold; } };
  const active = f.execute(f.updateAction(sent.references)); await started;
  f.clock.advance(90001);
  const other = createCardsModule(f.options), action = f.updateAction(sent.references);
  const secondServices = { ...f.s, claim: { owner: 'worker-2', fence: 2, generation: 1, leaseUntil: f.clock.now() + 90000 } };
  f.s.transactions.transaction(tx => { const request = tx.get('outbox', action.idempotencyKey)!;
    tx.put('outbox', { ...request, revision: request.revision + 1, claim: secondServices.claim }, request.revision); });
  const result = await other.handlers.find(h => h.operation === 'app.update')!.execute(action, secondServices);
  assert.equal(result.error?.blockerId, 'card_update_outcome_unknown');
  release(); assert.equal((await active).status, 'unknown-outcome'); assert.equal(f.native.calls.length, 2);
});
for (const change of ['cancel', 'generation', 'fence', 'line', 'conversation'] as const) test(`rejects ${change} before side effects`, async t => {
  const f = fixture(); t.after(() => f.close()); const sent = await f.execute(f.sendAction()); const action = f.updateAction(sent.references);
  if (change === 'cancel') f.abort.abort();
  if (change === 'line') f.native.phone = '+15555550999';
  if (change === 'conversation' && action.operation === 'app.update') action.arguments.card.scope.spaceId = 'wrong-space';
  if (change === 'generation') f.s.transactions.transaction(tx => { const task = tx.get('tasks', f.s.context.taskId)!; tx.put('tasks', { ...task, revision: task.revision + 1, generation: 2 }, task.revision); });
  if (change === 'fence') f.s.claim = { ...f.s.claim, fence: 2 };
  assert.notEqual((await f.execute(action)).status, 'executor-completed'); assert.equal(f.native.calls.length, 1);
});
test('cancellation during asynchronous preparation is fenced immediately before dispatch', async t => {
  const f = fixture(); t.after(() => f.close()); const sent = await f.execute(f.sendAction('universal'));
  f.options.templates[0]!.updateUrl = async () => { f.abort.abort(); return 'https://fixture.invalid/next'; };
  assert.equal((await f.execute(f.updateAction(sent.references))).status, 'cancelled'); assert.equal(f.native.calls.length, 1);
});
for (const cause of ['provider', 'post-dispatch-generation', 'commit'] as const) test(`${cause} failure leaves durable uncertainty and blocks retries`, async t => {
  const f = fixture(); t.after(() => f.close()); const sent = await f.execute(f.sendAction());
  f.native.hook = async content => { if (content.type !== 'edit') return;
    if (cause === 'provider') throw new Error('secret-provider-error');
    if (cause === 'post-dispatch-generation') f.s.transactions.transaction(tx => { const task = tx.get('tasks', f.s.context.taskId)!; tx.put('tasks', { ...task, revision: task.revision + 1, generation: 2 }, task.revision); });
    if (cause === 'commit') f.failTransactionAt('cards');
  };
  const result = await f.execute(f.updateAction(sent.references)); assert.equal(result.status, 'unknown-outcome');
  assert.equal(f.session(sent.references).phase, 'unknown'); assert.equal(JSON.stringify(result).includes('secret-provider-error'), false);
  if (cause !== 'post-dispatch-generation') assert.equal((await f.execute(f.updateAction(sent.references))).error?.blockerId, 'card_update_outcome_unknown');
  assert.equal(f.native.calls.length, 2);
});
