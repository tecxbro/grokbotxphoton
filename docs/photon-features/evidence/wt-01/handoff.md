# WT-01 handoff

Implemented a durable SQLite engine, persisted authorization, transactional work handoff, fenced child execution and a bounded authenticated Unix-domain protocol server. The provider-integrated objective remains blocked on the shared seams below; this lane is not installed or live verified.

## Identity

- Repository: https://github.com/tecxbro/grokbotonimessage
- Absolute worktree: `/Users/darshan/Documents/ChatGPT/grokbotxphoton`
- Branch: `main`
- Starting and final HEAD: `57e40736be8a59047b776654c766fbe8bfd10c9e`
- Verified F0 introducing commit: `57e40736be8a59047b776654c766fbe8bfd10c9e`
- Assigned F0 hash: not supplied separately in the brief; no independent assignment was invented.
- Verified contract digest: `e0f7779bc9ca3d45696e9b4e24e8579d922c8d2d7d4323c821202d8f599acbf8` (71 files, 51 schemas).
- Comparison/remote main: `24468391b57f028b4b881ddbf71efab3a49a6f73`, confirmed by `git ls-remote` at beginning and final verification; local HEAD ahead 1, behind 0.
- No branch/worktree changes, commits, pushes or staging. Existing dirty `package.json`, `package-lock.json`, `agent.md`, and `architecthure.md` retained byte-for-byte. Other lanes added untracked files concurrently; their contents were not used or modified.

## Implemented interfaces

`DurableSQLiteStore` consumes F0 `TransactionStore`/`Transaction` and migrations; `DurableContexts` implements `ContextResolver`; `DurableSubmission` and `DurableEngine` implement `SubmissionPort`; `DurableEngine` supplies `recover/startOutbox/stopOutbox`; `DurableWork` and `DurableLocalProtocol` implement the F0 work/local wire routes. `DurableExecutor`, `ExecutionClaims`, `applyInteraction`, `executeChild`, and the runtime-owned child checkpoint codec provide the owned execution/storage integration seams. See [implementation.md](implementation.md) for behavior and trust assumptions.

## Verification

The machine default Node and mutable workspace dependencies were not used for validation. A separate private temporary directory was populated with `git archive` of the exact F0 commit, then only WT-01 source/tests/examples were copied in. Its committed lockfile was installed using `npm ci --ignore-scripts`. No other lane source was copied.

Validation cwd: `/var/folders/mw/7sj15dn14z5g9zdvmmhzf1280000gn/T/photon-wt01-validation-rcy03fs9`

Node executable: `/Users/darshan/.npm/_npx/cee224165f95995d/node_modules/node/bin/node`; Node 24.13.0, npm 10.9.2, TypeScript 5.9.3. Put that executable directory first on PATH for npm commands.

| Command in validation cwd | Result | Log |
| --- | --- | --- |
| `npm ci --ignore-scripts` | Exit 0 | [clean-install.txt](clean-install.txt) |
| `npm run photon:build` | Exit 0 | [build.txt](build.txt) |
| `node --test packages/photon-features/dist/tests/lanes/wt-01/*.test.js` | Exit 0 / 31 passed, 0 failed | [lane.txt](lane.txt) |
| `npm run photon:test` | Exit 0 / 60 passed, 0 failed | [foundation.txt](foundation.txt) |
| `npm run photon:check` | Exit 0 | [check.txt](check.txt) |
| `npm test` | Exit 0 / 31 passed, 0 failed | [existing.txt](existing.txt) |

`git diff --check` passed; no tracked foundation files differ. Final SHA-256 comparison found zero differences between all 25 WT-01 source/test/example files and the copy tested. [validation.json](validation.json) records command/log hashes and evidence tiers; [final-verification.json](final-verification.json) records final identity, preserved files and source hashes.

The 31 lane tests exercise real temporary SQLite databases, four concurrent reserving processes, a deliberately exiting process during a provider test-double callback, separate database connections, and real local sockets. They cover admission/authorization, stale generations, FIFO/concurrency, lease fencing, cancellation/timeouts, unknown outcomes, multipart partial persistence/resume, transactional reduction and rollback (including async reducer rejection), repeated work acknowledgements, restart persistence, bounded framing and diagnostic isolation. They do not prove real provider execution.

