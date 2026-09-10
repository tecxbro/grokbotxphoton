import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// The distribution tools are ESM JavaScript entrypoints intentionally shipped as .mjs.
// @ts-ignore no declaration file is required for the executable test seam.
import { validateExamples } from "../../../../scripts/generate-skill.mjs";
// @ts-ignore no declaration file is required for the executable test seam.
import { encodeArchive, packageSupportFiles, sha256, validateMetadata } from "../../../../scripts/package.mjs";
// @ts-ignore no declaration file is required for the executable test seam.
import { installPackage } from "../../../../scripts/install.mjs";
// @ts-ignore no declaration file is required for the executable test seam.
import { rollbackInstallation } from "../../../../scripts/rollback.mjs";

const metadata = {
  kind: "assembled-tested-candidate",
  commit: "a".repeat(40),
  f0Digest: "b".repeat(64),
  node: "24.13.0",
  npm: "10.9.2",
  stateSchemaVersion: 1,
  compatibleStateSchemas: [1],
  platform: process.platform,
  arch: process.arch,
  tests: ["npm test", "npm run photon:test", "npm run photon:check", "npm run photon:test:integration", "node scripts/generate-skill.mjs --check"].map(command => ({ command, exitCode: 0 })),
};
const releaseFiles = {
  "dist/src/cli/main.js": "console.log('fixture')",
  "dist/src/index.d.ts": "export {};",
  "schemas/protocol.json": "{}",
  "SKILL.md": "full policy stays versioned",
  "INSTALL.md": "inactive",
  "package.json": '{"type":"module"}',
  "dependency-lock.json": "{}",
  "node_modules/zod/package.json": "{}",
};

test("generated examples stay registry-valid including the four assigned names", async () => {
  const report = await validateExamples({ check: true });
  assert.equal(report.operations, 44);
  assert.equal(report.assignedExamplesValidated, 4);
  assert.equal(report.filesValidated, 48);
});

test("release contract requires exact runtime dependencies and all lifecycle tools", () => {
  for (const name of ["scripts/generate-skill.mjs", "scripts/install.mjs", "scripts/package.mjs", "scripts/rollback.mjs", "scripts/smoke-test.mjs"]) {
    assert.ok(packageSupportFiles.includes(name));
  }
  assert.throws(() => validateMetadata({ ...metadata, releaseContract: 3 }), /UNTESTED_OR_INCOMPATIBLE_ARTIFACT/);
  assert.throws(() => validateMetadata({ ...metadata, releaseContract: 2, version: "0.1.0", dependencies: { "spectrum-ts": "12.8.1", zod: "4.5.4" } }), /UNTESTED_OR_INCOMPATIBLE_ARTIFACT/);
  assert.doesNotThrow(() => validateMetadata({ ...metadata, releaseContract: 2, version: "0.1.0", dependencies: { "spectrum-ts": "12.8.0", zod: "4.5.4" } }));
});

test("repeat inactive install and standalone rollback preserve unrelated data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wt08-regression-"));
  const root = join(directory, "install");
  try {
    const firstBytes = encodeArchive(releaseFiles, metadata);
    const firstPath = join(directory, "first.gpf.gz");
    await writeFile(firstPath, firstBytes);
    const firstOptions = { root, archivePath: firstPath, checksum: sha256(firstBytes) };
    const first = await installPackage(firstOptions);
    assert.deepEqual(await installPackage(firstOptions), first);
    await writeFile(join(root, "unrelated"), "keep");
    const secondBytes = encodeArchive({ ...releaseFiles, "SKILL.md": "second" }, { ...metadata, commit: "c".repeat(40) });
    const secondPath = join(directory, "second.gpf.gz");
    await writeFile(secondPath, secondBytes);
    await installPackage({ root, archivePath: secondPath, checksum: sha256(secondBytes) });
    const rollback = await rollbackInstallation({ root, release: first.release });
    assert.equal(rollback.statePreserved, true);
    assert.equal(await readFile(join(root, "unrelated"), "utf8"), "keep");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
