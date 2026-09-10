import test from 'node:test';
import assert from 'node:assert/strict';
import { HostComposition } from '../../src/index.js';
import { SpectrumOwner } from '../../src/adapters/transport/spectrum-owner.js';
import { ProviderContext } from '../../src/adapters/transport/provider-context.js';
import { runtime } from '../lanes/wt-09/harness.js';
test('one host owner starts one SDK and rejects competing subscriptions',async()=>{
  let starts=0,stops=0,subscriptions=0;
  const routes=new ProviderContext('project-1',[{accountId:'account-1',lineId:'line-1',phone:'fixture'}]);
  const owner=new SpectrumOwner({inbound:'photon-stream',outbound:'imessage',wake:'existing-grok-task-handoff'},routes,
    async()=>{starts++;return{messages:()=>{subscriptions++;return(async function*(){})();},space:async()=>{throw new Error('unused');},stop:async()=>{stops++;}};});
  await Promise.all([owner.start(),owner.start()]);assert.equal(starts,1);owner.stream('host');
  assert.throws(()=>owner.stream('feature'),/COMPETING_RECEIVE_PATH/);assert.equal(subscriptions,1);
  await Promise.all([owner.stop(),owner.stop()]);assert.equal(stops,1);
});
test('host is inactive by default and startup failure cleans up all owned components',async t=>{
  const r=runtime();t.after(()=>r.close());const calls:string[]=[];
  const ports={client:{start:async()=>{calls.push('client.start');},stop:async()=>{calls.push('client.stop');},ready:()=>true},
    store:{transaction:r.store.transaction.bind(r.store),close:()=>{calls.push('store.close');}},
    ingress:{start:async()=>{throw new Error('INGRESS_FAILURE');},stop:async()=>{calls.push('ingress.stop');}},
    recover:async()=>{calls.push('recover');},startOutbox:async()=>{calls.push('outbox.start');},stopOutbox:async()=>{calls.push('outbox.stop');},accept:async()=>{}};
  const config={activation:'disabled' as const,provider:'imessage' as const,storePath:r.path,socketPath:'unused',ingress:{kind:'photon-stream' as const,verificationConfigured:true}};
  await assert.rejects(new HostComposition(config,ports).start(),/HOST_NOT_CONFIGURED/);assert.deepEqual(calls,[]);
  const host=new HostComposition({...config,activation:'enabled'},ports);await assert.rejects(host.start(),/INGRESS_FAILURE/);
  assert.equal(host.readiness().ready,false);assert.deepEqual(calls,['client.start','recover','outbox.start','ingress.stop','outbox.stop','client.stop','store.close']);
});
