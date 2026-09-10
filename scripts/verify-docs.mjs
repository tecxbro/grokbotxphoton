import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { workingIdentity } from './verify-lane.mjs';
import { officialTargets, validateDocument } from './fetch-photon-docs.mjs';
/** Verify content identity and actual snapshots, never a status asserted by a URL list. */
export function checkSourceLock(lock, read) {
  if (lock.version !== 1 || !Array.isArray(lock.sources) || !lock.sources.length) throw new Error('INVALID_SOURCE_LOCK');
  const urls = new Set();
  for(const source of lock.sources) {
    if (!['official','skill'].includes(source.classification)) throw new Error('INVALID_SOURCE_CLASSIFICATION');
    if (urls.has(source.url)) throw new Error('DUPLICATE_SOURCE'); urls.add(source.url);
    if (!Number.isFinite(Date.parse(source.retrievedAt))) throw new Error('INVALID_SOURCE_TIME');
    if (source.failure) {
      if(source.sha256 !== null || source.snapshot !== null || source.identity !== null) throw new Error('FABRICATED_SOURCE_EVIDENCE');
    } else {
      if (!source.snapshot || !source.sha256 || source.snapshot.includes('..')) throw new Error('INVALID_SOURCE_SNAPSHOT');
      const body=read(source.snapshot);
      if(createHash('sha256').update(body).digest('hex')!==source.sha256) throw new Error('SOURCE_HASH_MISMATCH');
      if(validateDocument(source,body)!==source.identity)throw new Error('SOURCE_TITLE_MISMATCH');
      if(source.classification==='official' && !source.snapshot.startsWith('docs/photon/reference/'))throw new Error('SOURCE_CLASSIFICATION_MISMATCH');
      if(source.classification==='skill' && !source.snapshot.startsWith('docs/worktrees/wt-00/references/'))throw new Error('SOURCE_CLASSIFICATION_MISMATCH');
    }
  }
}
export function checkEvidence(cases, evidence) {
  if(cases.length!==8 || new Set(cases.map(c=>c.id)).size!==8)throw new Error('MISSING_ACCEPTANCE');
  for(const c of cases) {
    if(c.status!=='passed' || !c.evidence?.length || c.evidence.some(id=>!evidence.includes(id)))throw new Error(`INCONSISTENT_EVIDENCE:${c.id}`);
  }
}
export function verifyDocs(root=process.cwd(),lane='wt-00') {
  const read=p=>readFileSync(resolve(root,p),'utf8');
  const manifest=JSON.parse(read('docs/photon-features/docs-manifest.json'));
  for(const [path,sections] of Object.entries(manifest.sections)) {
    const body=read(path);
    for(const section of sections) if(!body.includes(`## ${section}\n`))throw new Error(`MISSING_SECTION:${path}:${section}`);
  }
  const inventory=JSON.parse(read(`docs/worktrees/${lane}/FILES.json`));
  const ownership=JSON.parse(read('docs/worktrees/ownership.json'));
  if(inventory.files.map(f=>f.path).sort().join('\n')!==[...ownership.owners[lane]].sort().join('\n'))throw new Error('FILE_INVENTORY_DRIFT');
  for(const file of inventory.files) {
    const body=read(file.path);
    if(!file.purpose || !body.trim())throw new Error(`EMPTY_DOCUMENT:${file.path}`);
    for(const symbol of file.symbols ?? [])if(!body.includes(symbol))throw new Error(`MISSING_SYMBOL:${file.path}:${symbol}`);
  }
  if (lane === 'integration') {
    const lock=JSON.parse(read('docs/worktrees/integration/source-lock.json'));
    if(lock.version!==1||lock.sources.length!==7)throw new Error('INVALID_INTEGRATION_SOURCE_LOCK');
    for(const source of lock.sources) {
      if(source.classification!=='official'||!source.url.startsWith('https://photon.codes/docs/')||
        !source.snapshot.startsWith('docs/photon/reference/')||
        createHash('sha256').update(read(source.snapshot)).digest('hex')!==source.sha256)
        throw new Error(`INTEGRATION_SOURCE_DRIFT:${source.url}`);
    }
    const ledger=JSON.parse(read('docs/worktrees/integration/included-commits.json'));
    const foundation=JSON.parse(read('docs/worktrees/foundation.json'));
    if(ledger.base.tag!==foundation.tag||ledger.base.contractDigest!==foundation.contractDigest||
      ledger.lanes.length!==9||ledger.lanes.some(entry=>entry.integrationStatus!=='integrated'||!entry.reviewedCommits.length||!entry.integrationCommits.length))
      throw new Error('INCOMPLETE_INTEGRATION_LEDGER');
    const evidence=read('docs/worktrees/integration/TEST-EVIDENCE.md');
    for(const marker of ['75 passed','755','live test','not prove installation'])
      if(!evidence.includes(marker))throw new Error(`MISSING_INTEGRATION_EVIDENCE:${marker}`);
    return {lane,structural:'passed',sources:lock.sources.length,lanes:ledger.lanes.length,
      semanticReview:'Integration evidence remains local/offline; installation, activation and live behavior are separate.'};
  }
  const official=JSON.parse(read('docs/photon/source-lock.json'));
  checkSourceLock(official,read);
  const requiredUrls=[...officialTargets,'https://photon.codes/docs/llms.txt','https://docs.photon.codes/docs/llms.txt',...['spectrum','cli','webhooks','low-level-sdks','api-reference'].map(p=>`https://photon.codes/docs/llms-${p}.txt`)];
  for(const url of requiredUrls)if(!official.sources.some(s=>s.url===url))throw new Error(`MISSING_SOURCE:${url}`);
  if(!official.discovered?.length)throw new Error('MISSING_INDEX_INVENTORY');
  const indexed=new Set();
  for(const source of official.sources.filter(s=>s.url.endsWith('/llms.txt') && !s.failure)) for(const m of read(source.snapshot).matchAll(/\[[^\]]+\]\((https:\/\/[^)]+)\)/g))indexed.add(m[1]);
  if([...indexed].sort().join()!==official.discovered.map(s=>s.url).sort().join())throw new Error('INDEX_ENTRY_LOST');
  checkSourceLock(JSON.parse(read('docs/worktrees/wt-00/source-lock.json')),read);
  checkEvidence(manifest.acceptance,manifest.evidence);
  const report=JSON.parse(read('.photon-local/verification.json'));
  if(report.mode!=='f0' || report.identity.workingTreeDigest!==workingIdentity(root).workingTreeDigest)throw new Error('STALE_TEST_EVIDENCE');
  for(const name of manifest.requiredResults) {
    const result=report.results.find(r=>r.name===name);
    if(!result || result.status!=='passed' || result.exit!==0)throw new Error(`MISSING_VERIFIED_RESULT:${name}`);
    if(createHash('sha256').update(read(`.photon-local/${name}.log`)).digest('hex')!==result.logSha256)throw new Error('TEST_LOG_HASH_MISMATCH');
  }
  if(!read('docs/worktrees/wt-00/TEST-EVIDENCE.md').includes('Manual review: complete'))throw new Error('MANUAL_REVIEW_REQUIRED');
  return {lane, structural:'passed', sourceFailures:official.sources.filter(s=>s.failure).map(s=>s.url), semanticReview:'Recorded manual review; automation cannot prove prose or provider semantics.'};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {console.log(JSON.stringify(verifyDocs(process.cwd(),process.argv[2]??'wt-00')));}
  catch(e){console.error(e.message);process.exitCode=1;}
}
