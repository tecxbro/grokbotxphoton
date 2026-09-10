import { readdirSync } from "node:fs";
import { resolve, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { validateTestResult } from "./verify-lane.mjs";

const root = process.cwd();
const sourceRoot = resolve(root, "packages/photon-features/tests");
const included = new Set(["foundation", "lanes", "e2e", "security", "integration"]);
const tests = [];

function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (entry.name.endsWith(".test.ts")) {
      const source = relative(sourceRoot, path).replace(/\.ts$/, ".js");
      if (included.has(source.split("/")[0]))
        tests.push(`packages/photon-features/dist/tests/${source}`);
    } else if (entry.name.endsWith(".test.mjs")) {
      const source = relative(root, path);
      if (included.has(relative(sourceRoot, path).split("/")[0])) tests.push(source);
    }
  }
}

collect(sourceRoot);
tests.sort();
if (!tests.length) throw new Error("MISSING_INTEGRATION_TESTS");
const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", ...tests], {
  cwd: root,
  encoding: "utf8",
  timeout: 300_000,
  maxBuffer: 64 * 1024 * 1024,
});
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
const count = validateTestResult(result);
console.log(`integration-test-files: ${tests.length}; tests: ${count}; live suite excluded by explicit authorization boundary`);
