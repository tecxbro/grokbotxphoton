# WT-05 shared change requests
## CR-05-01 native management and lookup
F0 contracts/execution.ts has approvedAdvancedExtensions=[]; contracts/transport.ts ProviderContext has only scope/lifecycle. Approve a typed shared-owner public advanced poll seam before enabling get/vote/unvote/addOption or native identity lookup. Do not create another client. Reconcile action poll.unvote's required option against public polls.unvote(pollMessageGuid) clearing the bot selection. Native vote never accepts a participant identity.
## CR-05-02 ingress and durable unresolved work
UnitOfWork intentionally has no inbox/unresolved/list API. Shared ingress must persist normalized early/ambiguous events, retain original task routing, supply a bounded durable batch and atomically acknowledge dispositions after reducer success. Poll event requires option/actor but has no display text; unknown actor and unvote-all need honest normalization/native state, never sentinels. Runtime must deduplicate createContinuation and wake only after commit.
## CR-05-03 verification tooling
Inspection: verify-lane.mjs refuses every lane except wt-00 with LANE_NOT_ASSEMBLED; verify-docs.mjs hardcodes WT-00 source paths, eight F0 cases and report. Execute exact commands and record output after implementation. Shared owners must generalize lane checks; WT-05 will not change those files.

## Executed verifier evidence
All Node commands below used Node 24.19.0 via PATH=/Users/darshan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH.

| Exact command | Exit / exact output | Affected gate / required shared correction |
| --- | --- | --- |
| node scripts/verify-lane.mjs wt-05 | 1: `LANE_NOT_ASSEMBLED` | Dispatch supports WT-00 only; add WT-05 focused suites and lane semantics. |
| node scripts/verify-ownership.mjs wt-05 | 1: `UNOWNED_PATH:.gitignore` | Compares all changes since startCommit 5c342f5, including committed F0 foundation changes; use the lane's F0 base and preserve pre-existing relocation deltas. .gitignore was not edited by WT-05. |
| node scripts/verify-docs.mjs wt-05 | 1: `ENOENT: no such file or directory, open '/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/wt-05/.photon-local/verification.json'` | Requires the WT-00-only verification report and WT-00 source/evidence paths. Accept per-lane reports and validate this lane's snapshots/cases. No F0 report was fabricated. |
| node scripts/verify-worktree.mjs wt-05 | 0: registered WT-05 path/branch, HEAD ee2f8576, dirty=true | Real identity passes with preserved relocation map. Independent reflog/base check also passes. |

An initial owned FILE_INVENTORY_DRIFT was fixed by listing all authoritative lane inventory entries, including unchanged inherited artifacts. It is not treated as a shared blocker. New snapshots are listed separately. The shared source validator hardcodes snapshot roots under docs/photon/reference and wt-00/references; WT-05 instead independently runs validateDocument and SHA-256 checks against all 15 lane snapshots. Root TypeScript 6.0.3 is not the pinned workspace 5.9.3; shared runners should resolve the workspace compiler.

Independent audit uses the real F0 base and excludes only the four pre-existing files after byte-for-byte hash validation. It passes all 36 assigned changes and 36 unchanged foundation digest files. These passes do not change failed shared gate statuses.

The generic unresolved event only carries a quarantine pointer; WT-02 must recover retained raw data and re-normalize it when native identity becomes available. retryUnresolvedPollEvents consumes already-normalized poll events; it is not a substitute for durable capture or quarantine storage. Registry/host do not yet register the new reducer path. Integration must call applyPollEvent inside the original task's authorized UnitOfWork, persist disposition in that transaction, and wake after commit.
