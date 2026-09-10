---
name: grok-photon
description: Operate the installed Grok Photon messaging executable using scoped capabilities and durable work handoffs.
---

# Operate Grok Photon

Use the existing executable for messaging operations. Map normal English to a supported operation. Keep CLI syntax, JSON, local paths and internal errors out of the iMessage conversation. Do not write SDK integration code or build missing features during operation. The persistent runtime owns cloud iMessage, credentials, resources and the outbox. Never start another Spectrum client.

## Invocation and identity

The task launcher supplies `GROK_PHOTON_CONTEXT_ID`, `GROK_PHOTON_SOCKET` (absolute Unix socket path), and `GROK_PHOTON_CREDENTIAL_FILE` (absolute owner-owned 0600 file in a 0700 directory). The last is a local authentication credential, never a Photon SDK session. Do not print it or pass its contents in arguments. The socket's directory must also be owner-owned 0700. Parent directories must be administrator-controlled. Same-OS-user processes share a trust domain.

Use these exact commands:

```sh
grok-photon capabilities --json
grok-photon doctor --json
grok-photon execute --json-stdin < action.json
grok-photon status --request-id request-1 --json
grok-photon cancel --request-id request-1 --json
grok-photon work.list --limit 20 --json
grok-photon work.claim --handoff-id handoff-1 --lease-ms 30000 --json
grok-photon work.heartbeat --handoff-id handoff-1 --fence 1 --lease-ms 30000 --json
grok-photon work.ack --handoff-id handoff-1 --fence 1 --json
```

The numbers and IDs above are illustrative; use the returned handoff claim fence, actual request ID and current task grant. Lease range is 1000–60000 ms, list range 1–100 (default 20). No recipient, principal, generation, token or context override flags exist. The host authenticates every command, including status and discovery. Context IDs are lookup keys, not authority.

`execute` reads one complete strict JSON action until stdin EOF. Its only top-level fields are `version: 1`, `idempotencyKey`, `contextId`, `operation`, `arguments`. Use the exact shared schema and generated example for the chosen operation below. Replace fixture identities with authorized task resources. The action context must match the launcher context. No extra fields, executable code or raw provider dictionaries are accepted. Input is bounded to 262144 UTF-8 bytes; the complete authenticated frame must also fit that limit. All commands return one JSON line on stdout; diagnostics are on stderr. Successful responses are `{version:1,ok:true,result:...}`; failures are `{version:1,ok:false,error:{code,...}}`.

Exit codes: 0 means a successful protocol response with no reported adverse outcome, including queued work; 2 means invalid arguments, JSON or configuration; 3 means host unavailable/not ready; 4 means credential/context authorization failure; 5 means operation blocked/failed/cancelled/unknown or other runtime error; 6 means uncertain transport or invalid host response. Never equate exit 0 with a delivered message. A nonzero doctor exit can still include a valid read-only diagnostic result.

## Discovery, resources and targets

Read scoped capabilities before choosing an operation. Check implementation, account and conversation availability, provider support, blockers and evidence tier separately. Unimplemented, unavailable or unknown support is not permission to attempt a substitute. Only use a documented fallback reported by the runtime and acceptable to the user's intent. A warn-and-skip or accepted no-op does not prove an effect.

Resolve people and conversations through existing task context and persisted resource references. Do not invent reference IDs or scopes from phone numbers, names or raw strings. References contain `version`, `kind`, `id`, `scope` and kind-specific parent IDs. The host revalidates scope, ownership, parent identity and generation. If the target is ambiguous, ask one short clarification question. A newly created space requires a new scoped context before follow-up operations. Media must use host-staged bytes or authorized attachment references; stream/template/codec IDs must already be registered. If the task lacks a resource or grant, report the blocker through the existing orchestrator.

Keep a stable idempotency key for the same intended action and identical arguments. Persist it with the host-returned request ID. Never change the key just to bypass an error. Reusing a key with changed arguments is an idempotency conflict. Scope/task/generation are also part of runtime identity; a new generation must be resolved by the orchestrator.

Four concise, schema-validated starting points are [create a poll](examples/wt-08/create-poll.json), [reply](examples/wt-08/reply.json), [send a voice note](examples/wt-08/send-voice.json), and [update an app card](examples/wt-08/update-card.json). They are generated from the same canonical fixtures/parser as the complete operation inventory below. Fixture IDs are examples, never target authority.

## Work after a wake

A wake is only a notification. Retrieve `work.list`, claim a returned handoff, and consume the actual persisted typed `events` in the claim response. Persist task acceptance idempotently by handoff ID through the existing Grok task handoff before acknowledging. Heartbeat within the lease using the exact returned fence while accepting work. `work.ack` means the task accepted responsibility, not that outbound messaging finished. Never ack work you have not accepted durably.

