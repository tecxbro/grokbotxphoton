# WT-03 test evidence

Tested 2026-09-10 at HEAD ee2f8576b55973eee312bca5cad0549b6f959a88 plus the exact 15 owned source/test files below. Source digest: `44c5944e13b82cef8b7c6a851ccacb39e6f6a76f307c803c37eb4fc3897fded9`. All output is local; there is no activation or live delivery/read evidence.

## Toolchain and commands

Working directory: `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/wt-03`.

```sh
NODE=/Users/darshan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node
TSC=.photon-local/toolchain/typescript/bin/tsc
"$NODE" "$TSC" -p packages/photon-features/tsconfig.json --typeRoots "$PWD/.photon-local/toolchain/@types" --noEmit
"$NODE" "$TSC" -p packages/photon-features/tsconfig.json --typeRoots "$PWD/.photon-local/toolchain/@types" --outDir "$PWD/.photon-local/build"
# Inherited tests resolve fixtures relative to their emitted file location.
# Copy only fixture data into .photon-local/tests/fixtures before these runs.
TMPDIR="$PWD/.photon-local/tmp" "$NODE" --test --test-reporter=tap .photon-local/build/tests/lanes/wt-03/{unit,integration,regression,sdk-contract}.test.js
TMPDIR="$PWD/.photon-local/tmp" "$NODE" --test --test-reporter=tap .photon-local/build/tests/lanes/wt-03/{operations,recovery,streaming}.test.js
TMPDIR="$PWD/.photon-local/tmp" "$NODE" --test --test-reporter=tap .photon-local/build/tests/foundation/sdk-compatibility.test.js
"$NODE" --test --test-reporter=tap test/*.test.js
"$NODE" scripts/verify-lane.mjs wt-03
node scripts/verify-worktree.mjs wt-03
node scripts/verify-ownership.mjs wt-03
node scripts/verify-docs.mjs wt-03
```

Node 24.19.0, TypeScript 5.9.3, @types/node 24.10.1, Spectrum 12.8.0, Zod 4.5.4. The first unpinned typecheck used inherited 6.0.3 / 26.4.1 tooling and surfaced three unrelated socket-data type errors; the pinned whole-package checks pass. No dependency manifests changed.

## Results

| Check | Result |
| --- | --- |
| Whole-package pinned typecheck | Passed, exit 0 |
| Whole-package pinned build | Passed, exit 0; WT-03 .photon-local/build only |
| Four required focused suites | 40 passed, 0 failed/skipped |
| Retained WT-03 operations/recovery/streaming | 65 passed, 0 failed/skipped |
| Foundation pinned public SDK probe | 1 passed, 0 failed/skipped |
| Existing CLI | 31 passed, 0 failed/skipped |
| Independent source/assignment/protected-file/frozen-contract audit | Passed: 52 inventory files, 26 snapshots, 36 frozen files |
| Worktree verifier | Passed registered path/branch/HEAD check |
| Shared aggregate lane gate | BLOCKED: LANE_NOT_ASSEMBLED |
| Shared ownership/docs gates | BLOCKED: UNOWNED_PATH:.gitignore / FILE_INVENTORY_DRIFT |
| Inherited offline e2e | FAILED: UNIMPLEMENTED; WT-local path reruns hit socket harness EINVAL; see CHANGE-REQUESTS |

The 137 passing tests are local and offline contract evidence, not a passing aggregate product gate. The shared makeServices fixture persists child outcomes in memory for contract testing; it does not establish production crash durability. Real Spectrum runtime probes use an explicitly offline test provider with telemetry disabled. No live provider was constructed.

Manual review: complete. Owned diff, exported APIs, reference ownership, active-claim checks after awaits, void mapping, partial/unknown outcomes, stream single consumption, full voice preservation and structured bypass were reviewed. Frozen digest files remain byte-identical to F0; original relocation patch hash `e69c6362071341f7e87898c676a1ceb9eee23258c81cf7fb01b7398ab1f89075` is unchanged.

## Log identities

