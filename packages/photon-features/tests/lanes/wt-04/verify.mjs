import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const lane = dirname(fileURLToPath(import.meta.url));
const root = resolve(lane, '../../../../..');
const scratch = mkdtempSync(join(tmpdir(), 'wt04-verify-'));
try {
  symlinkSync(join(root, 'node_modules'), join(scratch, 'node_modules'));
  writeFileSync(join(scratch, 'package.json'), '{"type":"module"}\n');
  const output = join(scratch, 'dist');
  execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(lane, 'tsconfig.json'), '--outDir', output], { stdio: 'inherit' });
  execFileSync(process.execPath, ['--test', join(output, 'tests/lanes/wt-04/*.test.js')], { stdio: 'inherit' });
} finally { rmSync(scratch, { recursive: true, force: true }); }
