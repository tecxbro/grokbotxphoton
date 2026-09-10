# WT-00 integration handoff: preflight completed; integration blocked

This current report supersedes the missing-commit statements in initial-snapshot-report.md. All nine lanes committed concurrently during preflight. WT-00 did not create, replay, merge or cherry-pick those commits. No production implementation or shared contract was changed.

## Current repository and exact inputs

- Repository: https://github.com/tecxbro/grokbotonimessage.git
- Worktree: /Users/darshan/Documents/ChatGPT/grokbotxphoton; sole worktree; branch main.
- HEAD and exact committed tree tested: `6462f518b7fdb01f90276392cdf4db8daf23afa4`. This is a lane collection, not an assembled release.
- F0: `57e40736be8a59047b776654c766fbe8bfd10c9e`.
- Contract digest: `e0f7779bc9ca3d45696e9b4e24e8579d922c8d2d7d4323c821202d8f599acbf8` (fresh check passed).
- Comparison/live remote main: `24468391b57f028b4b881ddbf71efab3a49a6f73`; 10 ahead, 0 behind.
- Dirty: existing root package.json/package-lock.json; untracked agent.md/architecthure.md; WT-00 preflight evidence/source aggregation created in this turn. Root pre-existing files verified unchanged byte-for-byte. No staged changes.
- Integration commit: none created by WT-00. Tested release commit: none. All lane commits below already exist in HEAD ancestry; none were reapplied.

| Lane | Exact included commit |
| --- | --- |
| wt-01 | `3401f87105bb480799f022a71e722c5299f6239c` |
| wt-02 | `9527ef0d80369091b6f64b727dbe319e7a8a10b0` |
| wt-03 | `0e89319cfed92daaa9ff924f91fa3127d9ce8444` |
| wt-04 | `03286139330e2a27ec5581f720e4f3d20bcd75be` |
| wt-05 | `4399a8e5ba06d4afbb128541fb792608ae8f5083` |
| wt-06 | `7b31482ad26b143c87b366a49c001a6bae030d4b` |
| wt-07 | `02c03dc625174507bd07f64bb56702528259675c` |
| wt-08 | `3afd898a8260508c7a1a915da7819dba1ab3d4da` |
| wt-09 | `6462f518b7fdb01f90276392cdf4db8daf23afa4` |

Each commit descends from actual F0, retains the same foundation record, and changes only its owned paths. Exact file lists and checks: [committed-verification.json](./committed-verification.json). These provenance/ownership checks are not full implementation review approval.

## Exact-tree verification

A plain git archive of the exact HEAD above was extracted into a temporary directory; no Git worktree/branch was created or switched. Clean committed dependency installation used Node 24.13.0 / npm 10.9.2 and disabled lifecycle scripts.

| Check | Result |
| --- | --- |
| npm ci --ignore-scripts | Passed |
| npm test | 31 passed |
| npm run photon:build | Passed |
| npm run photon:test | 60 passed |
| npm run photon:check | Passed, F0 unchanged |
| WT-09 offline tests | 74 passed, 3 failed, 1 live test skipped |
| generate-skill.mjs --check | Passed |

Exact commands, cwd, exit codes and log hashes are in committed-verification.json and committed-*.log. Earlier dirty-snapshot package dry-run passed; no final package was produced.

Runtime/package versions: Node 24.13.0; npm 10.9.2; @grokbot/photon-features 0.1.0; grok-bot-cli 0.2.2; Spectrum/core/iMessage 12.8.0; advanced-imessage 2.1.0; Zod 4.5.4; TypeScript 5.9.3; @types/node 24.10.1; node:sqlite from the selected runtime. Global toolchain unchanged.

## Release gates and corrections

- F0: passed unchanged.
- G1: failed. Production text execution returns blocked/UNIMPLEMENTED (WT09-001); one production host remains unassembled.
- G2: failed. Four poll management operations remain application UNIMPLEMENTED; missing host bindings are not provider blockers.
- G3: failed. WT09-001 text execution; WT09-002 duplicate router/poll inbox writes cause STALE_FENCE; WT09-003 database mode 0644 violates installer private-file requirement.
- G4: not reached. No clean assembled release candidate, workflow approval, package bin registration or aggregate offline integration script. No final artifact/checksum exists.
- G5: neither authorized nor performed.

WT-00 owns shared execution/request/claim contracts, inbox ownership decisions, database file creation contract, host/registry/exports/dependencies and release coordination. WT-01/03 own execution adoption; WT-02/05 own router/poll adoption; feature corrections are not reassigned by this report. Do not bypass fences, mislabel multi-call handlers single-call, relax installer permissions or convert missing application code into provider blockers.

## Produced artifacts and source evidence

- [44-operation matrix](./operation-matrix.md): all operations, owners, lane capability declarations, tests and blockers.
- [Shared source index](../../../sources/integration-preflight-2026-09-09T03-38-17Z/index.md): 567 records across ten lanes, with original JSON and Markdown preserved. All 20 copied source files match the exact observed lane commits byte-for-byte.
- [Owned-path snapshot](./owned-path-snapshot.json), initial snapshot and fresh exact-commit verification manifests/logs.
- Initial snapshot report and capture/verification scripts retained for provenance.

The capability matrix retains WT-09 attribution; all account/conversation availability remains unknown, every production binding is pending and no live success is claimed. Source records preserve fetched/discovered/read distinctions, website versus template/skill versus pinned public-type authority, and SDK versus live evidence. Conflicting access observations, absent native poll identities/sequence, card restoration limits and generic idempotency examples remain unresolved rather than upgraded.

## Configuration, installation and recovery

One real store/outbox/SDK lifecycle, production owner lock/entrypoint, resource/media/stream bindings, authoritative context/recipient/admin grants, exact scope-to-native-line mappings, durable retrieval/claim/ack and verified Grok notification/task acceptance are still required. Grok wake/continuation has no real evidence. Native polls require an approved scoped public extension and consistency protocol. Cards require actual templates/backend authentication and restoration evidence. Legacy ingress/outbox were not activated or used.

Future command forms only; there is no releasable checksum or concrete installation target:

```sh
node packages/photon-features/scripts/package.mjs /absolute/assembled-candidate /absolute/approval.json /absolute/artifacts/release.gpf.gz
node /absolute/tools/install.mjs install /absolute/release.gpf.gz <sha256> /absolute/grok-photon
node /absolute/tools/install.mjs rollback /absolute/grok-photon <previous-release-sha256> confirm-inactive
```

Keep package.mjs alongside install.mjs. Installation selects an inactive release. Rollback requires a verified inactive owner and compatible schema/codecs, preserving pending/unknown work; current tests use synthetic releases with schema 1. No activation command has been established.

Suspension stops work execution and wake progress; interrupted dispatched calls may remain unknown. SDK restart replay/cursor coverage is unverified. Durable local capture/recovery does not establish an uptime or zero-loss guarantee. No keep-awake system was introduced.

## Required authorization and ownership decision

The missing-commit issue is resolved. The remaining input is the user-authorized integration workflow for shared amendments and whether owning lanes retain their required corrections or WT-00 receives an explicit recorded reassignment. This requirement comes directly from the attached request: "Integrate only through the user-authorized workflow" and "Feature fixes remain with their owning lanes unless ownership is explicitly reassigned and recorded." No workflow approval or ownership transfer was inferred from concurrently appearing commits.

Code built: yes, exact committed collection above.
Integrated: no.
Installed and activated: no.
Live verified: no.
