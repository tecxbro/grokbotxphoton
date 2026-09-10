# Observed runtime baseline

## Repository identity
Observed at START_COMMIT `5c342f5eeb654b1ad7cb00e52855b425f25148ae`: clean primary `/Users/darshan/Documents/ChatGPT/grokbotxphoton`, origin https://github.com/tecxbro/grokbotonimessage.git, main and live remote main equal. Before creation there were no photon-v3 branches, requested worktree or photon-v3-f0 tag. Exactly one additional worktree was created for WT-00. This is an existing populated repository, not an empty product. No content was copied from another mutable worktree or /workspace/grok-photon-proof.

## Existing entrypoints and dependencies
Root `package.json` has gbot and grok-bot -> `src/cli.js`, Node >=18, npm@10.9.2, ESM and node:test CLI tests. `src/commands.js` selects app gateway or explicit file backend; `src/gateway.js` submits to the app gateway; `src/app-session.js` loads encrypted app session routing. The Photon workspace already pins spectrum-ts 12.8.0, zod 4.5.4, TypeScript 5.9.3 and @types/node 24.10.1, and requires Node >=24.13.0 <25. Root Spectrum range was narrowed to the same exact version. Existing root scripts and CLI sources/tests are preserved.

## Existing runtime components
Source inspection found DurableEngine/Executor/Submission/Recovery under runtime/core, SQLite adapters under adapters/state, SpectrumOwner and webhook/stream adapters under adapters/transport, inbox normalization/routing/capture/recovery, work-handoff/claims, text batching and typing leases. These are committed implementation candidates; existence is not integration proof. The retained legacyDiscovery durableRuntimeFound=false field predates those commits and is not accepted as current evidence.

`runtime/inbound/batching.ts` implements a 2000ms quiet window and preserves historical burst boundaries on restart. Non-text retries bypass the text window. `contracts/content.ts` contains voice policy with 120-character target / 150 preferred maximum, one question and natural lowercase; feature text code owns formatting. The Grok model/worker internals are external to this repository; no second orchestrator is created.

## Authorization and work
Existing DurableLocalProtocol and local socket code parse requests and authenticated principals. Context/claim classes hold current scope, expiry, revocation, task generation and fencing checks; LocalProtocol exposes submit/status/diagnostics/capabilities/work.list/claim/heartbeat/ack/cancel. WakeAdapter and existing gateway handoff are seams; actual deployment wake binding is unverified. Credential destination policy and redirects remain protected by the original CLI URL policy.

## Startup and recovery
DurableEngine explicitly starts/stops one outbox driver. HostComposition describes client/recovery/outbox/ingress lifecycle. No inspected process or deployment was started, connected or proven live. The new inert createRuntimeHost requires explicit production ports, complete registration and f0-services-2 adaptation. Fresh SQLite uses .photon-local/runtime/photon.sqlite; existing files are not discovered or migrated automatically.

## Compatibility findings and unknowns
Inherited feature services expose a general transaction API and several features depend on private child records/hooks. This is incompatible with the requested frozen public feature seam and is isolated as legacy source compatibility. Other lanes must adapt explicitly; this assignment does not alter them. No credentials, recipient settings, line allocation, billing, production databases, existing bot/worker configuration or physical-device delivery were inspected. Inbound transport, outbound provider and bot wake-up remain separate.
