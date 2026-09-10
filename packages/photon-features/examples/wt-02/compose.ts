/** Compile-only composition recipe. Importing this module opens no connection.
 * WT-00/WT-08 must wire it into HostComposition after resolving requests/wt-02. */
import type {
  Clock,
  EventReducer,
  Scope,
  TransactionStore,
} from "../../src/index.js";
import type { ExistingGrokTaskHandoff } from "../../src/adapters/legacy/index.js";
import {
  SpectrumOwner,
  cloudSdkFactory,
  type TransportDimensions,
} from "../../src/adapters/transport/spectrum-owner.js";
import {
  ProviderContext,
  type LineBinding,
} from "../../src/adapters/transport/provider-context.js";
import { FileCaptureStore } from "../../src/adapters/transport/capture.js";
import { SpectrumEventSource } from "../../src/adapters/transport/event-source.js";
import { NativeWebhookIngress } from "../../src/adapters/transport/webhook-ingress.js";
import {
  InboundRouter,
  type InboundPolicy,
} from "../../src/runtime/inbound/router.js";
import { TextBatcher } from "../../src/runtime/inbound/batching.js";
import {
  InboundPump,
  type ActiveInboundRoute,
} from "../../src/runtime/inbound/pump.js";
import {
  WakeDispatcher,
  ExistingGrokWakeAdapter,
} from "../../src/runtime/inbound/wake-dispatcher.js";
import { recoverCaptures } from "../../src/runtime/inbound/recovery.js";
import type { Correlations } from "../../src/runtime/inbound/normalize.js";
import { TypingLeases } from "../../src/runtime/typing/leases.js";
import {
  createTypingModule,
  type BindTypingExecution,
} from "../../src/runtime/typing/operations.js";

export function composeWT02(
  config: {
    projectId: string;
    projectSecret: string;
    lines: readonly LineBinding[];
    dimensions: TransportDimensions;
    webhookSecret?: string;
    captureDirectory: string;
  },
  ports: {
    store: TransactionStore;
    clock: Clock;
    policy: InboundPolicy;
    reducers: readonly EventReducer[];
    correlations: Correlations;
    activeRoutes: () => readonly ActiveInboundRoute[];
    existingGrok: ExistingGrokTaskHandoff;
    bindTyping: BindTypingExecution;
    conversationId: (scope: Scope) => Promise<string>;
    report: (code: string) => void;
  },
) {
  const routes = new ProviderContext(config.projectId, config.lines);
  const captures = new FileCaptureStore(config.captureDirectory);
  let typing: TypingLeases;
  const client = new SpectrumOwner(
    config.dimensions,
    routes,
    cloudSdkFactory(config),
    {
      beforeStop: async () => {
        typing.shutdown();
        await typing.drain();
      },
      receiveFailed: () => typing.connectionLost(),
    },
  );
  typing = new TypingLeases(
    ports.clock,
    async (scope) => client.space(scope, await ports.conversationId(scope)),
    undefined,
    ports.report,
  );
  const router = new InboundRouter(
    ports.store,
    ports.clock,
    ports.policy,
    ports.reducers,
  );
  const wake = new WakeDispatcher(
    ports.store,
    ports.clock,
    new ExistingGrokWakeAdapter(ports.existingGrok),
  );
  const pump = new InboundPump(
    ports.activeRoutes,
    new TextBatcher(router),
    wake,
    ports.report,
  );
  const ingress =
    config.dimensions.inbound === "photon-stream"
      ? new SpectrumEventSource(
          client,
          captures,
          ports.clock,
          (d) => ports.report(d.code),
          ports.correlations,
        )
      : new NativeWebhookIngress(
          client,
          captures,
          ports.clock,
          config.webhookSecret ?? "",
          ports.correlations,
        );
  return {
    client,
    ingress,
    typing,
    pump,
    feature: createTypingModule(typing, ports.bindTyping),
    accept: (event: Parameters<InboundRouter["accept"]>[0]) =>
      router.accept(event),
    async recover() {
      const unresolved = await recoverCaptures(
        captures.ids(),
        captures,
        routes,
        ports.clock,
        (e) => router.accept(e),
        ports.correlations,
      );
      if (unresolved.length) ports.report("UNRESOLVED_CAPTURES");
    },
  };
}
