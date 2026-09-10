import type { InboundEvent } from "./events.js";
import type { Scope } from "./references.js";
export type { WakeAdapter } from "./ports.js";
/** Only the shared runtime owns this injected provider, its credentials and connections. */
export interface ProviderContext {
  readonly provider: "imessage";
  readonly scope: Scope;
  ready(): boolean;
  start(): Promise<void>;
  stop(): Promise<void>;
}
/** Ingress must authenticate before accept, and checkpoint only after durable capture. */
export interface EventSource {
  readonly authentication: "signed-webhook" | "authenticated-stream";
  start(accept: (event: InboundEvent) => Promise<void>): Promise<void>;
  stop(): Promise<void>;
}
