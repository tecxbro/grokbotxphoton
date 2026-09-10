# WT-04 test evidence

Tested HEAD before commit: `ee2f8576b55973eee312bca5cad0549b6f959a88` with WT-04 changes. Source-and-test content identity: `9d17310fe0b3050389b81ad350363948a5e813844a212fba0841e8b0b22e3451` (SHA-256 of sorted exact FILES.json packages/ paths, NUL, file bytes, NUL). This includes unchanged owned file-access.ts. The complete checked file list, log hashes and protected relocation hashes are in `.photon-local/wt04-evidence.json`. No evidence is attributed to an untested future commit.

Toolchain: checksum-verified Node 24.13.0 under `.photon-local/tooling/node-v24.13.0-darwin-arm64/bin/node`; npm 10.9.2 installed the unchanged lock with scripts disabled; Spectrum 12.8.0, TypeScript 5.9.3 and Zod 4.5.4. All runtime/test outputs are inside WT-04. Normal TypeScript build output uses the repository's ignored package dist directory because inherited tests depend on its location.

| Check | Result | Evidence |
|---|---|---|
| Focused new four test files | PASS, 34 tests | Included in final all-wt04 run |
| All WT-04 tests, including inherited compatibility suites | PASS, 70 tests, 0 failed/skipped/cancelled | wt04-all-wt04.log |
| Shared foundation | PASS, 65 tests | wt04-foundation.log |
| Legacy foundation | PASS, 60 tests | wt04-legacy-foundation-relative-tmp.log |
| Original CLI | PASS, 31 tests | wt04-cli.log |
| Full workspace typecheck | PASS, exit 0 | wt04-typecheck.log |
| Full workspace build | PASS, exit 0 | wt04-build.log |
| Schema/F0 digest | PASS, 3 schemas, 36 files; d95caace5f188fd13b6d4d26250be1c77aafa1f42447263e5e3e7982e7e1a60f | wt04-schema.log |
| verify-worktree.mjs wt-04 | PASS: actual relocated registered identity | Independent Git check |
| verify-lane.mjs wt-04, pinned Node | BLOCKED: LANE_NOT_ASSEMBLED | CHANGE-REQUESTS.md |
| Shared ownership aggregate | BLOCKED: UNOWNED_PATH:.gitignore from pre-F0 comparison | wt04-ownership-aggregate.log |
| Shared docs aggregate | BLOCKED: FILE_INVENTORY_DRIFT | wt04-docs-aggregate.log |
| Lane delta ownership / sources | Independently verified against user exact scope and F0 | FILES.json, source-lock.json |

## Reproduction
From WT-04, use `NODE=.photon-local/tooling/node-v24.13.0-darwin-arm64/bin/node` as a shell variable (this is a task-specific tool path, not a global install). Run `$NODE node_modules/typescript/bin/tsc -p packages/photon-features/tsconfig.json --noEmit`, then the same command without `--noEmit`. Run `$NODE --test --test-reporter=tap 'packages/photon-features/dist/tests/lanes/wt-04/*.test.js'` with absolute TMPDIR under WT-04 `.photon-local/tmp`. Shared foundation uses dist/tests/foundation/*.test.js. Legacy WT-00 tests use `TMPDIR=.photon-local/t` to stay below macOS socket path limits. CLI uses test/*.test.js. The aggregate lane command remains blocked; do not replace its result with direct-test PASS.

## Evidence limits
Provider callbacks are controlled fixtures using real SDK builders/types. Shared SQLite close/reopen demonstrates resource durability, not production child execution integration. No live sends, account changes, new client/database, production service or physical-device behavior was exercised. Native getAttachment requires the cloud iMessage provider; only allowlisted MIME formats are accepted. This lane does not add CAF support, conversion or companion-byte downloads.

An early new test run failed on owned fixture shape/key-order assumptions; these were corrected without editing shared fixtures. A later concurrency test scheduling race was fixed using an explicit stream-open barrier. Initial foundation commands used the wrong isolated output location; final normal-build runs pass. The absolute relocated temporary path failed one macOS socket test; the relative in-WT-04 temporary path passes. Earlier failures remain historical worklog evidence and are not final results.

Manual review: complete. New public handlers use only the frozen services/domain surface and injected provider context. Legacy adapters stay compatibility-only. Four-operation scope, source records, exported API comments, cancellation/retry behavior, exact diff ownership, preserved file hashes and evidence tiers were reviewed. Integration-dependent cleanup remains fail-closed and is explicitly recorded as CR-04-1.
