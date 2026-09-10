# WT-01 shared prerequisite requests

## Verified assignment — 2026-09-10

Repository: `/Users/darshan/Documents/ChatGPT/grokbotonimessage/main`.
Registered lane: `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/wt-01`.
Branch: `photon-v3/wt-01`.
Recorded F0 tag resolution and starting HEAD: `ee2f8576b55973eee312bca5cad0549b6f959a88`.
The branch reflog records creation from `photon-v3-f0`; F0 versus HEAD divergence is 0/0.
Live `git ls-remote origin` confirmed main at `5c342f5eeb654b1ad7cb00e52855b425f25148ae`; the lane branch and F0 tag are not advertised remotely. Local origin/main matches that remote main. HEAD is one commit ahead of main with no commits behind.

`node scripts/verify-worktree.mjs wt-01` passed and reported dirty=true.
Pre-existing relocation edits in `AGENTS.md`, `docs/photon-features/rollout.md`,
`docs/worktrees/worktree-map.json`, and `docs/worktrees/wt-00/HANDOFF.md` are preserved.
No worktree creation, branch switch, reset, rebase, tag movement, or sibling edits occurred.

## CR-01 — Enable verification of feature lanes

Owner: WT-00 / shared verification tooling.

`scripts/verify-lane.mjs` explicitly throws `LANE_NOT_ASSEMBLED` whenever the lane is not `wt-00`, before running any lane checks. Implement the required WT-01 focused-suite verification and lane-specific reporting without weakening missing/skipped-test rejection. Actual current invocation under the available Node 24.19.0 toolchain: `PATH=/Users/darshan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH node scripts/verify-lane.mjs wt-01`; exit 1; exact output `LANE_NOT_ASSEMBLED`.

## CR-02 — Compare lane ownership against its recorded F0 base

Owner: WT-00 / shared ownership tooling.

Actual command: `node scripts/verify-ownership.mjs wt-01`.
Actual failure: `UNOWNED_PATH:.gitignore`.

`verifyOwnership()` compares against foundation.startCommit (`5c342f5eeb654b1ad7cb00e52855b425f25148ae`) for every lane. This includes inherited WT-00 foundation changes in a WT-01 ownership check even at the untouched F0 HEAD. Feature lanes need their verified assignment base. The four pre-existing relocation changes also need explicit provenance handling; WT-01 must not erase or stage them to make its check pass.

## CR-03 — Align exact inventory and documentation validation

Owner: WT-00 / shared ownership and documentation tooling.

The user's exact WT-01 assignment requires these files, absent from the committed WT-01 ownership list:

- `packages/photon-features/src/runtime/core/execution-services.ts`
- `packages/photon-features/src/runtime/core/child-journal.ts`
- `packages/photon-features/src/runtime/core/receipt-state.ts`

The user explicitly authorizes these paths; this request concerns the shared checker, not permission to implement them. The manifest instead includes inherited alternate runtime and test filenames which the user excludes from edits. Reconcile the exact inventory without requiring changes to those alternate implementations.

`scripts/verify-docs.mjs` additionally requires inventory equality against that older list and hardcodes WT-00 source-lock, snapshot locations, F0 evidence, and manual-review checks. Add lane-specific checks for the required WT-01 source records, snapshots, acceptance evidence, and tested code identity. Do not fabricate a passing F0 report for WT-01.

## Checkpoint

The original prerequisite checkpoint stopped before implementation. Work later resumed under the user's instruction to continue owned implementation despite shared verifier limits; the history above remains provenance for the pre-existing file.

## CR-04 — Reconcile assembled e2e seams outside WT-01 ownership

Owner: integration plus the named sibling lane/tool owner.

Actual command under Node 24.19.0: `node --test packages/photon-features/dist/tests/e2e/*.test.js`.
Actual summary: 29 tests, 26 pass, 3 fail, 0 skipped/todo.

1. `CLI → authenticated host → durable executor → production text feature reaches offline SDK send` expected `executor-completed` but received `blocked` with `UNIMPLEMENTED`; the provider callback was not called. The assembled test still binds the production feature through the retained legacy executor/service boundary. Integration must explicitly adapt the feature handler to WT-01's `f0-services-2` `executeOperation`/`createExecutionServices` seam; WT-01 cannot edit host wiring or the feature implementation here.
2. `real installer with explicit offline archive fixture...` fails `PINNED_NODE_REQUIRED`. The fixture metadata is hard-coded to Node `24.13.0`, while the available conforming toolchain is Node `24.19.0` and the package engine is `>=24.13.0 <25`. WT-08/shared packaging tests must either run under the exact archived runtime or define the intended compatible-version rule; WT-01 cannot change installer/package fixtures.
3. `WT-02 router and WT-05 reducer commit one correlated continuation together` fails `STALE_FENCE`. The poll reducer updates the inbox row from revision 0 to 1 inside the router transaction, then `InboundRouter.reduce` writes its earlier revision-0 snapshot of the same row and loses CAS. WT-02/WT-05/integration must establish one owner for inbox reduction or reread the row before the router update. WT-01 must not edit the inbound router or poll reducer.

These are assembled/integration checks, not failures in the owned focused suite. They remain blockers to an integrated claim.

## Current independent verification checkpoint — 2026-09-10

- Required WT-01 focused files: 15/15 pass.
- All inherited plus required WT-01 tests: 46/46 pass.
- Foundation plus WT-00 contract suites: 125/125 pass.
- Security suites: 45/45 pass.
- Existing root CLI: 31/31 pass.
- Package typecheck, build, generated-schema/contract digest check, and `git diff --check`: pass.
- Aggregate lane verifier: BLOCKED by CR-01.
- Ownership checker: BLOCKED by CR-02 (`UNOWNED_PATH:.gitignore`).
- Documentation checker: BLOCKED by CR-03 (`FILE_INVENTORY_DRIFT`).
