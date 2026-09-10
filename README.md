# Grokbot x Photon

A standalone deterministic messaging runtime for Grok tasks using Photon Spectrum. It provides typed messaging actions, durable local state, authenticated worker IPC, feature modules, and a local `grok-photon` executable.

The Grok orchestrator is an external integration dependency. This repository contains the new Photon product; it does not include the separate Grok Bot CLI implementation.

## What is included

- **Runtime and state:** durable inbox/outbox, task claims, fenced execution, cancellation and recovery.
- **Transport:** inbound normalization, authenticated webhook handling, and typing lifecycle.
- **Messaging features:** text/composition, media, polls, app cards, and native conversation operations across a 44-operation contract.
- **Worker tools:** local CLI, operating skill, validated examples, inactive installation and rollback tooling.
- **Verification:** foundation, lane, integration, security and explicitly gated live tests, plus source/evidence records.

Source: [`packages/photon-features/src/`](packages/photon-features/src/). Tests: [`packages/photon-features/tests/`](packages/photon-features/tests/). Architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md). Contributor guide: [`AGENTS.md`](AGENTS.md).

## Development

Use **Node 24.13.0** and **npm 10.9.2**. Spectrum is pinned to **12.8.0** in the feature workspace.

```sh
npm ci --ignore-scripts
npm run build
npm test
npm run check
npm run photon:test:integration
npm run photon:verify-all
npm run smoke
```

`npm test` runs the 60 foundation tests. `npm run check` verifies generated schemas and the assembled candidate contract digest. `npm run photon:test:integration` discovers the full non-live test surface. `npm run photon:verify-all` adds the product-boundary, documentation, generated-skill and package checks. `npm run smoke` exercises the product CLI offline without connecting a host or provider.

The live test directory remains excluded unless separately authorized and configured.

For a particular lane after building:

```sh
node --test packages/photon-features/dist/tests/lanes/wt-03/*.test.js
```

## Current status

All nine reviewed implementation/verification lanes are assembled. This is a locally verified candidate, not an installed or activated production release.

| Gate | Status |
| --- | --- |
| Product foundation and compilation | Passed |
| Complete registered surface | 44 handlers and 12 compiler families passed |
| Non-live assembled tests | 755/755 passed on the source candidate |
| Package dry-run and synthetic lifecycle | Passed |
| Production host and external Grok wake wiring | Not activated or verified |
| Final approved artifact and live/device verification | Not complete |

Read the [integration handoff](docs/worktrees/integration/HANDOFF.md), [test evidence](docs/worktrees/integration/TEST-EVIDENCE.md), and [remaining release gates](docs/worktrees/integration/CHANGE-REQUESTS.md).

## Local executable and installation

After building, the new executable can be invoked directly:

```sh
node packages/photon-features/dist/src/cli/main.js doctor --json
```

An active host requires a scoped context, private credential file and local socket configuration. Missing configuration produces a structured failure. No host is activated by cloning, installing development dependencies, or running the offline checks.

See the [operating skill](packages/photon-features/SKILL.md) and [installation/rollback guide](packages/photon-features/INSTALL.md). Final artifact generation remains gated on an assembled tested candidate.

## Provenance

Historical F0/lane evidence retains its source commit identities for auditability. The former Grok Bot CLI source, tests, demos, metadata, changelog and publishing workflows are excluded from this product tree and from this repository's new history.

## License

[MIT](LICENSE). The license records tecxbro and contributors for the new product and retains the original ScriptedAlchemy notice for inherited materials. The feature package and release collector include the same license.
