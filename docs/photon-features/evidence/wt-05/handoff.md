# WT-05 handoff: polls, votes, task continuation

The F0-compatible creation and durable normalized-event layer is built and tested. **The complete five-operation interactive poll workflow remains blocked** on the shared changes in [advanced-polls.md](../../requests/wt-05/advanced-polls.md). Four native management operations have explicit blocked handlers, not working provider implementations.

## Checkout and start gate

- Repository: `https://github.com/tecxbro/grokbotonimessage`
- Path: `/Users/darshan/Documents/ChatGPT/grokbotxphoton`
- Branch: `main`
- Exact HEAD and F0 commit: `57e40736be8a59047b776654c766fbe8bfd10c9e`
- F0 contract digest: `e0f7779bc9ca3d45696e9b4e24e8579d922c8d2d7d4323c821202d8f599acbf8` (71 files, 51 schemas; freshly verified)
- Comparison commit / observed remote `main`: `24468391b57f028b4b881ddbf71efab3a49a6f73`
- Known divergence at inspection: local HEAD ahead 1, behind 0. `git ls-remote` matched the local origin tracking ref. No fetch, commit, push, branch/worktree creation, switch, reset or rebase.
- Starting dirty state: modified root `package.json` and `package-lock.json`; untracked `agent.md`, `architecthure.md`, and evidence directories for WT-01 through WT-04. Concurrent sibling-lane additions continued during this task; they were not edited by WT-05.
- Selected Node: `/Users/darshan/.npm/_npx/cee224165f95995d/node_modules/node/bin/node`, v24.13.0; npm 10.9.2. Global Node v23.11.0 was not replaced. No dependency installation or lockfile change by this lane.

## Five-operation status

| Operation | Implementation | SDK evidence / limitation |
| --- | --- | --- |
| `poll.create` | Implemented | Real Spectrum 12.8.0 `space.send(poll(question, choices.map(option)))`; actual builders and typed call sites tested with no live send. |
| `poll.get` | Blocked / unimplemented | Native 2.1.0 `polls.get(guid)` exists; shared F0 services do not expose it. A cached message is not authoritative poll state. |
| `poll.vote` | Blocked / unimplemented | Native `polls.vote(guid, nativeOptionId)` compile-probed. Must act only as authenticated bot and reconcile actual returned selection state. |
| `poll.unvote` | Blocked / unimplemented | Native `polls.unvote(guid)` compile-probed. F0 supplies an option argument, while this native method removes the bot's selection without an option argument; requires an approved precondition/contract. |
| `poll.addOption` | Blocked / unimplemented | Native `polls.addOption(guid, text)` compile-probed; no host-owned advanced extension approved. |

The module records the four blockers as `UNIMPLEMENTED`, with native provider support, so missing application wiring is not misrepresented as an SDK/provider limitation. Full interactive workflow advertisement is false even if creation is available. Active vote ingress is independently supplied by host configuration and defaults to unknown. Account/conversation availability and live evidence remain unknown.

## Durable correlation and continuation

Creation requires the shared authorized context, task generation, persisted reference ownership and current fenced outbox claim. It stores a durable dispatch checkpoint before the SDK call. The message/native poll GUID, full scope, originating principal/task/generation and original poll message reference commit together after a matching returned poll message. Caller option keys and display text persist separately in the checkpoint. Public Spectrum returns no native option IDs: no option identity is invented from labels, index, or a parsed composite event ID.

Native metadata registration is a pure transactional step requiring an already owned poll and matching native GUID. Each native option has a separate scoped reference; duplicate display labels remain distinct. It rejects omitted prior options and conflicting existing labels. The host must obtain metadata through an approved public lookup; that lookup is absent at F0. `registerAndReconcilePollOptions` commits registration and pending-event reductions/continuations together.

The reducer consumes the shared normalized `poll` event contract, with exact poll/message identity and full project/provider/account/line/conversation checks. It never chooses the newest poll in a chat. Early, unknown, ambiguous, cross-scope, stale-task, or insufficient-evidence events remain durable unresolved records. Resolution history is retained because F0 has no delete/status field on unresolved records; inbox state marks successful resolution.

Independent `(poll, native option, actor)` selection rows support multiple voters and independent selections without replacing an unrelated selection. Ordered reduction requires an explicitly verified source, a decimal sequence, and verified independent-option delta semantics. Raw vote replacement events, absent order, or incomparable evidence require native-state reconciliation. `receivedAt` never orders votes. Missing actors cannot be represented by F0's required actor field and must stay in WT-02's quarantine; no actor is synthesized.

