# WT-05 shared changes required for the complete poll workflow

Status: requested, not approved or implemented. Foundation F0 at `57e40736be8a59047b776654c766fbe8bfd10c9e`; digest `e0f7779bc9ca3d45696e9b4e24e8579d922c8d2d7d4323c821202d8f599acbf8`.

## WT-00: approve and supply the public advanced poll seam

Blocker ID: `wt-05-advanced-polls`. `ExecutionServices` exposes `ResourceResolver.space/message`, with no native poll lookup/mutation. `approvedAdvancedExtensions` is empty. Spectrum 12.8.0 exposes poll creation through `space.send(poll(...))`; its public poll and choice types contain labels, not native identifiers. `getMessage` cannot substitute for authoritative poll state. No private client, new connection, SDK subscription, dependency, or host change was introduced by WT-05.

Approve a **scoped host-owned** extension backed by the existing authenticated `@photon-ai/advanced-imessage` **2.1.0** public `AdvancedIMessage['polls']` contract. The existing host must supply it for the exact authorized project/account/line. Required public calls, already compile-probed in WT-05 tests:

```ts
polls.get(nativePollGuid)
polls.vote(nativePollGuid, nativeOptionIdentifier)
polls.unvote(nativePollGuid)
polls.addOption(nativePollGuid, text)
```

Return a serializable, scoped snapshot containing native poll GUID, native chat GUID, title, native option IDs/text, participant address/service and current selections. Preserve source sequence/revision or explicitly mark it absent. A snapshot alone has no event-log cursor in 2.1.0's `Poll` type: define an approved reconciliation consistency protocol before letting snapshots overwrite concurrent event state. Query outside the UnitOfWork, then validate a local revision fence and any provider ordering evidence in the commit transaction. A local fence alone is not proof of a server snapshot's position in its event log.

Native API votes are the authenticated account's votes only. `unvote` takes **no option argument** and removes that account's selection; F0's action schema includes an option reference. Decide its precondition: resolve the bot's actual current selection and reject an unrelated option (or revise the action contract). Do not implement unvote by passing the option ID as the second SDK argument. `vote` may replace the bot's previous selection; use the returned native state, with the consistency protocol above, rather than guessing a removed choice.

The public advanced APIs also declare optional `IdempotencyOptions`. No such option is exposed by Spectrum's send seam. If retry support is approved, probe exact `clientMessageId` behavior and timeout/outcome lookup on the host-owned extension before changing the current no-resend rule. Do not reinterpret generic recovery documentation's `clientGuid` example as a Spectrum send parameter.

## WT-00 / WT-01: request pointer and indexed lookup

Add an authoritative claimed request/outbox ID to `ExecutionServices` (or an equivalent checked request lookup service). WT-05 currently matches the unique row by principal + full scope + task + generation + idempotency key, then checks its full action and claim. This uses F0's bounded `list` and refuses saturation at 1000 rows. A shared request pointer would remove scanning and align the request ID without relying on WT-01's hash serialization.

Add indexed scoped reference lookup by `(kind, providerId, project, provider, account, line, conversation)`, and keyset pagination for inbox/unresolved recovery. Current poll correlation/reconciliation refuses saturated 1000-row lists rather than silently processing a truncated set. Confirm `contexts.id === contextId` and `tasks.id === taskId`, or supply authoritative lookup methods. WT-05 does not edit shared store tables or migrations.

## WT-00 / WT-02: normalized poll evidence

F0 poll events require actor, poll reference and option reference and carry only `change`. They cannot express a missing actor, full native option metadata, authoritative selection snapshots, or selection replacement semantics. Extend the contract or define the approved native-state normalization route before integration:

- Persist stable source/account/line event identity, native poll GUID, native chat GUID, native option identifier, and sequence when present. Never parse Spectrum composite message IDs as an undocumented identity protocol.
- Preserve unknown actors as quarantined unresolved data. Do not synthesize a bot, sentinel, or another participant's identity to satisfy required `actorId`.
- Route target-less Spectrum `poll_option` content to unresolved storage. Labels and the current chat's most recent poll cannot identify the native target.
- Carry option-added metadata from an approved native event/state lookup. Use `registerAndReconcilePollOptions` to commit option registration and any resulting pending-event continuations together.
- The reducer can apply independent per-option deltas only when the host explicitly verifies that semantics. Its default is unknown. Do not mark raw native single-choice replacement events as independent multi-select deltas merely because they have a sequence. Missing or incomparable ordering remains unresolved pending authoritative reconciliation.
- Configure an ordered source only when sequence scope and monotonicity have been verified. Preserve the ordering source alongside the sequence; never substitute `receivedAt`.
- Ensure the shared router does not create a second generic handoff for a poll event. WT-05's reducer already writes the originating task handoff in that transaction. Wake only after commit through the shared dispatcher.

## WT-03 / WT-08 / host integration

Register `createPollModule` once through aggregate composition when approved. Do not treat registry handler presence as implementation: four handlers deliberately return `blocked/UNIMPLEMENTED`. Keep the complete interactive workflow out of Grok's advertised capability set while native identity/state lookup or active vote ingress is absent. Creation remains implemented independently. The documented webhook delivery page currently excludes poll votes; a provider-accepted poll cannot upgrade ingress evidence.

Nested poll content needs the same originating task/message/native-option registration; WT-05 does not install a compiler that would silently bypass durable registration. Coordinate WT-03 child references/checkpoints before advertising nested-poll continuation.

## Integration acceptance

`packages/photon-features/tests/lanes/wt-05/integration-contract.ts` exports `registerPollIntegrationContract(label, factory)`. Supply WT-01's independent temporary real store, WT-02's actual normalized `accept`, an injected before-commit failure, and cleanup. The default run uses the F0 transactional fixture and is **not** real WT-01/WT-02 integration evidence. Rerun the full lane matrix after the approved extension and normalization are implemented. A live test requires an authorized real user's vote correlated to the actual originating task; none was sent or received in this work.
