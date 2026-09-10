# Contracts v1

Normative source: `packages/photon-features/src/contracts/`; generated JSON Schema draft 2020-12: `packages/photon-features/schemas/`. Generator regenerates every schema deterministically and `--check` rejects drift or inventory differences. `parseAction` additionally checks related poll/card parents and duplicate top-level poll option keys. Cross-resource authorization and all runtime resource/codec availability checks are service responsibilities, not JSON Schema assertions.

| Contract | Export / lane seam |
| --- | --- |
| Strict action envelope | `Action`, `ActionFor<K>`, `parseAction`, `operationArguments`, `actionSchemas`; version/idempotencyKey/contextId/operation/arguments only |
| Scoped references | `Scope`, `ResourceRef`, nine kind-specific schemas, `assertScope`, `sameScope` |
| Trusted context | `AuthenticatedPrincipal`, `TrustedContext`, `ContextResolver`; credential not inside action |
| Serializable content | `ContentSpec`, `contentSchema`, media/contact/card schemas |
| Results and capabilities | `OperationResult`, `RuntimeError`, `Capability`, lifecycle and observation schemas |
| Incoming events | `IncomingEvent`, `incomingEventSchema`; message/receipt/reaction/poll/group/app-interaction/typing/unresolved |
| Features | `FeatureModule`, `OperationHandler`, `ContentCompiler`, `EventReducer`, `RecoveryCodec` |
| Transactions | `TransactionStore`, `Transaction`, `StateTables`, `SQLiteStore`, `migrations` |
| Leases and execution | `Claim`, `assertClaim`, `assertTransition`, `lifecycleTransitions`, `RetryDecision` |
| Local protocol | `LocalRequest`, `LocalProtocol`, `SubmissionPort`, `listenLocal` |
| Shared services | `ExecutionServices`, `ResourceResolver`, `MediaStager`, `RegisteredStreams`, `Clock`, `WakeAdapter`, `ExecutionPort` |
| Host | `HostConfiguration`, `HostRuntimePorts`, `HostComposition`, `IngressAdapter`, `ClientOwner` |
| Voice | `voicePolicy`; WT-03 behavior and WT-08 operating guidance |

## Content limits and serialization

Permitted leaves: text, markdown, HTTPS link, attachment, voice, contact, poll, registered app and registered custom card resource. Group accepts 1–8 leaves. Compose accepts 1–16 leaves/groups, at most 128 leaves. Reply/effect wraps exactly one leaf and cannot nest wrappers. Maximum content-tree depth is 3 nodes (compose/group/leaf); nested resource fields have fixed shapes. This is a serialization limit, not a provider limit or a promise of support. Schema strings use JavaScript code-unit lengths; local wire uses UTF-8 bytes and caps the complete frame at 256 KiB. Text/markdown max 16000 units, URL max 2048, IDs max 200, poll question max 500, choices 2–12, label max 200, contact phones/emails max 10 each, group membership requests max 32. The runtime must check distinct poll keys in nested poll content during compilation as well as top-level create. Media max 25 MiB after actual byte validation.

No JavaScript, callbacks, commands, shell, raw SDK object, arbitrary provider dictionary or unrestricted custom JSON appears in action arguments. `custom.send` names a registered codec and a scoped card reference. The codec resolves trusted state; it does not receive an opaque caller-controlled provider payload. App templates and interactions require host registration. The F0 event selection field is a bounded array of IDs, not arbitrary interaction JSON. Unsupported incoming payloads retain a quarantined pointer in unresolved storage.

## Lifecycle and errors

Errors carry code, bounded redacted message, retry classification and optional blocker ID. Results carry version, request identity, revision, timestamp, references, optional typed value/error/capability and separate provider observations. Status transitions are explicit; blocked is retriable only after revalidation. Completed void operations need no invented message ID. Provider receipt fields absent from an event are unknown, never synthesized.

Capabilities record provider support (native/fallback/unsupported/unknown), account/conversation availability, implementation, inbound/outbound direction, separate unit/SDK-contract/live evidence, exact SDK version, sources and blockers. F0 capability records have no execution evidence and report unimplemented/unknown throughout. The compile-only probe inventory is evidence for public seams, not execution of any of the 44 handlers.

## Voice policy preservation

No fuller voice policy was found in this checkout. The known policy is preserved as data: natural lowercase with names/acronyms/code casing intact; intended bubbles roughly 120 characters and preferably below 150; blank lines between complete thoughts; no arbitrary sentence, URL, path, command or code splitting; one short question per turn; no em dashes; friend-like language; structured payloads bypass prose formatting. The lengths are prose targets, not permission to break indivisible content. WT-03 implements the formatter; WT-08 teaches the existing orchestrator to use it. Grok Bot receives the built package and operating skill and must not generate integration code during normal operation.

## Lane test contract

From the repository root, with Node 24.13.0 and npm 10.9.2 on PATH: `npm ci --ignore-scripts`, `npm test`, `npm run photon:build`, `npm run photon:test`, `npm run photon:check`. Regenerate with `npm run generate --workspace=@grokbot/photon-features`.

Within `packages/photon-features`, a lane can run `npm run test:lane -- dist/tests/lanes/wt-NN/*.test.js`; this builds package TypeScript then executes only the supplied lane tests. Other lanes need not be implemented/registered. Tests import interfaces from `src/index.js` using TypeScript NodeNext `.js` specifiers, and use `tests/fixtures/harness.ts` for FixedClock, FailureHooks, real temporary SQLite, context/event examples and registration shapes. The default F0 command runs only WT-00. Shared fixture changes go through WT-00 requests. Feature modules are tested with `buildRegistry([module], {requireComplete:false})`; production uses the default completeness gate.
