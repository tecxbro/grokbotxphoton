import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAction, type Operation } from '../../src/index.js';
import { runtime, action, context, principal } from '../lanes/wt-09/harness.js';

test('actual socket authenticates outside model JSON and persists submit/status', async t => {
  const r = runtime(); t.after(() => r.close());
  const socket = await r.socket(); t.after(() => socket.close());
  const request = { version: 1, method: 'submit', action: action() };
  assert.equal((await socket.request(request, 'x'.repeat(64))).error.code, 'UNAUTHENTICATED');
  assert.equal(r.store.scan('outbox').length, 0);
  const reply = await socket.request(request);
  assert.equal(reply.ok, true); assert.equal(reply.result.status, 'queued');
  const status = await socket.request({version: 1, method: 'status', contextId: context.contextId, requestId: reply.result.requestId});
  assert.deepEqual(status.result, reply.result);
  assert.equal(r.store.scan('outbox').length, 1);
});

for (const [name, edit] of [
  ['expired', (c: any) => { c.expiresAt = 10000; }],
  ['future-issued', (c: any) => { c.issuedAt = 10001; }],
  ['revoked', (c: any) => { c.revokedAt = 9999; }],
  ['wrong-principal', (c: any) => { c.principalId = 'intruder'; }],
  ['permission-removed', (c: any) => { c.permissions = []; }],
] as const) test(`authoritative context rejects ${name} before queueing`, async t => {
  const r = runtime(); t.after(() => r.close()); r.updateContext(edit);
  const reply = await r.protocol.dispatch({version: 1, method: 'submit', action: action()}, principal);
  assert.equal(reply.ok, false); assert.equal(r.store.scan('outbox').length, 0);
});

test('forged context and model-supplied permission cannot grant access', async t => {
  const r = runtime(); t.after(() => r.close());
  const forged = { ...action(), contextId: 'made-up-context' };
  assert.equal((await r.protocol.dispatch({version: 1, method: 'submit', action: forged}, principal)).ok, false);
  for (const injection of [{permissions: ['space.create']}, {authorized: true}, {principalId: principal.id}, {token: 'secret'}]) {
    assert.throws(() => parseAction({...action(), ...injection}));
  }
  assert.equal(r.store.scan('outbox').length, 0);
});

for (const field of ['projectId', 'accountId', 'lineId', 'spaceId'] as const)
  test(`rejects cross-${field} target even when resource id is known`, async t => {
    const r = runtime(); t.after(() => r.close()); const a = action('text.send');
    if (a.operation !== 'text.send') throw new Error('fixture');
    a.arguments.space.scope[field] = 'other';
    await assert.rejects(r.submission.submit(a, context), /SCOPE_MISMATCH/);
    assert.equal(r.store.scan('outbox').length, 0);
  });

for (const op of ['space.create', 'space.rename', 'space.addMembers', 'space.removeMembers', 'space.leave', 'account.shareContact'] as Operation[])
  test(`${op} permission alone is insufficient for administrative intent`, async t => {
    const r = runtime(); t.after(() => r.close()); r.updateContext(c => {c.permissions.push(op);});
    await assert.rejects(r.submission.submit(action(op), context), /FORBIDDEN/);
  });

test('trusted administrative intent still cannot authorize a new recipient', async t => {
  const r = runtime({administrativeIntent: () => true, recipientsAllowed: () => false}); t.after(() => r.close());
  r.updateContext(c => {c.permissions.push('space.create');});
  await assert.rejects(r.submission.submit(action('space.create'), context), /FORBIDDEN/);
});

test('status and cancellation conceal results from another task and principal', async t => {
  const r = runtime(); t.after(() => r.close()); const result = await r.submission.submit(action(), context);
  for (const c of [ {...context, contextId: 'other-task-context', taskId: 'other-task'},
    {...context, contextId: 'other-principal-context', taskId: 'other-principal-task', principalId: 'other-principal'} ]) {
    r.seed(c);
    await assert.rejects(r.submission.status(result.requestId, c), /RESOURCE_NOT_FOUND/);
    await assert.rejects(r.submission.cancel(result.requestId, c), /RESOURCE_NOT_FOUND/);
  }
  r.updateContext(c => {c.permissions = [];});
  await assert.rejects(r.submission.status(result.requestId, context), /FORBIDDEN/);
});

test('context is refreshed on every socket request after revocation', async t => {
  const r = runtime(); t.after(() => r.close()); const socket = await r.socket(); t.after(() => socket.close());
  const request = {version: 1, method: 'diagnostics', contextId: context.contextId};
  assert.equal((await socket.request(request)).ok, true);
  r.updateContext(c => {c.revokedAt = 10000;});
  assert.equal((await socket.request(request)).error.code, 'CONTEXT_REVOKED');
});
