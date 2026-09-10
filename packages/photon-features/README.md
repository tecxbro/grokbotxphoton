# Grok Photon feature package

WT-08 implements the local CLI, persistent operating skill, schema-validated examples and inactive distribution tooling on the F0 foundation. Integration supplies runtime composition, the package/bin registration and the aggregate test command. This checkout is an assembled local candidate, not an approved release.

Read [SKILL.md](SKILL.md) for the operator contract and all 44 registry-derived action examples. Read [INSTALL.md](INSTALL.md) for staging, activation prerequisites and rollback. The `grok-photon` commands belong to this package; they are separate from the Photon account-management CLI.

From the repository root with Node **24.13.0** and npm **10.9.2** on PATH:

```sh
npm run photon:build
npm run photon:test:integration
node packages/photon-features/scripts/generate-skill.mjs --check
node --test packages/photon-features/dist/tests/lanes/wt-08/{unit,sdk-contract,integration,regression}.test.js
node --test packages/photon-features/dist/tests/lanes/wt-08/cli.test.js
node --test packages/photon-features/tests/lanes/wt-08/distribution.test.mjs
node packages/photon-features/scripts/smoke-test.mjs
npm test
npm run photon:check
```

While other lanes are under construction, the focused compile command is:

```sh
node packages/photon-features/node_modules/typescript/bin/tsc -p packages/photon-features/tests/lanes/wt-08/tsconfig.json
```

The package-local TypeScript is the F0-pinned 5.9.3. A focused compile proves only WT-08 and its imported foundation seams. Distribution tests use synthetic archives and temporary SQLite state. They do not package or activate the feature runtime.

The assembled package registers `grok-photon` at `dist/src/cli/main.js`. Before an
approved inactive installation, invoke the built CLI directly:

```sh
node packages/photon-features/dist/src/cli/main.js doctor --json
```

The task launcher must supply `GROK_PHOTON_CONTEXT_ID`, `GROK_PHOTON_SOCKET` and `GROK_PHOTON_CREDENTIAL_FILE`. Missing configuration produces a machine-readable failure. Ordinary smoke tests intentionally clear these variables and make no socket or provider calls.

To regenerate the persistent manual's operation table and examples after an approved registry/schema change:

```sh
node packages/photon-features/scripts/generate-skill.mjs
```

Generation preserves handwritten operating instructions and fuller voice guidance outside its marked table. It uses registry entries, shared parsers and committed fixture examples; it contains no second action schema. `--check` rejects table, example or inventory drift.

## Exported WT-08 functions

- `main()` reads the supported command and writes one machine JSON line; `readJson()` enforces the stdin byte/UTF-8 boundary. The earlier `run` name remains an alias.
- `executeCommand()` parses and dispatches one request; `commandRequest()` exposes strict parsing for tests and embedded callers.
- `callRuntime()` performs one authenticated Unix-socket exchange without retries. The earlier `localRequest` name remains an alias.
- `formatCommandResult()` maps protocol/error results to stable stdout, stderr and exits.
- `generateSkill()` and `validateExamples()` generate/check 44 operation examples plus the four named end-to-end examples from the actual registry, schemas and fixtures.
- `buildPackage()`, `installPackage()`, `verifyInstallation()` and `rollbackInstallation()` are the distribution lifecycle APIs. Packaging is side-effectful only on an approved clean assembled candidate/output path; install/rollback require an inactive host and never delete runtime data; smoke verification is offline.

The four concise examples are [create poll](examples/wt-08/create-poll.json), [reply](examples/wt-08/reply.json), [send voice](examples/wt-08/send-voice.json), and [update card](examples/wt-08/update-card.json). Replace fixture references only with resources resolved and authorized by the active context.