## Shared requests and remaining limitations

See [001-execution-and-host-seams.md](../../requests/wt-01/001-execution-and-host-seams.md). The critical blocker is that frozen F0 `ExecutionServices` has no mandatory per-child side-effect boundary. Raw feature handlers are not automatically safe. The owned `executeChild` adapter is concrete and tested but needs a shared contract and feature adoption. Package exports, host/protocol wiring and production policy/capability bindings also require WT-00 integration.

Unknown outcomes are retained without automatic resend; no provider idempotency or lookup extension is assumed. Retention keeps all data because F0 lacks dependency-aware deletion. Ordering conservatively serializes the entire account/line; unknown or blocked predecessors stop later work on that line. WT-08 must supply host locking and OS/credential setup. Unix permissions do not isolate hostile unrestricted same-user processes.

## Evidence tiers

- Code built: yes.
- Real dependencies integrated: SQLite and Unix IPC yes; F0/pinned SDK type compatibility yes; real messaging handlers/transport/host wiring no.
- Installed/activated: no (ephemeral test servers only).
- Live verified: no. No live messages, account changes or platform permission changes.

## Changed files

- `docs/photon-features/evidence/wt-01/baseline.json`
- `docs/photon-features/evidence/wt-01/build.txt`
- `docs/photon-features/evidence/wt-01/check.txt`
- `docs/photon-features/evidence/wt-01/clean-install.txt`
- `docs/photon-features/evidence/wt-01/existing.txt`
- `docs/photon-features/evidence/wt-01/final-verification.json`
- `docs/photon-features/evidence/wt-01/foundation.txt`
- `docs/photon-features/evidence/wt-01/handoff.md`
- `docs/photon-features/evidence/wt-01/implementation.md`
- `docs/photon-features/evidence/wt-01/lane.txt`
- `docs/photon-features/evidence/wt-01/sources.json`
- `docs/photon-features/evidence/wt-01/sources.md`
- `docs/photon-features/evidence/wt-01/validation-environment.json`
- `docs/photon-features/evidence/wt-01/validation.json`
- `docs/photon-features/requests/wt-01/001-execution-and-host-seams.md`
- `packages/photon-features/examples/wt-01/compose-engine.ts`
- `packages/photon-features/src/adapters/state/sqlite.ts`
- `packages/photon-features/src/adapters/state/unit-of-work.ts`
- `packages/photon-features/src/runtime/core/admission.ts`
- `packages/photon-features/src/runtime/core/authorization.ts`
- `packages/photon-features/src/runtime/core/cancellation.ts`
- `packages/photon-features/src/runtime/core/checkpoint-codec.ts`
- `packages/photon-features/src/runtime/core/children.ts`
- `packages/photon-features/src/runtime/core/claims.ts`
- `packages/photon-features/src/runtime/core/engine.ts`
- `packages/photon-features/src/runtime/core/errors.ts`
- `packages/photon-features/src/runtime/core/execution-boundary.ts`
- `packages/photon-features/src/runtime/core/executor.ts`
- `packages/photon-features/src/runtime/core/feature-services.ts`
- `packages/photon-features/src/runtime/core/idempotency.ts`
- `packages/photon-features/src/runtime/core/index.ts`
- `packages/photon-features/src/runtime/core/local-server.ts`
- `packages/photon-features/src/runtime/core/outcomes.ts`
- `packages/photon-features/src/runtime/core/recovery.ts`
- `packages/photon-features/src/runtime/core/submission.ts`
- `packages/photon-features/src/runtime/core/work-handoff.ts`
- `packages/photon-features/tests/lanes/wt-01/fixture.ts`
- `packages/photon-features/tests/lanes/wt-01/process-worker.ts`
- `packages/photon-features/tests/lanes/wt-01/runtime.test.ts`
- `packages/photon-features/tests/lanes/wt-01/work-protocol.test.ts`
