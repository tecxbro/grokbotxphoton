import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { CardRuntime, executeCardOperation, type CardRuntimeOptions } from '../../../src/features/cards/operations.js';
import { makeServices, scope, context } from '../../fixtures/runtime-services.js';
import { FakeSpace, templates } from './fixture.js';
import { parseAction, type Action, type OperationResult, type ResourceRef } from '../../../src/index.js';
import type { ExecutionServices } from '../../../src/contracts/services.js';
import { decodeSession, encodeCardSession, restoreCardSession } from '../../../src/features/cards/session-codec.js';
import { authenticateInteraction } from '../../../src/features/cards/interaction-adapter.js';
import type { CardTemplate } from '../../../src/features/cards/configuration.js';

/** Reusable contract fixture in the exact four-file owned test layout. It never
 * instantiates a provider and is not evidence of production executor durability. */
export function publicFixture(configured: CardTemplate[] = templates()) {
  const base = makeServices(), native = new FakeSpace();
  const services: ExecutionServices = { ...base.services, context: { ...context, permissions: ['app.send', 'app.sendCustomized', 'app.update'] } };
  const space: Extract<ResourceRef, { kind: 'space' }> = { version: 1, kind: 'space', id: scope.spaceId, scope };
  services.transaction(unit => unit.put('references', { id: space.id, scope, revision: 0, reference: space,
    providerId: native.id, taskId: context.taskId, generation: context.generation, ownedByPrincipalId: context.principalId }, null));
  services.resolveResource = async ref => {
    services.assertActiveClaim();
    const row = services.transaction(unit => unit.get('references', ref.id));
    assert.deepEqual(row?.reference, ref);
    assert.equal(row?.generation, services.context.generation);
    return ref;
  };
  const children = new Map<string, { digest: string; result: Promise<OperationResult> }>();
  let childCalls = 0;
  services.executeChild = async child => {
    services.assertActiveClaim(); childCalls++;
    const previous = children.get(child.key);
    if (previous) { assert.equal(previous.digest, child.argumentsDigest); return previous.result; }
    const result = Promise.resolve().then(() => child.dispatch(services.signal));
    children.set(child.key, { digest: child.argumentsDigest, result });
    return result;
  };
  const revisions = new Map<string, number>();
  const options: CardRuntimeOptions = { templates: configured, binding: c => ({ scope: c.scope, phone: native.phone, nativeSpaceId: native.id }),
    space: async () => native, requestId: action => action.idempotencyKey, updateRevision: action => revisions.get(action.idempotencyKey) };
  const runtime = new CardRuntime(options);
  let sequence = 0;
  const send = (kind: 'universal' | 'custom' = 'custom') => parseAction({ version: 1, contextId: context.contextId, idempotencyKey: `send-${++sequence}`,
    operation: kind === 'universal' ? 'app.send' : 'app.sendCustomized', arguments: { space, templateId: kind, url: 'https://fixture.invalid/app',
      ...(kind === 'custom' ? { layout: { caption: 'First' } } : {}) } });
  const update = (result: OperationResult, expected = 0) => {
    const action = parseAction({ version: 1, contextId: context.contextId, idempotencyKey: `update-${++sequence}`, operation: 'app.update',
      arguments: { card: result.references.find(ref => ref.kind === 'card'), session: result.references.find(ref => ref.kind === 'card-session'), layout: { caption: 'Updated' } } });
    revisions.set(action.idempotencyKey, expected); return action;
  };
  const execute = (action: Action, instance = runtime) => executeCardOperation(action, services, instance);
  const snapshot = (result: OperationResult) => runtime.snapshot(result.references.find(ref => ref.kind === 'card-session')!.id)!;
  const assertion = async (result: OperationResult, changes: Record<string, unknown> = {}) => {
    const data = decodeSession(snapshot(result));
    return authenticateInteraction({ body: new Uint8Array([1]), headers: {} }, { id: 'fixture-hmac-v1', source: 'test-only authenticated capture fixture',
      authenticate: async () => ({ version: 1, eventId: 'event-1', session: data.session, scope, taskId: data.taskId, generation: data.generation,
        participantId: 'participant-1', nonce: data.callback!.nonce, actionId: 'confirm', selection: ['yes'], occurredAt: services.clock.now(), ...changes }) });
  };
  return { ...base, services, native, runtime, options, send, update, execute, snapshot, assertion, revisions, children, childCalls: () => childCalls };
}

