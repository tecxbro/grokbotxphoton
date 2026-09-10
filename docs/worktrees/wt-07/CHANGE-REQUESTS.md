# Change requests

## CR-WT07-001: assemble WT-07 verification support

The shared `scripts/verify-lane.mjs` currently rejects every lane except `wt-00` with `LANE_NOT_ASSEMBLED`. Integration should add lane-aware verification without weakening required tests or evidence.

Observed command: `npx -y -p node@24.13.0 node scripts/verify-lane.mjs wt-07`. Result: exit 1, exact output `LANE_NOT_ASSEMBLED`.

## CR-WT07-002: align ownership with the assigned structure

The assignment requires `packages/photon-features/src/features/native/account-contact.ts` and `reducer.ts`, but `docs/worktrees/ownership.json` does not assign either path to WT-07. It also retains the older `guards.ts`, `fixture.ts`, `native.test.ts`, `.gitignore`, and lane `tsconfig.json` layout. WT-00/integration must reconcile this shared manifest. WT-07 will implement the explicitly assigned files and verify all other owned changes independently; this shared file will not be edited here.

Observed command: `npx -y -p node@24.13.0 node scripts/verify-ownership.mjs wt-07`. Result: exit 1, exact output `UNOWNED_PATH:.gitignore`. The checker compares all changes since `foundation.startCommit` and stops on inherited F0 ownership before reaching WT-07's assigned new paths.
