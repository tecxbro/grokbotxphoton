# Test evidence

## Planned commands

- `npx -y -p node@24.13.0 node --test` over the four compiled WT-07 suites.
- `npx -y -p node@24.13.0 node scripts/verify-lane.mjs wt-07` to capture the expected shared-tool limitation.
- Explicit TypeScript typecheck/build with the pinned toolchain.
- SDK declaration/runtime contract probes for Spectrum 12.8.0.
- `node scripts/verify-ownership.mjs wt-07`, `git diff --check`, staged diff inspection, and final status/identity checks.

## Results

- `npx -y -p node@24.13.0 node node_modules/typescript/bin/tsc -p packages/photon-features/tests/lanes/wt-07/tsconfig.json --noEmit`: PASS.
- Lane build plus `node --test --test-reporter=tap` over `unit`, `sdk-contract`, `integration`, and `regression`: PASS, 94 tests, 0 failed, 0 skipped, 0 todo/cancelled.
- Full `packages/photon-features/tsconfig.json` typecheck and build: PASS.
- `packages/photon-features/dist/tests/foundation/*.test.js`: PASS, 65 tests.
- `packages/photon-features/dist/tests/lanes/wt-00/*.test.js`: PASS, 60 tests.
- `test/*.test.js`: PASS, 31 tests.
- `node scripts/generate-contracts.mjs --check`: PASS, contract digest `d95caace5f188fd13b6d4d26250be1c77aafa1f42447263e5e3e7982e7e1a60f`, 36 files.
- `node scripts/verify-worktree.mjs wt-07`: PASS at registered path/branch/base.
- `node scripts/verify-lane.mjs wt-07`: stopped with `LANE_NOT_ASSEMBLED` (exit 1), as recorded in `CHANGE-REQUESTS.md`.
- `node scripts/verify-ownership.mjs wt-07`: stopped with `UNOWNED_PATH:.gitignore` (exit 1) because the shared checker compares inherited F0 changes from `startCommit`; independently reviewed assignment-scoped paths and recorded the manifest mismatch.
- Official Markdown source validation: PASS, 20/20 HTTP 200 with matching Markdown MIME/title/hash records.
- `git diff --check`: PASS.

No provider connection, real send, real group mutation, account provisioning, runtime activation, receipt, or device check was performed.

Manual review: complete
