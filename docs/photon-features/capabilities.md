# Capability evaluation

## Dimensions
The 44 catalog entries carry operation, owning lane, schema, permission, side-effect class and reference inputs. `evaluateCapabilities` separates providerSupport (native/fallback/unsupported/unknown), account/conversation availability and checkedAt, implementation, inbound/outbound direction, SDK version, evidence tiers (unit/sdk-contract/integration/live) and blockers. Registration alone produces at most partial implementation with unknown support/availability. No blanket supported:true field exists.

## F0 state
All 44 public handlers remain unimplemented with no account inspection and no live evidence. Inherited feature code is not automatically registered. Missing handlers block host readiness. Spectrum universal methods can warn-and-skip or return undefined; that is not proof of native rendering or recipient delivery. Current plan/line and group constraints are checked by owning lanes only after authorized production configuration.

## SDK boundary
Pinned spectrum-ts 12.8.0 public imports compile for text, polls, app cards, read, effect and iMessage narrowing/session metadata. `message.markRead` is an application operation implemented through SDK `message.read`, not an invented SDK method. Poll-management and app-session recovery support need operation-specific integration probes; F0 does not silently add Advanced iMessage or a local macOS provider. Sources and access failures are in [documentation](documentation.md).
