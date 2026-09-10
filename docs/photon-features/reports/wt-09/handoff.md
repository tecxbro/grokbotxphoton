# WT-09 handoff

WT-09 adds 78 tests: **74 passed, 3 failed, 1 live test skipped**. Three integration defects remain. This is test preparation and seam verification against an observed dirty snapshot; it is not final assembled product verification.

## Exact provenance

Repository: https://github.com/tecxbro/grokbotonimessage.git
Checkout: `/Users/darshan/Documents/ChatGPT/grokbotxphoton/`; branch `main`.
HEAD and comparison commit: `57e40736be8a59047b776654c766fbe8bfd10c9e`.
F0: `F0`; digest `e0f7779bc9ca3d45696e9b4e24e8579d922c8d2d7d4323c821202d8f599acbf8`.
Tested snapshot digest: `e84694892ea9642967df6e63df83a4583b166b7ce152546c88cc0715b7529662`.
Exact tested candidate SHA: **not supplied / null**. Snapshot path: `/var/folders/mw/7sj15dn14z5g9zdvmmhzf1280000gn/T/wt09-snapshot-FBBYk8`.
Remote origin/main was `24468391b57f028b4b881ddbf71efab3a49a6f73`; HEAD was one commit ahead, zero behind. `ls-remote` matched the tracking SHA at capture time.
Dirty state and per-file hashes: `docs/photon-features/evidence/wt-09/2026-09-09T03-33-25-072Z/snapshot.json`. Other lanes have uncommitted code; no branch/worktree operations were performed.

## Commands and results

| Command | Result |
| --- | --- |
| `npm ci --ignore-scripts` | exit 0 |
| `npm test` | exit 0 |
| `npm run photon:build` | exit 0 |
| `npm run photon:test` | exit 0 |
| `npm run photon:check` | exit 0 |
| `/Users/darshan/.npm/_npx/cee224165f95995d/node_modules/node/bin/node --test --test-reporter=tap packages/photon-features/dist/tests/e2e/card-restart.test.js packages/photon-features/dist/tests/e2e/feature-runtime.test.js packages/photon-features/dist/tests/e2e/inbound-events.test.js packages/photon-features/dist/tests/e2e/install-rollback.test.js packages/photon-features/dist/tests/e2e/local-roundtrip.test.js packages/photon-features/dist/tests/e2e/multipart-recovery.test.js packages/photon-features/dist/tests/e2e/poll-restart.test.js packages/photon-features/dist/tests/e2e/single-ownership.test.js packages/photon-features/dist/tests/e2e/typing-lifecycle.test.js packages/photon-features/dist/tests/lanes/wt-09/sdk-and-voice.test.js packages/photon-features/dist/tests/live/authorized-smoke.test.js packages/photon-features/dist/tests/security/claim-fencing.test.js packages/photon-features/dist/tests/security/context-scope.test.js packages/photon-features/dist/tests/security/media-access.test.js packages/photon-features/dist/tests/security/webhook-auth.test.js` | exit 1 |
| `/Users/darshan/.npm/_npx/cee224165f95995d/node_modules/node/bin/node packages/photon-features/scripts/generate-skill.mjs --check` | exit 0 |
| `npm pack --dry-run --json --workspace=@grokbot/photon-features` | exit 0 |

Original repository CLI tests: 31 passed. F0 tests: 60 passed. WT-09: 78 tests, 74 passed, three required integration assertions failed, live test skipped. Build, contract drift check, generated skill/examples and npm package dry run pass. Package listing has 265 files and no test paths. Exact commands, cwd, UTC times and log hashes are in snapshot.json.

## Unresolved defects

- **WT09-001 — WT-00 integration; WT-01 and WT-03 correction:** CLI admission succeeds. Executor returns blocked / UNIMPLEMENTED with no references. Reproducer and required correction: `../../requests/wt-09/wt09-001.md`.
- **WT09-002 — WT-00 integration; WT-02 and WT-05 correction:** InboundRouter.accept throws STALE_FENCE; standalone poll reduction passes. Reproducer and required correction: `../../requests/wt-09/wt09-002.md`.
- **WT09-003 — WT-00 integration; WT-01 and WT-08 correction:** DurableSQLiteStore creates a 0644 database; group/other permission mask is decimal 36 (octal 044), whereas installer requires zero. Reproducer and required correction: `../../requests/wt-09/wt09-003.md`.

## Evidence boundaries

- **Code built:** yes, selected Node 24.13.0 / npm 10.9.2 and pinned SDK 12.8.0. Public builder compatibility passed; full upstream declaration cleanliness is not claimed.
- **Assembled integration verified:** no. Actual CLI/socket/store/executor components were exercised, and the production text-feature path fails. WT-00 host composition and exact candidate are pending.
- **Installed/activated:** no real product installation or activation. The actual installer passed clean/repeat/rollback tests with a synthetic offline archive and private fixture database; pending and unknown rows and database hash survived. Runtime-created database compatibility fails separately.
- **Live verified:** no provider calls. No provider acceptance, delivered/read receipt, incoming interaction, or device rendering evidence exists. The skipped text smoke requires exact action approval, account/line/conversation, candidate and private local host configuration. Poll verification still requires a correlated real vote; rendering requires device evidence.

All 44 operations are enumerated in operation-coverage.md/json with lane declarations, unknown provider availability, tests and blockers. Factory declarations are not independently verified runtime support. Four poll lookup/mutation operations explicitly remain unimplemented integrations, not unsupported Photon capabilities; the two typing handlers lack capability records. Additional test gaps are explicit in requirements.md.

No production implementation, shared contract/migration, dependency, registry, host wiring, other lane test, branch or worktree was edited by WT-09. Test failures have not been inverted or skipped. No corrected assembled commit has been supplied for retest.

Rerun: with Node 24.13.0 and npm 10.9.2 on PATH, `node packages/photon-features/tests/lanes/wt-09/verify.mjs`, then `node packages/photon-features/tests/lanes/wt-09/coverage.mjs`. The runner is expected to exit 1 while defects remain.
