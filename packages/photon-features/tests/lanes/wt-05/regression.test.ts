import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { SQLiteStore } from "../../../src/state/sqlite.js";
import type { Transaction } from "../../../src/state/ports.js";
import type { UnitOfWork } from "../../../src/contracts/store.js";
import { context, scope, registerPoll, pollEvent } from "./support.js";
import { applyPollEvent, type PollEventPolicy } from "../../../src/features/polls/reducer.js";
import { reconcilePollState, retryUnresolvedPollEvents } from "../../../src/features/polls/reconciliation.js";
import { scopedId, resolvePollIdentity } from "../../../src/features/polls/identity.js";
const policy:PollEventPolicy={orderedSources:["native-test"],selectionSemantics:"independent-option-deltas",verifiedActors:["alice","bob"]};

// Foundation SQLite contract adapter for tests only. This is not WT-01/WT-02 production integration.
function unit(tx:Transaction,task=context):UnitOfWork {
  return {get:tx.get.bind(tx),put:tx.put.bind(tx),createContinuation(spec){
    if(tx.get("handoffs",spec.id))return;
    tx.put("handoffs",{id:spec.id,scope:task.scope,revision:0,taskId:task.taskId,generation:task.generation,
      principalId:task.principalId,eventIds:[...spec.eventIds],state:"pending",claim:null,createdAt:100},null);
  }};
}
function fixture() {
  mkdirSync(".photon-local",{recursive:true});const dir=mkdtempSync(resolve(".photon-local/wt05-restart-"));
  const path=resolve(dir,"state.sqlite");let store=new SQLiteStore(path);
  return {get store(){return store;},restart(){store.close();store=new SQLiteStore(path);},
    close(){store.close();rmSync(dir,{recursive:true,force:true});}};
}

test("F0 restart preserves two polls, original tasks, multiple voters and multiselect",()=>{
  const f=fixture();try {
    const a=registerPoll(f.store,"poll-a");const b=registerPoll(f.store,"poll-b","task-b");
    const taskB={...context,taskId:"task-b"};
    for(const [p,task] of [[a,context],[b,taskB]] as const) for(const actorId of ["alice","bob"]) for(const option of p.options)
      f.store.transaction(tx=>applyPollEvent(pollEvent(p,{actorId,option,eventId:`${p.guid}-${actorId}-${option.id}`}),unit(tx,task),task,policy));
    assert.equal(f.store.transaction(tx=>tx.list("votes",scope,100).length),8);
    f.restart();
    assert.equal(f.store.transaction(tx=>resolvePollIdentity(unit(tx),a.ref,context).options.length),2);
    assert.equal(f.store.transaction(tx=>tx.list("handoffs",scope,100).length),8);
    const result=f.store.transaction(tx=>applyPollEvent(pollEvent(a),unit(tx),context,policy));
    assert.equal(result.status,"duplicate");
    assert.deepEqual(new Set(f.store.transaction(tx=>tx.list("handoffs",scope,100).map(h=>h.taskId))),new Set([context.taskId,"task-b"]));
  } finally {f.close();}
});

test("F0 unvote and late arrivals use provider ordering, including an early unvote tombstone",()=>{
  const f=fixture();try {
    const p=registerPoll(f.store);const reduce=(sequence:string,change:"vote"|"unvote")=>f.store.transaction(tx=>
      applyPollEvent(pollEvent(p,{eventId:sequence,change,ordering:{source:"native-test",sequence}}),unit(tx),context,policy));
    reduce("3","unvote");assert.equal(reduce("2","vote").status,"stale");
    assert.equal(f.store.transaction(tx=>tx.list("handoffs",scope,100).length),0);
    reduce("4","vote");reduce("6","unvote");assert.equal(reduce("5","vote").status,"stale");
    assert.equal(f.store.transaction(tx=>tx.list("votes",scope,100)[0]?.active),false);
    assert.equal(f.store.transaction(tx=>tx.list("handoffs",scope,100).length),2);
    assert.deepEqual(reduce("6","vote"),{status:"unresolved",reason:"CONFLICTING_REVISION"});
  }finally{f.close();}
});

test("F0 early votes remain in the shared inbox until metadata can resolve them after restart",()=>{
  const f=fixture();try {
    const guid="early";const ref={version:1 as const,kind:"poll" as const,scope,id:scopedId("poll",scope,guid),messageId:scopedId("message",scope,guid)};
    const p={ref,guid,options:[{version:1 as const,kind:"poll-option" as const,scope,pollId:ref.id,id:scopedId("option",scope,guid,"native-option-a")}]};
    const event=pollEvent(p);
    f.store.transaction(tx=>{tx.put("inbox",{id:event.eventId,scope,revision:0,event,state:"unresolved"},null);
      assert.deepEqual(applyPollEvent(event,unit(tx),context,policy),{status:"unresolved",reason:"UNKNOWN_POLL"});});
    f.restart();registerPoll(f.store,guid);
    for(let i=0;i<3;i++)f.store.transaction(tx=>retryUnresolvedPollEvents(tx.list("inbox",scope,100).map(r=>r.event),unit(tx),context,policy));
    assert.equal(f.store.transaction(tx=>tx.list("handoffs",scope,100).length),1);
  }finally{f.close();}
});

