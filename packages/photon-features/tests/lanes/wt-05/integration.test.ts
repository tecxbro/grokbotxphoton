import { resourceRefSchema } from "../../../src/contracts/references.js";
import { FailureHooks } from "../../fixtures/harness.js";
import { createPollReducer } from "../../../src/features/polls/reducer.js";
import { registerPollIntegrationContract } from "./integration-contract.js";
import { storeFixture } from "./support.js";

registerPollIntegrationContract("F0 transactional fixture (WT-01/WT-02 rerun pending)", () => {
  const f = storeFixture(); const hooks = new FailureHooks();
  const reducer = createPollReducer({ orderedSources: ["native-test"], selectionSemantics: "independent-option-deltas" });
  return { store: f.store, close: f.close,
    failNextCommit: () => hooks.failAt("before-commit"),
    accept: async event => {
      f.store.transaction(tx => { reducer.reduce(event, tx); hooks.hit("before-commit"); });
    },
  };
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { makeServices, context as f0Context, scope as f0Scope } from "../../fixtures/runtime-services.js";
import { pollEvent } from "./support.js";
import { reconcilePollState } from "../../../src/features/polls/reconciliation.js";
import { applyPollEvent, type PollEventPolicy } from "../../../src/features/polls/reducer.js";
import type { ResourceRef } from "../../../src/contracts/references.js";
import type { Message, Space, ContentBuilder } from "spectrum-ts";
import { scopedId } from "../../../src/features/polls/identity.js";
import { executePollOperation } from "../../../src/features/polls/operations.js";

const policy:PollEventPolicy={orderedSources:["native-test"],selectionSemantics:"independent-option-deltas",verifiedActors:["alice","bob"]};

// Seed native identity through the public domain UoW; no private execution tables.
function reductionFixture() {
  const f=makeServices(); const guid="native-poll";
  const ref={version:1 as const,kind:"poll" as const,scope:f0Scope,
    id:scopedId("poll",f0Scope,guid),messageId:scopedId("message",f0Scope,guid)};
  const registered=f.services.transaction(u=>{
    const message:ResourceRef={version:1,kind:"message",id:ref.messageId,scope:f0Scope};
    for(const reference of [ref,message])u.put("references",{id:reference.id,scope:f0Scope,revision:0,
      reference,providerId:guid,ownedByPrincipalId:f0Context.principalId,taskId:f0Context.taskId,generation:1},null);
    u.put("polls",{id:ref.id,scope:f0Scope,revision:0,reference:ref,question:"Pick?",options:[]},null);
    return reconcilePollState(u,f0Context,{poll:ref,nativePollGuid:guid,
      options:[{nativeId:"native-option-a",label:"Same"},{nativeId:"native-option-b",label:"Same"}]});
  });
  if(registered.status!=="registered")throw new Error("native options missing");
  return {...f,p:{ref,guid,options:registered.options}};
}

test("F0 UoW rolls back vote and continuation when continuation creation fails",()=>{
  const f=reductionFixture();const event=pollEvent(f.p);
  const voteId=scopedId("vote",f0Scope,f.p.ref.id,f.p.options[0]!.id,"alice");
  assert.throws(()=>f.services.transaction(u=>applyPollEvent(event,{...u,createContinuation(spec){
    u.createContinuation(spec);throw new Error("commit failure");
  }},f0Context,policy)),/commit failure/);
  assert.equal(f.services.transaction(u=>u.get("votes",voteId)),undefined);
  assert.equal(f.continuations.length,0);
  f.services.transaction(u=>applyPollEvent(event,u,f0Context,policy));
  assert.equal(f.continuations.length,1);
  assert.equal(f.services.transaction(u=>u.get("votes",voteId)?.active),true);
});

test("F0 replay and repeated reconciliation cannot duplicate logical vote work",()=>{
  const f=reductionFixture();const event=pollEvent(f.p);
  assert.equal(f.services.transaction(u=>applyPollEvent(event,u,f0Context,policy)).status,"applied");
  for(let i=0;i<3;i++)assert.equal(f.services.transaction(u=>applyPollEvent({...event,eventId:`alias-${i}`},u,f0Context,policy)).status,"duplicate");
  assert.equal(f.continuations.length,1);
});

test("F0 generation fencing prevents stale task state and continuation writes",()=>{
  const f=reductionFixture(); f.authoritative.generation++;
  assert.throws(()=>f.services.transaction(u=>applyPollEvent(pollEvent(f.p),u,f0Context,policy)),/STALE_GENERATION/);
  assert.equal(f.continuations.length,0);
});

test("F0 identity commit failure after provider return records unknown child and does not resend",async()=>{
  const f=makeServices();const ref:ResourceRef={version:1,kind:"space",id:f0Scope.spaceId,scope:f0Scope};
  f.resources.set(ref.id,resourceRefSchema.parse(ref));
  f.services.transaction(u=>u.put("references",{id:ref.id,scope:f0Scope,revision:0,reference:ref,
    providerId:"chat",ownedByPrincipalId:f0Context.principalId,taskId:f0Context.taskId,generation:1},null));
  let calls=0;
  const space={__platform:"imessage",id:"chat",phone:f0Scope.lineId,send:async(c:ContentBuilder)=>{
    calls++;return {id:"native",platform:"imessage",direction:"outbound",space,content:await c.build()} as unknown as Message;
  }} as unknown as Space;
  const original=f.services.transaction;
  f.services.transaction=run=>original(u=>run({...u,put(table,row,rev){
    if(table==="polls")throw new Error("commit failure");u.put(table,row,rev);
  }}));
  const action={version:1 as const,contextId:f0Context.contextId,idempotencyKey:"create",operation:"poll.create" as const,
    arguments:{space:ref,question:"Pick?",options:[{key:"a",label:"A"},{key:"b",label:"B"}]}};
  const binding={resolveSpace:async()=>space};
  assert.equal((await executePollOperation(action,f.services,binding)).status,"unknown-outcome");
  assert.equal((await executePollOperation(action,f.services,binding)).status,"unknown-outcome");
  assert.equal(calls,1);
  assert.equal(original(u=>u.get("polls",scopedId("poll",f0Scope,"native"))),undefined);
  assert.equal(original(u=>u.get("references",scopedId("poll",f0Scope,"native"))),undefined);
});