An expired lease requires a new claim and its new fence. Stop using stale fences, revoked/expired contexts or stale generations. Do not invent replacement contexts. Already acknowledged/cancelled work cannot be claimed. On uncertain ack, consult durable task acceptance and work state through the existing orchestrator; do not repeat the task side effect. Work may already be absent from the available list after acknowledgement.

## Outcomes and retries

- `queued`: persisted for execution, not sent.
- `executor-completed`: executor completed, possibly a void call; not delivery evidence.
- `provider-accepted`: explicit provider acceptance evidence.
- `observed-delivered` and `observed-read`: separately correlated delivery/read observations.
- `blocked`: inspect the blocker; retry only after revalidation and explicit safe-before-dispatch classification.
- `failed`: report the failure. Follow the typed retry classification; never blindly resend.
- `cancelled`: no further work is allowed for this request; cancellation cannot undo a side effect already dispatched.
- `unknown-outcome`: reconcile first. Do not send again or create a replacement key.

Transport timeout/disconnect after writing may hide a successful submission. Query known request status or reconcile the stable identity through the runtime; do not automatically resend. Local request IDs in protocol errors can be diagnostic correlation IDs, not submitted operation IDs. `never` prohibits retry; `safe-before-dispatch` is conditional on current authorization and the runtime's dispatch state; `reconcile-first` requires outcome reconciliation. Cancellation racing dispatch can produce unknown-outcome. Missing receipts remain unknown. Do not claim cancellation retracted a message.

## Voice

Preserve any fuller installed voice policy; this manual supplies baseline guidance and never replaces it. Use natural lowercase while preserving names, acronyms, code, URLs and paths. Aim for roughly 120 characters per intended bubble, preferably below 150. Separate complete thoughts with blank lines. Never split sentences, URLs, code, commands or paths arbitrarily to meet a length target. Ask one short question per turn. Avoid em dashes. Sound like a friend, not customer support. Structured content bypasses prose formatting. The runtime's WT-03 formatter owns formatting behavior.

## Generated operations

<!-- BEGIN GENERATED OPERATIONS -->

Generated from the shared registry, strict action schemas and validated F0 fixtures. Registration does not prove runtime support. Discover current scoped capabilities before execution.

