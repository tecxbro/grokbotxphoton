# WT-02 transport, inbound, receipt acquisition and typing

Implemented as an owned extension of the F0 transport, preserving existing compatible runtime behavior. Use [architecture](ARCHITECTURE.md) for the exact function boundaries, [acceptance](ACCEPTANCE.md) and [test evidence](TEST-EVIDENCE.md) for verification, and [handoff](HANDOFF.md) for integration requirements.

Worktree: `/Users/darshan/Documents/ChatGPT/grokbotonimessage/worktrees/wt-02`; branch `photon-v3/wt-02`; F0 `ee2f8576b55973eee312bca5cad0549b6f959a88`, contract version `f0-services-2`.

There is one SDK owner and one selected ingress. Incoming transport, outgoing provider access, durable work and configured Grok wake remain separate. This lane does not install, activate, register accounts, send live messages or edit host composition.
