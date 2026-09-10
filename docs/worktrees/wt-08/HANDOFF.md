# WT-08 handoff

Status: implemented and directly verified in the registered WT-08 worktree; shared aggregate gates remain open.

## Delivered

- Exact CLI exports `main`, `executeCommand`, `callRuntime`, and `formatCommandResult` with compatibility aliases and the existing authenticated Unix-socket behavior.
- Required capabilities/execute/status/doctor plus cancellation and durable work list/claim/heartbeat/ack commands.
- Registry-derived operating skill, 44 canonical operation examples, and four assigned examples; preserved voice/idempotency/retry/receipt/work/cancellation/ambiguity policy.
- Exact distribution lifecycle exports `generateSkill`, `validateExamples`, `buildPackage`, `installPackage`, `verifyInstallation`, and standalone `rollbackInstallation`.
- Inactive repeat-safe install, exact new release dependency metadata, deterministic archive/checksum/provenance rules, offline smoke, and state-preserving compatible rollback.
- Four required suites and complete lane/source/evidence documentation.

## Evidence tiers

- Built: yes. Node 24.13.0 typecheck/build and all direct WT-08 tests pass.
- Integrated runtime: no. No assembled candidate or `photon:test:integration` registration exists in this lane.
- Installed: no final package was built or installed; only temporary synthetic installer fixtures ran.
- Activated: no. Configuration remains outside this lane and smoke explicitly reports false.
- Provider accepted/delivered/read: no live/provider operation ran; all remain untested/unknown.
- Physical device: untested.

## Remaining integration work

Resolve `WT08-CR-001` through `WT08-CR-003` in shared/integration ownership, register the package bin and aggregate tests, assemble all real handlers/runtime seams, then build a final release only from the clean approved candidate. The inherited F0 registry still reports operations unimplemented until real lane modules are assembled; generated registration is not a readiness claim.

`npm ci --ignore-scripts` completed with the pinned toolchain and reported 18 moderate dependency audit findings. WT-08 did not run an automatic audit fix or change shared dependencies/lockfiles.

The four relocation-only edits present before work remain unstaged and unchanged. No main/other-worktree edit, branch operation, reset, rebase, merge, push, account action, Spectrum connection, provisioning, send, or activation occurred.
