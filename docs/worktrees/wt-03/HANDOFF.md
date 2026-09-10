# WT-03 handoff

Worktree: `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/wt-03`
Branch: `photon-v3/wt-03`
Base/tag and starting HEAD: `photon-v3-f0`, `ee2f8576b55973eee312bca5cad0549b6f959a88`
Starting reflog: branch created from photon-v3-f0. Remote origin is `https://github.com/tecxbro/grokbotonimessage.git`; remote main/HEAD verified at `5c342f5eeb654b1ad7cb00e52855b425f25148ae`; no remote WT-03 branch or F0 tag. No push performed.

This handoff travels with the focused WT-03 implementation commit. Resolve its exact final SHA with `git log -1 --format=%H -- docs/worktrees/wt-03/HANDOFF.md`; the final task response records it. Pre-commit tested HEAD is F0 plus the source hashes recorded in TEST-EVIDENCE.md. Do not reset completed work to F0.

## Operation status

| Operation | Local implementation status |
| --- | --- |
| text.send | Implemented; formatted bubbles, shared child per bubble. |
| text.stream | Implemented buffered fallback; single consumption, bounded input, no progressive-delivery claim. |
| markdown.send | Implemented; public Markdown builder, prose bypass. |
| link.send | Implemented URL-only richlink; custom titles rejected. |
| content.group | Implemented for pinned provider constraints and available compilers; one opaque child. |
| content.compose | Implemented; full preflight, registered-family delegation and ordered shared children. |
| message.get | Implemented; authorized current SDK retrieval; bounded text/Markdown/link or actual metadata. |
| message.reply | Implemented; actual target and threading; no downgrade to plain send. |
| message.react | Implemented; six semantic tapbacks, actual handle and parent mapping. |
| reaction.remove | Implemented; actual principal-owned bot reaction and authorized parent required. |
| message.edit | Implemented text edits; outbound ownership, retraction and time window checked; void result. |
| message.unsend | Implemented eligible outbound unsend within window; void result. |
| message.markRead | Implemented inbound conversation mark-read; not recipient-read evidence. |

## Evidence tiers
- Built: full package typecheck and build pass with pinned TypeScript 5.9.3 / Node types 24.10.1 and Spectrum 12.8.0 on Node 24.19.0. Output is under WT-03 .photon-local.
- Tested: 40 focused tests, 65 retained WT-03 regressions, 1 foundation SDK probe and 31 existing CLI tests pass, with zero skipped tests.
- Contract-integrated: public factory registers 13 handlers into the shared registry in an offline test; public child/reference behavior is exercised using the shared services fixture.
- Product-integrated: not established. Shared verify-lane rejects WT-03; inherited offline e2e returned UNIMPLEMENTED from the unchanged executor, and WT-local-only reruns encounter the inherited UNIX socket path-length limitation. These are separately documented failures, not passing gates.
- Activated: no. Provider/live/device delivery/read: untested; no live sends, accounts, subscriptions or credentials changed.

## Remaining integration work
Register createFeatureModule with authoritative SDK handle bindings and the shared compiler registry; provide production f0-services-2 executeChild/reconciliation. Do not use the retained legacy factory as a public F0 module. Reconcile shared ownership/docs/verifier rules with the latest lane assignment and repair the inherited executor/e2e blockers outside WT-03 ownership. Other content families work only when their shared compilers are injected. Test provider-specific edit counts, recipient eligibility, partial group outcomes, native rendering and real receipt/device behavior only in a separately authorized environment.

Four original relocation-only edits remain untouched and excluded from the commit: AGENTS.md, docs/photon-features/rollout.md, docs/worktrees/worktree-map.json and docs/worktrees/wt-00/HANDOFF.md. No other worktree, main, shared contracts/dependencies/registry/host/fixtures/verifiers, archive or parent README was edited. FILES.json lists exact task files and symbols; SOURCES.md explains documented API differences and toolchain drift.
