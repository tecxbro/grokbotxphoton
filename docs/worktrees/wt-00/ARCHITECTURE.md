# Foundation architecture

## Planned implementation
Reuse strict Zod operation/content/reference schemas where compatible. Add a documented public feature-services contract with no private tables, an injected host seam, additive receipt state and schema/checker tooling. Existing legacy contract consumers remain source-compatible and require integration-lane adaptation to the new public service seam; they are not automatically registered.

## Flow and ownership
Trusted local invocation resolves principal and expiring/revocable context before scoped references. A fenced claim surrounds every state change and executeChild dispatch. One runtime owns credentials, inbox/outbox, attempts and children; features own domain records through UnitOfWork only. Durable continuation is created transactionally; wake carries only a pointer. Inbound authentication precedes capture; provider dispatch and wake are separate ports.

## Transactions and recovery
Synchronous domain transactions cannot await provider I/O. Child preparation is durable before dispatch, and ambiguous dispatch must return unknown-outcome until reconciled. Cancellation fences new effects, not effects already accepted. Receipt evidence is append-only, independently correlated and never fabricates provider times/readers. Fresh SQLite migration preserves the existing record layout; no production database is opened.

## Non-ownership and limitations
Existing feature/runtime modules are inherited and untouched. Their private child-boundary adapter and table access are not the new public F0 contract. Integration must adapt them explicitly. Unrestricted same-UID processes are not isolated by an opaque context ID; OS process isolation/credential separation is needed against malicious local peers.

## Interfaces
See [execution](../../contracts/execution.md), [receipts](../../contracts/receipts.md), and [operations](../../contracts/operations.md) from shared docs; root ARCHITECTURE.md is the project entry point.
