import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { changedPaths } from './verify-ownership.mjs';
export const foundationTests=['contracts','feature-services','receipts','sdk-compatibility','ownership','verification-tools'].map(n=>`packages/photon-features/dist/tests/foundation/${n}.test.js`);
/** Missing and skipped suites are errors, regardless of the child process exit code. */
export function validateTestResult(result) {
  const output=String(result.stdout ?? '')+'\n'+String(result.stderr ?? '');
  if(result.status!==0 || result.error)throw new Error('COMMAND_FAILED');
  const metric=name=>Number(output.match(new RegExp(`^(?:#|ℹ) ${name} (\\d+)$`,'m'))?.[1] ?? 0);
  const tests=metric('tests'),skipped=metric('skipped');
  if(!tests || skipped || /^not ok\b/m.test(output) || /^(?:not )?ok .*# (?:SKIP|TODO)\b/im.test(output) || metric('todo') || metric('cancelled'))throw new Error('MISSING_OR_SKIPPED_TESTS');
  return tests;
}
export function requireTests(root,files) {if(!files.length || files.some(p=>!existsSync(resolve(root,p))))throw new Error('MISSING_REQUIRED_TEST');}
export function workingIdentity(root) {
  const foundation=JSON.parse(readFileSync(resolve(root,'docs/worktrees/foundation.json')));
  const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
  const hash=createHash('sha256');
  // Include committed tree plus every staged/unstaged/untracked delta's actual bytes.
  hash.update(git('rev-parse','HEAD^{tree}'));
  hash.update(execFileSync('git',['-C',root,'diff','--cached','--raw','--no-abbrev','-z']));
  for(const path of changedPaths(root,foundation.startCommit)) {
    hash.update(path+'\0');hash.update(existsSync(resolve(root,path))?readFileSync(resolve(root,path)):'DELETED');hash.update('\0');
  }
  return {head:git('rev-parse','HEAD'),dirty:!!git('status','--porcelain'),workingTreeDigest:hash.digest('hex')};
}
export function verifyLane(root=process.cwd(),lane='wt-00') {
 const [major,minor]=process.versions.node.split('.').map(Number);
 if(major!==24 || minor<13)throw new Error('NODE_24_13_REQUIRED');
 if(lane!=='wt-00')throw new Error('LANE_NOT_ASSEMBLED');
 const report={mode:'f0',at:new Date().toISOString(),identity:workingIdentity(root),results:[],status:'running'};
 mkdirSync(resolve(root,'.photon-local'),{recursive:true});
 const save=()=>writeFileSync(resolve(root,'.photon-local/verification.json'),JSON.stringify(report,null,2)+'\n');
 const run=(name,args,tests=false)=>{
   const result=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});
   const output=String(result.stdout??'')+String(result.stderr??'');
   writeFileSync(resolve(root,`.photon-local/${name}.log`),output);
   let count=null;try{if(result.status!==0||result.error)throw new Error('COMMAND_FAILED');if(tests)count=validateTestResult(result);}
   catch(e){report.results.push({name,status:'failed',exit:result.status,tests:count});save();throw new Error(`${name}:${e.message}\n${output.slice(-5000)}`);}
   report.results.push({name,status:'passed',exit:result.status,tests:count,logSha256:createHash('sha256').update(output).digest('hex')});save();console.log(`${name}: PASS${count ? ` (${count} tests)` : ''}`);
 };
 try {
   run('worktree',['scripts/verify-worktree.mjs',lane]);
   run('typecheck',['node_modules/typescript/bin/tsc','-p','packages/photon-features/tsconfig.json','--noEmit']);
   run('build',['node_modules/typescript/bin/tsc','-p','packages/photon-features/tsconfig.json']);
   requireTests(root,foundationTests);
   for(const name of ['contracts','feature-services','receipts','sdk-compatibility','ownership','verification-tools'])run(name==='ownership'?'ownership-tests':name,['--test','--test-reporter=tap',`packages/photon-features/dist/tests/foundation/${name}.test.js`],true);
   run('schema-drift',['scripts/generate-contracts.mjs','--check']);
   run('legacy-foundation',['--test','--test-reporter=tap','packages/photon-features/dist/tests/lanes/wt-00/*.test.js'],true);
   run('existing-cli',['--test','--test-reporter=tap','test/*.test.js'],true);
   run('ownership',['scripts/verify-ownership.mjs',lane]);
   run('docs',['scripts/verify-docs.mjs',lane]);
   report.status='passed';save();return report;
 } catch(e){report.status='failed';save();throw e;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 try {const report=verifyLane(process.cwd(),process.argv[2]??'wt-00');console.log(JSON.stringify({mode:report.mode,status:report.status,identity:report.identity}));}
 catch(e){console.error(e.message);process.exitCode=1;}
}
