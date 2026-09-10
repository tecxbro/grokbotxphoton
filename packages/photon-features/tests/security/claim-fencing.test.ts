import test from 'node:test';
import assert from 'node:assert/strict';
import { ExecutionClaims } from '../../src/runtime/core/claims.js';
import { runtime, action, context } from '../lanes/wt-09/harness.js';

test('lease heartbeat preserves fence; stale owner/fence/generation cannot write', async t => {
  const r = runtime(); t.after(() => r.close()); const claims = new ExecutionClaims(r.store, r.contexts);
  const result = await r.submission.submit(action(), context);
  const claim = claims.acquire(result.requestId, 'executor-a', 1000)!; assert.ok(claim);
  assert.equal(claims.acquire(result.requestId, 'executor-b', 1000), null);
  r.clock.advance(100); claims.heartbeat(result.requestId, claim, 2000);
  assert.equal(r.store.scan('outbox')[0]!.claim!.fence, claim.fence);
  for (const stale of [{...claim, owner: 'executor-b'}, {...claim, fence: claim.fence + 1}, {...claim, generation: 99}])
    assert.throws(() => r.store.transaction(tx => claims.writable(tx, result.requestId, stale)), /STALE_FENCE/);
  r.clock.advance(2000);
  assert.throws(() => claims.heartbeat(result.requestId, claim, 1000), /STALE_FENCE/);
  assert.equal(claims.acquire(result.requestId, 'executor-b', 1000), null, 'expired work requires recovery before reclaim');
});

test('cancellation and revocation invalidate an already held claim', async t => {
  const r = runtime(); t.after(() => r.close()); const claims = new ExecutionClaims(r.store, r.contexts);
  const result = await r.submission.submit(action(), context); const claim = claims.acquire(result.requestId, 'executor', 1000)!;
  await r.submission.cancel(result.requestId, context);
  assert.throws(() => r.store.transaction(tx => claims.writable(tx, result.requestId, claim)), /CANCELLED/);
  assert.notEqual((await r.submission.status(result.requestId, context)).status, 'cancelled', 'an in-flight claim is not proof of undone delivery');
});

test('revocation and task generation change fence a previously acquired executor',async t=>{
  for(const change of ['revocation','generation']){
    const r=runtime();t.after(()=>r.close());const claims=new ExecutionClaims(r.store,r.contexts);
    const result=await r.submission.submit(action(),context);const claim=claims.acquire(result.requestId,'executor',1000)!;
    if(change==='revocation')r.updateContext(c=>{c.revokedAt=10000;});
    else r.store.transaction(tx=>{const task=tx.get('tasks',context.taskId)!;const revision=task.revision++;task.generation++;tx.put('tasks',task,revision);});
    assert.throws(()=>r.store.transaction(tx=>claims.writable(tx,result.requestId,claim)),/CONTEXT_REVOKED|STALE_GENERATION/);
  }
});

test('one idempotency key cannot claim conflicting arguments',async t=>{
  const r=runtime();t.after(()=>r.close());const first=action('text.send');
  await r.submission.submit(first,context);
  const conflict=structuredClone(first);
  if(conflict.operation!=='text.send')throw new Error('fixture');
  conflict.arguments.text='conflicting logical write';
  await assert.rejects(r.submission.submit(conflict,context),/IDEMPOTENCY_CONFLICT/);
  assert.equal(r.store.scan('outbox').length,1);
  assert.deepEqual(r.store.scan('outbox')[0]!.action,first);
});
