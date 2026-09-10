import type {
  ClientOwner,
  HostConfiguration,
  IngressAdapter,
} from "../contracts/index.js";
import type { TransactionStore } from "../state/index.js";
export interface HostRuntimePorts {
  client: ClientOwner;
  store: TransactionStore;
  ingress: IngressAdapter;
  recover(): Promise<void>;
  startOutbox(): Promise<void>;
  stopOutbox(): Promise<void>;
  accept: Parameters<IngressAdapter["start"]>[0];
}
/** Composition order only. No credentials, default client, worker loop, or test fallback. */
export class HostComposition {
  private state:
    | "inactive"
    | "starting"
    | "ready"
    | "stopping"
    | "stopped"
    | "failed" = "inactive";
  constructor(
    private readonly config: HostConfiguration,
    private readonly ports: HostRuntimePorts,
  ) {}
  readiness() {
    return {
      state: this.state,
      ready: this.state === "ready" && this.ports.client.ready(),
      activation: this.config.activation,
    };
  }
  async start(): Promise<void> {
    if (this.state !== "inactive") throw new Error("HOST_ALREADY_STARTED");
    if (
      this.config.activation !== "enabled" ||
      !this.config.ingress.verificationConfigured
    )
      throw new Error("HOST_NOT_CONFIGURED");
    this.state = "starting";
    try {
      await this.ports.client.start();
      await this.ports.recover();
      await this.ports.startOutbox();
      await this.ports.ingress.start(this.ports.accept);
      if (!this.ports.client.ready()) throw new Error("CLIENT_NOT_READY");
      this.state = "ready";
    } catch (e) {
      await this.cleanup();
      this.state = "failed";
      throw e;
    }
  }
  private async cleanup() {
    const failures: unknown[] = [];
    for (const stop of [
      () => this.ports.ingress.stop(),
      () => this.ports.stopOutbox(),
      () => this.ports.client.stop(),
      () => this.ports.store.close(),
    ]) {
      try {
        await stop();
      } catch (e) {
        failures.push(e);
      }
    }
    return failures;
  }
  async stop(): Promise<void> {
    if (this.state === "stopped" || this.state === "failed") return;
    if (this.state === "starting" || this.state === "stopping")
      throw new Error("HOST_TRANSITION_IN_PROGRESS");
    this.state = "stopping";
    const failures = await this.cleanup();
    this.state = failures.length ? "failed" : "stopped";
    if (failures.length)
      throw new AggregateError(failures, "HOST_SHUTDOWN_FAILED");
  }
}
