# Standalone product separation

This change corrects the initial whole-repository copy into `tecxbro/grokbotxphoton`. The new repository now contains the Photon product developed in WT-00 through WT-09.

## Scope

Retained: `packages/photon-features/` implementations, tests, schemas, CLI, operating skill, examples and tooling; `docs/photon-features/` contracts and historical evidence; working/architecture guides; the original license notice.

Removed from the current tree: the former root Grok Bot CLI (`src/`), its `test/` suite, CLI demo media, CLI changelog, Changesets configuration/dependencies, Renovate configuration, CLI package smoke workflow and npm publishing workflow.

Replaced the root manifest with a private `grokbotxphoton` workspace at version 0.1.0, using Node 24.13.0/npm 10.9.2 and the existing pinned feature-package dependencies. No root `gbot`/`grok-bot` executable or CLI runtime dependency remains. The package lock was regenerated and a clean dependency install passed with lifecycle scripts disabled.

The root README and working guides describe the new product. Active packaging approval URLs now target `tecxbro/grokbotxphoton`. The WT-09 runner labels its root tests as product foundation tests. Source records, historical snapshots, old commit references and original test logs retain their original provenance. Existing Git history is retained; this is a normal commit removing the inherited CLI from the current tree.

The external Grok task/wake interface remains part of the new product's intended integration contract. It does not bundle the old CLI or establish a functioning live wake connection.

## Validation

- `npm ci --ignore-scripts`: passed in the standalone checkout.
- `npm test`: 60 foundation tests passed.
- `npm run check`: build and F0 digest check passed; digest unchanged.
- Generated skill: 44 examples validated; no drift.
- Offline CLI smoke: passed, no host/provider calls.
- Compiled WT-01 through WT-08 lane tests: 334 passed.
- WT-08 source distribution tests: 7 passed against temporary synthetic releases.
- `npm run test:verification`: still fails on WT09-001, WT09-002 and WT09-003. Product separation does not fix those defects.

Exact command arguments, test log hashes and toolchain: [validation.json](evidence/wt-00/product-separation/validation.json).

No final release artifact, production installation, activation, live messaging or account changes were performed. CI covers foundation/build/schema/skill/offline smoke checks; it does not claim full integration acceptance. The original CLI repository and checkout were not changed by this separation.
