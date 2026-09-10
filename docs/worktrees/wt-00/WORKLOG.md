# Work log

## Checkpoint 1: before implementation
Verified clean primary and matching origin/main by live ls-remote. START_COMMIT 5c342f5eeb654b1ad7cb00e52855b425f25148ae. Created only assigned branch/worktree successfully. Existing source includes legacy foundation and all lanes; this assignment preserves them. Plan: strict public contracts, shared execution seam, receipts, additive migration, exact ownership, retrieval evidence and fail-closed verification. Tests not yet run.

## Checkpoint 2: implementation and focused tests
Reused strict version 1 operation schemas and preserved all inherited lane code. Added inert JSON gate, public services/feature/reference/receipt/state/transport files, explicit registration/capabilities, additive migration and inactive host. Added bounded source retrieval and checker tools. Initial typecheck exposed missing callback annotations in new tests; corrected. Focused suite passed 64/64; inherited foundation plus root CLI passed 91/91. No skipped tests. Source retrieval verified both indexes, all 22 focused pages and 15 skills; five full-tab URLs are 404. No live operations.

## Checkpoint 3: verification tools and manual review
The new host failure/cleanup probe brings focused tests to 65. Inspected production imports (no fixture/runtime activation imports), package dry-run contents, additive migration and full diff scope. Corrected TAP todo-zero parsing and separated ownership-test/checker logs. The docs checker rejects pending acceptance as expected; now reconciled the eight acceptance cases against real focused/build/regression/source evidence. Final complete wrapper and post-commit retest are mandatory before immutable tag creation. No deployment or live sends.

## Checkpoint 4: complete F0 verification
Complete verify-lane passed 156 tests (65 new + 60 inherited foundation + 31 CLI), all schema/build/typecheck/ownership/docs checks. Tested HEAD 5c342f5eeb654b1ad7cb00e52855b425f25148ae, dirty working-tree identity 0ad2b7c57a37ff7ace745ed7fb154d1b40d9c85d32d3f99e827397d27f44d46c. The five individually requested check commands also passed. Final review added a receipt replay assertion: an early unresolved receipt replay must preserve a later target mapping rather than conflict or regress evidence. The complete final gate will rerun with this correction and the documentation update before commit, then again on clean HEAD before tagging.

The staged-source snapshot exceeded the default child-process buffer while computing verification identity. Replaced the buffered binary staged diff with Git's exact staged blob IDs/modes (`--raw --no-abbrev -z`); working bytes are still hashed separately. This preserves staged-versus-working identity without buffering the entire documentation corpus. No test PASS was emitted for the failed invocation; rerunning the final F0 gate.
