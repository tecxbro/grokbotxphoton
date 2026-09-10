# Runtime contract

## Ownership
One Grok orchestrator and its workers invoke a deterministic local package. One injected host owns authenticated Photon provider connections, ingress, durable store and outbox driver. The program contains no Grok API usage or transcript polling loop. Root gbot/grok-bot remain unchanged.

## Invocation
Use [execution contract](../contracts/execution.md). JSON is data only, with a server-resolved context and independently authenticated principal. execute/status operate on durable requests; capabilities/doctor report distinct readiness dimensions; durable work is retrieved/claimed/heartbeated/acked separately from pointer-only wake. The `LocalExecutor` contract owns state authorization and receives explicit registered features before startup.

## Recovery and compatibility
Persist inbox before acknowledgement, resume typed events by durable checkpoint, maintain task generation/fence, record child dispatch intent before effects, and treat uncertain effects as unknown pending reconciliation. Receipt evidence is independent, append-only and scoped; [receipt contract](../contracts/receipts.md) defines early correlation and group limits. The new migration is additive and tested only against isolated fresh SQLite; equivalent existing generic records map without copying to a second journal.

Existing legacy implementations compile but cannot be registered as public FeatureModule without deliberate adaptation. Provider start, authenticated ingress, recovery and outbox lifecycle are injected and never default to test services. No production adapter implementing the entire f0-services-2 seam is claimed by F0.
