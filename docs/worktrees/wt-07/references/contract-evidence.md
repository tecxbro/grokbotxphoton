# WT-07 contract evidence

Verified package declarations:

- `spectrum-ts@12.8.0`
- `@spectrum-ts/core@12.8.0`
- `@spectrum-ts/imessage@12.8.0`

Public iMessage declarations used by the lane include provider `space.get`/`space.create`, `getMembers`, space `getDisplayName`/`rename`, `getMembers`/`add`/`remove`/`leave`, `getAvatar`/`avatar`, iMessage `background`, `shareContactCard`, `effect`, `nativeContactCard`, and narrowed iMessage message metadata.

Skill records are separate guidance:

- Spectrum skill v3.1.0, SHA-256 `0a2f328fe6da4d202497e8bb859625de06af23cce884d1639dd1e8f3cb737de8`
- iMessage skill v9.1.0, SHA-256 `218af7703b8d12537ca8c6077c1b8b5d9865ccc2202fc7eaef2d883651a59dbb`
- Spectrum iMessage provider reference SHA-256 `10fb889be4fd62e0e3f201ab46e6b34096e8aa2f24101bdecb49197926e8c3de`
- Rename/avatar/membership reference SHA-256 `4f363aad74e7d910da73b971fc5f692e6f6f270d407b850a7b83e62796ae8053`
- Groups/custom reference SHA-256 `c185c67526664c24224d63b79975115ed4bda5f6a5f021b6b2f3a3c592a2ebb7`
- Advanced chats/groups/addresses references SHA-256 `02472b27caa201d9d8dc9dec0195c2ade85c57e447a6457315a4b2e37e7940b7`, `edba77502bf6afd39415a0d0889b7ef439fc2547ee7cc2eedbf5ee3b8628af28`, and `abd08fd4e8bb84e4a31388221c28509f4e220d576ba735c51acf946b83b72b41`

No private SDK field, endpoint, raw database row, client constructor, or lifecycle method is used.