- `.photon-local/typecheck-final.log`: SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- `.photon-local/build-final.log`: SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- `.photon-local/focused-final.log`: SHA-256 `ecb4714dfb8e0fcb4a81fd268b18e6a31a910db73e4027fe10bf490fa0f0a22d`
- `.photon-local/retained-final.log`: SHA-256 `aee21280564c748b87a9cc19349f05ce80e250ce6ae874e682e87175c18579de`
- `.photon-local/sdk-final.log`: SHA-256 `96fde113f57fd921a556c582708dcd2dc7cfd5e534b0ea8aa239f7ed23cc0cca`
- `.photon-local/cli-final.log`: SHA-256 `d2c686827ddce18e85fc07a496274873c0f7bc1cfbaca276608741466615c543`
- `.photon-local/legacy-e2e-final.log`: SHA-256 `8d5ad7e340746dba7163ac84d5d11a955b1b9fca26a5d23ab0036ed8abad67ed`

## Tested source identities

- `packages/photon-features/src/features/text-messages/composition.ts`: `8d32e2f96444d8324b92e7770606a266a8aeb4e7e211183f9948603302b86677`
- `packages/photon-features/src/features/text-messages/edits.ts`: `9b04ed9e32a5fa99622ba10001234ca88ddc06c0e168cd354a2cb316b17db1bb`
- `packages/photon-features/src/features/text-messages/mark-read.ts`: `c1a76d1dbcf179eb5036a30298c78352d24f1af6491c69b72b2d3fa7de2df8e5`
- `packages/photon-features/src/features/text-messages/module.ts`: `14b0c64b9eb834d50798948e6bd2d07f3d817d379f07076969137fd17c84a74e`
- `packages/photon-features/src/features/text-messages/reactions.ts`: `dd0eeb462414fd02d60d2b89014deb4c8eff57440fa194c5191daaa874a23538`
- `packages/photon-features/src/features/text-messages/replies.ts`: `65740562aea7c364fd699f653380733f994b9d82ec0a86f98c016d86188f72d4`
- `packages/photon-features/src/features/text-messages/sdk.ts`: `2391b0f7a83abd8d08a5d2145dc8051a5da8d45ebefe6b1f4262dd8596ab08cb`
- `packages/photon-features/src/features/text-messages/streaming.ts`: `69d491d165ad06a4a5ef8241b5c79195592580ff971eedc0303161edde88eeb3`
- `packages/photon-features/src/features/text-messages/targets.ts`: `b877d723f506c81b168afca22beb7bba225fec3dd78305bb77939a68a462223d`
- `packages/photon-features/src/features/text-messages/text.ts`: `f141b979f39beb53a8903e37e59889c65bfa8ac92ffd6133712d6956b3ebb4f8`
- `packages/photon-features/src/features/text-messages/voice-policy.ts`: `48496f59429857cbfe9349a5d72f658155656e94ad4e1a33dd16b6f7d2d427ec`
- `packages/photon-features/tests/lanes/wt-03/integration.test.ts`: `9fc97510fcab45d7cdd14597157b46f8ee96730a21c1992ba8de595e8b7b1a37`
- `packages/photon-features/tests/lanes/wt-03/regression.test.ts`: `d90a2bed5e61bc17949954a08f48dd02dc4c4647647cf9ec16b9c060a91b02f7`
- `packages/photon-features/tests/lanes/wt-03/sdk-contract.test.ts`: `0f5976332ae3d5a66e798f653661ffe569610576c1ac5868b6d22d4b25c9b3b6`
- `packages/photon-features/tests/lanes/wt-03/unit.test.ts`: `f9db36edaae6d15a7f169a64911c9d15d9d84bc32f666d663437b0c6c0ee8c1d`

## Untested and remaining

Production public-runtime persistence/reconciliation, assembled host activation, real SDK account/line availability, provider edit-count/recipient restrictions, native rendering, hidden partial group reconciliation, crash/restart during actual provider dispatch and device delivery/read remain untested. No natural-language orchestrator, live account, receipt subscription or provider connection was modified. Shared verifier/e2e issues remain explicit blockers, not successful checks.