// Importing this fixture in the other three suites must not register duplicate tests.
if (import.meta.url === pathToFileURL(process.argv[1]!).href) {
  test('configured static and customized sends use separate native builder shapes', async () => {
    const f = publicFixture();
    for (const kind of ['universal', 'custom'] as const) assert.equal((await f.execute(f.send(kind))).status, 'provider-accepted');
    assert.deepEqual(f.native.calls.map(c => c.type), ['app', 'customized-mini-app']); assert.equal(f.childCalls(), 2);
  });
  for (const [name, mutate, blocker] of [
    ['missing template', (t: CardTemplate[]) => t.splice(1, 1), 'card_template_missing'],
    ['missing extension', (t: CardTemplate[]) => delete t[1]!.extension, 'customized_extension_missing'],
    ['missing live installation', (t: CardTemplate[]) => { t[1]!.live = { installedExtensionVerified: false, evidence: '' }; }, 'live_extension_unverified'],
  ] as const) test(name + ' blocks before provider effects', async () => {
    const config = templates(); mutate(config); const f = publicFixture(config);
    const result = await f.execute(f.send()); assert.equal(result.error?.blockerId, blocker); assert.equal(f.native.calls.length, 0);
  });
  test('unapproved origin, inbound card and wrong serving line are rejected', async () => {
    const f = publicFixture(); const action = f.send(); if (action.operation !== 'app.sendCustomized') throw Error();
    action.arguments.url = 'https://other.invalid/app'; assert.equal((await f.execute(action)).error?.code, 'FORBIDDEN');
    const good = await f.execute(f.send()); const original = [...f.native.messages.values()][0]!;
    original.direction = 'inbound'; assert.equal((await f.execute(f.update(good))).error?.code, 'SCOPE_MISMATCH');
    original.direction = 'outbound'; f.options.binding = c => ({ scope: c.scope, phone: '+15559999999', nativeSpaceId: f.native.id });
    assert.equal((await f.execute(f.update(good))).error?.code, 'SCOPE_MISMATCH'); assert.equal(f.native.calls.length, 1);
  });
  test('session codec rejects SDK graphs, oversized metadata, versions and fake restoration', async () => {
    const f = publicFixture(), result = await f.execute(f.send()); const json = f.snapshot(result), data = decodeSession(json);
    assert.equal(JSON.parse(encodeCardSession(data)).version, 1);
    assert.throws(() => restoreCardSession(json), /session/);
    assert.throws(() => encodeCardSession({ ...data, version: 2 } as never));
    assert.throws(() => encodeCardSession({ ...data, original: [...f.native.messages.values()][0] } as never));
    assert.throws(() => decodeSession(' '.repeat(32769)));
    const original = [...f.native.messages.values()][0]!;
    assert.equal(restoreCardSession(json, original).original, original);
    assert.throws(() => restoreCardSession(json, { ...original, id: 'different' }));
  });
  test('missing immutable revision and universal URL mapping block only updates', async () => {
    const f = publicFixture(), sent = await f.execute(f.send('universal'));
    const update = f.update(sent); f.revisions.clear();
    assert.equal((await f.execute(update)).error?.blockerId, 'card_update_revision_required');
    assert.equal((await f.execute(f.update(sent))).error?.blockerId, 'universal_update_url_required');
    assert.equal(f.native.calls.length, 1);
  });
  test('callback backend and raw payload bounds fail closed', async () => {
    const request = { body: new Uint8Array([1]), headers: {} };
    await assert.rejects(authenticateInteraction(request), /not configured/);
    const backend = { id: 'test', source: 'test fixture', authenticate: async () => ({}) };
    await assert.rejects(authenticateInteraction({ ...request, body: new Uint8Array(16385) }, backend), /bounds/);
    await assert.rejects(authenticateInteraction(request, backend));
  });
}
