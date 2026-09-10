# WT-03 handoff

WT-03 is built and tested against committed F0 using Spectrum 12.8.0. This handoff records validation before the WT-03 commit; Git history identifies the committed snapshot. This lane has not been integrated into the host, installed/activated, or verified against live Photon/iMessage delivery. No SDK connection, event subscription, reasoning model, router, transport, or outbox was added to production code.

## Checkout

- Repository: https://github.com/tecxbro/grokbotonimessage
- Path: `/Users/darshan/Documents/ChatGPT/grokbotxphoton`
- Branch: `main`; the sole registered worktree was retained.
- Implementation base HEAD and F0: `57e40736be8a59047b776654c766fbe8bfd10c9e`
- Comparison commit: `57e40736be8a59047b776654c766fbe8bfd10c9e`
- F0 SHA-256 digest: `e0f7779bc9ca3d45696e9b4e24e8579d922c8d2d7d4323c821202d8f599acbf8`
- Merge-base with `origin/main`: `24468391b57f028b4b881ddbf71efab3a49a6f73`
- Remote main was checked read-only with `git ls-remote`: `24468391b57f028b4b881ddbf71efab3a49a6f73`; local HEAD is one commit ahead and zero behind. Original worktree creation base is unknown.
- Initial dirty files preserved: `package.json`, `package-lock.json`, untracked `agent.md`, `architecthure.md`. Other lanes added files concurrently; their source was not used for validation or modified.

## All 13 operation statuses

“Implemented” means the supported execution path was built and exercised in isolated tests, not activated or live verified. Account and conversation availability remain unknown.

| Operation | Status and supported behavior |
| --- | --- |
| `text.send` | Implemented: deterministic prose policy, complete-thought blank-line bubbles, one journal child per bubble. |
| `text.stream` | Implemented buffered fallback: trusted registered source, once-only consumption, 16000 code-unit/4096 chunk/30 second bounds, expiry, cancellation, then one SDK text send. Native progressive delivery is not implemented by this lane. |
| `markdown.send` | Implemented: public `markdown()` builder with structured payload preservation; cloud provider's native formatting path is verified from pinned source. |
| `link.send` | Implemented: public `richlink(url)` preview request. Custom titles explicitly unsupported; SDK return never confirms recipient preview rendering. |
| `content.group` | Implemented for pinned provider combinations: 2–8 items, at most one text/markdown, plus registered attachment/voice/contact compilers. Actual returned child handles are persisted together. Ambiguous group failures leave every child unknown. |
| `content.compose` | Implemented: 1–16 ordered leaves/groups, F0 nesting/count limits, registered compiler delegation, per-child resume. No opaque variadic send or fake single-content compose compiler. |
| `message.get` | Implemented: authoritative resource resolution plus fresh public `space.getMessage(id)`; returns serializable text/Markdown/link content, or actual public metadata and target for other content. |
| `message.reply` | Implemented: actual resolved target plus one registered leaf compiler and `message.reply`. Poll replies rejected. |
| `message.react` | Implemented: six native tapback aliases; actual returned reaction message retained and mapped durably. Unsupported target content rejected. |
| `reaction.remove` | Implemented: authorized outbound reaction handle `.unsend()`, with original parent/emoji/native metadata. Missing actual handle after restart fails unavailable. |
| `message.edit` | Implemented: owned outbound text target, scope/line/time/retraction checks, public `.edit(text(...))`. Provider enforces remaining edit-count and recipient eligibility. Void result retains existing target. |
| `message.unsend` | Implemented: owned outbound eligible target within the local time bound, public `.unsend()`. Polls/reaction-through-message/control targets rejected. Void result retains existing target. |
| `message.markRead` | Implemented: inbound target only, public `.read()`. Native iMessage marks the whole chat read. Void result retains existing target; no delivery/read observation is invented. |

The feature factory exports five single-content compilers (`text`, `markdown`, `link`, `group`, `reply`), all handlers, capability contributions and a conservative recovery codec. Production uses only public Spectrum imports and injected F0 services. Tests use shared F0 SQLite fixtures plus lane-local doubles and a no-network public Spectrum test provider.

