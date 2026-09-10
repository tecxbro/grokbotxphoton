> ## Documentation Index
> Fetch the complete documentation index at: https://docs.photon.codes/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Composing content

> Send multiple content items or reply with multiple parts.

All send methods take a variadic list. Spectrum sends each item sequentially as a separate message:

```ts theme={null}
await space.send(
  "Here's the file you requested:",
  attachment("/path/to/document.pdf"),
);
```

This runs one `send()` per item on the underlying provider. It is not a single compound message.

Reach for [`group()`](/docs/spectrum-ts/content/groups) when you specifically want multiple items rendered as one bundled unit.

## Reply with multiple items

`message.reply(...)` has the same variadic signature and delegates to `space.send(reply(...))` internally:

```ts theme={null}
await message.reply(
  "Thanks for the question.",
  attachment("/path/to/answer.png"),
);
```

On platforms without thread support, `reply()` resolves as a no-op. If you need guaranteed delivery, use `space.send(...)` instead. See [Replies](/docs/spectrum-ts/content/replies) for the canonical form.
