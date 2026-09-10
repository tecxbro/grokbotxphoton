# WT-01 handoff

## Current evidence tier

- Built: yes. All assigned production entry points compile against the frozen F0 contracts and pinned dependency graph.
- Independently verified: yes. Required focused tests pass 15/15; all WT-01 tests pass 46/46; foundation+WT-00, security, root CLI, typecheck, build, and contract-generation checks pass. These are local/offline results only.
- Integrated: no. Integration belongs only in `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/wt-integration`.
- Installed/activated: no. `npm ci` is local test setup, not runtime installation or activation.
- Live verified: no provider call, delivery/read receipt, line, account, or physical-device test occurred.

Starting F0: `ee2f8576b55973eee312bca5cad0549b6f959a88` (`f0-services-2`, contract digest `d95caace5f188fd13b6d4d26250be1c77aafa1f42447263e5e3e7982e7e1a60f`). Tested implementation commit: `08d9ed396e1b18b0bd5edfcc866c7dde0518c006`. The final HEAD adds only this evidence update to that tested implementation.

The shared aggregate gate is unresolved: `verify-lane` returns `LANE_NOT_ASSEMBLED`; ownership returns `UNOWNED_PATH:.gitignore`; documentation returns `FILE_INVENTORY_DRIFT`; assembled E2E has three out-of-lane failures. `CHANGE-REQUESTS.md` preserves exact causes and required shared corrections. No owned failure is classified as a shared blocker.

Protected relocation-only edits remain unstaged and must not be included in a WT-01 commit: root `AGENTS.md`, `docs/photon-features/rollout.md`, `docs/worktrees/worktree-map.json`, and `docs/worktrees/wt-00/HANDOFF.md`.
