# Architecture

## Boundary

`createFeatureModule()` receives host-owned `NativeDependencies`: the existing authenticated provider binding, exact-intent authorization, content authorization, common content compilers, and optional guarded avatar retention. No lifecycle or provisioning API is available to the lane.

## Execution flow

1. Parse the F0 action and verify operation ownership, permission, context lifetime, cancellation, generation, and lease.
2. Authorize the exact immutable action before provider lookup or media staging.
3. Resolve the injected binding and require matching project/provider/account/line scope plus live capability evidence.
4. Resolve resources and explicitly route `space.get` and `space.create` through the bound phone.
5. Revalidate authority immediately before dispatch. A post-dispatch exception becomes `unknown-outcome` with `reconcile-first`.

## Operation modules

`spaces.ts` owns `executeSpaceLookup()` and `createSpace()`. `membership.ts` owns `executeMembershipOperation()`. `appearance.ts` owns `executeAppearanceOperation()` and the shared media boundary. `effects.ts` owns `executeEffect()`. `account-contact.ts` owns `shareAccountContact()`. `metadata.ts` owns `getCuratedMetadata()`. `custom-handlers.ts` owns `resolveCustomHandler()` and `executeCustomHandler()`. `sdk.ts` exposes `mapNativeOperation()` and the pinned public Spectrum types.

## Events and recovery

`applyNativeEvent()` consumes only already-normalized F0 `group` events through the shared reducer transaction. It creates no provider subscription, automatic reply, or continuation. There is no F0 group projection table, so authoritative reads still query the provider. Native writes have no safe generic replay proof; recovery remains `unknown` until host integration supplies reconciliation.
