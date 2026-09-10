# WT-09 verification summary

Status: independent test development complete; F0 product acceptance failed on four required gaps; assembled-candidate verification pending.

Test/source/report commit: `dacae5e6626c7ec05b9c1a8f624ae342d0463004`; product SHA under test: `ee2f8576b55973eee312bca5cad0549b6f959a88`.

Proven here: registered worktree/branch/F0 identity, 28-source lock, Spectrum 12.8.0 declaration compatibility, compilation, 71 owned local/fixture assertions, 31 original CLI regressions, 60 inherited Photon tests, ten typing/SDK/voice regressions, all-44 registry/example validation, and package dry-run inspection.

Required F0 failures: durable text execution is `UNIMPLEMENTED` (WT09-001), poll ingress hits `STALE_FENCE` (WT09-002), SQLite opens as `0644` (WT09-003), and the runtime store has no durable `recordReceipt` acquisition API (WT09-004). The live gate skipped by design.

Shared-tool blockers are separate: ownership verification compares against a stale base and stops at `UNOWNED_PATH:.gitignore`; lane verification rejects WT-09 as `LANE_NOT_ASSEMBLED`.

Not proven: an assembled candidate, runtime activation, provider acceptance, delivered/read observations, user interactions, app extension/backend behavior, or device rendering. Integration must incorporate the focused WT-09 commits and rerun the exact commands in HANDOFF against an identified candidate.
