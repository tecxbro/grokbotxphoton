# WT-02 test evidence

## Identity and commands
Tested HEAD: ee2f8576b55973eee312bca5cad0549b6f959a88 with the owned implementation/tests dirty. Their final SHA-256 (sorted path, NUL, bytes, NUL): `3af265ef9fbcbbf7c27190ab0e383e43b0f017cd2aa2c3960290e84e1b816fc1`. This content identity covers the 14 source and four test files in FILES.json; documentation updates do not pretend to be retests. The scoped resulting commit is reported in the final handoff response.

Node: 24.13.0, executable `/Users/darshan/.npm/_npx/cee224165f95995d/node_modules/node/bin/node`; shell default Node 23.11.0 was not used for passing verification. Lockfile-installed Spectrum 12.8.0, TypeScript 5.9.3, Zod 4.5.4. `npm ci --ignore-scripts --no-audit --no-fund` passed, without dependency-file edits.

Full commands, exits, test counts, log hashes and committed output snapshots: [verification results](references/verification-results.json). All commands ran in WT-02. Final test temporary files used relative `TMPDIR=.photon-local`.

| Check | Result | Evidence |
| --- | --- | --- |
| tsc -p packages/photon-features/tsconfig.json --noEmit | PASS | references/typecheck.txt |
| tsc -p packages/photon-features/tsconfig.json | PASS | references/build.txt |
| node --test --test-reporter=tap packages/photon-features/dist/tests/lanes/wt-02/*.test.js | PASS: 67/67, zero skipped/cancelled/todo | references/lane-tests.txt |
| node --test --test-reporter=tap packages/photon-features/dist/tests/foundation/*.test.js packages/photon-features/dist/tests/lanes/wt-00/*.test.js | PASS: 125/125 | references/foundation-tests.txt |
| node --test --test-reporter=tap test/*.test.js | PASS: 31/31 | references/cli-tests.txt |
| node scripts/generate-contracts.mjs --check | PASS: three schemas, unchanged F0 digest d95caace5f188fd13b6d4d26250be1c77aafa1f42447263e5e3e7982e7e1a60f | references/contracts.txt |
| node scripts/verify-worktree.mjs wt-02 | PASS | references/verify-worktree.txt |
| node scripts/verify-lane.mjs wt-02 | BLOCKED, exit 1: LANE_NOT_ASSEMBLED | references/verify-lane.txt |
| node scripts/verify-ownership.mjs wt-02 | BLOCKED, exit 1: UNOWNED_PATH:.gitignore | references/verify-ownership.txt |
| node scripts/verify-docs.mjs wt-02 | BLOCKED, exit 1: FILE_INVENTORY_DRIFT | references/verify-docs.txt |

## Scope of evidence
The four required new test files contain 25 tests; the 42 inherited lane tests also pass. Tests exercise actual pinned Spectrum construction/public Space narrowing/typing no-op/webhook callback semantics with offline custom providers. Native getMessage calls and Grok notifications are controlled adapters. Shared SQLite inbox/continuation/work retrieval is exercised through the retained store. Receipt acquisition uses an injected test writer with the shared append semantics; this is not the missing production receipt writer or a live read/delivery receipt.

Explicit acceptance evidence: unit covers normalization and legacy identity, 2000 ms batching, reader/part/time receipt identity, and lease clocks; sdk-contract covers pinned exports, actual no-op, fire-and-forget webhook and public getMessage shape; integration covers committed handoffs, wake retries/retrieval, invalid webhooks, persistence failure before ack, one subscription and f0-services-2 typing; regression covers receipt/echo suppression, capture recovery, checkpoint gaps, missing/group readers, exact native reconciliation, wrong-line targets, cancellation and bounded/hung lookup.

## Checkpoint history and review
Initial owned compile failures were corrected. Initial test failures found invalid test Space construction, builder shape assumptions, and an intentionally supported reaction continuation; the fixtures now use real public Space objects and the existing explicit reaction continuation is preserved. Final review retained the original event-key formula to preserve old capture replay compatibility and verified it with a regression assertion.

An inherited foundation socket test initially failed with `listen EINVAL` because absolute WT-02 TMPDIR made runtime.sock exceed the macOS Unix socket path limit. Full failing output is retained in references/foundation-absolute-temp-failure.txt. Relative `.photon-local` fixes test setup without a shared-code change; all 125 foundation tests then passed.

Manual review: complete for owned code, API comments, documented limitations, sources, test assertions, current contract usage and user-authorized file boundaries. Final independent audit checks every source hash, inventory symbol, owned input digest and preserved relocation-file hash. Shared aggregate checks are not marked passed. No installation, activation, deployment, registration, credentials, live sends, real Grok wake or physical-device verification occurred.

Independent final audit: [references/final-audit.json](references/final-audit.json). Empty build/typecheck .txt files are exact zero-output successful command logs; exit status and hashes are in verification-results.json.
