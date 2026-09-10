import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { readFileSync } from "node:fs";
import { commandRequest, executeCommand } from "../../../src/cli/commands.js";
import { readJson } from "../../../src/cli/main.js";
import { CliError, formatCommandResult } from "../../../src/cli/output.js";
import { parseAction } from "../../../src/contracts/index.js";

const action = JSON.parse(
  readFileSync(new URL("../../../../examples/wt-08/reply.json", import.meta.url), "utf8"),
);

test("strict command parsing and executeCommand dispatch exactly one request", async () => {
  const request = commandRequest(["execute", "--json-stdin"], "context-1", action);
  assert.equal(request.method, "submit");
  let calls = 0;
  const response = await executeCommand(
    ["execute", "--json-stdin"],
    "context-1",
    async (actual) => {
      calls++;
      assert.deepEqual(actual, request);
      return { version: 1, ok: false, error: { code: "UNAVAILABLE" } };
    },
    action,
  );
  assert.equal(calls, 1);
  assert.equal(response.ok, false);
  for (const argv of [
    ["status", "--json"],
    ["doctor", "--json", "--token", "secret"],
    ["capabilities", "--json", "--json"],
  ]) assert.throws(() => commandRequest(argv, "context-1"), CliError);
});

test("JSON stdin is bounded and rejects malformed or non-action values", async () => {
  assert.deepEqual(await readJson(Readable.from([JSON.stringify(action)])), action);
  await assert.rejects(readJson(Readable.from(["{"])), /INVALID_REQUEST/);
  await assert.rejects(readJson(Readable.from([" ".repeat(262145)])), /INPUT_TOO_LARGE/);
  assert.throws(() => parseAction({ ...action, unexpected: true }));
});

test("formatCommandResult keeps one JSON stdout frame and stable exits", () => {
  const unavailable = formatCommandResult({ version: 1, ok: false, error: { code: "UNAVAILABLE" } });
  assert.equal(unavailable.exitCode, 3);
  assert.equal(unavailable.stdout.trim().split("\n").length, 1);
  assert.match(unavailable.stderr, /requires attention/);
  const invalid = formatCommandResult(new CliError("INVALID_REQUEST", 2));
  assert.equal(invalid.exitCode, 2);
  assert.deepEqual(JSON.parse(invalid.stdout), { version: 1, ok: false, error: { code: "INVALID_REQUEST" } });
});
