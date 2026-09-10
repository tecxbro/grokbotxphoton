import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { text, poll, option, markdown, resolveContents } from 'spectrum-ts';
import { operations, operationOwners, parseAction, foundationCapabilities } from '../../../src/index.js';
import { formatProse } from '../../../src/features/text-messages/voice-policy.js';
import { createCompilers } from '../../../src/features/text-messages/composition.js';
import { runtime, context, scope, action } from './harness.js';
import { unusedDependencies } from './execution-harness.js';

test('44 operation fixtures are accounted for with explicit implementation and availability',()=>{
  assert.equal(operations.length,44);assert.equal(new Set(operations).size,44);
  const owners=JSON.parse(readFileSync(new URL('../../../../../../docs/photon-features/ownership.json',import.meta.url),'utf8')).operations;
  for(const op of operations){assert.equal(parseAction(action(op)).operation,op);assert.equal(operationOwners[op],owners[op]);}
  assert.equal(foundationCapabilities().length,44);
  for(const c of foundationCapabilities()){assert.equal(c.providerSupport,'unknown');assert.equal(c.availability.account,'unknown');assert.equal(c.evidence.length,0);}
});
test('pinned public builders execute offline; duplicate labels do not imply unique option identity',async()=>{
  const built=await resolveContents([text('hello'),markdown('**Ada**'),poll('Pick',[option('Same'),option('Same')])]);
  assert.deepEqual(built.map(c=>c.type),['text','markdown','poll']);
  const p=built[2]!;assert.ok(p.type==='poll');assert.equal(p.options.length,2);assert.equal(p.options[0]!.title,'Same');
});
test('voice keeps names/acronyms/code/URLs intact and structured content bypasses formatter',async t=>{
  const r=runtime();t.after(()=>r.close());
  const prose='Hello Ada, NASA uses `CamelCase()` at https://example.com/A?B=C';
  const formatted=formatProse(prose).bubbles.join('\n\n');assert.ok(formatted.includes('Ada, NASA'));assert.ok(formatted.includes('`CamelCase()`'));assert.ok(formatted.includes('https://example.com/A?B=C'));
  assert.throws(()=>formatProse('Can you go? Could you stay?'));
  const compiler=createCompilers({binding:()=>({scope,phone:'fixture',nativeSpaceId:'fixture'}),requestId:()=> 'fixture'})[0]!;
  const input='Hello Ada — **NASA**? What Next?';
  const content=await compiler.compile({type:'markdown',text:input},{...unusedDependencies,context,transactions:r.store,clock:r.clock,
    signal:new AbortController().signal,claim:{owner:'fixture',fence:1,generation:1,leaseUntil:20000}});
  const built=(await resolveContents([content]))[0]!;assert.ok(built.type==='markdown');assert.equal(built.markdown,input);
});
