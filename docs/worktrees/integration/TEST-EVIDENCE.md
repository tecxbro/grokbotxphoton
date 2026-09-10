# Integration test evidence

## Baseline checkpoint

- Worktree registration: PASS at the exact requested path.
- Branch: `photon-v3/integration`.
- Starting HEAD/F0: `ee2f8576b55973eee312bca5cad0549b6f959a88`.
- Initial status: clean; no staged, unstaged, untracked, or relocation-only files.
- Origin: `https://github.com/tecxbro/grokbotonimessage.git`.
- Remote main: `5c342f5eeb654b1ad7cb00e52855b425f25148ae`, matching local `origin/main` at inspection.
- Remote integration branch/F0 tag: not advertised at inspection.
- Lane commit ancestry/path review: PASS; all selected commits descend directly from F0 and lane deltas do not overlap one another.

## Working-path checkpoint

Runtime: bundled Node 24.19.0 and npm 10.9.2. Dependencies were installed with
`npm ci --ignore-scripts --no-audit --no-fund`; tracked files were unchanged.

- `npm run photon:build`: PASS.
- `node --test packages/photon-features/dist/tests/e2e/feature-runtime.test.js`:
  PASS, 1/1, no skips. The offline Spectrum send is invoked once and only once.
- Focused compiled WT-01/02/03 lane suites: PASS, 80/80, no skips.
- Focused compiled WT-01/02/03/08 lane suites: 90/91 PASS, no skips. The sole
  failure is WT-08 `PINNED_NODE_REQUIRED`: the synthetic installed artifact pins
  exact Node 24.13.0 while the candidate runs package-supported Node 24.19.0.

The passing round trip is candidate-local/offline evidence: CLI input,
authenticated socket, durable persistence/claim, public F0 execution, public text
handler, and offline Spectrum SDK acceptance. It does not prove installation,
activation, remote provider acceptance, delivery, read, rendering, or device behavior.

## Assembled WT-09 checkpoint

- Build and text roundtrip after each of WT-04, WT-05, WT-06, and WT-07: PASS.
- First complete-lane WT-09 run on Node 24.19.0: 72/76 pass, 3 fail, 1 authorized-live skip.
  Durable receipt recording and private SQLite file modes already passed.
- Pinned runtime check: `npx --yes -p node@24.13.0 node --version` returned
  `v24.13.0`; WT-08's exact tested-artifact toolchain was preserved.
- Focused local-roundtrip, poll composition, installer, and affected WT-02/WT-05
  regressions under Node 24.13.0: PASS, 49/49, no skips.
- Exact WT-09 11-file assembled suite under Node 24.13.0: PASS, 75 passed,
  0 failed, 1 skipped. The skip is the off-by-default authorized live test and is
  not counted as live evidence.

The three closed candidate failures were the legacy executor in WT-09's text
test, duplicate/stale-fenced poll continuation composition, and running an exact
Node 24.13 artifact fixture with a different Node runtime. No assertions were
weakened: text now requires SDK-return acceptance, the poll path requires exactly
one validated durable handoff, and the installer still enforces the pinned runtime.

## Complete surface checkpoint

- Actual WT-02 through WT-07 factories assemble exactly 44 public handlers with
  no missing or duplicate owner, plus all 12 shared compiler families including
  integration's public-SDK poll compiler: PASS, 2/2 assembly tests.
- `npm run photon:test:integration` under Node 24.13.0: PASS, 77 test files,
  755 tests, 0 failed, 0 skipped. The live directory is excluded explicitly
  because no live authorization was granted; it is not silently counted as PASS.
- The public WT-07 adapter reuses its injected scoped provider and sends native
  effects only through `ExecutionServices.executeChild`; construction remains inert.

This checkpoint does not prove installation or activation, and it does not prove
provider delivery/read, extension rendering, human interaction, or device behavior.
