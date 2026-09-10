import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeSession, decodeSession, restoreOriginal, SESSION_CODEC, type CardSession } from '../../src/features/cards/session-codec.js';
import { createInteractionAdapter, type AuthenticatedInteraction } from '../../src/features/cards/interaction-adapter.js';
import { key } from '../../src/features/cards/state.js';
import { runtime, context, scope } from '../lanes/wt-09/harness.js';
import { unusedDependencies } from '../lanes/wt-09/execution-harness.js';
import { resolveContents, type Message, type Space, type ContentInput } from 'spectrum-ts';
import { parseAction, type ExecutionServices, type Action } from '../../src/index.js';
import { CardOperations } from '../../src/features/cards/operations.js';
import type { CardOptions } from '../../src/features/cards/configuration.js';
function session():CardSession {
  const message={version:1 as const,kind:'message' as const,id:'card-message',scope};
  const card={version:1 as const,kind:'card' as const,id:'card-1',messageId:message.id,scope};
  return {version:1,sdkVersion:'12.8.0',message,card,session:{version:1,kind:'card-session',id:'session-1',cardId:card.id,scope},
    providerMessageId:'provider-message',templateId:'template-1',kind:'universal',taskId:context.taskId,principalId:context.principalId,
    generation:1,cardRevision:0,url:'https://example.com/card',phase:'ready',metadata:null,
    callback:{backendContractId:'fixture-backend',nonce:'nonce-1',participantIds:['participant-1'],actionIds:['approve'],expiresAt:20000}};
}
function seed(r:ReturnType<typeof runtime>,data:CardSession) {
  r.store.transaction(tx=>{
    for (const reference of [data.card,data.session,data.message]) tx.put('references',{id:reference.id,scope,revision:0,reference,
      providerId:reference.id,ownedByPrincipalId:context.principalId,taskId:context.taskId,generation:1},null);
    tx.put('cards',{id:data.card.id,scope,revision:0,reference:data.card,templateId:data.templateId},null);
    tx.put('sessions',{id:data.session.id,scope,revision:0,reference:data.session,allowedActionIds:['approve'],expiresAt:20000,generation:1},null);
    tx.put('checkpoints',{id:key('session',data.session.id),scope,revision:0,requestId:'original-request',codecId:SESSION_CODEC.id,codecVersion:1,
      payloadJson:encodeSession(data),nextChildIndex:0,claim:{owner:'fixture',fence:1,generation:1,leaseUntil:20000}},null);
  });
}
test('card codec keeps original target/session and rejects malformed parent or SDK version',()=>{
  const data=session();assert.deepEqual(decodeSession(encodeSession(data)),data);
  assert.throws(()=>encodeSession({...data,session:{...data.session,cardId:'other'}}));
  assert.throws(()=>decodeSession(JSON.stringify({...data,sdkVersion:'future'})));
  assert.throws(()=>decodeSession(' '.repeat(32769)));
});
test('restart without public original-session rehydration is explicitly blocked',async t=>{
  const r=runtime();t.after(()=>r.close());const data=decodeSession(encodeSession(session()));
  await assert.rejects(restoreOriginal(data,{...unusedDependencies,context,clock:r.clock,signal:new AbortController().signal,
    claim:{owner:'fixture',fence:1,generation:1,leaseUntil:20000},transactions:r.store},
    {templates:[],binding:()=>({scope,phone:'offline-line',nativeSpaceId:'offline-chat'}),requestId:()=> 'original-request'}),/requires_original_session/);
});
test('callback binding enforces participant, expiry, scope, nonce and single-use replay before wake',async t=>{
  const r=runtime();t.after(()=>r.close());const data=session();seed(r,data);let wakes=0;
  let assertion:AuthenticatedInteraction={version:1,eventId:'click-1',session:data.session,scope,taskId:context.taskId,generation:1,
    participantId:'participant-1',nonce:'nonce-1',actionId:'approve',selection:[],occurredAt:10000};
  const original=structuredClone(assertion);
  const adapter=createInteractionAdapter({transactions:r.store,clock:r.clock,wake:{wake:async()=>{wakes++;return {status:'accepted'};}},
    backend:{id:'fixture-backend',source:'offline-authentication-fixture',authenticate:async()=>assertion}});
  const request={body:Buffer.from('fixture'),headers:{}};
  for (const patch of [{participantId:'intruder'},{nonce:'other'},{scope:{...scope,lineId:'other'}},{occurredAt:999999},{generation:2}]) {
    assertion={...original,...patch};assert.equal((await adapter.accept(request)).status,'rejected');assert.equal(wakes,0);
  }
  assertion=original;assert.equal((await adapter.accept(request)).status,'committed');assert.equal(wakes,1);
  assertion={...original,eventId:'new-id-same-nonce'};assert.equal((await adapter.accept(request)).status,'replayed');assert.equal(wakes,1);
  r.clock.advance(10000);assert.equal((await adapter.accept(request)).status,'rejected');assert.equal(wakes,1);
  const missing=createInteractionAdapter({transactions:r.store,clock:r.clock,wake:{wake:async()=>{assert.fail('missing backend cannot wake');}}});
  assert.equal((await missing.accept(request)).status,'blocked');
});

