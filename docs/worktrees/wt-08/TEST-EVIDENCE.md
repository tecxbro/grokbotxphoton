# WT-08 test evidence

## Direct results on the working candidate

| Check | Result |
| --- | --- |
| `npx --yes node@24.13.0 node_modules/typescript/bin/tsc -p packages/photon-features/tests/lanes/wt-08/tsconfig.json --noEmit` | exit 0 |
| Full package typecheck/build with the pinned compiler | exit 0 |
| Required `unit`, `sdk-contract`, `integration`, `regression` suites | 11 passed; 0 failed/skipped/todo |
| Preserved inherited WT-08 `cli.test.js` | 6 passed; 0 failed/skipped/todo |
| Preserved inherited WT-08 `distribution.test.mjs` | 7 passed; 0 failed/skipped/todo |
| `generate-skill.mjs --check` | 44 operations; 44 canonical + 4 assigned examples; 48 files; drift true |
| `smoke-test.mjs packages/photon-features` | offline passed; activated false; liveVerified false |
| Root `npm test` | 31 passed; 0 failed/skipped/todo |
| Root `npm run photon:test` | 60 passed; 0 failed/skipped/todo |
| Root `npm run photon:check` | exit 0; F0 digest `d95caace5f188fd13b6d4d26250be1c77aafa1f42447263e5e3e7982e7e1a60f` |
| Direct WT-08 scope/source verifier | 58 task changes; 27 source hashes verified; only 4 preserved relocation changes outside scope |
| `scripts/verify-worktree.mjs wt-08` under Node 24.13.0 | passed with registered path/branch/F0 head |

The distribution suites use temporary directories/SQLite and synthetic archives. They test deterministic checksums, traversal/collision/secret refusal, inactive repeat install, owner/socket refusal, state preservation, tamper refusal, and incompatible downgrade. No assembled final archive was produced because package metadata and aggregate integration registration are intentionally shared gates.

## Shared-tool blockers, not passes

- Exact `node scripts/verify-lane.mjs wt-08`: `NODE_24_13_REQUIRED` under the system Node 23.11.0.
- Same verifier under Node 24.13.0: `LANE_NOT_ASSEMBLED`.
- `scripts/verify-ownership.mjs wt-08`: `UNOWNED_PATH:.gitignore` because it compares every lane to the pre-F0 start commit and attributes F0-owned files to WT-08.
- `scripts/verify-docs.mjs wt-08`: `FILE_INVENTORY_DRIFT` because shared ownership retains the older WT-08 layout and does not include the superseding exact files in this assignment.

These gates remain unresolved and are not represented as passing. Manual review covers the generated manual, source hashes, exact exports, package support-file inventory, diff whitespace, owned-path allowlist, and protected behavior.
