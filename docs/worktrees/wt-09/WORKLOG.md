# WT-09 worklog

## 2026-09-10 - identity and source gate

- Registered path: `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/wt-09`.
- Branch: `photon-v3/wt-09`.
- Starting HEAD and `photon-v3-f0`: `ee2f8576b55973eee312bca5cad0549b6f959a88`.
- F0 contract: `f0-services-2`; digest `d95caace5f188fd13b6d4d26250be1c77aafa1f42447263e5e3e7982e7e1a60f`.
- Origin: `https://github.com/tecxbro/grokbotonimessage.git`; fetched `origin/main` is `5c342f5eeb654b1ad7cb00e52855b425f25148ae`, matching local `main` with divergence `0 0`.
- Reflog begins at F0 and current HEAD equals F0; no legitimate WT-09 development commit was present to preserve.
- Pre-existing staged: none. Pre-existing untracked: none. Pre-existing unstaged relocation-only edits: `AGENTS.md`, `docs/photon-features/rollout.md`, `docs/worktrees/worktree-map.json`, and `docs/worktrees/wt-00/HANDOFF.md`. They remain out of scope and untouched.
- No submodules or nested `.git` directories were found.
- Retrieved and hashed 20 official Markdown sources and 8 remote skill sources into `references/`; all returned validated Markdown.
- Installed dependencies initially under the shell's Node 23.11.0, then repeated the clean install and every authoritative check with exact Node 24.13.0 through `npx --yes -p node@24.13.0`.

## 2026-09-10 - implementation checkpoint

- Added the missing delivery/read ledger acceptance suite, including early and duplicate receipts, exact part/line/chat correlation, read/delivery independence, stale snapshot monotonicity, group ambiguity, restart, no-reply routing, mark-read separation, and reconcile-first unknown sends.
- Extended the real local roundtrip to require CLI JSON over a real Unix socket, production authorization, the durable executor, the production text feature module, one outbox, and one offline provider-adapter send. F0 correctly fails at its required `UNIMPLEMENTED` product boundary.
- Extended poll restart, multipart structured-content, claim-key conflict, webhook duplicate/capture-failure, and media interruption/timeout acceptance cases.
- Replaced the live gate with exact candidate/account/line/conversation/action approval. The allowed actions cover typing, poll create/vote, reply, reaction, media, card send/update, restart and receipt observations; it stays skipped without an explicit approval file.
- Locked 28/28 assigned Markdown sources and recorded Spectrum 12.8.0 declaration hashes.

## 2026-09-10 - verification checkpoint

- `photon:build`, `photon:check`, original CLI tests, inherited Photon tests, typing/SDK/voice regressions, generated-skill validation, and package dry-run passed with exact Node 24.13.0.
- The 11-file owned suite ran 76 tests: 71 passed, four failed as required product defects, and the live gate skipped once. Failures are `WT09-001` (durable text path `UNIMPLEMENTED`), `WT09-002` (router/poll reducer `STALE_FENCE`), `WT09-003` (SQLite file mode `0644`), and `WT09-004` (no durable runtime `recordReceipt`).
- Shared ownership verification is blocked by stale-base classification (`UNOWNED_PATH:.gitignore`); the shared lane verifier rejects WT-09 with `LANE_NOT_ASSEMBLED`. These are recorded in CHANGE-REQUESTS and are distinct from the four product failures.
- No live account, provider, user, extension, or device action was attempted.
