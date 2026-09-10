# WT-02 implementation handoff

WT-02 is implemented locally within its owned paths. It is **not integrated into the production host, installed/activated, or live verified**. Public SDK and F0 limitations below prevent claiming complete native event coverage or loss-free provider replay. No messages, provisioning, billing changes, transcript polling, deployments, branch changes, or worktree changes were performed. The user subsequently authorized a commit limited to WT-02 owned paths. Checkout details below record the pre-commit foundation baseline.

## Checkout and frozen foundation

- Repository: `https://github.com/tecxbro/grokbotonimessage.git`
- Absolute checkout: `/Users/darshan/Documents/ChatGPT/grokbotxphoton`
- Branch: `main`
- Pre-commit HEAD and completed F0: `57e40736be8a59047b776654c766fbe8bfd10c9e`
- Contract digest: `e0f7779bc9ca3d45696e9b4e24e8579d922c8d2d7d4323c821202d8f599acbf8`
- Comparison `origin/main`: `24468391b57f028b4b881ddbf71efab3a49a6f73`; local ahead 1, behind 0. Read-only `git ls-remote` returned that same remote main commit during this task. Original worktree creation base is unknown.
- Initial dirty state: `package.json`, `package-lock.json`, untracked `agent.md`, `architecthure.md`. These were preserved. Other lanes added files concurrently; WT-02 did not modify or stage them.
- F0 digest verification passed for all 71 scoped files and 51 schemas. Shared contracts, state, host, aggregate registry, and package/lock files were not edited by this lane.

Machine-readable records: [baseline.json](./baseline.json), [validation.json](./validation.json), [sources.json](./sources.json), [files.json](./files.json).

## What was built

| Files under `packages/photon-features/` | Behavior / exported seam |
| --- | --- |
| `src/adapters/transport/spectrum-owner.ts`, `provider-context.ts` | One coalesced SDK lifecycle, public cloud factory, explicit transport dimensions, receive-owner exclusion, scoped per-phone space resolution, readiness and coverage evidence, typing-before-client shutdown hook. |
| `src/adapters/transport/snapshot.ts`, `capture.ts` | Public-field snapshots; fsync-backed private capture files with safe hashed IDs, no lazy media fetch or SDK internals. |
| `src/adapters/transport/event-source.ts` | One public message iterator, durable capture then typed acceptance, redacted failure/gap diagnostics. SDK internal reconnect is not replaced with another connection. |
| `src/adapters/transport/webhook-ingress.ts` | Strict native JSON envelope, HMAC over exact raw bytes, timestamp tolerance, bounded body, route agreement, durable accept before HTTP 200, no competing stream or unauthenticated alternative. |
| `src/runtime/inbound/normalize.ts` | Typed message/media/poll/reaction/read/group normalization, scoped opaque references, safe event identity, unresolved quarantine and authoritative poll-correlation seam. |
| `src/runtime/inbound/router.ts` | F0 transactions, event dedupe, echo suppression, reducers and handoff committed atomically, cross-scope/collision rejection, async-reducer rejection, durable unresolved/retry state. |
| `src/runtime/inbound/batching.ts` | Two-second quiet window over individually persisted new text; historical bursts remain separate after restart. Media/operational events bypass it. |
| `src/runtime/inbound/wake-dispatcher.ts`, `pump.ts` | Committed-handoff-only notification, task/generation checks, pending/expired-claim retries through injected `ExistingGrokTaskHandoff`, one host scheduler over local durable work. |
| `src/runtime/inbound/checkpoints.ts`, `recovery.ts` | Gap-preserving durable-prefix barrier; local capture replay after pre-inbox crashes; explicit provider restart-gap limitations. |
| `src/runtime/typing/leases.ts`, `operations.ts` | Generation/token-scoped leases, delayed starts, overlap, completion/error/cancellation/timeout, long-worker waiting, connection loss, bounded shutdown, stale dispatch validation, nonblocking response wrapper, two operation handlers and transient recovery codec. |
| `tests/lanes/wt-02/` | SDK public-call compilation, actual SDK webhook callback probe, 42 offline tests, fake timers, real temporary SQLite/capture files, isolated lane/F0 TypeScript configuration. |
| `examples/wt-02/compose.ts` | Compile-only host composition recipe. Importing it opens no connection; actual startup requires explicit host integration. |

`typing.begin/end` complete transient lease scheduling, return void and no provider observations. The manager separately tracks outstanding control calls and failures. Neither scheduling nor a resolved control proves that a recipient saw typing. A hung control cannot block a real reply; shutdown reports uncertainty if it cannot drain within the bound.

## Consumed and exported interfaces

Consumes frozen `IncomingEvent`, `Scope`, `ResourceRef`, `TransactionStore`, `Transaction`, `InboxRecord`, `HandoffRecord`, `EventReducer`, `Clock`, `ClientOwner`, `IngressAdapter`, `FeatureModule`, `ExecutionServices`, `WakeAdapter`, and `ExistingGrokTaskHandoff`.