test('production card module keeps original target across repeated updates, rejects stale revisions and restores via public resolver',async t=>{
  const r=runtime();t.after(()=>r.close());const c:ExecutionServices['context']={...context,permissions:['app.send','app.update']};
  let requestId='card-request-0',revision=0,sequence=0;const targets:Message[]=[];
  let original:Message & {miniAppCardSession:{chatGuid:string;messageGuid:string;sessionId:string;targetMessageGuid:string}|null};
  const space={id:'offline-chat',__platform:'imessage',phone:'offline-line',send:async(input:ContentInput)=>{
    const content=(await resolveContents([input]))[0]!;
    if(content.type==='edit'){
      targets.push(content.target);assert.equal(content.target,original);
      original.miniAppCardSession!.messageGuid=`refresh-${targets.length}`;return undefined;
    }
    original={id:'original-message',platform:'imessage',space,content,direction:'outbound',timestamp:new Date(10000),sender:undefined,
      miniAppCardSession:{chatGuid:'offline-chat',messageGuid:'guid-0',sessionId:'provider-session',targetMessageGuid:'original-target'}} as typeof original;
    return original;
  }} as unknown as Space;
  const options:CardOptions={templates:[{id:'template-1',kind:'universal',origins:['https://example.com'],updateUrl:async()=>`https://example.com/update/${revision}`}],
    binding:()=>({scope,phone:'offline-line',nativeSpaceId:'offline-chat'}),requestId:()=>requestId,updateRevision:()=>revision};
  let feature=new CardOperations(options);
  const services:ExecutionServices={...unusedDependencies,context:c,clock:r.clock,transactions:r.store,signal:new AbortController().signal,
    claim:{owner:'offline-module-fixture',fence:1,generation:1,leaseUntil:20000},resources:{resolve:async ref=>ref,space:async()=>space,message:async()=>original}};
  async function invoke(operation:string,args:unknown){
    requestId=`card-request-${++sequence}`;
    const a:Action=parseAction({version:1,contextId:context.contextId,idempotencyKey:requestId,operation,arguments:args});
    r.store.transaction(tx=>tx.put('outbox',{id:requestId,scope,revision:0,action:a,principalId:context.principalId,taskId:context.taskId,generation:1,
      argumentDigest:'offline-module-fixture',claim:services.claim,cancellationRequestedAt:null,
      result:{version:1,requestId,status:'queued',revision:0,updatedAt:10000,references:[],observations:[]}},null));
    return feature.execute(a,services);
  }
  const sent=await invoke('app.send',{space:{version:1,kind:'space',id:scope.spaceId,scope},templateId:'template-1',url:'https://example.com/card'});
  assert.equal(sent.status,'provider-accepted',JSON.stringify(sent));
  const card=sent.references.find(ref=>ref.kind==='card')!,session=sent.references.find(ref=>ref.kind==='card-session')!;
  const args={card,session,layout:{caption:'updated'}};
  assert.equal((await invoke('app.update',args)).status,'executor-completed');revision=1;
  assert.equal((await invoke('app.update',args)).status,'executor-completed');
  assert.equal((await invoke('app.update',args)).error?.code,'IDEMPOTENCY_CONFLICT');assert.equal(targets.length,2);
  feature=new CardOperations(options);revision=2;
  assert.equal((await invoke('app.update',args)).status,'executor-completed');assert.equal(targets.length,3);
  assert.ok(targets.every(target=>target===original));
  const stored=decodeSession(r.store.transaction(tx=>tx.get('checkpoints',key('session',session.id)))!.payloadJson);
  assert.equal(stored.providerMessageId,'original-message');assert.equal(stored.metadata?.messageGuid,'refresh-3');
  assert.equal(stored.session.id,session.id);assert.equal(stored.cardRevision,3);
});
