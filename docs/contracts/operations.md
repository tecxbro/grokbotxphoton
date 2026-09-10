# Operations

## Catalog

All 44 operations require an authenticated context, matching operation permission, current task generation/claim and authorized full-scope references. Names are application operations, not assumed SDK methods.

| Operation | Owner | Arguments | Permission | Side effect | Reference fields | Output value |
| --- | --- | --- | --- | --- | --- | --- |
| typing.begin | wt-02 | space, ttlMs | typing.begin | provider-write | space | void / returned references |
| typing.end | wt-02 | space | typing.end | provider-write | space | void / returned references |
| text.send | wt-03 | space, text | text.send | provider-write | space | void / returned references |
| text.stream | wt-03 | space, stream | text.stream | provider-write | space, stream | void / returned references |
| markdown.send | wt-03 | space, text | markdown.send | provider-write | space | void / returned references |
| link.send | wt-03 | space, url, title | link.send | provider-write | space | void / returned references |
| content.group | wt-03 | space, content | content.group | provider-write | space | void / returned references |
| content.compose | wt-03 | space, content | content.compose | provider-write | space | void / returned references |
| message.get | wt-03 | message | message.get | read | message | message |
| message.reply | wt-03 | message, content | message.reply | provider-write | message | void / returned references |
| message.react | wt-03 | message, reaction | message.react | provider-write | message, reaction | void / returned references |
| reaction.remove | wt-03 | reaction | reaction.remove | provider-write | reaction | void / returned references |
| message.edit | wt-03 | message, text | message.edit | provider-write | message | void / returned references |
| message.unsend | wt-03 | message | message.unsend | provider-write | message | void / returned references |
| message.markRead | wt-03 | message | message.markRead | provider-write | message | void / returned references |
| attachment.send | wt-04 | space, media | attachment.send | provider-write | space | void / returned references |
| attachment.fetch | wt-04 | attachment | attachment.fetch | read | attachment | media |
| voice.send | wt-04 | space, media | voice.send | provider-write | space | void / returned references |
| contact.send | wt-04 | space, contact | contact.send | provider-write | space | void / returned references |
| poll.create | wt-05 | space, question, options | poll.create | provider-write | space | void / returned references |
| poll.get | wt-05 | poll | poll.get | read | poll | poll |
| poll.vote | wt-05 | poll, option | poll.vote | provider-write | poll, option | void / returned references |
| poll.unvote | wt-05 | poll, option | poll.unvote | provider-write | poll, option | void / returned references |
| poll.addOption | wt-05 | poll, option | poll.addOption | provider-write | poll, option | void / returned references |
| app.send | wt-06 | space, templateId, url | app.send | provider-write | space | void / returned references |
| app.sendCustomized | wt-06 | space, templateId, url, layout | app.sendCustomized | provider-write | space | void / returned references |
| app.update | wt-06 | card, session, layout | app.update | provider-write | card, session | void / returned references |
| space.get | wt-07 | space | space.get | read | space | void / returned references |
| space.create | wt-07 | members, name | space.create | provider-write | none | void / returned references |
| space.getName | wt-07 | space | space.getName | read | space | name |
| space.rename | wt-07 | space, name | space.rename | provider-write | space | void / returned references |
| space.getMembers | wt-07 | space | space.getMembers | read | space | members |
| space.addMembers | wt-07 | space, members | space.addMembers | provider-write | space | void / returned references |
| space.removeMembers | wt-07 | space, members | space.removeMembers | provider-write | space | void / returned references |
| space.leave | wt-07 | space | space.leave | provider-write | space | void / returned references |
| space.getAvatar | wt-07 | space | space.getAvatar | read | space | media |
| space.setAvatar | wt-07 | space, media | space.setAvatar | provider-write | space | void / returned references |
| space.clearAvatar | wt-07 | space | space.clearAvatar | provider-write | space | void / returned references |
| space.setBackground | wt-07 | space, media | space.setBackground | provider-write | space | void / returned references |
| space.clearBackground | wt-07 | space | space.clearBackground | provider-write | space | void / returned references |
| account.shareContact | wt-07 | space | account.shareContact | provider-write | space | void / returned references |
| effect.send | wt-07 | space, content | effect.send | provider-write | space | void / returned references |
| metadata.get | wt-07 | message | metadata.get | read | message | metadata |
| custom.send | wt-07 | space, codecId, resource | custom.send | provider-write | space | void / returned references |

## Input and result schemas

The canonical strict argument definitions are operationArguments in packages/photon-features/src/contracts/actions.ts. Every row is included in schemas/action.schema.json as a literal operation envelope, with required fields, bounds, enums and fully expanded scoped reference shapes. Optional fields remain optional there; this table names them for discoverability. Content comes from contracts/content.ts. OperationResult in contracts/results.ts and schemas/result.schema.json defines the returned lifecycle, revision, actual references, typed value, errors/retry classification and observations. Events use schemas/event.schema.json from contracts/events.ts. JSON Schema describes structural validation; runtime checks additionally validate JSON inertness/size, poll-option/card-session identity, reference authorization and current context/claim generation.

Read operations can require remote I/O but do not authorize a messaging side effect. All provider-write rows require executeChild, including fire-and-forget controls. Typed message, poll, name, member, media and metadata values must match their declared result variant. Mutation success may include real returned references; never fabricate an ID or receipt for an undefined SDK return. No operations are registered in the F0 production registry.
