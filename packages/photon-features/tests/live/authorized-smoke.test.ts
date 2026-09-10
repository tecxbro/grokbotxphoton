import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { parseAction, scopeSchema, resultSchema, sameScope, type Scope } from '../../src/index.js';
import { localRequest } from '../../src/cli/local-client.js';

// Off by default. Credentials and configuration are never consent. This test performs
// only the exact actions in an expiring approval record for the exact candidate/scope.
const approvalFile=process.env.WT09_LIVE_APPROVAL_FILE;
const workflowSchema=z.enum(['typing','poll-create','poll-vote','reply','reaction','media','card-send','card-update']);
const evidenceKindSchema=z.enum(['provider-accepted','delivered','read','user-vote','card-callback','restart-recovered','device-rendered']);
const approvedActionSchema=z.strictObject({
  workflow:workflowSchema,
  action:z.unknown(),
  actionSha256:z.string().regex(/^[a-f0-9]{64}$/),
  requiredEvidence:z.array(evidenceKindSchema).max(7),
});
const approvalSchema=z.strictObject({
  version:z.literal(2),
  approved:z.literal(true),
  approvedBy:z.string().min(1),
  authorizationReference:z.string().min(1),
  candidateSha:z.string().regex(/^[a-f0-9]{40}$/),
  expiresAt:z.number().int(),
  scope:scopeSchema,
  socket:z.string().min(1),
  credentialFile:z.string().min(1),
  actions:z.array(approvedActionSchema).min(8).max(32),
  observations:z.array(z.strictObject({
    workflow:workflowSchema,
    kind:evidenceKindSchema,
    evidenceReference:z.string().min(1),
    observedAt:z.number().int().nonnegative(),
  })).max(100),
});

const requiredWorkflows=new Set<z.infer<typeof workflowSchema>>([
  'typing','poll-create','poll-vote','reply','reaction','media','card-send','card-update',
]);

function scopes(value:unknown):Scope[]{
  if(!value||typeof value!=='object')return [];
  const record=value as Record<string,unknown>;
  const own='scope' in record?scopeSchema.safeParse(record.scope):undefined;
  return [...(own?.success?[own.data]:[]),...Object.values(record).flatMap(scopes)];
}

test('authorized scoped workflows and separately observed live evidence', {skip:!approvalFile,timeout:180000}, async()=>{
  const approval=approvalSchema.parse(JSON.parse(readFileSync(approvalFile!,'utf8')));
  assert.ok(approval.expiresAt>Date.now(),'LIVE_PENDING: expired authorization');
  assert.equal(process.env.WT09_LIVE_CANDIDATE_SHA,approval.candidateSha,'LIVE_PENDING: exact assembled candidate not verified');
  assert.deepEqual(new Set(approval.actions.map(item=>item.workflow)),requiredWorkflows,'LIVE_PENDING: every workflow requires explicit authorization');
  const allowed:Record<z.infer<typeof workflowSchema>,readonly string[]>={
    typing:['typing.begin','typing.end'],
    'poll-create':['poll.create'],
    'poll-vote':['poll.vote','poll.unvote'],
    reply:['message.reply'],
    reaction:['message.react','reaction.remove'],
    media:['attachment.send','voice.send','contact.send'],
    'card-send':['app.send','app.sendCustomized'],
    'card-update':['app.update'],
  };
  const config={socket:approval.socket,credentialFile:approval.credentialFile};
  for(const item of approval.actions){
    assert.equal(createHash('sha256').update(JSON.stringify(item.action)).digest('hex'),item.actionSha256);
    const action=parseAction(item.action);
    assert.ok(allowed[item.workflow].includes(action.operation),`LIVE_PENDING: ${item.workflow} operation not authorized`);
    const actionScopes=scopes(action.arguments);
    assert.ok(actionScopes.length>0,`LIVE_PENDING: ${item.workflow} has no explicit scoped reference`);
    assert.ok(actionScopes.every(value=>sameScope(value,approval.scope)),`LIVE_PENDING: ${item.workflow} scope mismatch`);
    const response=await localRequest({version:1,method:'submit',action},config) as {ok:boolean;result:unknown};
    assert.equal(response.ok,true);
    let result=resultSchema.parse(response.result);const deadline=Date.now()+30000;
    while(result.status==='queued'&&Date.now()<deadline){
      await new Promise(resolve=>setTimeout(resolve,250));
      const status=await localRequest({version:1,method:'status',contextId:action.contextId,requestId:result.requestId},config) as {ok:boolean;result:unknown};
      assert.equal(status.ok,true);result=resultSchema.parse(status.result);
    }
    assert.ok(!['queued','blocked','failed','cancelled','unknown-outcome'].includes(result.status),
      `LIVE_PENDING: ${item.workflow} did not complete safely (${result.status})`);
    for(const kind of item.requiredEvidence){
      const external=approval.observations.some(value=>value.workflow===item.workflow&&value.kind===kind);
      const inResult=kind==='provider-accepted'&&result.observations.some(value=>value.kind==='accepted');
      assert.ok(external||inResult,`LIVE_PENDING: ${item.workflow} missing ${kind} evidence`);
    }
  }
  // User vote, restart recovery, callback and device rendering cannot be inferred from sends.
  for(const [workflow,kind] of [
    ['poll-vote','user-vote'],['poll-vote','restart-recovered'],['card-update','card-callback'],['card-update','device-rendered'],
  ] as const) assert.ok(approval.observations.some(value=>value.workflow===workflow&&value.kind===kind),
    `LIVE_PENDING: ${workflow} missing ${kind} observation`);
});
