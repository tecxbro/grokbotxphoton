# WT-07 native iMessage operations

WT-07 implements 17 scoped native operations: conversation lookup/creation/name, membership, avatar/background appearance, native account contact sharing, message effects, curated metadata, and one registered custom handler.

This lane owns implementation and isolated evidence only. Integration into the aggregate registry, runtime activation, provider acceptance/delivery/read, device rendering, provisioning, and live group changes remain outside WT-07.

The implementation preserves the originating project, provider, account, line, and conversation. New recipients and administrative changes require exact authorized intent. Provider writes do not manufacture delivery observations.
