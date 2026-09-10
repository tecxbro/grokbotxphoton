import { localRequestSchema, parseAction, type LocalRequest } from "../contracts/index.js";
import { CliError, type CliResponse } from "./output.js";
export function commandRequest(argv: string[], contextId: string | undefined, input?: unknown): LocalRequest {
  const [command, ...rest] = argv;
  const flags = new Map<string, string | true>();
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i]!;
    if (!key.startsWith("--") || flags.has(key)) throw new CliError("INVALID_ARGUMENTS", 2);
    if (["--json", "--json-stdin"].includes(key)) flags.set(key, true);
    else { const value = rest[++i]; if (!value || value.startsWith("--")) throw new CliError("INVALID_ARGUMENTS", 2); flags.set(key, value); }
  }
  const definitions: Record<string, [string, string[]]> = {
    capabilities: ["capabilities", ["--json"]], doctor: ["diagnostics", ["--json"]],
    status: ["status", ["--request-id", "--json"]], cancel: ["request.cancel", ["--request-id", "--json"]],
    "work.list": ["work.list", ["--limit", "--json"]],
    "work.claim": ["work.claim", ["--handoff-id", "--lease-ms", "--json"]],
    "work.heartbeat": ["work.heartbeat", ["--handoff-id", "--fence", "--lease-ms", "--json"]],
    "work.ack": ["work.ack", ["--handoff-id", "--fence", "--json"]],
    execute: ["submit", ["--json-stdin"]],
  };
  const def = definitions[command ?? ""];
  if (!def || [...flags.keys()].some(k => !def[1].includes(k)) || !flags.has(command === "execute" ? "--json-stdin" : "--json")) throw new CliError("INVALID_ARGUMENTS", 2);
  if (!contextId) throw new CliError("INVALID_CONFIGURATION", 2);
  try {
    if (command === "execute") {
      const action = parseAction(input);
      if (!contextId || action.contextId !== contextId) throw new CliError("CONTEXT_MISMATCH", 4);
      return localRequestSchema.parse({ version: 1, method: "submit", action });
    }
    const request: Record<string, unknown> = { version: 1, method: def[0], contextId };
    const names = { "--request-id": "requestId", "--handoff-id": "handoffId", "--fence": "fence", "--lease-ms": "leaseMs", "--limit": "limit" };
    for (const [flag, name] of Object.entries(names)) if (flags.has(flag)) {
      const value = flags.get(flag);
      if (["fence", "leaseMs", "limit"].includes(name)) {
        if (typeof value !== "string" || !/^\d+$/.test(value)) throw new CliError("INVALID_ARGUMENTS", 2);
        request[name] = Number(value);
      } else request[name] = value;
    }
    if (def[0] === "work.list" && !flags.has("--limit")) request.limit = 20;
    return localRequestSchema.parse(request);
  } catch (e) { if (e instanceof CliError) throw e; throw new CliError("INVALID_REQUEST", 2); }
}


/** Parse one supported command and dispatch exactly one authenticated local request. */
export async function executeCommand(
  argv: string[],
  contextId: string | undefined,
  call: (request: LocalRequest) => Promise<CliResponse>,
  input?: unknown,
): Promise<CliResponse> {
  return call(commandRequest(argv, contextId, input));
}