test("F0 unknown actors, targets, wrong line/chat/task and missing ingress semantics stay unresolved",()=>{
  const f=fixture();try {
    const p=registerPoll(f.store);const original=pollEvent(p);
    const cases=[{...original,actorId:"unknown"},{...original,option:{...original.option,id:"Same"}},
      {...original,scope:{...scope,lineId:"other"}},{...original,scope:{...scope,spaceId:"other"}},
      {...original,poll:{...p.ref,messageId:"wrong"}},{...original,ordering:{source:"unverified",sequence:"1"}}];
    for(const event of cases)assert.equal(f.store.transaction(tx=>applyPollEvent(event,unit(tx),context,policy)).status,"unresolved");
    assert.equal(f.store.transaction(tx=>applyPollEvent(original,unit(tx),{...context,taskId:"wrong"},policy)).status,"unresolved");
    assert.equal(f.store.transaction(tx=>applyPollEvent(original,unit(tx),context,{...policy,selectionSemantics:"unknown"})).status,"unresolved");
    assert.equal(f.store.transaction(tx=>tx.list("handoffs",scope,100).length),0);
  }finally{f.close();}
});

test("F0 added option metadata is registered atomically and repeated reconciliation deduplicates continuation",()=>{
  const f=fixture();try {
    const p=registerPoll(f.store);const added={version:1 as const,kind:"poll-option" as const,scope,pollId:p.ref.id,id:scopedId("option",scope,p.guid,"native-c")};
    const event=pollEvent(p,{change:"option-added",option:added});
    assert.equal(f.store.transaction(tx=>applyPollEvent(event,unit(tx),context,policy)).status,"unresolved");
    const snapshot={poll:p.ref,nativePollGuid:p.guid,options:[{nativeId:"native-option-a",label:"Same"},{nativeId:"native-option-b",label:"Same"},{nativeId:"native-c",label:"Same"}]};
    for(let i=0;i<3;i++)f.store.transaction(tx=>{reconcilePollState(unit(tx),context,snapshot);retryUnresolvedPollEvents([event],unit(tx),context,policy);});
    assert.equal(f.store.transaction(tx=>tx.list("handoffs",scope,100).length),1);
    assert.equal(f.store.transaction(tx=>tx.list("votes",scope,100).length),0);
    assert.throws(()=>f.store.transaction(tx=>reconcilePollState(unit(tx),context,{...snapshot,options:snapshot.options.slice(0,2)})),/INCOMPLETE_OPTION_LOOKUP/);
    assert.equal(f.store.transaction(tx=>tx.get("polls",p.ref.id)?.options.length),3);
    assert.equal(f.store.transaction(tx=>reconcilePollState(unit(tx),context)).status,"blocked");
  }finally{f.close();}
});

test("F0 refuses ambiguous native IDs, batch saturation and incomparable ordering",()=>{
  const f=fixture();try {
    const p=registerPoll(f.store);const event=pollEvent(p);
    assert.throws(()=>f.store.transaction(tx=>reconcilePollState(unit(tx),context,{poll:p.ref,nativePollGuid:p.guid,
      options:[{nativeId:"same",label:"A"},{nativeId:"same",label:"B"}]})),/AMBIGUOUS_OPTIONS/);
    assert.throws(()=>f.store.transaction(tx=>retryUnresolvedPollEvents(Array(101).fill(event),unit(tx),context,policy)),/BATCH_TOO_LARGE/);
    f.store.transaction(tx=>applyPollEvent(event,unit(tx),context,policy));
    const other={...event,ordering:{source:"other-native",sequence:"20"}};
    assert.deepEqual(f.store.transaction(tx=>applyPollEvent(other,unit(tx),context,{...policy,orderedSources:[...policy.orderedSources,"other-native"]})),
      {status:"unresolved",reason:"INCOMPARABLE_ORDERING"});
  }finally{f.close();}
});

test("F0 conflicting targets in one chat are unresolved and storage errors propagate",()=>{
  const f=fixture();try {
    const a=registerPoll(f.store,"a");const b=registerPoll(f.store,"b");
    const event=pollEvent(a,{targets:[b.ref]});
    assert.deepEqual(f.store.transaction(tx=>applyPollEvent(event,unit(tx),context,policy)),
      {status:"unresolved",reason:"AMBIGUOUS_EVENT_TARGET"});
    assert.throws(()=>f.store.transaction(tx=>applyPollEvent(pollEvent(a),{...unit(tx),get(){throw new Error("storage unavailable");}},context,policy)),/storage unavailable/);
    assert.equal(f.store.transaction(tx=>tx.list("handoffs",scope,100).length),0);
  }finally{f.close();}
});
