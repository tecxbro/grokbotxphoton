# WT-09 test evidence

## Current identity

Test development started at F0 `ee2f8576b55973eee312bca5cad0549b6f959a88` with the pre-existing relocation-only dirty paths listed in WORKLOG. The focused test/source/report commit is `dacae5e6626c7ec05b9c1a8f624ae342d0463004`. Source retrieval completed against 28 Markdown documents. Installed SDK contract is Spectrum 12.8.0.

## Commands and results

| Evidence ID | Command | Result | Tier |
| --- | --- | --- | --- |
| E-ID-01 | Git identity, worktree, reflog, merge-base and `git fetch origin` checks | passed | repository |
| E-SRC-01 | bounded HTTPS retrieval and SHA-256 lock of official/skill Markdown | 28/28 validated | documentation |
| E-DEP-01 | `npx --yes -p node@24.13.0 npm ci --ignore-scripts` | passed; 185 packages installed | setup only |
| E-BUILD-01 | `npx --yes -p node@24.13.0 npm run photon:build` | passed | compile |
| E-OWNED-01 | exact 11-file compiled WT-09 test command in HANDOFF | 76 total: 71 passed, 4 failed, 1 skipped | F0/local |
| E-CLI-01 | `npx --yes -p node@24.13.0 npm test` | 31 passed | regression |
| E-PHOTON-01 | `npx --yes -p node@24.13.0 npm run photon:test` | 60 passed | inherited F0 fixtures |
| E-CHECK-01 | `npx --yes -p node@24.13.0 npm run photon:check` | passed; 3 schemas, 36 files, digest `d95caace...` | schema/contracts |
| E-REG-01 | compiled typing lifecycle plus SDK/voice tests | 10 passed | local/SDK fixtures |
| E-SKILL-01 | generated skill validation | passed; 44 operations/examples, drift check true | registry/example |
| E-PACK-01 | `npm pack --dry-run --json --workspace=@grokbot/photon-features` | passed; 289 entries | packaging inspection |
| E-WT-01 | `npx --yes -p node@24.13.0 node scripts/verify-worktree.mjs wt-09` | passed | repository |
| E-SHARED-01 | shared ownership/lane verification | blocked: `UNOWNED_PATH:.gitignore`; `LANE_NOT_ASSEMBLED` | shared tooling |

The four failures in E-OWNED-01 are required product failures, recorded as WT09-001 through WT09-004 in `defects.md`; they were not weakened or skipped. The one skip is the deliberately off-by-default live test. Passing F0 fixtures prove only the named local or contract tier.

## Evidence boundary

No runtime installation/activation, Photon account change, provider acceptance, delivered/read observation, real inbound vote, authenticated card backend, supported extension rendering, or physical-device behavior has occurred. F0 fixtures are not assembled-candidate evidence.
