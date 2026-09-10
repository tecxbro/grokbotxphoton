# Sources

Official Photon Markdown is normative. The local Spectrum and iMessage skills are workflow guidance and are recorded separately from official documentation. The installed public declarations are the executable contract.

All official sources in `source-lock.json` returned HTTP 200 on 2026-09-10 with `text/plain` or `text/markdown`, a matching document title, and a recorded SHA-256 digest. Installed package declarations were inspected for Spectrum 12.8.0, `@spectrum-ts/core` 12.8.0, and `@spectrum-ts/imessage` 12.8.0.

Focused conclusions:

- `space.get` and `space.create` are resolver operations that throw on unsupported/provider failures and require explicit per-phone routing when multiple dedicated lines exist.
- Group creation and group administration require a dedicated cloud line; direct conversations reject group-only name, membership, and avatar operations.
- Rename, avatar, membership, background, account contact, and effect operations use public Spectrum content/space APIs. A resolved send-routed control does not prove device rendering.
- Native contact sharing always uses the authorized account identity and is distinct from arbitrary `contact()` content.
- Curated message metadata can contain user content; WT-07 returns only F0's allowlisted timestamps and direction.
- Inbound group changes arrive through the provider event stream owned by WT-02; WT-07 consumes normalized `group` events without subscribing again.

See `references/contract-evidence.md` for the package and skill boundary record.
