import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const officialTargets = [
  'spectrum-ts/introduction', 'spectrum-ts/getting-started', 'spectrum-ts/messages',
  'spectrum-ts/spaces-and-users', 'spectrum-ts/platform-narrowing', 'spectrum-ts/providers',
  'spectrum-ts/providers/imessage/connection-and-routing', 'spectrum-ts/content',
  'spectrum-ts/content/composing-content', 'spectrum-ts/content/polls', 'spectrum-ts/content/app',
  'spectrum-ts/content/read', 'spectrum-ts/custom-events-and-lifecycle',
  'spectrum-ts/providers/imessage/messaging-features/inbound-read-receipts',
  'spectrum-ts/providers/imessage/messaging-features/message-metadata',
  'best-practices/architecture', 'best-practices/inbound-pipeline', 'best-practices/recovery-and-state',
  'advanced-kits/imessage/getting-started', 'advanced-kits/imessage/error-handling',
  'advanced-kits/imessage/events', 'webhooks/delivery',
].map(p => `https://photon.codes/docs/${p}.md`);
export const skillPaths = [
  'README.md', 'skills/spectrum/SKILL.md', 'skills/imessage/SKILL.md',
  'skills/photon-cli/SKILL.md', 'skills/photon-webhooks/SKILL.md',
  ...['getting-started','content','capability-semantics','platform-narrowing','providers/imessage','best-practices'].map(p => `skills/spectrum/${p}.md`),
  ...['choosing-a-stack','advanced/getting-started','references/hosted-v2','references/spectrum'].map(p => `skills/imessage/${p}.md`),
];

/** Reject successful HTTP error pages too; identity must match the requested source. */
export function validateDocument(record, body) {
  if (record.status !== 200) throw new Error(`HTTP_STATUS:${record.status}`);
  if (!/^(text\/(plain|markdown|x-markdown)|application\/(octet-stream|markdown))(;|$)/i.test(record.contentType ?? '')) throw new Error('NOT_MARKDOWN_CONTENT_TYPE');
  if (!body.trim() || body.length < 40 || /<(?:!doctype|html|head|body)\b/i.test(body)) throw new Error('NOT_MARKDOWN_BODY');
  if (!/^#{1,6}\s+\S/m.test(body)) throw new Error('MISSING_DOCUMENT_TITLE');
  if (/^#\s*Error\s*$/im.test(body)) throw new Error('ERROR_DOCUMENT');
  if (/^#\s*(?:404|not found|access denied|sign in)\b/im.test(body)) throw new Error('ERROR_DOCUMENT');
  const asked = new URL(record.url), actual = new URL(record.finalUrl);
  if (asked.pathname !== actual.pathname) throw new Error('DOCUMENT_IDENTITY_MISMATCH');
  if (asked.hostname !== actual.hostname && !(asked.hostname === 'docs.photon.codes' && actual.hostname === 'photon.codes')) throw new Error('SOURCE_HOST_MISMATCH');
  const title = body.match(/^#{1,6}\s+(.+)$/m)[1].trim();
  const special = {'llms.txt':'Photon','connection-and-routing.md':'iMessage connection and routing','inbound-read-receipts.md':'Inbound iMessage read receipts','message-metadata.md':'Native iMessage message metadata','delivery.md':'Delivery and retries'};
  const leaf = asked.pathname.split('/').at(-1);
  if (['photon.codes','docs.photon.codes'].includes(asked.hostname) && (officialTargets.includes(record.url) || leaf === 'llms.txt')) {
    const expected = special[leaf] ?? leaf.replace(/\.md$/, '').replaceAll('-', ' ');
    if(title.toLowerCase() !== expected.toLowerCase())throw new Error('DOCUMENT_TITLE_MISMATCH');
  }
  return title;
}

/** Anonymous, read-only retrieval bounded by time, bytes and redirects. No fabricated failures. */
export async function fetchDocument(url, { fetcher = fetch, timeoutMs = 15000, maxBytes = 4 * 1024 * 1024 } = {}) {
  const record = { url, finalUrl: null, status: null, retrievedAt: new Date().toISOString(), contentType: null, identity: null, sha256: null, snapshot: null, failure: null };
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'follow', headers: { Accept: 'text/markdown,text/plain' } });
    record.finalUrl = response.url || url;
    record.status = response.status;
    record.contentType = response.headers.get('content-type');
    if (!response.body) throw new Error('EMPTY_BODY');
    const chunks = []; let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > maxBytes) throw new Error('DOCUMENT_TOO_LARGE');
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString('utf8');
    record.identity = validateDocument(record, body);
    record.sha256 = createHash('sha256').update(body).digest('hex');
    return { record, body };
  } catch (error) { record.failure = String(error.message); return { record, body: null }; }
}

/** Only validated content is snapshotted. Failed access retains actual transport metadata. */
export async function writeSourceRecord(result, classification, directory = root) {
  const record = { ...result.record, classification };
  if (result.body !== null && !record.failure) {
    const url = new URL(record.url);
    const relative = classification === 'official' ? `docs/photon/reference/${url.hostname}/${url.pathname.replace(/^\/docs\//, '')}` : `docs/worktrees/wt-00/references/${url.hostname}${url.pathname}`;
    record.snapshot = relative;
    const path = resolve(directory, relative);
    if (!path.startsWith(resolve(directory) + '/')) throw new Error('SNAPSHOT_ESCAPE');
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, result.body);
  }
  return record;
}

async function main() {
  const sources = [], discovered = new Map();
  // Index retrieval happens before every focused page; preserve all links, regardless of scope.
  for (const url of ['https://docs.photon.codes/docs/llms.txt', 'https://photon.codes/docs/llms.txt']) {
    const result = await fetchDocument(url);
    sources.push(await writeSourceRecord(result, 'official'));
    for (const m of result.body?.matchAll(/\[([^\]]+)\]\((https:\/\/[^)]+)\)/g) ?? []) discovered.set(m[2], { title: m[1], url: m[2], scope: 'reference-only' });
  }
  const full = ['spectrum','cli','webhooks','low-level-sdks','api-reference'].map(p => `https://photon.codes/docs/llms-${p}.txt`);
  const targets = [...full, ...officialTargets];
  for (let i = 0; i < targets.length; i += 4) {
    const batch = await Promise.all(targets.slice(i, i+4).map(url => fetchDocument(url)));
    for (const result of batch) sources.push(await writeSourceRecord(result, 'official'));
  }
  await writeFile(resolve(root, 'docs/photon/source-lock.json'), JSON.stringify({ version: 1, sources, discovered: [...discovered.values()] }, null, 2) + '\n');
  const skills = [];
  for (let i = 0; i < skillPaths.length; i += 4) {
    const batch = await Promise.all(skillPaths.slice(i,i+4).map(p => fetchDocument(`https://raw.githubusercontent.com/tecxbro/photon-skills/main/${p}`)));
    for (const result of batch) skills.push(await writeSourceRecord(result, 'skill'));
  }
  await writeFile(resolve(root, 'docs/worktrees/wt-00/source-lock.json'), JSON.stringify({ version: 1, sources: skills }, null, 2) + '\n');
  console.log(JSON.stringify({ verified: sources.filter(s => !s.failure).length, failures: sources.filter(s => s.failure).map(s => ({ url: s.url, failure: s.failure })), discovered: discovered.size, skills: skills.length }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
