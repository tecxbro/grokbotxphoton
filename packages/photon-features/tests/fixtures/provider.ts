import type { OperationResult } from '../../src/contracts/results.js';
/** Test-only provider with an explicit ambiguous-dispatch fault. No network access. */
export class TestProvider {
  calls: string[] = [];
  outcome: 'accepted' | 'unknown' = 'accepted';
  async dispatch(id: string): Promise<OperationResult> {
    this.calls.push(id);
    if(this.outcome==='unknown')throw new Error('connection lost after dispatch');
    return {version:1,requestId:id,status:'provider-accepted',revision:0,updatedAt:1000,references:[],observations:[]};
  }
}
