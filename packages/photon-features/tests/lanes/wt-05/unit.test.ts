import { resourceRefSchema } from "../../../src/contracts/references.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Space, Message, ContentBuilder } from "spectrum-ts";
import { makeServices, context, scope } from "../../fixtures/runtime-services.js";
import type { Action } from "../../../src/contracts/actions.js";
import type { ResourceRef } from "../../../src/contracts/references.js";
import { executePollOperation, pollOperations } from "../../../src/features/polls/operations.js";
import { createFeatureModule, pollFeatureAvailability } from "../../../src/features/polls/module.js";
import { mapPollOperation } from "../../../src/features/polls/sdk.js";
import { reconcilePollState } from "../../../src/features/polls/reconciliation.js";
import { resolvePollIdentity, resolveOptionIdentity } from "../../../src/features/polls/identity.js";

function fixture() {
  const f = makeServices();
  const s = { ...f.services, context: { ...context, permissions: [...pollOperations] } };
  const ref: Extract<ResourceRef,{kind:"space"}> = { version:1,kind:"space",id:scope.spaceId,scope };
  f.resources.set(ref.id, resourceRefSchema.parse(ref));
  s.transaction(u => u.put("references", { id:ref.id,scope,revision:0,reference:ref,providerId:"native-chat",
    ownedByPrincipalId:context.principalId,taskId:context.taskId,generation:context.generation },null));
  let calls = 0;
  let behavior: "accepted"|"timeout"|"undefined"|"wrong-chat" = "accepted";
  const space = { __platform:"imessage",id:"native-chat",phone:scope.lineId,
    send:async (content:ContentBuilder) => {
      calls++;
      if(behavior==="timeout") throw new Error("possible transmission timeout");
      if(behavior==="undefined") return undefined;
      return { id:"native-poll", platform:"imessage",direction:"outbound",space: behavior==="wrong-chat" ?
        {...space,id:"other-chat"}:space,content:await content.build() } as unknown as Message;
    },
  } as unknown as Space;
  const binding = { resolveSpace:async()=>space };
  const action:Action={version:1,contextId:context.contextId,idempotencyKey:"create",operation:"poll.create",
    arguments:{space:ref,question:"Pick?",options:[{key:"a",label:"Same"},{key:"b",label:"Same"}]}};
  return {...f,s,ref,space,binding,action,calls:()=>calls,setBehavior:(value:typeof behavior)=>{behavior=value;}};
}

test("F0 factory registers five typed handlers without starting any provider", () => {
  assert.deepEqual(Object.keys(createFeatureModule().handlers), [...pollOperations]);
  for(const ingress of ["unknown","unavailable","available"] as const) {
    assert.equal(pollFeatureAvailability(ingress).interactiveWorkflowAdvertisable,false);
    assert.equal(pollFeatureAvailability(ingress).operations["poll.vote"],"blocked");
  }
});

test("F0 create uses one shared child and registers actual message/poll identity", async () => {
  const f=fixture(); const result=await executePollOperation(f.action,f.s,f.binding);
  assert.equal(result.status,"provider-accepted"); assert.equal(f.calls(),1); assert.equal(f.children.size,1);
  const poll=result.references.find(r=>r.kind==="poll")!;
  assert.equal(poll.kind,"poll"); if(poll.kind!=="poll") throw new Error("missing poll");
  f.s.transaction(u=>{
    assert.equal(u.get("references",poll.id)?.providerId,"native-poll");
    assert.equal(u.get("references",poll.id)?.taskId,context.taskId);
    assert.deepEqual(u.get("polls",poll.id)?.options,[]);
    assert.equal(resolvePollIdentity(u,{...poll,id:"native-poll",messageId:"native-poll"},context).id,poll.id);
    const registered=reconcilePollState(u,context,{poll,nativePollGuid:"native-poll",
      options:[{nativeId:"native-a",label:"Same"},{nativeId:"native-b",label:"Same"}]});
    assert.equal(registered.status,"registered");
    const stored=u.get("polls",poll.id)!;
    assert.notEqual(stored.options[0]!.reference.id,stored.options[1]!.reference.id);
    assert.equal(resolveOptionIdentity(u,stored,{...stored.options[0]!.reference,id:"native-a"},context).label,"Same");
    assert.throws(()=>resolveOptionIdentity(u,stored,{...stored.options[0]!.reference,id:"Same"},context),/LOOKUP_REQUIRED/);
  });
  assert.equal((await executePollOperation(f.action,f.s,f.binding)).status,"provider-accepted");
  assert.equal(f.calls(),1);
});