## Verification

Exact commands, working directories, timestamps and exit codes: [validation.json](validation.json). All commands ran against a fresh artifact copy of committed F0 plus only WT-03 files. Installed pinned SDK packages and package-local pinned tooling were reused read-only. No package metadata or lockfile was changed by this lane.

| Command | Outcome |
| --- | --- |
| `npm run test:lane -- dist/tests/lanes/wt-03/*.test.js` (package cwd) | Build passed; **67 passed, 0 failed** |
| `npm run photon:test` (isolated repository root) | Build passed; **60 passed, 0 failed** |
| `npm run photon:check` (isolated repository root) | Passed; F0 digest unchanged, 71 files / 51 schemas |
| `npm test` (isolated repository root) | **31 passed, 0 failed** |

Reproduce from this repository root using `python3 docs/photon-features/evidence/wt-03/validate.py`. Set `WT03_NODE_BIN` to a directory containing Node 24.13.0 on another machine. The script checks the runtime/pins, creates a fresh temporary F0 artifact copy, copies WT-03 sources/tests/example, and writes logs only in this evidence directory. The default Node directory is the verified existing local cache. npm was 10.9.2; TypeScript 5.9.3; package-local Node types 24.10.1. Upstream declaration compatibility remains the unchanged F0 tsconfig setting.

Tests cover all operation argument fixtures, public SDK builders and dispatch semantics, structured-content preservation, voice protections, native-handle reaction removal, target boundaries, eligibility and void results, buffered stream failure/cancellation/timeout/once-only use, finite nesting/group limitations, duplicate nested poll keys, missing/invalid compilers, part-three recovery without duplication, ambiguous child/group outcomes, and stale/cancelled leases including loss after dispatch.

A preliminary whole-checkout build encountered concurrent sibling-lane compile errors. The validated result above deliberately concerns F0 + WT-03, not an aggregate runtime. No sibling dependencies have been committed into the comparison foundation; cross-lane integration tests must be rerun after that merge.

## Source mismatches and limitations

Full inventory with actual retrieval/read status, times, hashes, versions, operations and tests: [sources.json](sources.json); interpretation: [sources.md](sources.md).

- F0 permits one-item groups; the pinned public builder requires two. F0 also permits group leaf families the cloud provider rejects. Those combinations fail explicitly before provider dispatch.
- F0 link titles have no corresponding public richlink parameter. They fail explicitly rather than being dropped or reported as rendered.
- Native SDK text streaming exists, but this implementation intentionally buffers for complete voice validation and observable one-send recovery. Stream consumption is claimed before opening; failed/crashed collection cannot be blindly reopened.
- A single `ContentCompiler` cannot express ordered multi-send recovery. Compose stays in the executor. Grouped delivery is one native multipart request with child handles observable only on successful return; it is not an atomic transaction or group-chat creation.
- Markdown stays structured; native formatting is the installed provider's responsibility. Unsupported SDK send results and post-dispatch ambiguity are not promoted to success.
- Edit-count and recipient/device eligibility are not fully present in F0 metadata. The provider enforces them; ambiguous thrown errors after a call starts conservatively require reconciliation.
- Official `.md` paths were attempted and returned HTTP 403; browser fallback read several rendered pages. Unread/unavailable sources are not claimed as reviewed. Authored `.mdx.vel` templates are supplementary unpinned source, not API authority.

## Integration blockers and changed files

[Integration requests](../../requests/wt-03/integration.md) specify the required current-outbox-ID callback, trusted native scope/phone binding, shared registry compiler lookup, resource mapping and reaction-handle restoration, closed-stream consumption convention, package export and host registration. No advanced-provider extension or new listener is needed. The shared executor continues owning authorization, attempt/outbox lifecycle and result revisions.

Complete lane-owned file inventory: [changed-files.txt](changed-files.txt). Code/test/example hashes are recorded in [implementation-manifest.json](implementation-manifest.json). Existing root changes and concurrent lane files are outside this inventory and were preserved.
