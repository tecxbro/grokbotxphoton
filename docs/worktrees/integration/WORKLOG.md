# Integration worklog

## 2026-09-10 — identity and input review

The designated worktree was initially absent, so work stopped without mutation.
After explicit authorization, created the registered worktree and branch from
`photon-v3-f0`. Verified repository origin, exact F0 resolution, clean status,
branch reflog, remote main identity, and absence of a remote integration branch.

Read root `AGENTS.md`, F0 foundation/ownership records, all nine lane HANDOFF,
FILES, TEST-EVIDENCE, and CHANGE-REQUESTS documents, the required official Photon
snapshots, the four requested Photon skills, Spectrum provider/lifecycle and
capability references, and webhook verification/retry references.

Validated each commit in `photon-v3-f0..photon-v3/wt-NN`. No changed path overlaps
exist between lane deltas. WT-01 has implementation commit `08d9ed3...` plus
documentation commit `15aa038...`; WT-09 has test/report commit `dacae5e...` plus
documentation commit `4743aa7...`. All other lanes have one reviewed commit.

Current checkpoint at commit `f343a46f2a57256b57fa372d1b10ac924e472ab6`:
WT-01, WT-02, WT-03, and WT-08 exact reviewed commits are integrated. The
integration-owned feature runtime test was migrated from the intentionally
unimplemented legacy executor to the public `f0-services-2` execution path.

The real local path now crosses CLI JSON input, authenticated Unix socket,
durable submission and claim, public `executeOperation`, the public text handler,
and an offline Spectrum `Space.send`. It records exactly one SDK-return acceptance
observation, returns one message reference, and suppresses duplicate execution.

`npm run photon:build` passes. The focused WT-01/02/03 set passes 80/80 and the
feature runtime round trip passes 1/1. The combined WT-01/02/03/08 run passes
90/91; the sole WT-08 regression rejects available Node 24.19.0 because its
installer fixture requires exact Node 24.13.0 despite the package contract
allowing `>=24.13.0 <25`. That compatibility decision remains open and explicit.

Next checkpoint: commit this working-path evidence, then integrate WT-04 through
WT-07 individually, rerunning the build and text round trip after every lane.

## 2026-09-10 — complete lane assembly and WT-09 defect closure

Integrated WT-04, WT-05, WT-06, WT-07, then both reviewed WT-09 commits. After
each feature lane, the TypeScript build and exact-once offline text round trip
passed. The first assembled WT-09 run under Node 24.19.0 passed 72/76, failed
three, and skipped the authorization-gated live case.

Kept WT-08's exact Node 24.13.0 artifact contract unchanged and reran its
installer case with that available pinned runtime; it passed. Migrated WT-09's
legacy text roundtrip to the same public `f0-services-2` seam already proven by
the working-path checkpoint. Fixed the WT-02/WT-05 composition defect by letting
a reducer return its already-durable continuation and requiring the router to
validate and adopt that exact task/scope/event binding. The router re-reads inbox
state after reduction, preventing both a stale fence and a duplicate handoff.

Focused affected tests pass 49/49. The exact 11-file WT-09 candidate suite under
Node 24.13.0 passes 75/76 with zero failures and the one deliberately disabled
live test skipped. No installation, activation, provider delivery/read, or device
behavior occurred.

## 2026-09-10 — complete surface and aggregate verification

Added the fail-closed integration composition for the actual WT-02 through WT-07
factories. It assembles exactly 44 public handlers and 12 compiler families. The
WT-07 public adapter reuses the scoped provider and journals native effects through
one stable child. The integration-owned poll compiler fills the reviewed lane's
intentional compatibility gap using the public Spectrum builder.

Added the package bin, integration export, and source-derived aggregate runner.
Under exact Node 24.13.0, `photon:test:integration` discovers 77 non-live files and
passes 755/755 tests with no failures or skips. Aggregate worktree, F0, schema,
generated-skill, ownership, docs, and package dry-run gates also pass. The package
dry-run inventories 321 files.

No real archive was produced: WT-08 correctly requires a clean committed candidate
and a genuine workflow approval bound to its SHA. Synthetic distribution fixtures
prove inactive install/reinstall/verification/rollback mechanics only. There was
no installation, activation, provider delivery/read, rendering, interaction, or
device behavior.

The first post-commit aggregate exposed a WT-08 test assumption: its dirty-candidate
guard used the current checkout, so a clean integration commit advanced to the
deliberately missing approval file instead of exercising the guard. Integration
reassigned that aggregate test and now creates a temporary isolated Git repository
with one committed and one untracked file. The production package guard was not
changed.
