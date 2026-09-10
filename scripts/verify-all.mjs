import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { validateTestResult } from "./verify-lane.mjs";

const root = process.cwd();

function run(name, command, args, tests = false) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 360_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.status !== 0 || result.error) throw new Error(`${name}:COMMAND_FAILED`);
  const count = tests ? validateTestResult(result) : undefined;
  console.log(`${name}: PASS${count ? ` (${count} tests)` : ""}`);
  return result;
}

try {
  for (const forbidden of ["src", "test", "demo", ".changeset", "agent.md", "architecthure.md"])
    if (existsSync(forbidden)) throw new Error(`LEGACY_GROK_CLI_PATH:${forbidden}`);
  for (const required of ["LICENSE", "packages/photon-features/LICENSE", "packages/photon-features/SKILL.md"])
    if (!existsSync(required)) throw new Error(`PRODUCT_FILE_MISSING:${required}`);
  console.log("product-boundary: PASS (legacy Grok Bot CLI absent)");
  run("foundation", "npm", ["run", "photon:test"], true);
  run("schema-drift", "npm", ["run", "photon:check"]);
  run("assembled-integration", "npm", ["run", "photon:test:integration"], true);
  run("skill-drift", process.execPath, ["packages/photon-features/scripts/generate-skill.mjs", "--check"]);
  run("docs", process.execPath, ["scripts/verify-docs.mjs", "integration"]);
  const packed = run("package-dry-run", "npm", ["pack", "--workspace=@grokbot/photon-features", "--dry-run", "--json", "--ignore-scripts"]);
  const files = JSON.parse(packed.stdout)[0]?.files?.map(file => file.path) ?? [];
  for (const required of ["LICENSE", "dist/src/host/main.js", "dist/src/integration/assembly.js", "dist/src/cli/main.js", "schemas/action.schema.json", "src/state/migrations/0001-initial.sql"])
    if (!files.includes(required)) throw new Error(`PACKAGE_INCOMPLETE:${required}`);
  if (!existsSync("packages/photon-features/dist/tests/integration/assembly.test.js"))
    throw new Error("ASSEMBLY_TEST_MISSING");
  console.log("assembled-local: PASS; installed/activated: NO; live verification: NOT AUTHORIZED");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
