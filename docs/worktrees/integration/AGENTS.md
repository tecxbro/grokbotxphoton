# Integration lane rules

This directory and the shared composition, registry, host, package, contract,
migration, verification, and aggregate documentation changes required to assemble
reviewed lanes are owned by `photon-v3/integration` only.

Integrate immutable reviewed commits recorded in `included-commits.json`; never
merge a moving branch tip. Preserve each lane's implementation and evidence tier.
Feature defects stay with their lane unless this directory records an explicit
integration ownership decision. Shared compatibility changes must be implemented
once and recorded in `ARCHITECTURE.md` and `CHANGE-REQUESTS.md`.

Use one Spectrum credential/connection owner, one durable inbox/outbox, the
`f0-services-2` `executeChild` boundary, and reconcile-first handling for ambiguous
writes. Verify webhook signatures over raw bytes before parsing and persist inbound
work before acknowledgment. Do not activate, provision, send live messages, or
claim provider/device evidence in this lane.

Before every integration commit, inspect staged, unstaged, and untracked paths.
Stage only integration-owned paths and the exact reviewed lane commits being
integrated. Never move `photon-v3-f0` or rewrite a lane's history.
