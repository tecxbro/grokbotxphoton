import pathlib,subprocess,json,hashlib,tempfile,os,tarfile,io,datetime
root=pathlib.Path('/Users/darshan/Documents/ChatGPT/grokbotxphoton');loc=json.loads(pathlib.Path('/tmp/wt00-integration-preflight-current.json').read_text());ev=pathlib.Path(loc['evidence']);sha=lambda b:hashlib.sha256(b).hexdigest()
def git(*args):return subprocess.check_output(['git',*args],cwd=root)
head=git('rev-parse','HEAD').decode().strip();f0='57e40736be8a59047b776654c766fbe8bfd10c9e';snap=pathlib.Path(tempfile.mkdtemp(prefix='wt00-committed-'))
with tarfile.open(fileobj=io.BytesIO(git('archive',head))) as t:t.extractall(snap,filter='data')
ownership=json.loads(git('show',f0+':docs/photon-features/ownership.json'))
lanes={};violations=[]
for row in git('log','--format=%H %s',f0+'..'+head).decode().splitlines():
 commit,subject=row.split(' ',1);lane=next('wt-'+x for x in ['01','02','03','04','05','06','07','08','09'] if 'WT-'+x in subject)
 paths=git('diff-tree','--no-commit-id','--name-only','-r',commit).decode().splitlines();cfg=ownership['lanes'][lane];prefixes=[ownership['packageRoot']+x for x in cfg['packagePaths']]+cfg['documentationPaths'];bad=[p for p in paths if not any(p.startswith(x) if x.endswith('/') else p==x for x in prefixes)]
 assert subprocess.run(['git','merge-base','--is-ancestor',f0,commit],cwd=root).returncode==0
 digest=json.loads(git('show',commit+':docs/photon-features/foundation.json'))['contractDigest'];assert digest==json.loads((snap/'docs/photon-features/foundation.json').read_text())['contractDigest']
 lanes[lane]={'commit':commit,'subject':subject,'changedPaths':paths,'ownershipViolations':bad,'f0Ancestor':True,'declaredF0Digest':digest};violations+=bad
meta={'head':head,'f0':f0,'lanes':lanes,'snapshot':str(snap),'commands':[],'ownershipViolations':violations,'note':'Commits appeared concurrently on main; WT-00 did not create or replay them. Exact ancestry/path/dependency checks are not full code review approval.'}
(ev/'committed-verification.json').write_text(json.dumps(meta,indent=2)+'\n')
node='/Users/darshan/.npm/_npx/cee224165f95995d/node_modules/node/bin/node';env={**os.environ,'PATH':str(pathlib.Path(node).parent)+':'+os.environ['PATH'],'WT09_LIVE_APPROVAL_FILE':'','WT09_LIVE_CANDIDATE_SHA':''}
def run(name,args):
 r=subprocess.run(args,cwd=snap,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=60);(ev/('committed-'+name+'.log')).write_bytes(r.stdout);meta['commands'].append({'name':name,'argv':args,'cwd':str(snap),'exitCode':r.returncode,'logSha256':sha(r.stdout)});(ev/'committed-verification.json').write_text(json.dumps(meta,indent=2)+'\n');print(name,r.returncode,flush=True);return r.returncode==0
print(json.dumps({'head':head,'lanes':{k:v['commit'] for k,v in lanes.items()},'ownershipViolations':violations}),flush=True)
if run('clean-install',['npm','ci','--ignore-scripts']):
 run('original-cli',['npm','test'])
 if run('build',['npm','run','photon:build']):
  run('foundation',['npm','run','photon:test']);run('contract-drift',['npm','run','photon:check'])
  tests=sorted(str(p.relative_to(snap)) for folder in ['e2e','security','live','lanes/wt-09'] for p in (snap/'packages/photon-features/dist/tests'/folder).rglob('*.test.js'))
  run('wt09',[node,'--test','--test-reporter=tap',*tests]);run('generated-skill',[node,'packages/photon-features/scripts/generate-skill.mjs','--check'])
print('complete',str(ev/'committed-verification.json'),flush=True)
