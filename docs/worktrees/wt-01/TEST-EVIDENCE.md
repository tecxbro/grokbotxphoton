# WT-01 test evidence

Tested implementation commit: `08d9ed396e1b18b0bd5edfcc866c7dde0518c006`, based on F0 `ee2f8576b55973eee312bca5cad0549b6f959a88`. Commands are reported independently by evidence tier.

## Pre-implementation checks

| Check | Result | Evidence |
| --- | --- | --- |
| Registered worktree / branch / F0 | PASS | WT-01 is registered at the assigned path on `photon-v3/wt-01`; HEAD and `photon-v3-f0` resolve to `ee2f8576b55973eee312bca5cad0549b6f959a88`. |
| Branch origin | PASS | Branch reflog: `branch: Created from photon-v3-f0`. |
| Remote freshness | PASS | `git fetch --prune origin`; `origin/main=5c342f5eeb654b1ad7cb00e52855b425f25148ae`; HEAD versus origin/main is 1 ahead / 0 behind. |
| Pre-existing state | RECORDED | No staged files; four unstaged relocation edits and one pre-existing untracked lane change-request file. |
| Official source bodies | PASS | All supplied documentation and skill bodies returned 200 and were hashed; see `source-lock.json`. |
| Pinned SDK metadata | PASS | `spectrum-ts@12.8.0`, npm integrity and gitHead recorded; declarations inspected. |
| Dependency install | PASS WITH NOTE | Node 24.19.0 `npm ci --ignore-scripts`: 185 packages; audit reported 14 moderate dependency advisories. No audit fix was run because dependency changes are outside scope. |

## Implementation verification

| Check | Result | Evidence |
| --- | --- | --- |
| Typecheck checkpoint | PASS | Node 24.19.0: `npm run typecheck --workspace=@grokbot/photon-features`. |
| Build checkpoint | PASS | Node 24.19.0: `npm run build --workspace=@grokbot/photon-features`. |
| Required focused suite | PASS | `node --test` over compiled `unit`, `sdk-contract`, `integration`, and `regression`: 15 tests, 15 pass, 0 fail/skipped/todo. |
| Real persistence | PASS | Tests use temporary on-disk SQLite, close/reopen recovery, actual F0 migration, and assert database mode `0600`. |
| Real local IPC | PASS | Tests bind an actual Unix-domain socket, exchange framed requests, check mode `0600`, authentication, bounds, malformed input, status/doctor, and work fences. |
| All WT-01 tests | PASS | `node --test packages/photon-features/dist/tests/lanes/wt-01/*.test.js`: 46 tests, 46 pass. |
| Foundation plus WT-00 | PASS | `node --test packages/photon-features/dist/tests/foundation/*.test.js packages/photon-features/dist/tests/lanes/wt-00/*.test.js`: 125 tests, 125 pass. |
| Security | PASS | `node --test packages/photon-features/dist/tests/security/*.test.js`: 45 tests, 45 pass. |
| Root CLI | PASS | `npm test`: 31 tests, 31 pass. |
| Contract generation | PASS | `npm run check --workspace=@grokbot/photon-features`: 3 schemas, 36 files, contract digest `d95caace5f188fd13b6d4d26250be1c77aafa1f42447263e5e3e7982e7e1a60f`. |
| Assembled E2E | BLOCKED | 29 tests: 26 pass, 3 fail in shared/other-lane seams; exact failures and required owners are CR-04. |
| `verify-lane wt-01` | BLOCKED | Exit 1, exact output `LANE_NOT_ASSEMBLED`; CR-01. |
| Worktree verification | PASS | Reports the assigned registered path, branch `photon-v3/wt-01`, HEAD `ee2f8576b55973eee312bca5cad0549b6f959a88`, dirty true. |
| Ownership verification | BLOCKED | Exit 1, exact output `UNOWNED_PATH:.gitignore`; CR-02. |
| Documentation verification | BLOCKED | Exit 1, exact output `FILE_INVENTORY_DRIFT`; CR-03. |

The package typecheck, build, contract check, required focused suite, and complete WT-01 suite were rerun after creating implementation commit `08d9ed396e1b18b0bd5edfcc866c7dde0518c006`; every one passed. The wider foundation, security, CLI, E2E, and aggregate results above were run from the identical code and test tree immediately before that commit.

An earlier focused invocation had 14 pass / 1 fail because the SDK test computed the repository root one directory too shallow and attempted to read `packages/node_modules`. This was an owned test defect, not a shared blocker; it was fixed and the entire focused command passed on rerun.

The root-level command `npm run typecheck` was also attempted and exited 1 because the root package defines no such script. This is not an implementation result. The package-owned command `npm run typecheck --workspace=@grokbot/photon-features` passed and is the recorded typecheck evidence.
