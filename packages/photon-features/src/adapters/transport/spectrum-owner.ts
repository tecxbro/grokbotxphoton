import { Spectrum, type Message, type Space } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import type { ClientOwner, Scope } from "../../contracts/index.js";
import { ProviderContext } from "./provider-context.js";

export interface TransportDimensions {
  inbound: "photon-stream" | "photon-webhook";
  outbound: "imessage";
  wake: "existing-grok-task-handoff";
}
export interface OwnedSdk {
  messages(): AsyncIterable<[Space, Message]>;
  space(id: string, route: { phone: string }): Promise<Space>;
  stop(): Promise<void>;
}
export type SdkFactory = () => Promise<OwnedSdk>;
/** Construction initializes providers; only messages() activates reception. */
export function cloudSdkFactory(config: {
  projectId: string;
  projectSecret: string;
}): SdkFactory {
  return async () => {
    const app = await Spectrum({ ...config, providers: [imessage.config()] });
    const provider = imessage(app);
    return {
      messages: () => app.messages,
      space: (id, route) => provider.space.get(id, route),
      stop: () => app.stop(),
    };
  };
}
export class SpectrumOwner implements ClientOwner {
  private sdk?: OwnedSdk;
  private startPromise?: Promise<void>;
  private stopped = false;
  private stopPromise?: Promise<void>;
  private receiver?: string;
  private failed = false;
  constructor(
    readonly dimensions: TransportDimensions,
    readonly routes: ProviderContext,
    private readonly factory: SdkFactory,
    private readonly hooks: {
      beforeStop?: () => Promise<void>;
      receiveFailed?: () => void;
    } = {},
  ) {
    if (
      !["photon-stream", "photon-webhook"].includes(dimensions.inbound) ||
      dimensions.outbound !== "imessage" ||
      dimensions.wake !== "existing-grok-task-handoff"
    )
      throw new Error("INVALID_TRANSPORT_DIMENSIONS");
  }
  start(): Promise<void> {
    if (this.stopped) return Promise.reject(new Error("OWNER_STOPPED"));
    return (this.startPromise ??= this.factory()
      .then(async (sdk) => {
        if (this.stopped) {
          await sdk.stop();
          return;
        }
        this.sdk = sdk;
      })
      .catch((error) => {
        this.failed = true;
        throw error;
      }));
  }
  ready() {
    return !!this.sdk && !this.stopped && !this.failed;
  }
  claimReceiver(kind: TransportDimensions["inbound"], ownerId: string): void {
    if (!this.ready()) throw new Error("OWNER_NOT_READY");
    if (kind !== this.dimensions.inbound || this.receiver)
      throw new Error("COMPETING_RECEIVE_PATH");
    this.receiver = ownerId;
  }
  stream(ownerId: string): AsyncIterable<[Space, Message]> {
    this.claimReceiver("photon-stream", ownerId);
    return this.sdk!.messages();
  }
  async space(scope: Scope, conversationId: string): Promise<Space> {
    if (!this.ready()) throw new Error("OWNER_NOT_READY");
    return this.sdk!.space(
      conversationId,
      this.routes.outbound(scope, conversationId),
    );
  }
  receiveFailed() {
    this.failed = true;
    this.hooks.receiveFailed?.();
  }
  evidence() {
    return {
      ...this.dimensions,
      initialized: !!this.sdk,
      ready: this.ready(),
      receiver: this.receiver ?? null,
      lines: this.routes.evidence(),
      networkConnection: "unknown",
      sdkVersion: "12.8.0",
      recovery:
        "SDK internal reconnect/catch-up only; no public durable cursor or connection-health callback",
      coverage: [
        "message content",
        "poll vote/unvote when SDK resolves target",
        "attributable read receipts",
        "dedicated-line group changes",
      ],
      gaps: [
        "process restart replay unavailable",
        "SDK may skip unmappable events",
        "no public raw event sequence",
        "shared-line group changes unavailable",
      ],
    };
  }
  stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    this.stopped = true;
    return (this.stopPromise = (async () => {
      await this.startPromise?.catch(() => undefined);
      const failures: unknown[] = [];
      try {
        await this.hooks.beforeStop?.();
      } catch (error) {
        failures.push(error);
      }
      const sdk = this.sdk;
      this.sdk = undefined;
      try {
        await sdk?.stop();
      } catch (error) {
        failures.push(error);
      }
      if (failures.length)
        throw new AggregateError(failures, "TRANSPORT_SHUTDOWN_FAILED");
    })());
  }
}

/** Start the injected shared owner; concurrent starts reuse one construction. */
export async function startSpectrumOwner(owner: SpectrumOwner): Promise<SpectrumOwner> {
  await owner.start();
  if (!owner.ready()) throw new Error("OWNER_NOT_READY");
  return owner;
}
/** Stop reception and provider resources once, preserving shutdown failures. */
export function stopSpectrumOwner(owner: SpectrumOwner): Promise<void> { return owner.stop(); }
