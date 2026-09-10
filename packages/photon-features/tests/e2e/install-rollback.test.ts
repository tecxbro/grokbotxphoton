import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runtime, action, context } from '../lanes/wt-09/harness.js';
import { SQLiteStore } from '../../src/index.js';
import { DurableSQLiteStore } from '../../src/adapters/state/sqlite.js';
import { DatabaseSync } from 'node:sqlite';
const packagingUrl=new URL('../../../scripts/package.mjs',import.meta.url).href;
const installerUrl=new URL('../../../scripts/install.mjs',import.meta.url).href;

test('real installer with explicit offline archive fixture: clean/repeat install, inactive rollback, pending/unknown preservation',async t=>{
  const r=runtime();t.after(()=>r.close());const {encodeArchive,sha256}=await import(packagingUrl);const {installRelease,rollbackRelease}=await import(installerUrl);
  // Synthetic archive tests installer mechanics only. It is never candidate, package, or activation proof.
  const files=Object.fromEntries(['dist/src/cli/main.js','dist/src/index.d.ts','schemas/protocol.json','SKILL.md','INSTALL.md','package.json','dependency-lock.json','node_modules/zod/package.json'].map(p=>[p,'offline fixture\n']));
  const metadata={kind:'assembled-tested-candidate',commit:'0'.repeat(40),f0Digest:'0'.repeat(64),node:'24.13.0',npm:'10.9.2',platform:process.platform,arch:process.arch,
    stateSchemaVersion:1,compatibleStateSchemas:[1],offlineFixture:true,
    tests:['npm test','npm run photon:test','npm run photon:check','npm run photon:test:integration','node scripts/generate-skill.mjs --check'].map(command=>({command,exitCode:0}))};
  const archive=encodeArchive(files,metadata),checksum=sha256(archive),archivePath=join(r.dir,'fixture.gz'),root=join(r.dir,'install');writeFileSync(archivePath,archive);
  assert.equal((await installRelease({archivePath,checksum,root})).activation,'disabled');
  const path=join(root,'runtime/state.sqlite');writeFileSync(path,'',{mode:0o600});const store=new SQLiteStore(path);
  const queued=await r.submission.submit(action(),context);const original=r.store.scan('outbox')[0]!;
  store.transaction(tx=>{tx.put('outbox',original,null);tx.put('outbox',{...original,id:'uncertain',result:{...queued,requestId:'uncertain',status:'unknown-outcome'}},null);});store.close();
  const before=sha256(readFileSync(path));
  assert.equal((await installRelease({archivePath,checksum,root})).release,checksum);
  assert.equal((await rollbackRelease({root,release:checksum})).statePreserved,true);
  assert.equal(sha256(readFileSync(path)),before);
  const reopened=new DatabaseSync(path,{readOnly:true});try{assert.deepEqual(reopened.prepare('SELECT body FROM outbox ORDER BY id').all().map(row=>JSON.parse(String(row.body)).result.status).sort(),['queued','unknown-outcome']);}finally{reopened.close();}
  const changed=encodeArchive({...files,'SKILL.md':'changed fixture'},metadata),changedHash=sha256(changed),changedPath=join(r.dir,'second.gz');writeFileSync(changedPath,changed);
  await installRelease({archivePath:changedPath,checksum:changedHash,root});
  await rollbackRelease({root,release:checksum});
  assert.equal(JSON.parse(readFileSync(join(root,'selected-release.json'),'utf8')).release,checksum);
  assert.equal(sha256(readFileSync(path)),before);
  await assert.rejects(installRelease({archivePath,checksum:'f'.repeat(64),root}),/CHECKSUM/);
  writeFileSync(join(root,'runtime/configuration.json'),JSON.stringify({version:1,activation:'enabled'}));
  await assert.rejects(rollbackRelease({root,release:checksum}),/DEACTIVATION_REQUIRED/);
});

test('runtime-created database satisfies installer private-file contract under ordinary umask',t=>{
  const r=runtime();t.after(()=>r.close());const path=join(r.dir,'fresh.sqlite');
  const prior=process.umask(0o022);let store:DurableSQLiteStore|undefined;
  try{store=new DurableSQLiteStore(path);}finally{process.umask(prior);store?.close();}
  // Installer stateVersion requires all group/other bits clear. Test the real runtime creator.
  return import('node:fs').then(({statSync})=>assert.equal(statSync(path).mode&0o077,0,'WT-01 database cannot be reinstalled/rolled back by WT-08'));
});