for(const behavior of ["timeout","undefined","wrong-chat"] as const) test(`F0 ${behavior} stays unknown and replay cannot resend`,async()=>{
  const f=fixture(); f.setBehavior(behavior);
  const first=await executePollOperation(f.action,f.s,f.binding);
  assert.equal(first.status,"unknown-outcome"); assert.equal(first.error?.retry,"reconcile-first");
  assert.equal((await executePollOperation(f.action,f.s,f.binding)).status,"unknown-outcome");
  assert.equal(f.calls(),1);
});

test("F0 native operations validate identities and stay blocked without inventing an advanced client",async()=>{
  const f=fixture(); const created=await executePollOperation(f.action,f.s,f.binding);
  const poll=created.references.find(r=>r.kind==="poll")!;
  if(poll.kind!=="poll")throw new Error("poll");
  f.resources.set(poll.id,resourceRefSchema.parse(poll));
  const opts=f.s.transaction(u=>reconcilePollState(u,context,{poll,nativePollGuid:"native-poll",
    options:[{nativeId:"a",label:"A"},{nativeId:"b",label:"B"}]}));
  if(opts.status!=="registered")throw new Error("options");
  const option=opts.options[0]!; f.resources.set(option.id,resourceRefSchema.parse(option));
  const actions:Action[]=[
    {...f.action,operation:"poll.get",arguments:{poll}},
    {...f.action,operation:"poll.vote",arguments:{poll,option}},
    {...f.action,operation:"poll.unvote",arguments:{poll,option}},
    {...f.action,operation:"poll.addOption",arguments:{poll,option:{key:"c",label:"C"}}},
  ];
  for(const action of actions) {
    assert.equal(mapPollOperation(action as Parameters<typeof mapPollOperation>[0]).kind,"blocked");
    const result=await executePollOperation(action,f.s,f.binding);
    assert.equal(result.status,"blocked"); assert.equal(result.error?.blockerId,"wt-05-advanced-polls");
  }
  assert.equal(f.calls(),1);
});

test("F0 denies mismatched permission, context, line and claim before dispatch",async()=>{
  for(const kind of ["permission","context","line","claim"] as const) {
    const f=fixture();
    if(kind==="permission") f.s.context.permissions=[];
    if(kind==="context") f.action.contextId="other";
    if(kind==="line") (f.space as unknown as {phone:string}).phone="other-line";
    if(kind==="claim") f.authoritative.fence++;
    assert.equal((await executePollOperation(f.action,f.s,f.binding)).status,"failed");
    assert.equal(f.calls(),0);
  }
});

test("F0 rechecks cancellation after resource resolution",async()=>{
  const f=fixture(); const resolve=f.s.resolveResource;
  f.s.resolveResource=async ref=>{const value=await resolve(ref);f.abort.abort();return value;};
  assert.equal((await executePollOperation(f.action,f.s,f.binding)).error?.code,"CANCELLED"); assert.equal(f.calls(),0);
});

test("F0 missing binding is blocked; malformed actions never reach provider",async()=>{
  const f=fixture(); assert.equal((await executePollOperation(f.action,f.s)).error?.blockerId,"wt-05-provider-binding");
  const invalid={...f.action,arguments:{...f.action.arguments,participant:"someone-else"}} as Action;
  assert.equal((await executePollOperation(invalid,f.s,f.binding)).error?.code,"INVALID_REQUEST"); assert.equal(f.calls(),0);
});

test("F0 changed child digest conflicts without another send",async()=>{
  const f=fixture();await executePollOperation(f.action,f.s,f.binding);
  if(f.action.operation!=="poll.create")throw new Error("action");
  f.action.arguments.question="Different";
  assert.equal((await executePollOperation(f.action,f.s,f.binding)).error?.code,"IDEMPOTENCY_CONFLICT");
  assert.equal(f.calls(),1);
});
