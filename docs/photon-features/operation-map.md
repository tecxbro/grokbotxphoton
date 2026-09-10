# Operation map

All 44 entries have one owner and an implemented v1 argument schema. Every messaging handler is unimplemented at F0. Method names below are discovery/probe seams, not guarantees of provider support. See capabilities for separate evidence and availability.

| Operation | Owner | Public seam / blocker |
| --- | --- | --- |
| `typing.begin` | WT-02 | Space.startTyping |
| `typing.end` | WT-02 | Space.stopTyping |
| `text.send` | WT-03 | text / Space.send |
| `text.stream` | WT-03 | stream; host-registered AsyncIterable only |
| `markdown.send` | WT-03 | markdown; provider formatting needs evidence |
| `link.send` | WT-03 | richlink; authorize URL before SDK compilation |
| `content.group` | WT-03 | group; multipart recovery needs lane evidence |
| `content.compose` | WT-03 | ContentInput composition; durable child indexes |
| `message.get` | WT-03 | Space.getMessage |
| `message.reply` | WT-03 | Message.reply |
| `message.react` | WT-03 | Message.react |
| `reaction.remove` | WT-03 | No validated reaction-removal public seam yet |
| `message.edit` | WT-03 | Message.edit |
| `message.unsend` | WT-03 | Message.unsend |
| `message.markRead` | WT-03 | Message.read (void) |
| `attachment.send` | WT-04 | attachment; guarded staged media only |
| `attachment.fetch` | WT-04 | Attachment.read/stream requires lane probe |
| `voice.send` | WT-04 | voice; audio codecs/ffmpeg availability unresolved |
| `contact.send` | WT-04 | contact; arbitrary contact card, distinct from account.shareContact |
| `poll.create` | WT-05 | poll / option builders |
| `poll.get` | WT-05 | No validated native poll resolver yet |
| `poll.vote` | WT-05 | No validated public vote mutation seam yet |
| `poll.unvote` | WT-05 | No validated public unvote mutation seam yet |
| `poll.addOption` | WT-05 | No validated public add-option seam yet |
| `app.send` | WT-06 | app; registered template only |
| `app.sendCustomized` | WT-06 | customizedMiniApp; public import verified, construction needs lane probe |
| `app.update` | WT-06 | No validated durable card-update/session recovery seam yet |
| `space.get` | WT-07 | imessage(app).space.get; resolve serving line |
| `space.create` | WT-07 | imessage(app).space.create; account eligibility unknown |
| `space.getName` | WT-07 | Space.getDisplayName |
| `space.rename` | WT-07 | Space.rename (void) |
| `space.getMembers` | WT-07 | Space.getMembers |
| `space.addMembers` | WT-07 | Space.add; lane must probe address normalization |
| `space.removeMembers` | WT-07 | Space.remove; lane must probe authorization |
| `space.leave` | WT-07 | Space.leave (void) |
| `space.getAvatar` | WT-07 | Space.getAvatar |
| `space.setAvatar` | WT-07 | Space.avatar; guarded media |
| `space.clearAvatar` | WT-07 | No validated clear-avatar public seam yet |
| `space.setBackground` | WT-07 | imessage(space).background / background builder |
| `space.clearBackground` | WT-07 | imessage(space).background("clear") |
| `account.shareContact` | WT-07 | imessage(space).shareContactCard / nativeContactCard (void) |
| `effect.send` | WT-07 | effect; map allowlisted names to exported provider effects |
| `metadata.get` | WT-07 | imessage(message) public metadata; implemented fields must be evidence-backed |
| `custom.send` | WT-07 | Only registered, versioned codecs; no unrestricted payloads |