Inbox reduction, vote state and task handoff are written in the same shared UnitOfWork. The feature never wakes Grok or subscribes to SDK streams. The shared dispatcher must wake only after commit and must not create a second generic handoff. Stable event/provider IDs deduplicate replay and recovery. Poll ownership restores the original task/generation after reopening SQLite.

Network calls never run inside the database transaction. Unknown create outcomes (including missing SDK return, timeout, or acceptance followed by registration failure) retain the dispatch marker and never automatically resend. A crash after marker commit but before actual dispatch is conservatively unknown. Native outcome lookup/provider idempotency is not approved at F0. Reconciliation currently reprocesses retained events after trusted metadata registration; it cannot fetch native state or resolve unknown actor/order/selection semantics by itself. Bounded F0 list APIs fail closed at saturation rather than silently truncate correlation/recovery.

## Verification

All commands ran in the repository root with Node 24.13.0 on PATH. The lane-specific tsconfig compiles WT-05, its imported F0 code, and WT-00 probes/tests without importing sibling implementations.

| Check | Result | Evidence |
| --- | --- | --- |
| Lane + F0 typed build: `node node_modules/typescript/bin/tsc -p packages/photon-features/tests/lanes/wt-05/tsconfig.json` | Exit 0 | [lane-build.txt](lane-build.txt) |
| WT-05: `node --test packages/photon-features/dist/tests/lanes/wt-05/*.test.js` | 24 passed, 0 failed | [lane-tests.txt](lane-tests.txt) |
| F0: `node --test packages/photon-features/dist/tests/lanes/wt-00/*.test.js` | 60 passed, 0 failed | [foundation-tests.txt](foundation-tests.txt) |
| Existing CLI: `npm test` | 31 passed, 0 failed | [existing-tests.txt](existing-tests.txt) |
| `node packages/photon-features/scripts/generate-contracts.mjs --check` | Exit 0; unchanged F0 digest | [foundation-check.txt](foundation-check.txt) |
| Aggregate `npm run photon:build` | Exit 2 at inspection: sibling WT-08 `src/cli/local-client.ts:17`, optional `requestId` incompatible with required field | [aggregate-build.txt](aggregate-build.txt) |

The initial aggregate check also encountered in-progress sibling-lane errors; preserved in [start-gate-check.txt](start-gate-check.txt). No sibling fix was made. The passing F0/lane runs are separate from the aggregate result.

WT-05 covers all five schemas/public call shapes, simultaneous polls, duplicate labels, multiple voters/independent selections, early votes, repeated events, removals, option additions, out-of-order and missing evidence, ambiguous targets, invalid/missing actors at the F0 schema boundary, wrong line/chat, unauthorized bot targets, atomic rollback, restart, repeated reconciliation, creation without vote ingress, timeout/unknown send results, registration failure after acceptance, concurrent retry, and context/fence rejection. Tests exercise the real temporary F0 SQLite store and controlled SDK doubles. They do not prove native provider behavior or physical-device delivery.

The reusable `tests/lanes/wt-05/integration-contract.ts` suite is ready for WT-01's real store and WT-02's actual router. Its two current runs explicitly use F0 fixtures; real lane integration remains pending. The advanced API probe is test-only and constructs no client.

## Changed files and sources

Only the five owned WT-05 directories were changed. [changed-files.json](changed-files.json) contains the exact path inventory. Source files are `module.ts`, `operations.ts`, `identity.ts`, `reducer.ts`, `reconciliation.ts`, and `sdk.ts` under `packages/photon-features/src/features/polls/`. Tests, integration contract, sample, source records, logs and the shared-change request are also under owned paths. Generated ignored TypeScript build output exists under the shared package's `dist`; no shared source/schema/migration/dependency/registry/host file was edited.

[sources.md](sources.md) and [sources.json](sources.json) record actual access/read status, dates, installed versions, observed repository HEADs, content hashes and the operations/tests each supports. All eight website `.md` variants were actually fetched and verified. Pinned public declarations are authority; rolling website/main examples are supplementary. The provider implementation was read only to verify projection/identity limitations; no internal clients or symbols are used.

## Integration and live status

- Built: creation plus durable normalized-event primitives and explicit native-operation blockers.
- Integrated with WT-01/WT-02/shared host/orchestrator: **no**.
- Complete five-operation interactive workflow: **blocked**, with exact requests supplied.
- Installed/activated: **no**.
- Live verified: **no**. No live polls/messages, account or permission changes, platform activation, extra client, or second outbox.

A live poll test remains pending until a real authorized user's vote is received and correlated to its actual originating task. Completing the native management handlers and authoritative state reconciliation requires the approved shared contracts, not fabricated SDK methods or an independently owned connection.
