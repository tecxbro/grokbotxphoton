import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { operationRegistrations } from '../dist/src/registry/index.js';
import { parseAction, localRequestSchema } from '../dist/src/contracts/index.js';
const root = new URL('../', import.meta.url);
const start = '<!-- BEGIN GENERATED OPERATIONS -->';
const end = '<!-- END GENERATED OPERATIONS -->';
const assignedExamples = Object.freeze({
  'create-poll.json': 'poll.create',
  'reply.json': 'message.reply',
  'send-voice.json': 'voice.send',
  'update-card.json': 'app.update',
});

export async function validateExamples({ check = false } = {}) {
  const rows = [], names = [];
  await mkdir(new URL('examples/wt-08/', root), { recursive: true });
  for (const registration of operationRegistrations) {
    const { operation, owner, implementation } = registration;
    const fixture = JSON.parse(await readFile(new URL(`tests/fixtures/${operation}.json`, root), 'utf8'));
    const action = parseAction(fixture.valid);
    if (action.operation !== operation) throw new Error('EXAMPLE_OPERATION_MISMATCH');
    localRequestSchema.parse({ version: 1, method: 'submit', action });
    const schema = await readFile(new URL(`schemas/${operation}.json`, root), 'utf8');
    const name = `${operation}.json`; names.push(name);
    const example = JSON.stringify(action, null, 2) + '\n';
    const target = new URL(`examples/wt-08/${name}`, root);
    if (check) { if (await readFile(target, 'utf8') !== example) throw new Error(`EXAMPLE_DRIFT:${operation}`); }
    else await writeFile(target, example);
    rows.push(`| ${operation} | ${owner} | ${implementation} | [schema](schemas/${name}) | [example](examples/wt-08/${name}) | ${createHash('sha256').update(schema).digest('hex')} |`);
  }
  for (const [name, operation] of Object.entries(assignedExamples)) {
    const fixture = JSON.parse(await readFile(new URL(`tests/fixtures/${operation}.json`, root), 'utf8'));
    const action = parseAction(fixture.valid);
    if (action.operation !== operation) throw new Error('ASSIGNED_EXAMPLE_OPERATION_MISMATCH');
    localRequestSchema.parse({ version: 1, method: 'submit', action });
    const example = JSON.stringify(action, null, 2) + '\n';
    const target = new URL(`examples/wt-08/${name}`, root);
    if (check) { if (await readFile(target, 'utf8') !== example) throw new Error(`EXAMPLE_DRIFT:${name}`); }
    else await writeFile(target, example);
    names.push(name);
  }
  const inventory = (await readdir(new URL('examples/wt-08/', root))).filter(n => n.endsWith('.json')).sort();
  if (inventory.join() !== names.sort().join()) throw new Error('EXAMPLE_INVENTORY_DRIFT');
  return { rows, operations: rows.length, examplesValidated: rows.length, assignedExamplesValidated: Object.keys(assignedExamples).length, filesValidated: names.length };
}

export async function generateSkill({ check = false } = {}) {
  const { rows, operations, examplesValidated, assignedExamplesValidated, filesValidated } = await validateExamples({ check });
  const block = `${start}\n\nGenerated from the shared registry, strict action schemas and validated F0 fixtures. Registration does not prove runtime support. Discover current scoped capabilities before execution.\n\n| Operation | Owner | Registration | Shape | Invocation payload | Schema SHA-256 |\n| --- | --- | --- | --- | --- | --- |\n${rows.join('\n')}\n\n${end}`;
  const target = new URL('SKILL.md', root), old = await readFile(target, 'utf8');
  if (old.split(start).length !== 2 || old.split(end).length !== 2) throw new Error('MISSING_GENERATION_MARKERS');
  const next = old.slice(0, old.indexOf(start)) + block + old.slice(old.indexOf(end) + end.length);
  if (check) { if (next !== old) throw new Error('SKILL_REGISTRY_DRIFT'); } else await writeFile(target, next);
  return { operations, examplesValidated, assignedExamplesValidated, filesValidated, driftCheck: check };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await generateSkill({ check: process.argv.includes('--check') }))); }
  catch { console.error('grok-photon: generated documentation validation failed'); process.exitCode = 1; }
}
