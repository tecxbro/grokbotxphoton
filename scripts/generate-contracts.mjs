import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { actionSchema } from '../packages/photon-features/dist/src/contracts/actions.js';
import { incomingEventSchema } from '../packages/photon-features/dist/src/contracts/events.js';
import { resultSchema } from '../packages/photon-features/dist/src/contracts/results.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)),'..');
const check = process.argv.includes('--check');
for (const [name,schema] of Object.entries({action:actionSchema,event:incomingEventSchema,result:resultSchema})) {
  const path = resolve(root,`packages/photon-features/schemas/${name}.schema.json`);
  const body = JSON.stringify(z.toJSONSchema(schema,{target:'draft-2020-12',unrepresentable:'throw'}),null,2)+'\n';
  if(check) {if(readFileSync(path,'utf8')!==body)throw new Error(`SCHEMA_DRIFT:${name}`);}
  else writeFileSync(path,body);
}
const manifest = JSON.parse(readFileSync(resolve(root,'docs/worktrees/ownership.json')));
const files = [];
const walk = relative => {for(const e of readdirSync(resolve(root,relative),{withFileTypes:true})) {const path=relative+'/'+e.name;if(e.isDirectory())walk(path);else if(/\.(ts|sql)$/.test(path))files.push(path);}};
for(const relative of ['contracts','state','registry','host'])walk('packages/photon-features/src/'+relative);
files.push('packages/photon-features/src/index.ts','packages/photon-features/src/capabilities.ts','packages/photon-features/package.json','package-lock.json');
for(const name of ['action','event','result'])files.push(`packages/photon-features/schemas/${name}.schema.json`);
files.sort();
const hash = createHash('sha256');
for (const path of files) hash.update(path+'\0').update(readFileSync(resolve(root,path))).update('\0');
const digest = hash.digest('hex');
const path=resolve(root,'docs/worktrees/integration/candidate-contract.json');
const foundation=JSON.parse(readFileSync(path));
if(check) {if(foundation.contractDigest!==digest||foundation.digestFileCount!==undefined&&foundation.digestFileCount!==files.length)throw new Error('CONTRACT_DIGEST_DRIFT');}
else {foundation.contractDigest=digest;if('digestFileCount' in foundation)foundation.digestFileCount=files.length;else foundation.digestFiles=files;writeFileSync(path,JSON.stringify(foundation,null,2)+'\n');}
console.log(JSON.stringify({schemas:3,contractDigest:digest,files:files.length}));
