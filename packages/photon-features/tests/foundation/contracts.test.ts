import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { operations, parseActionRequest } from '../../src/contracts/actions.js';
import { parseContentSpec } from '../../src/contracts/content.js';
import { assertTrustedContext } from '../../src/contracts/context.js';
import { incomingEventSchema } from '../../src/contracts/events.js';
import { resultSchema } from '../../src/contracts/results.js';
import { context,principal } from '../fixtures/runtime-services.js';
const fixture=(op:string)=>JSON.parse(readFileSync(new URL(`../../../tests/fixtures/${op}.json`,import.meta.url),'utf8')).valid;
for(const operation of operations)test(`strict request: ${operation}`,()=>{
 const valid=fixture(operation);assert.equal(parseActionRequest(valid).operation,operation);
 for(const invalid of [{...valid,admin:true},{...valid,arguments:{}},{...valid,arguments:{...valid.arguments,callback:()=>{}}},{...valid,operation:'exec'},{...valid,arguments:{...valid.arguments,shell:'echo hi'}}])assert.throws(()=>parseActionRequest(invalid));
});
test('JSON rejects getters without executing, SDK objects, cycles and oversized trees',()=>{
 let called=false;const action=fixture('text.send');Object.defineProperty(action.arguments,'text',{get(){called=true;return 'hi';},enumerable:true});assert.throws(()=>parseActionRequest(action));assert.equal(called,false);
 assert.throws(()=>parseActionRequest(Object.assign(new Date(),fixture('text.send'))));
 const cyclic:any={type:'group'};cyclic.items=[cyclic];assert.throws(()=>parseContentSpec(cyclic));
 assert.throws(()=>parseContentSpec({type:'text',text:'x'.repeat(262145)}));
 assert.throws(()=>parseContentSpec({type:'compose',items:[{type:'compose',items:[]}]}));
 assert.throws(()=>parseContentSpec({type:'attachment',media:'/tmp/file'}));
});
test('authoritative context binds identity, expiry, revocation, permissions, scopes and generation',()=>{
 const action=parseActionRequest(fixture('text.send'));assertTrustedContext(context,principal,action,1000);
 for(const patch of [{principalId:'other'},{revokedAt:999},{expiresAt:999},{permissions:[]},{issuedAt:2000}])assert.throws(()=>assertTrustedContext({...context,...patch},principal,action,1000));
 const other=fixture('text.send');other.arguments.space.scope.lineId='other';assert.throws(()=>assertTrustedContext(context,principal,parseActionRequest(other),1000));
 const stream=fixture('text.stream');stream.arguments.stream.generation=0;assert.throws(()=>assertTrustedContext({...context,permissions:['text.stream']},principal,parseActionRequest(stream),1000),/STALE_GENERATION/);
});
test('event and result reject executable and unknown data',()=>{
 assert.equal(incomingEventSchema.safeParse({type:'shell',command:'echo hello'}).success,false);
 assert.equal(resultSchema.safeParse({version:1,requestId:'r',status:'success',references:[]}).success,false);
});
