# WT-06 handoff

## Git identity and scope
Worktree: /Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/wt-06. Branch: photon-v3/wt-06. Base: photon-v3-f0 = ee2f8576b55973eee312bca5cad0549b6f959a88, also the original branch creation reflog entry and pre-work HEAD. Origin: https://github.com/tecxbro/grokbotonimessage.git. Remote HEAD/main was freshly read as 5c342f5eeb654b1ad7cb00e52855b425f25148ae; F0 is one local commit ahead and zero behind. No remote WT-06 branch or F0 tag was present. Final publication is a local commit containing this handoff; its exact SHA is reported with the final response. No push or merge is part of this work.

Only the seven named cards source files, four named test files and this lane's docs/references changed. FILES.json enumerates responsibilities and required symbols. The compatibility implementation remains callable for inherited tests; the public entry point never uses its private task/outbox/checkpoint path.

## Three-operation capability matrix
| Operation | Built behavior | Configuration and limits |
| --- | --- | --- |
| app.send | Public app(URL) builder through executeChild; native cloud card references recorded | Unique configured template and approved HTTPS origin. Static mode is independent of live extension or callback backend. No rich-link substitution. |
| app.sendCustomized | Public customizedMiniApp builder with configured extension identity and staged media | Requires app name, Apple team/bundle IDs. Live mode additionally requires installed-extension evidence. Missing callback backend does not block a configured send. |
| app.update | Public edit targeting original SDK message; void result becomes executor-completed with original references | Requires retained original session, immutable admission revision and unchanged template identity. Universal cards need actual backend URL mapping. CAS reserves revision +1 and completes +2; unresolved odd revisions block later updates. |

## Session and callback proof
The pinned provider manages and refreshes miniAppCardSession on the original message; repeated offline tests preserve the original bubble, line/chat and refreshed metadata. Versioned encodeCardSession/restoreCardSession reject live graphs, invalid versions and mismatched handles. A serialized snapshot alone cannot rehydrate a provider session and returns requires_original_session. Domain bindings and update reservations are persisted through public UnitOfWork. Full metadata snapshots have no public F0 storage slot (WT06-003); the bounded 1000-entry module cache is not durable recovery. Eviction or cold restart can leave callbacks unresolved and updates unavailable.

Host wiring: instantiate CardRuntime once, register createFeatureModule(runtime) with the single executor, and use runtime.snapshot(sessionId) only inside trusted host code. Authenticate the actual backend bytes through authenticateInteraction; durably capture its exact normalized assertion, including selection, before applyCardInteraction. Never take snapshot/binding data from callback JSON. The reducer verifies participant, task/generation, scope, expiry, action, nonce and authoritative records. It atomically consumes a single-use session and creates the continuation. The shared host wakes after commit. Unknown sessions remain unresolved; no recent-task lookup, new listener, public server or app.messages tap assumption exists.

## Verification
240 offline tests pass: 40 new focused, 44 inherited cards, 65 public foundation, 60 inherited foundation and 31 CLI. Zero failures/skips. Package typecheck/build and generated schema check pass. references/verification.json records commands, result counts, hashes and source/code identities; logs remain in ignored .photon-local.

SQLite reopen testing proves persistence of domain CAS reservations and callback transaction rollback/commit using the existing SQLiteStore behind a test facade. Shared child replay is contract-fixture evidence. These are not production executor/transport assembly evidence.

Shared gate blockers: verify-lane reports LANE_NOT_ASSEMBLED; ownership reports UNOWNED_PATH:.gitignore because its base predates F0; docs reports FILE_INVENTORY_DRIFT and has subsequent WT-00-specific constraints. Worktree verification passes. Independent exact-task ownership, source hash/identity, inventory/symbol, protected-patch and diff checks pass. CHANGE-REQUESTS.md records exact commands, outputs and required corrections. No shared tooling was changed or blocked gate labeled passed.

## Integration requirements and untested behavior
Integration is restricted to /Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/wt-integration. It must inject production f0-services-2, one credential/connection owner, shared durable child execution and scoped transactions; map real configured templates/line/chat; persist admission revisions; and wire authenticated durable callback capture plus pointer-only wake. Legacy records use a different codec/revision protocol and need explicit migration before adoption. Full session snapshot persistence/reconciliation needs an approved shared extension.

Built and offline tested: yes. Production integrated: no. Installed/activated: no. Provider acceptance/delivery/read, device rendering, installed extension behavior and real backend callbacks: untested. No live sends, account or extension provisioning, callback service setup or configuration changes occurred.

## Preserved changes
Pre-existing unstaged relocation edits remain untouched and excluded from the commit: AGENTS.md, docs/photon-features/rollout.md, docs/worktrees/worktree-map.json, docs/worktrees/wt-00/HANDOFF.md. No pre-existing staged or untracked files existed. Their combined binary patch SHA256 remains e69c6362071341f7e87898c676a1ceb9eee23258c81cf7fb01b7398ab1f89075. Main, parent README, archive/product-snapshot, shared contracts/dependencies/migrations/registry/host/fixtures/verifiers and other worktrees remain untouched.
