# Acceptance

1. All 17 action schemas reject unknown/executable input and handlers require exact action permission and authorized intent.
2. Lookup and creation preserve provider/account/line/chat scope; reads have no configuration or lifecycle side effects.
3. New recipients and group administration require canonical unique identifiers, dedicated-line prerequisites, exact intent, and valid participant/cardinality state.
4. Rename/avatar/background/contact/effect operations use pinned public Spectrum APIs; media uses only the common guarded staging/retention ports.
5. `account.shareContact` is distinct from arbitrary contacts; `custom.send` permits only a named, resource-backed, permissioned handler.
6. Metadata is restricted to F0's safe allowlist and rejects cross-chat/cross-line messages.
7. Normalized group events are synchronously consumed without a second subscription, automatic reply, or continuation; ambiguous writes require reconciliation.
8. Required focused, SDK-contract, integration, regression, typecheck/build, ownership, source, and manual diff checks are recorded without upgrading isolated evidence to activation/live evidence.
