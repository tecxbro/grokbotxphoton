#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { MAX_REQUEST_BYTES } from "../contracts/actions.js";
import { executeCommand } from "./commands.js";
import { callRuntime } from "./local-client.js";
import { CliError, formatCommandResult } from "./output.js";
export async function readJson(input: NodeJS.ReadableStream): Promise<unknown> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of input) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_REQUEST_BYTES) throw new CliError("INPUT_TOO_LARGE", 2);
    chunks.push(bytes);
  }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new CliError("INVALID_REQUEST", 2); }
}
export async function main(argv: string[] = process.argv.slice(2), env = process.env, stdin: NodeJS.ReadableStream = process.stdin,
  stdout: Pick<NodeJS.WriteStream, "write"> = process.stdout, stderr: Pick<NodeJS.WriteStream, "write"> = process.stderr): Promise<number> {
  try {
    const input = argv[0] === "execute" ? await readJson(stdin) : undefined;
    const response = await executeCommand(
      argv,
      env.GROK_PHOTON_CONTEXT_ID,
      request => {
        if (!env.GROK_PHOTON_SOCKET || !env.GROK_PHOTON_CREDENTIAL_FILE) throw new CliError("INVALID_CONFIGURATION", 2);
        return callRuntime(request, { socket: env.GROK_PHOTON_SOCKET, credentialFile: env.GROK_PHOTON_CREDENTIAL_FILE });
      },
      input,
    );
    const formatted = formatCommandResult(response);
    stdout.write(formatted.stdout);
    if (formatted.stderr) stderr.write(formatted.stderr);
    return formatted.exitCode;
  } catch (e) {
    const error = e instanceof CliError ? e : new CliError("INTERNAL", 5);
    const formatted = formatCommandResult(error);
    stdout.write(formatted.stdout);
    stderr.write(formatted.stderr);
    return formatted.exitCode;
  }
}

/** Retained for existing WT-08 callers and tests. */
export const run = main;

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) process.exitCode = await main();
