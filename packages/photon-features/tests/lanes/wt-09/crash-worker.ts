// Deliberate abrupt termination of an OFFLINE provider fixture after dispatch intent.
// Run only in a disposable WT-09 child process; never connects to Photon.
import { writeFileSync } from 'node:fs';
import { DurableSQLiteStore } from '../../../src/adapters/state/sqlite.js';
import { DurableContexts } from '../../../src/runtime/core/authorization.js';
import { ExecutionClaims } from '../../../src/runtime/core/claims.js';
import { DurableExecutor } from '../../../src/runtime/core/executor.js';
import { binding, unusedDependencies } from './execution-harness.js';
if (process.argv[2] === '--wt09-offline-crash') {
  const [path, requestId, marker] = process.argv.slice(3);
  if (!path || !requestId || !marker) throw new Error('MISSING_CRASH_FIXTURE');
  const store = new DurableSQLiteStore(path);
  const contexts = new DurableContexts(store,{now:()=>10000});
  const executor = new DurableExecutor(new ExecutionClaims(store,contexts),unusedDependencies,1,1000);
  await executor.execute(requestId,binding(async () => {
    writeFileSync(marker,'offline-provider-accepted\n'); process.exit(86);
  }));
  throw new Error('CRASH_BOUNDARY_NOT_REACHED');
}
