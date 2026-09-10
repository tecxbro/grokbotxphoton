> ## Documentation Index
> Fetch the complete documentation index at: https://docs.photon.codes/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Typing indicators

> Send start and stop typing signals.

Use `typing()` to send a typing indicator signal through the content pipeline. The default action is `"start"`.

```ts theme={null}
import { typing } from "spectrum-ts";

await space.send(typing());        // start typing
await space.send(typing("stop"));  // stop typing
```

`space.startTyping()`, `space.stopTyping()`, and `space.responding(fn)` are sugar over `space.send(typing(...))`.

Platforms without a typing-indicator API silently no-op.
