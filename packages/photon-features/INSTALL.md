# Installation and rollback

Installation stages an immutable release and selects it **inactive**. It does not start a service, contact Photon, send messages, provision lines, install global dependencies, change billing or grant platform permissions. Preserve any fuller installed skill/voice policy; the packaged skill stays under its own versioned release directory and is not copied over another bot's policy.

## Toolchain and candidate boundary

Use Node 24.13.0 and npm 10.9.2, ESM, Spectrum 12.8.0 and Zod 4.5.4. Existing global Node is not replaced. Bundled dependencies are captured from a fresh lockfile installation on the approved candidate's build platform. Install only on the same OS/architecture as the candidate; native dependencies need integration probes on that target. Lifecycle scripts remain disabled. Do not enable dependency scripts merely because an optional codec is unavailable.

Integration supplies the package bin mapping `grok-photon: dist/src/cli/main.js`
and a source-derived `photon:test:integration` aggregate that includes all
non-live lane, integration, foundation, security, and end-to-end tests. Artifact
production still requires a clean committed candidate and an approval file from
the approved integration workflow. The local approval file is a trusted input,
not a cryptographically verified GitHub attestation. Restrict write access to the
release operator/workflow. No final artifact is created without that approval.

The approval file has this shape (substitute exact real values):

```json
{
  "kind": "assembled-candidate-approval",
  "approved": true,
  "commit": "<40-character tested candidate commit>",
  "f0Digest": "<64-character foundation digest>",
  "workflowRun": "https://github.com/tecxbro/grokbotxphoton/actions/runs/<run-id>"
}
```

From a tools checkout, with an output path outside the candidate:

```sh
node packages/photon-features/scripts/package.mjs /absolute/assembled-candidate /absolute/approval.json /absolute/artifacts/release.gpf.gz
```

This command validates the clean commit/toolchain/approval, runs local `npm ci --ignore-scripts`, clears generated `dist`, rebuilds through the test gates, runs existing/F0/schema/integration tests and checks generated skill drift. This dependency preparation may access the npm registry; it has no account or provider calls. The integration gate must be offline and must not invoke live messaging. Do not set production secrets in the build environment.

The deterministic gzip JSON archive is **not** a tarball or an npm package. Use the supplied installer. Its file entries contain a safe relative path, owner-only mode, size, SHA-256 and base64 bytes. It includes compiled `dist/src` JavaScript/types, schemas, 44 registry examples plus four assigned examples, skill, manuals, generator/install/package/rollback/smoke scripts, a private `bin/grok-photon` launcher, shared package metadata, exact repository dependency lock, F0 identity and the freshly installed dependencies. Test fixtures and runtime databases, socket files, credential paths and dotenv files are excluded/refused. npm `.bin` links are omitted; the launcher is supplied separately. The archive is tied to the tested commit and `docs/worktrees/foundation.json` digest. The checksum sidecar verifies exact bytes; a separate provenance JSON records test output hashes, whose timings may vary between runs. Identical payload/metadata inputs produce identical archive bytes.

No full archive has been built in WT-08. Dependency packaging and native runtime compatibility remain assembled-candidate integration checks. WT-00 must preserve the pinned dependency layout or extend the collector for new nested runtime dependencies; current nested workspace packages contain only developer types/tools.

## Stage an approved release

Obtain the archive and its checksum through the trusted integration workflow. Do not treat a checksum supplied by an unknown source as authentication. The parent of the chosen installation root must already exist and be controlled by the administrator. Pass an absolute, dedicated root that does not contain unrelated files.

```sh
node /absolute/tools/install.mjs install /absolute/release.gpf.gz <sha256> /absolute/grok-photon
```

Keep `package.mjs` alongside `install.mjs`; the latter imports its archive validator. No package manager or network is used during installation. The installer validates the complete archive before extraction, refuses unsafe paths/symlinks and creates owner-owned 0700 root/runtime/release directories. Credentials and SQLite/WAL/SHM belong under `runtime/`, never in the release. File modes are 0600 or 0700. It records disabled activation and atomically selects the checksummed release. Reinstalling identical bytes verifies the existing tree and selects it again; modified releases are refused. It never replaces arbitrary nonempty roots or other skills.

A selected release can be inspected offline:

```sh
node /absolute/grok-photon/releases/<sha256>/scripts/smoke-test.mjs /absolute/grok-photon/releases/<sha256>
```

The CLI is `/absolute/grok-photon/releases/<sha256>/bin/grok-photon`. Add that release's `bin` directory to the task launcher's PATH explicitly. This is local task configuration, not a global npm installation.

## Separate activation prerequisites

There is intentionally no automatic activation command in WT-08. WT-00 owns the host entrypoint/supervisor and must implement these integration requirements before activation:

1. Verify a single host owner under `runtime/host.lock`. Host startup and installation must coordinate on `.install-lock`; a lock file's presence is a refusal, not permission to kill a process or remove a stale lock. Verify process identity before operator recovery. Never launch a competing consumer.
2. Keep `runtime/configuration.json` disabled until an explicitly authorized supervisor activation. Configure the selected cloud transport, existing project/line, secret storage, database path, authoritative context resolver and existing Grok wake/task-acceptance adapter. Unknown/missing bindings must fail readiness.
3. Create a random 64-hex local credential in a 0600 file, mapped to the correct principal, and current scoped task grants. Photon SDK credentials stay exclusively in host storage. Supply only the local file path, socket path and context lookup key to the task launcher.
4. Validate schema/codecs and preserve inbox/outbox/unknown outcomes before startup. Hold the owner lock before database/socket/ingress activation and maintain protected WAL/SHM permissions.
5. Use the read-only `doctor --json` and `capabilities --json` after authorized activation. Readiness, provider availability and physical-device delivery are separate evidence tiers.

These are host integration requirements, not implemented activation guarantees. F0 alone has no system-wide owner lock or production entrypoint. The installer refuses a present host lock/socket or an enabled configuration. It never deletes those markers.

## Shutdown before rollback

Stop the verified host through its approved supervisor and disable configuration first. Confirm the supervisor reports a clean shutdown and no owner/socket remains through its normal lifecycle; never remove another process's socket/lock or kill an unverified PID to force rollback. Keep the database, queued requests, unknown outcomes, inbox/handoffs and recovery codecs intact.

```sh
node /absolute/tools/rollback.mjs /absolute/grok-photon <previous-release-sha256> confirm-inactive
```

Rollback reconstructs and checks the original artifact checksum from the installed files, validates the pinned Node version and reads actual SQLite `PRAGMA user_version` in read-only mode. It changes only the inactive selected-release pointer. WT-08 tests this on schema 1 with queued and unknown-outcome rows. It does not run migrations, delete work, reset the database or resend anything. Schema versions other than 1 fail with `INCOMPATIBLE_DOWNGRADE` before changing the selection. Later schema or recovery-codec versions need explicit compatibility tests and an approved tooling revision. Never promise an older executable can read a newer schema.

The earlier `install.mjs rollback ...` entry remains compatible for already scripted operators, but new automation should use the dedicated `rollback.mjs` and its exported `rollbackInstallation()` API.
