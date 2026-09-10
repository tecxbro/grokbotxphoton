# WT-06 handoff

Implemented app.send, app.sendCustomized and app.update as a feature module for the shared executor. All production code, isolated fixtures/tests, examples and evidence stay within WT-06 ownership. No live messages, provisioning, backend deployment, client creation, subscriptions or host activation occurred.

## Checkout and foundation

- Repository: https://github.com/tecxbro/grokbotonimessage
- Path: `/Users/darshan/Documents/ChatGPT/grokbotxphoton`
- Branch: `main` (unchanged).
- HEAD and tested F0: `57e40736be8a59047b776654c766fbe8bfd10c9e`.
- F0 contract digest: `e0f7779bc9ca3d45696e9b4e24e8579d922c8d2d7d4323c821202d8f599acbf8`.
- Comparison / verified remote main: `24468391b57f028b4b881ddbf71efab3a49a6f73`; local main is ahead 1, behind 0.
- Dirty on entry: package.json/package-lock.json modified; agent.md, architecthure.md, WT-01–WT-04 evidence and sibling implementation directories untracked. Other lanes continued writing during this task. WT-06 preserved unrelated work and did not stage, commit or publish. See manifest.json for the recorded initial and final status.

## Operation and capability matrix

| Operation/capability | Built behavior | Required host configuration / limitation | Evidence |
| --- | --- | --- | --- |
| app.send / universal static card | Public app(url), scoped send, real provider ID mapping | Registered template and allowed origin; no customized extension/backend required | Real builder + isolated SDK-shaped provider |
| app.sendCustomized | Public customizedMiniApp with supplied identity/layout | Actual Team ID, bundle ID, app name; optional App Store ID | Typed public import/call shape; fixture sends |
| app.update / customized | Public edit(builder, original), serialized per card, durable CAS/fencing; successful void returns original references | Actual original SDK session and immutable admission revision binding | Void, concurrent, delayed, stale, cancelled and uncertain-update tests |
| app.update / universal | Same original-target edit, with configured URL mapping | F0 lacks URL and revision arguments; requires updateUrl and updateRevision host seams | Configured mapping test; explicit blockers when missing |
| Rich-link preview | Separate capability, WT-03-owned | Not inferred from static-card acceptance | Distinct real richlink/app builder shapes |
| Live rendering request | Explicit live hint through configured template | Installed corresponding extension evidence; device rendering remains unverified | Builder flag/config gate only |
| Authenticated app-backend callback | Exported bounded verifier adapter; full binding, durable replay protection, atomic continuation-before-wake | No real backend contract supplied; missing verifier is blocked; HMAC exists only in isolated tests | Wrong scope/line/participant/task, expiry, nonce/action, replay, malformed and failure tests |
| Restart recovery | Versioned bounded data codec; shared resolver may retrieve surviving real handle | Full SDK/cache restart cannot be restored from JSON alone: requires_original_session | SQLite reopen + surviving handle updates original; missing/changed metadata is blocked |

Implementation is built and fixture-tested. Integrated: no. Installed/activated: no. Live verified: no. Returned provider acceptance is not device rendering or callback proof. Updates report executor-completed with void, not a fabricated acceptance receipt or replacement message ID.

## Persistence and ordering

Checkpoints retain only bounded references, original provider identity, task/principal/generation, revision, URL, phase, documented four-field miniAppCardSession and optional callback binding. No methods, secrets, client objects, extension credentials or SDK graph are serialized. Provider metadata is copied into the checkpoint after an edit; stored metadata is never assigned back onto an SDK object.

Per-card ordering combines an in-process queue, the immutable admission revision, a durable revision CAS, and a dispatching checkpoint written under the current executor claim. Task generation, cancellation and fencing are checked immediately before the side effect and before committing completion. A provider error, uncertain in-flight update, cancellation/generation change during dispatch, or post-dispatch commit failure leaves unknown/dispatching state and blocks further updates pending reconciliation. No provider idempotency is claimed.

Callback authentication is supplied only by the actual backend protocol implementation. Authorized assertions bind task, scoped card/session, participant, allowed action, expiry, event ID and one-use nonce. Unknown session/card/task remains unresolved. Generic app-interaction events lack participant/nonce authentication and cannot wake a task. Callback state and pending handoff commit atomically before wake; failed wake leaves durable pending work.

## Verification

Node 24.13.0 and npm 10.9.2 were selected by PATH for all commands. The machine default Node 23 was not changed.

| Check | Result |
| --- | --- |
| WT-06 isolated TypeScript build | passed |
| WT-06 tests in shared checkout | 44 passed, 0 failed |
| Existing repository npm test | 31 passed, 0 failed |
| Shared aggregate photon:build | passed on final run |
| Shared photon:test / F0 | 60 passed, 0 failed |
| Shared photon:check | passed; original 71-file / 51-schema digest preserved |
| Clean F0 + WT-06 artifact npm ci --ignore-scripts | passed |
| Clean lane build / tests | passed; 44 passed, 0 failed |
| Clean foundation tests / schema check | passed; 60 passed, 0 failed; original digest |

All command timestamps, exit codes and log filenames are in validation.json. Earlier aggregate checks encountered transient sibling-lane TypeScript errors; those files were not changed by WT-06. The final aggregate checks pass. No sibling feature test coverage is claimed by the F0 command.

From the repository root, with Node 24.13.0/npm 10.9.2 on PATH:

```sh
node node_modules/typescript/bin/tsc -p packages/photon-features/tests/lanes/wt-06/tsconfig.json
node --test packages/photon-features/dist/tests/lanes/wt-06/*.test.js
npm test
npm run photon:build
npm run photon:test
npm run photon:check
```

## Changed files

- `packages/photon-features/examples/wt-06/host-seam.ts`
- `packages/photon-features/src/features/cards/configuration.ts`
- `packages/photon-features/src/features/cards/interaction-adapter.ts`
- `packages/photon-features/src/features/cards/module.ts`
- `packages/photon-features/src/features/cards/operations.ts`
- `packages/photon-features/src/features/cards/reducer.ts`
- `packages/photon-features/src/features/cards/sdk.ts`
- `packages/photon-features/src/features/cards/session-codec.ts`
- `packages/photon-features/src/features/cards/state.ts`
- `packages/photon-features/src/features/cards/update-ordering.ts`
- `packages/photon-features/tests/lanes/wt-06/fixture.ts`
- `packages/photon-features/tests/lanes/wt-06/interactions.test.ts`
- `packages/photon-features/tests/lanes/wt-06/operations.test.ts`
- `packages/photon-features/tests/lanes/wt-06/sdk.test.ts`
- `packages/photon-features/tests/lanes/wt-06/session-codec.test.ts`
- `packages/photon-features/tests/lanes/wt-06/tsconfig.json`

- `docs/photon-features/requests/wt-06/host-integration.md`
- `docs/photon-features/evidence/wt-06/`: this handoff, manifest.json, sources.json, sources.md, validation.json and command logs.

## Integration requests

See ../../requests/wt-06/host-integration.md for the complete requests. WT-00 must wire the module into the single registry/executor; supply actual template/line bindings and immutable admission revisions; provide a real universal update URL mapping if needed; implement and mount the backend authentication contract plus authenticated session registration; and consume durable pending handoffs. No shared files were modified to bypass these ownership boundaries.

Sources: sources.json records per-URL access attempts/time, installed versions, content hashes, operations/tests and mismatches. Each website .md counterpart was checked individually. The rendered documentation was readable through web.open; Markdown endpoint failures remain recorded. Exact installed public types are authoritative; skills and authored templates are supplementary.
