# WT-04 handoff

## Identity and scope
Worktree: /Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/wt-04. Branch: photon-v3/wt-04. F0/original branch base and pre-commit tested HEAD: ee2f8576b55973eee312bca5cad0549b6f959a88. Origin is https://github.com/tecxbro/grokbotonimessage.git; remote main was freshly checked at 5c342f5eeb654b1ad7cb00e52855b425f25148ae, with no remote WT-04 branch. No worktree reset/switch/create/relocation or cross-lane merge occurred. The final commit hash is reported after committing, outside its own content.

Four pre-existing unstaged relocation files are preserved byte-for-byte and excluded from the commit: AGENTS.md, docs/photon-features/rollout.md, docs/worktrees/worktree-map.json and docs/worktrees/wt-00/HANDOFF.md. Initial staged and untracked sets were empty. Inherited media index/metadata/safety files and older tests were preserved; the user did not authorize changing them. FILES.json lists the exact task file set, including unchanged file-access.ts and reference snapshots.

## Four operations
All four public handlers are implemented and locally tested: attachment.send, attachment.fetch, voice.send and contact.send. Sends use executeChild and injected scoped Spectrum context; fetch publishes a guarded durable descriptor. Native metadata and source IDs survive SQLite reopen. Voice supports existing audio and an explicitly labelled ordinary-audio fallback. Contact is universal content, not native account sharing.

## Integration instructions
Integration is only /Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/wt-integration. Inject `createFeatureModule` from media/module.ts into the frozen registry; do not register legacy createMediaModule. Supply the already-owned `MediaProviderContext`, a verified voice policy and guarded `stageAttachment` callback. Bind `publicNativeMediaSource` to the same services/provider. Construct a scoped `GuardedMediaStager` with those services and assign it to `services.media`; share one host media capacity across scoped instances. Other feature consumers keep using the frozen MediaStager.resolve port.

WT-01/integration must wire atomic admission-time retainResource for every consumer and a synchronous authoritative no-consumer proof before release/cleanup. Until then resources remain pinned and cleanup is disabled by default. No extra database, provider client, registry wiring or shared contract was added. CR-04-1 describes this unresolved integration dependency. Orphan cleanup after hard process termination requires offline quiescence and remains host work.

## Evidence boundaries
Built: full workspace typecheck/build and unchanged contract digest pass. Direct lane evidence: 70 tests (34 new, 36 preserved compatibility tests) pass. Shared foundation: 65 pass. Legacy foundation: 60 pass using a short relative TMPDIR within WT-04. Original CLI: 31 pass. Full lane aggregate: BLOCKED by LANE_NOT_ASSEMBLED; ownership/docs aggregates have separately recorded baseline/inventory blockers. Independent lane ownership/source checks and manual diff review are recorded in TEST-EVIDENCE.md.

Integrated evidence is limited to controlled provider/executor fixtures and shared SQLite resource restart. Production executor integration, multi-process admission/cleanup proof, actual iMessage acceptance/delivery/read, provider audio processing, companion-byte downloads and physical-device behavior are untested. Nothing was installed as a service, activated, sent live, pushed or deployed.
