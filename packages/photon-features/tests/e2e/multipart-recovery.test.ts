import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DurableRecovery } from '../../src/runtime/core/recovery.js';
import { executeChild } from '../../src/runtime/core/execution-boundary.js';
import { runtime, action, context } from '../lanes/wt-09/harness.js';
import { execution, binding, outcome } from '../lanes/wt-09/execution-harness.js';
import { unusedDependencies } from '../lanes/wt-09/execution-harness.js';
import { createCompilers } from '../../src/features/text-messages/composition.js';
import { resolveContents } from 'spectrum-ts';
import { scope } from '../lanes/wt-09/harness.js';

test('process death after possible provider acceptance retains unknown and never blindly resends', async t => {
  const r = runtime(); t.after(() => r.close()); const submitted = await r.submission.submit(action(),context);
  const marker = join(r.dir,'accepted.txt');
  const child = spawnSync(process.execPath,[fileURLToPath(new URL('../lanes/wt-09/crash-worker.js',import.meta.url)),
    '--wt09-offline-crash',r.path,submitted.requestId,marker],{encoding:'utf8',timeout:10000});
  assert.equal(child.status,86,child.stderr); assert.equal(readFileSync(marker,'utf8'),'offline-provider-accepted\n');
  assert.equal(r.store.scan('attempts')[0]!.phase,'dispatching');
  r.clock.advance(1001); const recovery = new DurableRecovery(r.store,r.contexts);
  assert.equal(recovery.recover().unknown,1);
  assert.equal(r.store.scan('children')[0]!.state,'unknown');
  assert.equal((await r.submission.status(submitted.requestId,context)).status,'unknown-outcome');
  const {executor} = execution(r); let sent = 0;
  assert.equal(await executor.execute(submitted.requestId,binding(async()=>{sent++;return outcome();})),null);
  assert.equal(sent,0); assert.throws(()=>recovery.retry(submitted.requestId,context));
});

test('completed earlier child survives later pre-dispatch failure and retry', async t => {
  const r = runtime(); t.after(()=>r.close()); const submitted=await r.submission.submit(action(),context);
  const {executor}=execution(r); let first=0,second=0,fail=true;
  const module=binding(async(_a,s)=>{
    await executeChild(s,0,async()=>{first++;return outcome();});
    if(fail) throw new Error('controlled compiler unavailable before second dispatch');
    await executeChild(s,1,async()=>{second++;return outcome();}); return outcome();
  },'durable-children');
  assert.equal((await executor.execute(submitted.requestId,module))!.status,'blocked');
  assert.equal(first,1); assert.equal(second,0);
  new DurableRecovery(r.store,r.contexts).retry(submitted.requestId,context); fail=false;
  assert.equal((await executor.execute(submitted.requestId,module))!.status,'executor-completed');
  assert.equal(first,1); assert.equal(second,1); assert.equal(r.store.scan('children').length,2);
});

test('unknown later child preserves earlier completion and prevents replay', async t => {
  const r=runtime();t.after(()=>r.close());const submitted=await r.submission.submit(action(),context);const {executor}=execution(r);
  const calls:number[]=[];const module=binding(async(_a,s)=>{
    await executeChild(s,0,async()=>{calls.push(0);return outcome();});
    await executeChild(s,1,async()=>{calls.push(1);throw new Error('acceptance uncertain');});return outcome();
  },'durable-children');
  assert.equal((await executor.execute(submitted.requestId,module))!.status,'unknown-outcome');
  assert.deepEqual(r.store.scan('children').sort((a,b)=>a.index-b.index).map(c=>c.state),['completed','unknown']);
  assert.equal(await executor.execute(submitted.requestId,module),null);assert.deepEqual(calls,[0,1]);
});

test('resolved promise cannot manufacture provider acceptance or read evidence', async t => {
  for (const status of ['provider-accepted','observed-read'] as const) {
    const r=runtime();t.after(()=>r.close());const submitted=await r.submission.submit(action(),context);const {executor}=execution(r);
    assert.equal((await executor.execute(submitted.requestId,binding(async()=>({...outcome(),status}))))!.status,'unknown-outcome');
  }
});

test('structured content bypasses prose formatting and remains byte-for-byte intact', async t => {
  const r=runtime();t.after(()=>r.close());
  const compiler=createCompilers({binding:()=>({scope,phone:'offline-line',nativeSpaceId:'offline-chat'}),requestId:()=> 'structured-request'})
    .find(value=>value.family==='markdown')!;
  const source='**NASA?** Keep `CamelCase()` and https://example.com/A?B=C unchanged?';
  const built=await compiler.compile({type:'markdown',text:source},{...unusedDependencies,context,transactions:r.store,clock:r.clock,
    signal:new AbortController().signal,claim:{owner:'fixture',fence:1,generation:1,leaseUntil:20000}});
  const content=(await resolveContents([built]))[0]!;
  assert.equal(content.type,'markdown');
  assert.equal(content.markdown,source);
});
