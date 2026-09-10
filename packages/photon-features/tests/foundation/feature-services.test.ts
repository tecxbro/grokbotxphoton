import test from 'node:test';
import assert from 'node:assert/strict';
import type { ExecutionServices } from '../../src/contracts/services.js';
import type { ActionRequest } from '../../src/contracts/actions.js';
import type { FeatureModule } from '../../src/contracts/feature.js';
import type { UnitOfWork } from '../../src/contracts/store.js';
import { makeServices,scope } from '../fixtures/runtime-services.js';
import { TestProvider } from '../fixtures/provider.js';
import { parseActionRequest } from '../../src/contracts/actions.js';
import { registerFeatureModules } from '../../src/registry/modules.js';
import { createRuntimeHost } from '../../src/host/main.js';
import { readFileSync } from 'node:fs';
const fixture=(op:string)=>parseActionRequest(JSON.parse(readFileSync(new URL(`../../../tests/fixtures/${op}.json`,import.meta.url),'utf8')).valid);
const digest='a'.repeat(64);
for(const [op,owner] of [['text.send','wt-03'],['poll.create','wt-05'],['app.send','wt-06']] as const)test(`shared services: ${op}`,async()=>{
 const f=makeServices(),provider=new TestProvider(),action=fixture(op);
 if('space' in action.arguments)f.resources.set(action.arguments.space.id,action.arguments.space);
 const handler:NonNullable<FeatureModule['handlers'][typeof op]>=async(request:ActionRequest,services:ExecutionServices)=>{
   services.assertActiveClaim();if('space' in request.arguments)await services.resolveResource(request.arguments.space);
   const result=await services.executeChild({index:0,key:request.idempotencyKey,argumentsDigest:digest,dispatch:()=>provider.dispatch(request.idempotencyKey)});
   services.transaction(unit=>unit.createContinuation({id:'next',eventIds:[],resumeKey:op}));return result;
 };
 const result=await handler(action as never,f.services);assert.equal(result.status,'provider-accepted');assert.equal(result.observations.length,0);assert.deepEqual(f.continuations,['next']);
 assert.equal((await handler(action as never,f.services)).status,'provider-accepted');assert.equal(provider.calls.length,1);
 assert.equal('transactions' in f.services,false);assert.equal('outbox' in f.services,false);
 const module:FeatureModule={id:op,owner,handlers:{[op]:handler}};const registry=registerFeatureModules([module]);assert.equal(registry.handlers.size,1);assert.equal(registry.missing.length,43);
 assert.throws(()=>registerFeatureModules([module,module]),/DUPLICATE/);assert.throws(()=>registerFeatureModules([module],true),/MISSING_HANDLERS/);
});
test('claim cancellation and stale fences prevent consequential work',async()=>{
 const f=makeServices(),p=new TestProvider();f.authoritative.fence=2;
 await assert.rejects(f.services.executeChild({index:0,key:'child',argumentsDigest:digest,dispatch:()=>p.dispatch('child')}),/STALE_FENCE/);assert.equal(p.calls.length,0);
 f.authoritative.fence=1;f.authoritative.generation=2;assert.throws(f.services.assertActiveClaim,/STALE_GENERATION/);
 f.authoritative.generation=1;f.authoritative.cancelled=true;assert.throws(f.services.assertActiveClaim,/CANCELLED/);
});
test('ambiguous child remains unknown on retry and identity changes are rejected',async()=>{
 const f=makeServices(),p=new TestProvider();p.outcome='unknown';const child={index:0,key:'child',argumentsDigest:digest,dispatch:()=>p.dispatch('child')};
 assert.equal((await f.services.executeChild(child)).status,'unknown-outcome');assert.equal((await f.services.executeChild(child)).status,'unknown-outcome');assert.equal(p.calls.length,1);
 await assert.rejects(f.services.executeChild({...child,argumentsDigest:'b'.repeat(64)}),/IDEMPOTENCY_CONFLICT/);
});
test('domain transaction rolls back continuations and cannot escape or read private tables',()=>{
 const f=makeServices();let captured:UnitOfWork|undefined;
 assert.throws(()=>f.services.transaction(unit=>{captured=unit;unit.createContinuation({id:'x',eventIds:[],resumeKey:'resume'});throw new Error('rollback');}),/rollback/);assert.deepEqual(f.continuations,[]);
 assert.throws(()=>captured!.get('polls','x'),/TRANSACTION_CLOSED/);
 f.services.transaction(unit=>{
 // @ts-expect-error Private runtime tables must remain inaccessible in feature code.
 assert.throws(()=>unit.get('outbox','x'),/PRIVATE_TABLE/);
 });
 // @ts-expect-error Asynchronous transaction callback is not a valid feature contract.
 assert.throws(()=>f.services.transaction(async()=>1),/ASYNC_TRANSACTION/);
});
test('guarded media and streams deny unregistered resources',async()=>{
 const f=makeServices();await assert.rejects(f.services.media.resolve({stagingId:'x',sha256:digest,mimeType:'text/plain',bytes:1},f.services.context),/MEDIA_REJECTED/);
 await assert.rejects(f.services.streams.open({version:1,kind:'stream',id:'x',scope,generation:1,expiresAt:9000},f.services.context,f.services.signal),/RESOURCE_NOT_FOUND/);
});
test('host stays inert and unavailable without production components',async()=>{
 const host=createRuntimeHost();assert.equal(host.doctor().ready,false);assert.equal(host.doctor().missingComponents.length,5);assert.equal(host.doctor().missingOperations.length,44);await assert.rejects(host.start(),/HOST_NOT_CONFIGURED/);assert.ok(host.capabilities().every(c=>c.implementation==='unimplemented'));
});

test('host registers injected features and shuts all components down after failed startup',async()=>{
 const {operationCatalog}=await import('../../src/registry/catalog.js');
 const calls:string[]=[];const modules:FeatureModule[]=operationCatalog.map(c=>({id:c.operation,owner:c.owner,handlers:{[c.operation]:async()=>{throw new Error('test handler not invoked');}}}));
 const host=createRuntimeHost({modules,
 provider:{provider:'imessage',scope,ready:()=>true,async start(){calls.push('provider');},async stop(){calls.push('provider-stop');}},
 ingress:{authentication:'authenticated-stream',async start(){calls.push('ingress');},async stop(){calls.push('ingress-stop');}},
 wake:{async wake(){throw new Error('test must not wake');}},
 store:{persistence:'sqlite',assertActiveClaim(){throw new Error('not used');},recordReceipt(){throw new Error('not used');},transaction(){throw new Error('not used');},close(){calls.push('store-close');}},
 executor:{contractVersion:'f0-services-2',registerFeatures(m){assert.equal(m.length,44);calls.push('register');},ready:()=>false,async dispatch(){throw new Error('not used');},async recover(){calls.push('recover');},async startOutbox(){calls.push('outbox');throw new Error('startup failure');},async stopOutbox(){calls.push('outbox-stop');},async capture(){throw new Error('not used');}},
 });
 assert.deepEqual(calls,[]);await assert.rejects(host.start(),/HOST_START_FAILED/);assert.deepEqual(calls,['register','provider','recover','ingress','outbox','ingress-stop','outbox-stop','provider-stop','store-close']);assert.equal(host.doctor().ready,false);await host.stop();assert.equal(calls.length,9);
});
