import pathlib,subprocess,shutil,os,tarfile,io,json
root=pathlib.Path(__file__).resolve().parents[4]
import tempfile
dest=pathlib.Path(tempfile.mkdtemp(prefix='wt03-validation-'))
# Isolated committed F0 plus this lane. No sibling working files.
archive=subprocess.check_output(['git','archive','57e40736be8a59047b776654c766fbe8bfd10c9e'],cwd=root)
with tarfile.open(fileobj=io.BytesIO(archive)) as tar:tar.extractall(dest,filter='data')
for rel in ['packages/photon-features/src/features/text-messages','packages/photon-features/tests/lanes/wt-03','packages/photon-features/examples/wt-03']:
 shutil.copytree(root/rel,dest/rel,dirs_exist_ok=True)
# Read-only reuse of installed pinned SDK; no dependency or source edits.
if not (dest/'node_modules').exists():(dest/'node_modules').symlink_to(root/'node_modules',target_is_directory=True)
local_modules=dest/'packages/photon-features/node_modules'
if not local_modules.exists():local_modules.symlink_to(root/'packages/photon-features/node_modules',target_is_directory=True)
env=os.environ.copy();node_bin=os.environ.get('WT03_NODE_BIN', '/Users/darshan/.npm/_npx/cee224165f95995d/node_modules/node/bin')
env['PATH']=node_bin+':'+env['PATH']
assert subprocess.check_output(['node','--version'],env=env,text=True).strip() == 'v24.13.0', 'Node 24.13.0 required'
for rel, version in [('node_modules/spectrum-ts/package.json','12.8.0'),('node_modules/@spectrum-ts/imessage/package.json','12.8.0'),('packages/photon-features/node_modules/@types/node/package.json','24.10.1'),('packages/photon-features/node_modules/typescript/package.json','5.9.3')]:
 assert json.loads((root/rel).read_text())['version']==version, 'Pinned dependency mismatch: '+rel
commands=[('lane-tests',['npm','run','test:lane','--','dist/tests/lanes/wt-03/*.test.js'],dest/'packages/photon-features'),('foundation-tests',['npm','run','photon:test'],dest),('schema-check',['npm','run','photon:check'],dest),('existing-tests',['npm','test'],dest)]
results=[]
for name,cmd,cwd in commands:
 r=subprocess.run(cmd,cwd=cwd,env=env,text=True,capture_output=True);(root/'docs/photon-features/evidence/wt-03'/f'{name}.txt').write_text(r.stdout+r.stderr)
 print(name,r.returncode,r.stdout[-600:]+r.stderr[-500:],flush=True);results.append({'name':name,'command':' '.join(cmd),'cwd':str(cwd),'exitCode':r.returncode,'observedAt':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()})
 if r.returncode:break
(root/'docs/photon-features/evidence/wt-03/validation.json').write_text(json.dumps(results,indent=2)+'\n')

if any(r['exitCode'] for r in results):raise SystemExit(1)
