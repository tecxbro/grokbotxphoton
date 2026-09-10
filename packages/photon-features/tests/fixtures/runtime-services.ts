import type { ExecutionServices } from '../../src/contracts/services.js';
import type { DomainTable, UnitOfWork } from '../../src/contracts/store.js';
import type { StateTables } from '../../src/state/ports.js';
import type { TrustedContext, AuthenticatedPrincipal } from '../../src/contracts/context.js';
import { assertTrustedContext } from '../../src/contracts/context.js';
import { assertScope, type ResourceRef } from '../../src/contracts/references.js';
import { appendReceipt, type ReceiptObservation } from '../../src/contracts/receipts.js';
import type { OperationResult } from '../../src/contracts/results.js';
import { TestClock } from './clock.js';
export const scope = {projectId:'project-1',provider:'imessage' as const,accountId:'account-1',lineId:'line-1',spaceId:'space-1'};
export const principal: AuthenticatedPrincipal = {id:'principal-1',osUid:501,credentialId:'credential-1',authenticatedAt:100};
export const context: TrustedContext = {version:1,contextId:'context-1',principalId:principal.id,scope,taskId:'task-1',generation:1,permissions:['text.send','poll.create','app.send'],issuedAt:100,expiresAt:10000,revokedAt:null};
/** Contract fixture only: in-memory children are never production recovery evidence. */
export function makeServices() {
  const clock = new TestClock();
  const abort = new AbortController();
  const claim = {owner:principal.id,generation:1,fence:1,leaseUntil:9000};
  const authoritative = {generation:1,fence:1,cancelled:false};
  let rows = new Map<string,unknown>();
  const resources = new Map<string,ResourceRef>();
  let receipts: ReceiptObservation[]=[];
  const children = new Map<number,{key:string;digest:string;result:OperationResult}>();
  const continuations: string[]=[];
  function active() {
    if(authoritative.cancelled || abort.signal.aborted)throw new Error('CANCELLED');
    if(authoritative.generation!==claim.generation)throw new Error('STALE_GENERATION');
    if(authoritative.fence!==claim.fence || claim.leaseUntil<=clock.now())throw new Error('STALE_FENCE');
    if(context.revokedAt!==null || context.expiresAt<=clock.now())throw new Error('CONTEXT_EXPIRED');
  }
  const services: ExecutionServices = {
    context,claim,signal:abort.signal,clock,
    assertActiveClaim:active,
    async resolveResource(ref) { active();assertScope(ref,scope);const value=resources.get(ref.id);if(!value || JSON.stringify(value)!==JSON.stringify(ref))throw new Error('RESOURCE_NOT_FOUND');active();return structuredClone(value); },
    transaction<T>(run: (unit: UnitOfWork) => T extends PromiseLike<unknown> ? never : T): T {
      active();const snapshot=new Map(rows);const oldContinuations=continuations.length;
      let open=true;
      const guard=(table: DomainTable)=>{if(!open)throw new Error('TRANSACTION_CLOSED');active();if(!['references','polls','votes','cards','sessions','stagedMedia','streams'].includes(table))throw new Error('PRIVATE_TABLE_FORBIDDEN');};
      const unit: UnitOfWork={
        get:<K extends DomainTable>(table:K,id:string)=>{guard(table);return structuredClone(rows.get(table+':'+id)) as StateTables[K]|undefined;},
        put(table,record,expected){guard(table);assertScope({version:1,kind:'space',id:scope.spaceId,scope:record.scope},scope);const key=table+':'+record.id;const old=rows.get(key) as {revision:number}|undefined;if(expected===null ? !!old || record.revision!==0 : old?.revision!==expected || record.revision!==expected+1)throw new Error('STALE_FENCE');rows.set(key,structuredClone(record));},
        createContinuation(spec){if(!open)throw new Error('TRANSACTION_CLOSED');active();continuations.push(spec.id);},
      };
      try {const result=run(unit);if(result && typeof result==='object' && 'then' in result)throw new Error('ASYNC_TRANSACTION_FORBIDDEN');active();return result;}
      catch(e){rows=snapshot;continuations.length=oldContinuations;throw e;}finally{open=false;}
    },
    async executeChild(child) {
      active();if(!Number.isInteger(child.index)||child.index<0||!/^[a-f0-9]{64}$/.test(child.argumentsDigest))throw new Error('INVALID_CHILD');
      const prior=children.get(child.index);
      if(prior){if(prior.key!==child.key||prior.digest!==child.argumentsDigest)throw new Error('IDEMPOTENCY_CONFLICT');return prior.result;}
      let result:OperationResult;
      try { result=await child.dispatch(abort.signal); }
      catch { result={version:1,requestId:child.key,status:'unknown-outcome',revision:0,updatedAt:clock.now(),references:[],observations:[],error:{code:'UNKNOWN_OUTCOME',message:'Reconcile before retry',retry:'reconcile-first'}}; }
      children.set(child.index,{key:child.key,digest:child.argumentsDigest,result});
      // A completed side effect remains recorded even when cancellation wins before return.
      return result;
    },
    async recordReceipt(observation){active();if(JSON.stringify(observation.scope)!==JSON.stringify(scope))throw new Error('SCOPE_MISMATCH');receipts=appendReceipt(receipts,observation);},
    media:{async resolve(){active();throw new Error('MEDIA_REJECTED');}},
    streams:{async open(){active();throw new Error('RESOURCE_NOT_FOUND');}},
  };
  return {services,clock,authoritative,abort,resources,continuations,children,getReceipts:()=>receipts};
}
