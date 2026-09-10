> ## Documentation Index
> Fetch the complete documentation index at: https://docs.photon.codes/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Replies

> Thread content under an existing message.

Use `reply()` to send a threaded reply by wrapping content with the message being replied to. See [Reactions and replies](/docs/spectrum-ts/reactions-and-replies) for the full details and sugar methods.

```ts theme={null}
import { reply, text } from "spectrum-ts";

await space.send(reply(text("Got it"), message));
```

`reply()` cannot wrap `reply`, `edit`, `reaction`, `group`, `typing`, `rename`, `avatar`, `addMember`, `removeMember`, `leaveSpace`, `unsend`, or `read` content.

## Reply sugar

`message.reply(...)` has the same variadic signature and delegates to `space.send(reply(...))` internally:

```ts theme={null}
await message.reply(
  "Thanks for the question.",
  attachment("/path/to/answer.png"),
);
```

On platforms without thread support, `reply()` resolves as a no-op. If you need guaranteed delivery, use `space.send(...)` instead.
