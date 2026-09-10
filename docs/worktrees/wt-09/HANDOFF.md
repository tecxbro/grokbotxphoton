# WT-09 handoff

Status: independent test development and F0 execution complete; assembled-candidate execution pending.

Focused test/source/report commit: `dacae5e6626c7ec05b9c1a8f624ae342d0463004` (`test(photon): add WT-09 acceptance lane`). This commit contains only the assigned WT-09 tests, worktree documentation/reference lock, and the three assigned report files.

The integration destination is `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/wt-integration`. The integration owner must incorporate the exact focused WT-09 commit without merging feature branches into WT-09, check out an exact assembled candidate, and rerun the commands recorded here. F0 results cannot be promoted to product verification.

## Identity and preserved state

- Worktree: `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/wt-09`.
- Branch: `photon-v3/wt-09`.
- Test-development base/product SHA: `photon-v3-f0` / `ee2f8576b55973eee312bca5cad0549b6f959a88`.
- Preserved and excluded pre-existing relocation-only edits: `AGENTS.md`, `docs/photon-features/rollout.md`, `docs/worktrees/worktree-map.json`, `docs/worktrees/wt-00/HANDOFF.md`.

## Exact local commands

```sh
npx --yes -p node@24.13.0 npm ci --ignore-scripts
npx --yes -p node@24.13.0 npm run photon:build
npx --yes -p node@24.13.0 node --test --test-reporter=tap \
  packages/photon-features/dist/tests/e2e/local-roundtrip.test.js \
  packages/photon-features/dist/tests/e2e/delivery-read.test.js \
  packages/photon-features/dist/tests/e2e/poll-restart.test.js \
  packages/photon-features/dist/tests/e2e/card-restart.test.js \
  packages/photon-features/dist/tests/e2e/multipart-recovery.test.js \
  packages/photon-features/dist/tests/e2e/install-rollback.test.js \
  packages/photon-features/dist/tests/security/context-scope.test.js \
  packages/photon-features/dist/tests/security/webhook-auth.test.js \
  packages/photon-features/dist/tests/security/media-access.test.js \
  packages/photon-features/dist/tests/security/claim-fencing.test.js \
  packages/photon-features/dist/tests/live/authorized-smoke.test.js
npx --yes -p node@24.13.0 npm test
npx --yes -p node@24.13.0 npm run photon:test
npx --yes -p node@24.13.0 npm run photon:check
npx --yes -p node@24.13.0 npm pack --dry-run --json --workspace=@grokbot/photon-features
```

The owned suite result on F0 was 76 total: 71 passed, four failed, and one live-gate test skipped. The four product failures are WT09-001 `UNIMPLEMENTED`, WT09-002 `STALE_FENCE`, WT09-003 SQLite `0644`, and WT09-004 missing durable `recordReceipt`. Original CLI tests passed 31/31; inherited Photon tests passed 60/60; typing plus SDK/voice regressions passed 10/10; contract/registry/generated-skill and packaging checks passed.

## Integration-owner candidate run

1. Record the exact assembled candidate SHA and every included product/test commit before execution.
2. Confirm the candidate uses the same F0 operation/execution/receipt schemas or record the reviewed schema delta; do not adapt expected outcomes downward.
3. Run the exact commands above in `wt-integration`, preserving the four failure names until their owning fixes are present.
4. Archive raw TAP output and sanitized runtime logs. Correlate each result to candidate SHA, test commit, account/line/chat fixture identity, and evidence tier.
5. Do not mark provider acceptance, delivered/read, interaction, card rendering, or device behavior PASS without the corresponding actual observation.

The separately gated live suite requires an explicit, expiring approval file whose candidate SHA and account/line/conversation/action hashes match the environment. Credentials alone do not activate it. Missing user vote, receipt, backend/extension, restart, or device evidence remains pending/blocked.
