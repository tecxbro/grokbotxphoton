# WT-09 change requests

## CR-WT09-001 - shared ownership manifest is stale for the assigned structure

Owner: WT-00/shared verification owner.

The assignment owns `packages/photon-features/tests/e2e/delivery-read.test.ts` and the three reports `defects.md`, `operation-coverage.json`, and `verification-summary.md`. `docs/worktrees/ownership.json` does not list the new delivery test or any report paths and still lists older WT-09-only files outside the exact assignment. WT-09 will not edit the shared manifest. Update the manifest/checker before using `verify-ownership.mjs wt-09` as a lane gate.

Observed command/result on F0 `ee2f8576b55973eee312bca5cad0549b6f959a88`:

```text
$ npx --yes -p node@24.13.0 node scripts/verify-ownership.mjs wt-09
Error: UNOWNED_PATH:.gitignore
```

The checker compares this worktree with the stale foundation start commit `5c342f5eeb654b1ad7cb00e52855b425f25148ae`, so inherited F0 changes are misclassified before the task-owned additions are evaluated.

## CR-WT09-002 - shared lane verifier rejects every non-WT-00 lane

Owner: WT-00/shared verification owner.

`scripts/verify-lane.mjs` contains `if(lane!=="wt-00") throw new Error("LANE_NOT_ASSEMBLED")`. This is an explicit shared-tool BLOCKED result, not a WT-09 test failure. Provide an ownership-aware WT-09 mode that preserves relocation-only edits and runs the exact assigned test list.

Observed command/result:

```text
$ npx --yes -p node@24.13.0 node scripts/verify-lane.mjs wt-09
Error: LANE_NOT_ASSEMBLED
```

Exact Node 24.13.0 execution is available through `npx` and is not a current blocker.
