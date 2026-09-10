# WT-07 integration requests

Target: WT-00 host/contract owner, coordinated with WT-01/WT-02/WT-03/WT-04. These are requests only; shared contracts, the registry, host composition, dependencies, and sibling implementations were not edited by WT-07.

## 1. Scoped provider and authorization ports

Bind `createNativeModule(NativeDependencies)` to the already-running authenticated Spectrum provider. `binding(context)` must be a read-only lookup: match project/provider/account/line/space exactly, resolve the exact serving phone, and supply current account and conversation availability in `availableOperations`. Use `imessage(existingSpectrum)`; never construct a second client, subscribe, sync profiles, enable a service, or allocate a line in this binding. Group actions require an existing dedicated line. Account sharing requires a configured native profile and account capability.

`authorizeIntent(action, context)` must validate the complete parsed action against trusted user intent, including exact recipients and an optional create-group name. The operations array alone is not recipient consent or administrative authorization. Validate the current authorized recipient scope, new-recipient consent/eligibility, and group permissions using principal/task/generation grants. Do not interpret any model-supplied flag as authorization. Shared pool proactive recipients must already meet project-recipient prerequisites. No approved Advanced SDK extension is introduced to query addresses directly.

For native wrappers used inside other lanes' composition, `authorizeContent(content, context)` must validate explicit intent for that content and the current target conversation. Both native compilers independently enforce native operation permissions and provider availability. The composition host must dispatch the compiled content only to the same scoped conversation.

WT-01 remains responsible for authoritative context re-resolution, current task cancellation/generation/fence checks, claim renewal, deadline enforcement, and request/attempt lifecycle. The lane additionally checks its supplied context and lease at dispatch and before disclosing a read result. F0's snapshot services cannot independently observe a newly revoked database context.

## 2. Common media retention port

F0 `MediaStager.resolve` only reads existing approved resources. Approve a host-level retain/ingest operation for provider-returned avatar bytes. Wire it to `NativeDependencies.retainAvatar` using WT-04's guarded public port, including decoded-byte safety checks, principal/task/generation ownership, scoped staging records, bounded retention, and cleanup/expiry. Return the existing `stagedMediaSchema` shape. WT-07 checks byte count, MIME and digest; it never writes a media file or fetches a URL.

Without the retention binding, a nonempty `space.getAvatar` returns `blocked/UNAVAILABLE`; an absent icon still returns `{ type: "media", media: null }`. Setter inputs use only `ExecutionServices.media.resolve`. JPEG/PNG/HEIC/HEIF are accepted; unsupported formats are rejected.

## 3. Registration and resource interoperability

Register the 17 handlers and the `effect` and `registered-custom` compilers in the WT-00 aggregate. Supply WT-03/WT-04 common text, markdown and attachment compilers through `NativeDependencies.compilers`; do not import a sibling's private implementation. The example factory is inert until the host uses it.

The only custom handler is `native-account-contact-v1`. A trusted host must register a `cards` record whose `templateId` equals that ID, with a scoped card reference resolvable by the common ResourceResolver. It requires both `custom.send` and `account.shareContact` permissions and explicit account-sharing intent. Other codecs and raw payloads are rejected. Do not adapt the F0 sample's placeholder `registered-card-v1` into an unrestricted codec.

Created conversations and returned messages receive opaque SHA-256-derived IDs stored using F0 `references` transactions. A created space preserves project/provider/account/line but has its own `scope.spaceId`. The host must issue a new appropriately authorized context before the new reference can be used. Existing contexts cannot use it by changing their action reference. ResourceResolver must enforce authoritative reference identity and principal/task/generation ownership and recover the provider ID from the stored record. Reconcile persistence/dispatch ambiguity instead of retrying an SDK mutation blindly.

## 4. Group events and later integration tests

WT-02 owns subscription, normalization, durable inbox deduplication and reconciliation triggers. WT-07 has no persistent group projection and registers no listener, no group reducer, and no automatic response. Reads fetch current provider state. F0 has no group projection table; request a versioned contract first if a local projection is later required. Membership events that affect authorization must reach the host's grant-revalidation flow.

Repeat lane cases with the real common transport, media stager and SQLite resource/context resolver: two selected lines; cross-line/cross-chat references; new-recipient and administrative grants; generated-space context handoff; avatar retention expiry/cleanup; native content inside composition; cancellation and stale fences; ambiguous create-plus-rename; and group event replay without replies. The lane already uses the F0 real temporary SQLite fixture, but provider/media/resolver integrations are injected test doubles. Provider idempotency/outcome lookup is not available through the approved F0 seam; the recovery codec reports `unknown`.

No live mutation, installation, activation, provisioning, or billing change is requested or performed by this lane.
