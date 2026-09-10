# WT-05 poll lifecycle

F0 entry points are createFeatureModule, executePollOperation, mapPollOperation, resolvePollIdentity, resolveOptionIdentity, applyPollEvent, reconcilePollState and retryUnresolvedPollEvents. The new path imports the frozen f0-services-2 contracts directly and uses the shared child executor and UnitOfWork.

poll.create is locally implemented with a trusted shared-owner Spectrum space binding. poll.get, poll.vote, poll.unvote and poll.addOption have validated handlers that return a shared-integration blocker; no advanced seam is approved at F0. This is not a complete five-operation native management implementation. See CHANGE-REQUESTS.md.

Identity registration, normalized vote reduction, atomic continuations and bounded replay are tested independently. Legacy exports are preserved for compatible existing consumers but are not registered by the new module. No host registration, second client/listener/outbox, account changes, activation or live poll was performed.

See ARCHITECTURE.md for integration obligations, ACCEPTANCE.md for case-level status, TEST-EVIDENCE.md for commands/hashes and HANDOFF.md for delivery state.
