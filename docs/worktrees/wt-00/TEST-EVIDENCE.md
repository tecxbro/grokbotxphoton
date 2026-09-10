# Test evidence

## Results
Foundation tests: 65 passed, zero failures/skips. Inherited foundation tests: 60 passed. Original CLI tests: 31 passed. Actual installed Spectrum 12.8.0 public imports and signatures compile; no mock signatures are used for SDK proof. Typecheck/build and schema generation/drift checks pass. Package dry-run contains host/public declarations, generated schemas and additive SQL, with no test fixtures or local runtime outputs.

The complete wrapper is the final completion gate. Its first run exposed and fixed a TAP summary parser false positive (`todo 0`) and a duplicate ownership log name. A later run correctly rejected pending acceptance status. Final current-working-tree results are written by the wrapper to `.photon-local/verification.json` with HEAD, dirty identity, real exit/test counts and SHA-256 for each log. `verify-docs` checks freshness and log hashes. These ignored logs are local verification output, not fabricated permanent source snapshots.

## Identity
START_COMMIT and comparison commit: `5c342f5eeb654b1ad7cb00e52855b425f25148ae`. Tested pre-commit HEAD is that same value with WT-00 changes. The frozen code/interface digest is recorded in `docs/worktrees/foundation.json`; it includes source contracts, registry, state, host, package/lockfile and the three schemas. The complete test runner records a separate working-tree digest including dirty and staged/untracked bytes. After committing, rerun the suite against clean HEAD before creating the immutable tag; its actual SHA is reported outside the commit.

## Acceptance reconciliation
1. Worktree path/branch/original base/registration and exact ownership checked, including committed/staged/unstaged/untracked paths. Wrong-worktree and duplicate/unowned path failure tests pass.
2. Forty-four valid fixtures plus missing/unknown/executable input variants pass; JSON getter/cycle/oversize/nested wrapper tests pass.
3. Representative text/poll/card handlers share scoped services and child execution. Fencing/cancellation, unknown retry identity, rollback/continuation and private-table denial tests pass.
4. Early and duplicate receipt correlation, read-before-delivery, stale observations, part targeting, unknown readers and real SQLite close/reopen/additive migration tests pass.
5. Actual pinned public Spectrum builder, Message/Space, read, effect and iMessage session probes compile. Host composition uses injected components only and startup failure cleans up.
6. Checker tests reject wrong worktree, missing/skipped tests, invalid/hash-mismatched sources, missing docs and inconsistent acceptance evidence.
7. Generated schemas, full workspace typecheck/build, inherited 60 foundation tests and 31 original CLI tests pass.
8. Source records are verified with five explicit access failures; documentation and API inventory have been manually reviewed and the final wrapper checks consistency/freshness.

## Manual review
Manual review: complete. Reviewed original/new contract exports, authorized JSON boundary, receipt independence/correlation, host fail-closed startup/cleanup, migration additivity, SDK imports, generated schema origins, exact ownership, source identity and test wrapper failure paths. Original CLI and other lane code were not modified. Legacy table-based services remain explicitly documented compatibility interfaces; new lanes must target f0-services-2.

## Untested boundaries
No installed/activated production host, adapted inherited feature execution, end-to-end provider integration, real messaging credentials, live line inspection, bot wake delivery or physical-device verification. Test fixtures prove foundation contracts only. No F0 PASS claims full-product readiness.
