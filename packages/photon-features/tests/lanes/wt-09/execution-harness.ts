import type { Capability, OperationResult } from '../../../src/index.js';
import { DurableExecutor, type ExecutionBinding } from '../../../src/runtime/core/executor.js';
import { ExecutionClaims } from '../../../src/runtime/core/claims.js';
import type { FeatureDependencies } from '../../../src/runtime/core/feature-services.js';
import { runtime } from './harness.js';
export const offlineCapability: Capability = {operation:'text.send',implementation:'implemented',providerSupport:'native',
  availability:{account:'available',conversation:'available',checkedAt:10000},direction:{inbound:'not-applicable',outbound:'implemented'},
  evidence:[],sdkVersion:'12.8.0',sources:[],blockers:['Offline fixture; no live capability inspection']};
export const outcome = (): OperationResult => ({version:1,requestId:'fixture-result',status:'executor-completed',revision:0,
  updatedAt:10000,references:[],observations:[],value:{type:'void'}});
export const unusedDependencies: FeatureDependencies = {
  resources:{resolve:async ref=>ref,space:async()=>{throw new Error('UNEXPECTED_SPACE');},message:async()=>{throw new Error('UNEXPECTED_MESSAGE');}},
  media:{resolve:async()=>{throw new Error('UNEXPECTED_MEDIA');}},streams:{open:async()=>{throw new Error('UNEXPECTED_STREAM');}},
};
export function execution(r: ReturnType<typeof runtime>, dependencies = unusedDependencies) {
  const claims = new ExecutionClaims(r.store,r.contexts);
  return {claims,executor:new DurableExecutor(claims,dependencies,4,1000)};
}
export function binding(execute: ExecutionBinding['handler']['execute'], boundary: ExecutionBinding['boundary'] = 'single-call'): ExecutionBinding {
  return {boundary,capability:()=>structuredClone(offlineCapability),handler:{operation:'text.send',recoveryCodec:{id:'wt09.offline',version:1},execute}};
}
