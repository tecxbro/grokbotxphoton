# WT-08 shared change requests

## WT08-CR-001: shared verifier does not support registered WT-08

Command from the registered WT-08 root with the system `node` (23.11.0):

```text
$ node scripts/verify-lane.mjs wt-08
NODE_24_13_REQUIRED
```

Equivalent invocation with the F0-pinned Node 24.13.0:

```text
$ npx --yes node@24.13.0 scripts/verify-lane.mjs wt-08
LANE_NOT_ASSEMBLED
```

`scripts/verify-lane.mjs` has an explicit `lane !== "wt-00"` refusal and is WT-00-owned. Required shared correction: add a WT-08 mode that honors the registered path/branch, requires the four lane suites and task documentation, and retains existing no-skip/test-evidence/ownership guarantees. WT-08 will not edit or weaken the verifier and will continue direct focused checks.

## WT08-CR-002: package/bin and aggregate integration registration

`packages/photon-features/package.json` does not yet register `grok-photon`, and root metadata has no `photon:test:integration`. Both files are protected/shared. Integration must register `grok-photon: dist/src/cli/main.js` and a genuine assembled aggregate test before `buildPackage()` can emit a release. The package gate intentionally refuses this isolated lane.

## WT08-CR-003: ownership and docs tools compare against stale layout/base

The registered worktree identity check succeeds:

```text
$ npx --yes node@24.13.0 scripts/verify-worktree.mjs wt-08
{"lane":"wt-08","path":"/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/wt-08","branch":"photon-v3/wt-08","startCommit":"5c342f5eeb654b1ad7cb00e52855b425f25148ae","head":"ee2f8576b55973eee312bca5cad0549b6f959a88","dirty":true}
```

The shared ownership wrapper fails before reaching task changes:

```text
$ npx --yes node@24.13.0 scripts/verify-ownership.mjs wt-08
UNOWNED_PATH:.gitignore
```

It diffs from `foundation.startCommit` (`5c342f5…`) instead of the assigned F0 base (`ee2f8576…`), so it treats the F0 `.gitignore` and other WT-00 foundation changes as WT-08 work. Required correction: for post-F0 lanes compare against the immutable F0 commit while still including index/worktree/untracked bytes.

The shared docs wrapper then reports:

```text
$ npx --yes node@24.13.0 scripts/verify-docs.mjs wt-08
FILE_INVENTORY_DRIFT
```

The superseding assignment owns package manuals, `rollback.mjs`, four named examples, and task-local references, while shared `docs/worktrees/ownership.json` retains the older WT-08 inventory. Required correction: reconcile the shared WT-08 allowlist/docs checker with the new exact structure. WT-08 has not edited either shared verifier or ownership manifest.
