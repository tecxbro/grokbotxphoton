# Grokbot x Photon

A standalone deterministic messaging runtime for Grok tasks using Photon Spectrum. It provides typed messaging actions, durable local state, authenticated worker IPC, feature modules, and a local `grok-photon` executable.

The Grok orchestrator is an external integration dependency. This repository contains the new Photon product; it does not include the separate Grok Bot CLI implementation.

## What is included

- **Runtime and state:** durable inbox/outbox, task claims, fenced execution, cancellation and recovery.
- **Transport:** inbound normalization, authenticated webhook handling, and typing lifecycle.
- **Messaging features:** text/composition, media, polls, app cards, and native conversation operations across a 44-operation contract.
- **Worker tools:** local CLI, operating skill, validated examples, inactive installation and rollback tooling.
- **Verification:** foundation, lane, integration, security and explicitly gated live tests, plus source/evidence records.

Source: [`packages/photon-features/src/`](packages/photon-features/src/). Tests: [`packages/photon-features/tests/`](packages/photon-features/tests/). Architecture: [`architecthure.md`](architecthure.md). Contributor guide: [`agent.md`](agent.md).

## Development

Use **Node 24.13.0** and **npm 10.9.2**. Spectrum is pinned to **12.8.0** in the feature workspace.

```sh
npm ci --ignore-scripts
npm run build
npm test
npm run check
npm run smoke
```

`npm test` runs the 60 foundation tests. `npm run check` verifies generated schemas and the frozen F0 contract digest. `npm run smoke` exercises the CLI offline without connecting a host or provider.

Run independent offline integration/security verification separately:

```sh
npm run test:verification
```

This suite currently fails on the documented integration defects below. It is not part of the foundation-only CI job. The existing live tests require separate explicit authorization and configuration.

For a particular lane after building:

```sh
node --test packages/photon-features/dist/tests/lanes/wt-03/*.test.js
```

## Current status

All nine implementation/verification lanes are present. This is an implementation snapshot under integration, not an installable production release.

| Gate | Status |
| --- | --- |
| Product foundation and compilation | Passed in the recorded preflight |
| Text through durable executor | Blocked: execution-service contract mismatch (WT09-001) |
| Inbound poll continuation | Blocked: router/reducer duplicate inbox ownership (WT09-002) |
| Runtime database versus installer | Blocked: private-file permission mismatch (WT09-003) |
| Full poll management | `poll.get`, `poll.vote`, `poll.unvote`, `poll.addOption` require implementation |
| Production host and Grok wake wiring | Incomplete / unverified |
| Final package, activation and live verification | Not complete |

Read the [44-operation evidence matrix](docs/photon-features/reports/wt-09/operation-coverage.md), [verification requirements](docs/photon-features/reports/wt-09/requirements.md), and [defect reports](docs/photon-features/requests/wt-09/).

## Local executable and installation

After building, the new executable can be invoked directly:

```sh
node packages/photon-features/dist/src/cli/main.js doctor --json
```

An active host requires a scoped context, private credential file and local socket configuration. Missing configuration produces a structured failure. No host is activated by cloning, installing development dependencies, or running the offline checks.

See the [operating skill](packages/photon-features/SKILL.md) and [installation/rollback guide](packages/photon-features/INSTALL.md). Final artifact generation remains gated on an assembled tested candidate.

## Provenance

Historical F0/lane evidence is retained unchanged, including its original repository URLs, commit identities and old CLI regression counts. Those references document where the work was developed; the former CLI source, tests, demos, changelog and automatic publishing setup are excluded from this product's current tree.

## License

[MIT](LICENSE). The license records tecxbro and contributors for the new product and retains the original ScriptedAlchemy notice for inherited materials. The feature package and release collector include the same license.
