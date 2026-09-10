# WT-09 source access record

Exact access/read times, versions, hashes and local captures are in sources.json. Each HTML page and Markdown variant was fetched separately. Fetched-only sources were not relied upon. Only inspected excerpts support expectations; public installed SDK exports remain API authority. Upstream source commits are unknown when recorded as null.

| Source | Access | Read | Expectation |
| --- | --- | --- | --- |
| https://photon.codes/docs/llms.txt | 200 | index-read | discover primary test-specific source pages; index is not API execution evidence |
| https://photon.codes/docs/spectrum-ts/messages | 200 | not-read | Fetched but not relied upon; no test expectation attributed |
| https://photon.codes/docs/spectrum-ts/content/typing-indicators | 200 | not-read | Fetched but not relied upon; no test expectation attributed |
| https://photon.codes/docs/spectrum-ts/content/polls | 200 | not-read | Fetched but not relied upon; no test expectation attributed |
| https://photon.codes/docs/spectrum-ts/content/app | 200 | not-read | Fetched but not relied upon; no test expectation attributed |
| https://photon.codes/docs/spectrum-ts/content/edits | 200 | not-read | Fetched but not relied upon; no test expectation attributed |
| https://photon.codes/docs/spectrum-ts/content/groups | 200 | not-read | Fetched but not relied upon; no test expectation attributed |
| https://photon.codes/docs/spectrum-ts/providers/imessage/connection-and-routing | 200 | not-read | Fetched but not relied upon; no test expectation attributed |
| https://photon.codes/docs/spectrum-ts/providers/imessage/messaging-features/apps | 200 | not-read | Fetched but not relied upon; no test expectation attributed |
| https://photon.codes/docs/spectrum-ts/webhooks | 200 | not-read | Fetched but not relied upon; no test expectation attributed |
| https://photon.codes/docs/webhooks/verifying-signatures | 200 | not-read | Fetched but not relied upon; no test expectation attributed |
| https://photon.codes/docs/webhooks/delivery | 200 | not-read | Fetched but not relied upon; no test expectation attributed |
| https://photon.codes/docs/advanced-kits/imessage/polls | 200 | not-read | Fetched but not relied upon; no test expectation attributed |
| https://photon.codes/docs/advanced-kits/imessage/events | 200 | not-read | Fetched but not relied upon; no test expectation attributed |
| https://photon.codes/docs/advanced-kits/imessage/error-handling | 200 | not-read | Fetched but not relied upon; no test expectation attributed |
| https://photon.codes/docs/best-practices/inbound-pipeline | 200 | not-read | Fetched but not relied upon; no test expectation attributed |
| https://photon.codes/docs/best-practices/recovery-and-state | 200 | not-read | Fetched but not relied upon; no test expectation attributed |
| https://github.com/photon-hq/spectrum-ts | 200 | not-read | Fetched but not relied upon; no test expectation attributed |
| https://github.com/tecxbro/photon-skills/blob/main/skills/spectrum/capability-semantics.md | 200 | not-read | Fetched but not relied upon; no test expectation attributed |
| https://github.com/tecxbro/photon-skills/blob/main/skills/spectrum/content/app-cards.md | 200 | not-read | Fetched but not relied upon; no test expectation attributed |
| https://github.com/tecxbro/photon-skills/blob/main/skills/spectrum/content/polls-groups-and-custom.md | 200 | not-read | Fetched but not relied upon; no test expectation attributed |
| https://github.com/tecxbro/photon-skills/blob/main/skills/spectrum/content/read-and-typing.md | 200 | not-read | Fetched but not relied upon; no test expectation attributed |
| https://github.com/tecxbro/photon-skills/blob/main/skills/photon-webhooks/verifying-signatures.md | 200 | not-read | Fetched but not relied upon; no test expectation attributed |
| https://photon.codes/docs/spectrum-ts/messages.md | 200 | not-read | Fetched but not relied upon; no test expectation attributed |
| https://photon.codes/docs/spectrum-ts/content/typing-indicators.md | 200 | relevant-excerpts-read | typing uses start/stop controls; no delivery or rendering evidence inferred |
| https://photon.codes/docs/spectrum-ts/content/polls.md | 200 | relevant-excerpts-read | poll and option builders; incoming poll_option requires correlation |
| https://photon.codes/docs/spectrum-ts/content/app.md | 200 | relevant-excerpts-read | retain original message; session refresh; live rendering needs installed extension |
| https://photon.codes/docs/spectrum-ts/content/edits.md | 200 | relevant-excerpts-read | edit returns void; cannot replace original card target |
| https://photon.codes/docs/spectrum-ts/content/groups.md | 200 | relevant-excerpts-read | group constraints and per-child outcomes; not provider exactly-once proof |
| https://photon.codes/docs/spectrum-ts/providers/imessage/connection-and-routing.md | 200 | relevant-excerpts-read | explicit account/line routing; cloud provider selected |
| https://photon.codes/docs/spectrum-ts/providers/imessage/messaging-features/apps.md | 200 | relevant-excerpts-read | provider-managed original card session used for repeated updates |
| https://photon.codes/docs/spectrum-ts/webhooks.md | 200 | relevant-excerpts-read | SDK callback is fire-and-forget; independent durable-before-ack route required |
| https://photon.codes/docs/webhooks/verifying-signatures.md | 200 | relevant-excerpts-read | HMAC v0 over timestamp and exact raw bytes; five-minute freshness window |
| https://photon.codes/docs/webhooks/delivery.md | 200 | not-read | Fetched but not relied upon; no test expectation attributed |
| https://photon.codes/docs/advanced-kits/imessage/polls.md | 200 | not-read | Fetched but not relied upon; no test expectation attributed |
| https://photon.codes/docs/advanced-kits/imessage/events.md | 200 | not-read | Fetched but not relied upon; no test expectation attributed |
| https://photon.codes/docs/advanced-kits/imessage/error-handling.md | 200 | not-read | Fetched but not relied upon; no test expectation attributed |
| https://photon.codes/docs/best-practices/inbound-pipeline.md | 200 | not-read | Fetched but not relied upon; no test expectation attributed |
| https://photon.codes/docs/best-practices/recovery-and-state.md | 200 | relevant-excerpts-read | retain child progress; verify actual provider seam before dedup assumptions |
| /Users/darshan/.codex/skills/spectrum/SKILL.md | local-read | read | provider contract gate |
| /Users/darshan/.codex/skills/spectrum/providers/imessage.md | local-read | read | select cloud iMessage; explicit serving line |
| /Users/darshan/.codex/skills/spectrum/capability-semantics.md | local-read | read | native, fallback, warn-and-skip and unsupported are separate |
| /Users/darshan/.codex/skills/spectrum/best-practices.md | local-read | read | durable recovery and cancellation expectations |
| /Users/darshan/Documents/ChatGPT/grokbotxphoton/node_modules/spectrum-ts/package.json | local-inspected | package-metadata-read | Exact installed package identity; public exports compiled and builder calls executed offline. Whole declaration file not reviewed. |
| /Users/darshan/Documents/ChatGPT/grokbotxphoton/node_modules/spectrum-ts/dist/index.d.ts | local-inspected | public-seams-compiled-by-SDK-tests | Exact installed package identity; public exports compiled and builder calls executed offline. Whole declaration file not reviewed. |
| /Users/darshan/Documents/ChatGPT/grokbotxphoton/node_modules/@spectrum-ts/core/package.json | local-inspected | package-metadata-read | Exact installed package identity; public exports compiled and builder calls executed offline. Whole declaration file not reviewed. |
| /Users/darshan/Documents/ChatGPT/grokbotxphoton/node_modules/@spectrum-ts/core/dist/index.d.ts | local-inspected | public-seams-compiled-by-SDK-tests | Exact installed package identity; public exports compiled and builder calls executed offline. Whole declaration file not reviewed. |
| /Users/darshan/Documents/ChatGPT/grokbotxphoton/node_modules/@spectrum-ts/imessage/package.json | local-inspected | package-metadata-read | Exact installed package identity; public exports compiled and builder calls executed offline. Whole declaration file not reviewed. |
| /Users/darshan/Documents/ChatGPT/grokbotxphoton/node_modules/@spectrum-ts/imessage/dist/index.d.ts | local-inspected | public-seams-compiled-by-SDK-tests | Exact installed package identity; public exports compiled and builder calls executed offline. Whole declaration file not reviewed. |
| /Users/darshan/Documents/ChatGPT/grokbotxphoton/node_modules/@photon-ai/advanced-imessage/package.json | local-inspected | package-metadata-read | Exact installed package identity; public exports compiled and builder calls executed offline. Whole declaration file not reviewed. |
| /Users/darshan/Documents/ChatGPT/grokbotxphoton/node_modules/@photon-ai/advanced-imessage/dist/index.d.ts | local-inspected | public-seams-compiled-by-SDK-tests | Exact installed package identity; public exports compiled and builder calls executed offline. Whole declaration file not reviewed. |