| Operation | Owner | Registration | Shape | Invocation payload | Schema SHA-256 |
| --- | --- | --- | --- | --- | --- |
| typing.begin | wt-02 | unimplemented | [schema](schemas/typing.begin.json) | [example](examples/wt-08/typing.begin.json) | 2eac56750971175336e2a8520c30ea9b062f37c0f12dcc2ff8be7b8d4196ace7 |
| typing.end | wt-02 | unimplemented | [schema](schemas/typing.end.json) | [example](examples/wt-08/typing.end.json) | 2b50ec0b1ae6f81389312c0189df294aedb6e8bf76ee4a1fd86e812a9267c974 |
| text.send | wt-03 | unimplemented | [schema](schemas/text.send.json) | [example](examples/wt-08/text.send.json) | 3cf8a080b0a1f01c40d40ebffb4aeb6697780fbad1704c14d0eef345ad33d646 |
| text.stream | wt-03 | unimplemented | [schema](schemas/text.stream.json) | [example](examples/wt-08/text.stream.json) | eb4e0ae99f352c5be5acbf3081dcd1765076c3d1a9980ee8bc88cea4b2ac1b68 |
| markdown.send | wt-03 | unimplemented | [schema](schemas/markdown.send.json) | [example](examples/wt-08/markdown.send.json) | f768e62107de269a214d37f841dbc0455ea0191176f65df5c782ff2bce105172 |
| link.send | wt-03 | unimplemented | [schema](schemas/link.send.json) | [example](examples/wt-08/link.send.json) | 1ad218345cb60274dd66432d4d1f8d0d5dafe27e7f564215d607cd86ea0657ba |
| content.group | wt-03 | unimplemented | [schema](schemas/content.group.json) | [example](examples/wt-08/content.group.json) | b05dad20732db30c0be8f2fc64e9616e0a0a88847b53249cf18c8a7afec9238e |
| content.compose | wt-03 | unimplemented | [schema](schemas/content.compose.json) | [example](examples/wt-08/content.compose.json) | 04e1ed3e1cf358b1815041390ffff04d273776a2433d068b30cc17be0c734592 |
| message.get | wt-03 | unimplemented | [schema](schemas/message.get.json) | [example](examples/wt-08/message.get.json) | ff79eac35a9c919cb5fbfca8e0c26d7399d505c569b7775be1e799e0fa06f366 |
| message.reply | wt-03 | unimplemented | [schema](schemas/message.reply.json) | [example](examples/wt-08/message.reply.json) | 53db0f00f99412cc7c6d39189017dcb879ed5fb00a0efdce8d0438e079ba3d5d |
| message.react | wt-03 | unimplemented | [schema](schemas/message.react.json) | [example](examples/wt-08/message.react.json) | 5b51b3117d702a20b3dc6333de64892b3e510f970adf33c62a3ba3f24202213d |
| reaction.remove | wt-03 | unimplemented | [schema](schemas/reaction.remove.json) | [example](examples/wt-08/reaction.remove.json) | ea7c7cc6d576611227d056da68e480b96f024f25f44fa4a27d3accbf3a5b3390 |
| message.edit | wt-03 | unimplemented | [schema](schemas/message.edit.json) | [example](examples/wt-08/message.edit.json) | b18b27dd4723dd874b390ce9bf11e7eb526ebef154b0064477b97cf16ebc5076 |
| message.unsend | wt-03 | unimplemented | [schema](schemas/message.unsend.json) | [example](examples/wt-08/message.unsend.json) | 3db7bc2648a10da5fe4ae7d807015e5623c4aa67a62cd71d0ddd6cf35f78d211 |
| message.markRead | wt-03 | unimplemented | [schema](schemas/message.markRead.json) | [example](examples/wt-08/message.markRead.json) | ed39bcf0bb964c4a7ee574d7d7bd6005dbb00623ff419f660517a6c8d059fbd3 |
| attachment.send | wt-04 | unimplemented | [schema](schemas/attachment.send.json) | [example](examples/wt-08/attachment.send.json) | 64f7d16454b48e92fc39dca0d5328c0fe8e2e6188c87e7cfaf1bd6094539705f |
| attachment.fetch | wt-04 | unimplemented | [schema](schemas/attachment.fetch.json) | [example](examples/wt-08/attachment.fetch.json) | 524d30132ab96ae79f9737963a0ce7b44d88035aaf50b031adb7319c4f5acf79 |
| voice.send | wt-04 | unimplemented | [schema](schemas/voice.send.json) | [example](examples/wt-08/voice.send.json) | deff7c9344422cc42df40ed8bea8b4e0e24ec3d7eaf9e31fdf895d5d735e54ff |
| contact.send | wt-04 | unimplemented | [schema](schemas/contact.send.json) | [example](examples/wt-08/contact.send.json) | 31a53986db442e969588c858372abafa2f3e761d4d63116c188ab48971927dad |
| poll.create | wt-05 | unimplemented | [schema](schemas/poll.create.json) | [example](examples/wt-08/poll.create.json) | 05846f80222989353b40d28c1d4f0b0c3fe1b350e9ac076221f602c29a6b6035 |
| poll.get | wt-05 | unimplemented | [schema](schemas/poll.get.json) | [example](examples/wt-08/poll.get.json) | 8a85568e3a4ed02d672b3d7b025f46a793f8ff6939e729ac0214cfc497c3d727 |
| poll.vote | wt-05 | unimplemented | [schema](schemas/poll.vote.json) | [example](examples/wt-08/poll.vote.json) | db494b6425c1c357e21eab69a8a035aacd9d75dbb8ff35e9aa8d5aa238a1f909 |
| poll.unvote | wt-05 | unimplemented | [schema](schemas/poll.unvote.json) | [example](examples/wt-08/poll.unvote.json) | 3b0f91bd799bc32b502f8b98e0133dfced0c90fdbc5db709c5625ccd9b413cc3 |
| poll.addOption | wt-05 | unimplemented | [schema](schemas/poll.addOption.json) | [example](examples/wt-08/poll.addOption.json) | 6faf9149c59d0179796d9f9be8d5a11af5a99a2823b544e3900561af4c728169 |
| app.send | wt-06 | unimplemented | [schema](schemas/app.send.json) | [example](examples/wt-08/app.send.json) | f6fc50b44c2eda816e033148710a66d5c19c489e238ab2e0898501fc0a76c1e3 |
| app.sendCustomized | wt-06 | unimplemented | [schema](schemas/app.sendCustomized.json) | [example](examples/wt-08/app.sendCustomized.json) | 013b0c1414abfd7e49353004aa0381893dfb92bd21b447da07e9ac8e2493144d |
| app.update | wt-06 | unimplemented | [schema](schemas/app.update.json) | [example](examples/wt-08/app.update.json) | 8dd6031582e5afff4d1506a2af141a4b026580d4082f425934a05d4cbb04abe2 |
| space.get | wt-07 | unimplemented | [schema](schemas/space.get.json) | [example](examples/wt-08/space.get.json) | b842efc3d4a95b8c1059edc7bd002b72fdc15e97f309683e25f6f4ad17de7bb8 |
| space.create | wt-07 | unimplemented | [schema](schemas/space.create.json) | [example](examples/wt-08/space.create.json) | c9539f57f9c85fe9703ff88ea891734f19b56b9cd6747c32bdccab6134a6a57d |
| space.getName | wt-07 | unimplemented | [schema](schemas/space.getName.json) | [example](examples/wt-08/space.getName.json) | 16370cd111c08717089815bbc05af3529b29d7809401dda7cd7d61cafa8c9198 |
| space.rename | wt-07 | unimplemented | [schema](schemas/space.rename.json) | [example](examples/wt-08/space.rename.json) | 246370e4ee685d9e1e10f707ba03c90483af5f693532f54ee2d443674445c2f8 |
| space.getMembers | wt-07 | unimplemented | [schema](schemas/space.getMembers.json) | [example](examples/wt-08/space.getMembers.json) | 3e8abfdccf53b0c47fbe2556c8e9bb39608e234a6b59b0a64f4f3cbf0e498b97 |
| space.addMembers | wt-07 | unimplemented | [schema](schemas/space.addMembers.json) | [example](examples/wt-08/space.addMembers.json) | 3c992972cd9e6b73c9306ba97fef6ff98a464e3a0291eaf743b5491d6e4be460 |
| space.removeMembers | wt-07 | unimplemented | [schema](schemas/space.removeMembers.json) | [example](examples/wt-08/space.removeMembers.json) | 7ac57276156f10f3e31d30621d27fa9c3b1f8ddb9e682793b3a7d0f8dd7145c9 |
| space.leave | wt-07 | unimplemented | [schema](schemas/space.leave.json) | [example](examples/wt-08/space.leave.json) | 9418af1558f8fa54f7f4a0eeb781218237fbb9bcb7940ae4023d7b7884251c95 |
| space.getAvatar | wt-07 | unimplemented | [schema](schemas/space.getAvatar.json) | [example](examples/wt-08/space.getAvatar.json) | cab4beed17d77b05dc60b2e8532b5b184304ae667ea52aa706ee95dd19f6aed7 |
| space.setAvatar | wt-07 | unimplemented | [schema](schemas/space.setAvatar.json) | [example](examples/wt-08/space.setAvatar.json) | 70618244798413d3465b9841c0f5a0d74020ffa4d88d7d20b31b60a47347d984 |
| space.clearAvatar | wt-07 | unimplemented | [schema](schemas/space.clearAvatar.json) | [example](examples/wt-08/space.clearAvatar.json) | 0b537432dfc68bcb4b67da0b052a709aec89fa622f8611ac93592773539696c8 |
| space.setBackground | wt-07 | unimplemented | [schema](schemas/space.setBackground.json) | [example](examples/wt-08/space.setBackground.json) | 3ba62d4735071467d521b7b667e0a4ed1148e15357200b19c6d2e3726938fc9a |
| space.clearBackground | wt-07 | unimplemented | [schema](schemas/space.clearBackground.json) | [example](examples/wt-08/space.clearBackground.json) | 6063b1fd36864695ea197c9a8ecd46e6935b4dedea87b844148d96df1c8a59a3 |
| account.shareContact | wt-07 | unimplemented | [schema](schemas/account.shareContact.json) | [example](examples/wt-08/account.shareContact.json) | e79f27d9a0a8aae76b71fa966a2c3a258b58550d8d22ca685d77dc71f1069a8c |
| effect.send | wt-07 | unimplemented | [schema](schemas/effect.send.json) | [example](examples/wt-08/effect.send.json) | 205dfcab2a0fe07fd069e406c9c9d6760b61a971f785833117039e4e0830e210 |
| metadata.get | wt-07 | unimplemented | [schema](schemas/metadata.get.json) | [example](examples/wt-08/metadata.get.json) | bf0a2ae2dabef515d9416bec1a846437d45cfd8e6343b82054d0f563af176b96 |
| custom.send | wt-07 | unimplemented | [schema](schemas/custom.send.json) | [example](examples/wt-08/custom.send.json) | 9774e41cb1220dbe1c1c38aca46229c7ead466c9be54c6af55e86109533f9919 |

<!-- END GENERATED OPERATIONS -->