Exports the classes/functions in the table plus `TaskRoute`, `InboundPolicy`, `CorrelationPending`, `Correlations`, `LineBinding`, `TransportDimensions`, `CaptureStore`, `TypingTicket`, `TimerPort`, and `BindTypingExecution`/`TypingExecutionBinding`. These are lane-local seams; package aggregate exports remain a WT-00 integration request. There is no duplicate poll/card business store, new orchestrator, or unapproved provider extension.

## Event coverage and limits

| Input | Lane behavior | Actual 12.8.0 receive availability |
| --- | --- | --- |
| Text, Markdown, HTTPS link, attachment/voice, bounded groups/replies/effects, simple contact, poll creation content | Typed F0 content; attachments retain scoped references and metadata in private capture; only new plain text batches. | Public received-message content subset; no promise all outbound content arms are emitted inbound. |
| Reactions, reads | Own event identity plus target reference; operational by default. | Added reactions and attributable inbound read receipts are mapped. |
| Poll vote/unvote | Authoritative poll/option correlation required; unresolved until supplied, then replay promotes the same durable event. | Public vote objects lack native parent/option identifiers; no title matching or synthetic-ID parsing. |
| Group rename, add/remove/leave, avatar | Typed group event; metadata and actor retained in capture where F0 has no field. | Supported dedicated-line events; shared-line group coverage unavailable. |
| Edits, retractions, removed reactions, delivered/failed receipts, poll option additions | Existing F0 event union/reducer route can accept typed events from a future verified adapter. The normalizer maps an explicit edit shape if supplied. Unsent without representable content is unresolved. | The pinned iMessage mapping consumes several native event kinds without exposing them publicly. This lane cannot recover events the SDK did not emit. |
| App/card interactions, rich contact/custom/future content, missing actor or ambiguous poll target | Captured durably and unresolved; no fabricated fields or silent drop. | Registered feature mapping/public provider seams remain required. |
| Unknown/missing project/line route | Private capture retained, diagnostics or non-success webhook result. | No fallback to the first configured line. |

SDK internal reconnect/catch-up uses a volatile cursor; Spectrum exposes no host-managed durable cursor, raw sequence, or connection-health event. The lane does not infer order from receipt IDs, manufacture checkpoints, or promise zero loss across restart. Local captures/inbox recover; upstream gaps remain reported/unverified. Same-millisecond arrival order is not promoted into provider ordering.

F0's unpaginated 1000-row scoped inbox query is a production-scale integration blocker: `INBOX_PAGINATION_REQUIRED` is explicit. The capture store needs host retention/indexing policy. These limitations are documented rather than bypassed by edits to shared contracts.

## Validation

Selected runtime: Node **24.13.0** at `/Users/darshan/.npm/_npx/cee224165f95995d/node_modules/node/bin/node`, npm **10.9.2**, pinned Spectrum **12.8.0**. The default shell Node remains 23.11.0; it was not replaced. Commands below run from `/Users/darshan/Documents/ChatGPT/grokbotxphoton` with the selected Node directory prepended to PATH.

- `node node_modules/typescript/bin/tsc -p packages/photon-features/tests/lanes/wt-02/tsconfig.json`: passed, fresh lane and frozen F0 compilation.
- `node --test packages/photon-features/dist/tests/lanes/wt-02/*.test.js`: **42 passed, 0 failed**. [Final log](./final-lane-tests.txt).
- `node --test packages/photon-features/dist/tests/lanes/wt-00/*.test.js`: **60 passed, 0 failed**. [F0 log](./f0-targeted-tests.txt).
- `npm test`: **31 passed, 0 failed**. [Existing CLI log](./existing-tests.txt).
- `node packages/photon-features/scripts/generate-contracts.mjs --check`: passed; exact F0 digest preserved. [Digest log](./f0-digest-check.txt).

- Final `npm run photon:test`: passed, **60 F0 tests**, with the full package TypeScript build. [Aggregate log](./final-aggregate-tests.txt).
- Final `npm run photon:check`: passed, with the full package build and unchanged foundation digest. [Aggregate check](./final-aggregate-check.txt).

All final validation commands passed. Exact commands/timestamps are recorded in [validation.json](./validation.json). Earlier aggregate builds encountered errors in files being authored by other lanes; those files were preserved, and their subsequent updates allowed the final aggregate checks to pass. This lane did not reinstall shared dependencies or alter the shared lockfile while other lanes were active.

## Configuration and handoff

See [integration requests](../../requests/wt-02/integration.md) for exact host/WT-01/WT-05/WT-06 inputs, required export registration, raw webhook mounting, capture recovery, pagination, and provider coverage requests. [Source notes](./sources.md) distinguish authoritative installed declarations, official documentation, supplementary skill reads, and retrieval failures.

**Built:** lane implementation, offline tests, composition example, evidence and requests.

**Integrated:** no production host/registry or Grok binding added.

**Installed/activated:** no service or account changes.

**Live verified:** no provider delivery, physical-device typing, real reconnect, or actual Grok wake. An offline accepted notification is not evidence that Grok resumed.
