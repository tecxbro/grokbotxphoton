# WT-09 independent verification

This lane develops independent acceptance tests for the Photon feature runtime. The integration owner cherry-picks the exact WT-09 test commit into `wt-integration` and runs it against an exact assembled candidate. F0 fixtures alone cannot satisfy product acceptance.

## Evidence levels

| Level | Meaning | Can prove |
| --- | --- | --- |
| Fixture/unit | Controlled in-process doubles | Test logic and isolated invariants only |
| SDK contract | Installed public `spectrum-ts` 12.8.0 declarations/builders | Compile-time and builder compatibility |
| Real local | Unix socket, authorization, temporary SQLite/executor, production feature module, offline provider adapter | Local composition and durable behavior, not network delivery |
| Provider accepted | Explicit provider observation | Provider acceptance only |
| Delivered/read | Correlated provider event or snapshot | The exact observed dimension only |
| Interaction | Authenticated inbound vote/callback/event | That observed interaction only |
| Device | Physical supported device/extension observation | Rendering or device behavior |

## Test map

| Area | Owned test |
| --- | --- |
| CLI, IPC, authorization, executor, feature, adapter | `local-roundtrip.test.ts` |
| Accepted/delivered/read correlation and restart | `delivery-read.test.ts` |
| Poll recovery | `poll-restart.test.ts` |
| Card recovery/callback safety | `card-restart.test.ts` |
| Multipart uncertainty | `multipart-recovery.test.ts` |
| Installation/rollback | `install-rollback.test.ts` |
| Context and disclosure | `context-scope.test.ts` |
| Webhook raw-body authentication | `webhook-auth.test.ts` |
| Media access and retention | `media-access.test.ts` |
| Claims and fencing | `claim-fencing.test.ts` |
| Explicitly authorized live smoke | `authorized-smoke.test.ts` |

Typing lifecycle coverage is inherited and read-only in this assignment; its results are reported separately when the suite runs.
