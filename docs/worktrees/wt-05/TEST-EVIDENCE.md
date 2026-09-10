# WT-05 test evidence

Tested base/HEAD: `ee2f8576b55973eee312bca5cad0549b6f959a88` plus the WT-05 changes. Code-and-four-tests SHA-256: `5d18e1c6d8c521bc8c6567ea291b469825f621dd3e76ba7f26097a0055cac317`. This digest hashes sorted paths, NUL, actual bytes, NUL. Documentation and source snapshots are separately audited.

Runtime: Node 24.19.0. Compiler: packages/photon-features/node_modules/typescript/bin/tsc 5.9.3. npm ci used the unchanged lock with --ignore-scripts.

| Check | Exit | Tests passed / failed / skipped | Log SHA-256 |
| --- | --- | --- | --- |
| focused | 0 | 25 / 0 / 0 | `a6ce11eebffbaf90967835546fef4f211287ec665cef0cd07ebc22ffc46c603e` |
| typecheck | 0 | — | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| build | 0 | — | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| lane-verifier | 1 | — | `9deae2ed3c9156699f88a0b1459f1fe209f162348d05b85f5f0b03bdfba082bb` |
| worktree | 0 | — | `5f5924f9204af6a0931b908a18932163ee5adf33eb3a74f2bb66db1dca24f93d` |
| ownership | 1 | — | `54ad17419c868eee2edcd4015a45f99ff4af0ee62ab0279f8872be07cd6df42b` |
| sdk-compatibility | 0 | 1 / 0 / 0 | `b886d6625c3756cee4d7c52839271fc5a405f34cd633de35a3cd4593251368a4` |
| foundation | 0 | 65 / 0 / 0 | `b69417e55e5d1c1b3f5047cfe0064a3836713a66618a2560e3a37f972a68115c` |
| legacy-foundation | 0 | 60 / 0 / 0 | `d61dd6196f86a5c993af2bcae8bee855a13e9b24a849dc628ae692e4188bd3d1` |
| cli | 0 | 31 / 0 / 0 | `d97b76ae22b594bce69f9c7ee77c02d5db51a2e254646c37a23d29418d0f5be3` |
| schema | 0 | — | `3ed0ce51a09c8e57f07679f23b23cea37175606e0a8128923a982a9ea029f608` |
| docs | 1 | — | `8f2b3191b7727186d1ca6330cdcc6515c87ffcad8d58178f7ee74e5f54d695fa` |
| all-polls | 0 | 47 / 0 / 0 | `4333c46df5e75d6620d29b7a5480e403c1d25fd201641392caadda4487b1404c` |

## Exact commands
All commands run from the registered WT-05 root. `node` below is /Users/darshan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.

```sh
node --test --test-reporter=tap packages/photon-features/dist/tests/lanes/wt-05/unit.test.js packages/photon-features/dist/tests/lanes/wt-05/sdk-contract.test.js packages/photon-features/dist/tests/lanes/wt-05/integration.test.js packages/photon-features/dist/tests/lanes/wt-05/regression.test.js
```
```sh
node packages/photon-features/node_modules/typescript/bin/tsc -p packages/photon-features/tsconfig.json --noEmit
```
```sh
node packages/photon-features/node_modules/typescript/bin/tsc -p packages/photon-features/tsconfig.json
```
```sh
node scripts/verify-lane.mjs wt-05
```
```sh
node scripts/verify-worktree.mjs wt-05
```
```sh
node scripts/verify-ownership.mjs wt-05
```
```sh
node --test --test-reporter=tap packages/photon-features/dist/tests/foundation/sdk-compatibility.test.js
```
```sh
node --test --test-reporter=tap packages/photon-features/dist/tests/foundation/contracts.test.js packages/photon-features/dist/tests/foundation/feature-services.test.js packages/photon-features/dist/tests/foundation/ownership.test.js packages/photon-features/dist/tests/foundation/receipts.test.js packages/photon-features/dist/tests/foundation/sdk-compatibility.test.js packages/photon-features/dist/tests/foundation/verification-tools.test.js
```
```sh
node --test --test-reporter=tap packages/photon-features/dist/tests/lanes/wt-00/contracts.test.js packages/photon-features/dist/tests/lanes/wt-00/host.test.js packages/photon-features/dist/tests/lanes/wt-00/protocol.test.js packages/photon-features/dist/tests/lanes/wt-00/state.test.js
```
```sh
node --test --test-reporter=tap test/app-session.test.js test/doctor.test.js test/gateway.test.js test/release-config.test.js test/store.test.js test/url-policy.test.js
```
```sh
node scripts/generate-contracts.mjs --check
```
```sh
node scripts/verify-docs.mjs wt-05
```
```sh
node --test --test-reporter=tap packages/photon-features/dist/tests/lanes/wt-05/integration.test.js packages/photon-features/dist/tests/lanes/wt-05/operations.test.js packages/photon-features/dist/tests/lanes/wt-05/reducer.test.js packages/photon-features/dist/tests/lanes/wt-05/regression.test.js packages/photon-features/dist/tests/lanes/wt-05/sdk-contract.test.js packages/photon-features/dist/tests/lanes/wt-05/unit.test.js
```

## Scope of proof
47 total lane tests include 24 inherited compatibility tests and 23 new F0 tests; the four requested focused files contain 25 tests, including two inherited integration cases. Foundation 65, inherited F0 60 and CLI 31 also pass. The standalone SDK compatibility test is included in the 65 foundation tests; counts should not be added as unique coverage.

Foundation services provide in-memory child semantics; the SQLite close/reopen test uses the foundation store and a test-only UoW adapter. No real WT-01 executor/WT-02 ingress/wake was assembled. Mock provider returns are not actual provider acceptance, delivery, reads or user interaction. Native metadata is supplied by fixtures; no live lookup was performed.

Shared verifier failures are recorded verbatim in CHANGE-REQUESTS.md and remain failed. The independent audit validates the full lane inventory, all source bodies/hashes, exact assignment ownership, 36 unchanged foundation contract files and four preserved relocation file hashes. Runtime logs and command result JSON remain under ignored .photon-local/.

Manual review: complete. Reviewed all six source deltas, four test files, contract boundaries, comments, sources, ownership and protected behavior. No new private table access, SDK client/listener, wake or journal in F0 code. Compatibility exports remain isolated. Initial fixture failures were fixed and not hidden as shared limitations.
