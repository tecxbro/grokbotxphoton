import { parseActionRequest } from "../contracts/actions.js";
import { assertJsonData } from "../contracts/content.js";
import type { AuthenticatedPrincipal } from "../contracts/context.js";
import type { FeatureModule } from "../contracts/feature.js";
import type { ProviderContext, EventSource, WakeAdapter } from "../contracts/transport.js";
import type { StateStore } from "../contracts/store.js";
import type { InboundEvent } from "../contracts/events.js";
import type { LocalRequest } from "../contracts/protocol.js";
import { localRequestSchema } from "../contracts/protocol.js";
import type { LocalResponse } from "./protocol.js";
import { registerFeatureModules } from "../registry/modules.js";
import { evaluateCapabilities } from "../capabilities.js";
/** Adapter must authenticate principal, resolve context and recheck task generation per call. */
export interface LocalExecutor {
  readonly contractVersion: "f0-services-2";
  dispatch(request: LocalRequest, principal: AuthenticatedPrincipal): Promise<LocalResponse>;
  registerFeatures(modules: readonly FeatureModule[]): void;
  ready(): boolean;
  recover(): Promise<void>;
  startOutbox(): Promise<void>;
  stopOutbox(): Promise<void>;
  capture(event: InboundEvent): Promise<void>;
}
export interface RuntimeHostComponents {
  provider?: ProviderContext;
  ingress?: EventSource;
  wake?: WakeAdapter;
  store?: StateStore;
  executor?: LocalExecutor;
  modules?: readonly FeatureModule[];
}
/** Inert composition factory. Construction never opens credentials, storage, sockets or streams. */
export function createRuntimeHost(components: RuntimeHostComponents = {}) {
  const registry = registerFeatureModules(components.modules ?? []);
  const missing = ["provider", "ingress", "wake", "store", "executor"].filter(k => !components[k as keyof RuntimeHostComponents]);
  let state: "inactive" | "starting" | "ready" | "stopping" | "stopped" | "failed" = "inactive";
  const doctor = () => ({state, ready: state === "ready" && missing.length === 0 && registry.missing.length === 0 && components.provider?.ready() === true && components.executor?.ready() === true, missingComponents: [...missing], missingOperations: [...registry.missing]});
  const invoke = async (input: unknown, principal: AuthenticatedPrincipal) => {
    assertJsonData(input);
    if (!doctor().ready || !components.executor) throw new Error("HOST_NOT_READY");
    return components.executor.dispatch(localRequestSchema.parse(input), principal);
  };
  const cleanup = async () => {
    const errors: unknown[] = [];
    for (const stop of [() => components.ingress?.stop(), () => components.executor?.stopOutbox(), () => components.provider?.stop(), () => components.store?.close()]) {
      try { await stop(); } catch (e) { errors.push(e); }
    }
    return errors;
  };
  return {
    doctor,
    capabilities: () => evaluateCapabilities(new Set(registry.handlers.keys())),
    execute: (input: unknown, principal: AuthenticatedPrincipal) => invoke({version: 1, method: "submit", action: parseActionRequest(input)}, principal),
    status: (contextId: string, requestId: string, principal: AuthenticatedPrincipal) => invoke({version: 1, method: "status", contextId, requestId}, principal),
    work: (request: Extract<LocalRequest, {method: "work.list" | "work.claim" | "work.heartbeat" | "work.ack"}>, principal: AuthenticatedPrincipal) => invoke(request, principal),
    /** Explicit lifecycle entry; missing real components or handlers blocks startup. */
    async start() {
      if (state !== "inactive") throw new Error("HOST_ALREADY_STARTED");
      if (missing.length || registry.missing.length || components.executor?.contractVersion !== "f0-services-2") throw new Error("HOST_NOT_CONFIGURED");
      state = "starting";
      try {
        components.executor!.registerFeatures(components.modules ?? []);
        await components.provider!.start();
        await components.executor!.recover();
        await components.ingress!.start(e => components.executor!.capture(e));
        await components.executor!.startOutbox();
        if (!components.provider!.ready()) throw new Error("PROVIDER_NOT_READY");
        state = "ready";
      } catch (error) { const failures = await cleanup(); state = "failed"; throw new AggregateError([error, ...failures], "HOST_START_FAILED"); }
    },
    async stop() {
      if (state === "stopped" || state === "failed") return;
      if (state === "starting" || state === "stopping") throw new Error("HOST_TRANSITION_IN_PROGRESS");
      if (state === "inactive") { state = "stopped"; return; }
      state = "stopping";
      const errors = await cleanup();
      state = errors.length ? "failed" : "stopped";
      if (errors.length) throw new AggregateError(errors, "HOST_STOP_FAILED");
    },
  };
}
