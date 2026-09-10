import {
  sameScope,
  type ExecutionServices,
  type ResourceRef,
} from "../../contracts/index.js";
import type {
  TransactionStore,
  Transaction,
  Table,
  StateTables,
  Claim,
} from "../../state/index.js";
import { ExecutionClaims } from "./claims.js";
import { canonical } from "./idempotency.js";
import { fault } from "./errors.js";
const featureTables: readonly Table[] = [
  "references",
  "polls",
  "votes",
  "cards",
  "sessions",
  "checkpoints",
  "children",
  "stagedMedia",
  "streams",
];
/** Feature code is trusted, but the store it receives cannot write outside this execution. */
export function fencedStore(
  claims: ExecutionClaims,
  id: string,
  claim: Claim,
): TransactionStore {
  return {
    close: () => fault("FORBIDDEN"),
    transaction<T>(fn: (tx: Transaction) => T): T {
      return claims.store.transaction((tx) => {
        const { context: c } = claims.writable(tx, id, claim);
        function allowed<K extends Table>(
          table: K,
          row: StateTables[K],
        ): boolean {
          if (!featureTables.includes(table) || !sameScope(row.scope, c.scope))
            return false;
          if ("requestId" in row) return row.requestId === id;
          if ("ownedByPrincipalId" in row)
            return (
              row.ownedByPrincipalId === c.principalId &&
              row.taskId === c.taskId &&
              row.generation === c.generation
            );
          if ("principalId" in row)
            return (
              row.principalId === c.principalId &&
              "taskId" in row &&
              row.taskId === c.taskId &&
              (!("generation" in row) || row.generation === c.generation)
            );
          const ref = "reference" in row ? row.reference : undefined;
          const refId = ref?.id ?? ("pollId" in row ? row.pollId : undefined);
          const owner = refId ? tx.get("references", refId) : undefined;
          return (
            !!owner &&
            owner.ownedByPrincipalId === c.principalId &&
            owner.taskId === c.taskId &&
            owner.generation === c.generation &&
            sameScope(owner.scope, c.scope)
          );
        }
        const guarded: Transaction = {
          get: <K extends Table>(table: K, key: string) => {
            const row = tx.get(table, key);
            return row && allowed(table, row) ? row : undefined;
          },
          list: <K extends Table>(
            table: K,
            scope: StateTables[K]["scope"],
            limit: number,
          ) => {
            if (!sameScope(scope, c.scope)) return fault("SCOPE_MISMATCH");
            return tx
              .list(table, scope, limit)
              .filter((r) => allowed(table, r));
          },
          listWork: () => fault("FORBIDDEN"),
          put: <K extends Table>(
            table: K,
            row: StateTables[K],
            revision: number | null,
          ) => {
            if (!allowed(table, row)) fault("FORBIDDEN");
            if (
              "claim" in row &&
              row.claim &&
              (row.claim.owner !== claim.owner ||
                row.claim.fence !== claim.fence ||
                row.claim.generation !== claim.generation)
            )
              fault("STALE_FENCE");
            const old = tx.get(table, row.id);
            if (old && !allowed(table, old)) fault("FORBIDDEN");
            tx.put(table, row, revision);
          },
        };
        const result = fn(guarded);
        claims.writable(tx, id, claim);
        return result;
      });
    },
  };
}
export type FeatureDependencies = Pick<
  ExecutionServices,
  "resources" | "media" | "streams"
>;
export function servicesFor(
  claims: ExecutionClaims,
  id: string,
  claim: Claim,
  deps: FeatureDependencies,
  signal: AbortSignal,
): ExecutionServices {
  const current = () =>
    claims.store.transaction((tx) => claims.writable(tx, id, claim).context);
  const c = current();
  const check = (ref: ResourceRef) =>
    claims.store.transaction((tx) => {
      const { context } = claims.writable(tx, id, claim);
      claims.contexts.reference(tx, context, ref);
      return context;
    });
  return {
    context: c,
    claim: Object.freeze({ ...claim }),
    clock: claims.contexts.clock,
    signal,
    transactions: fencedStore(claims, id, claim),
    resources: {
      resolve: async (ref) => {
        const value = await deps.resources.resolve(ref, check(ref));
        check(ref);
        if (canonical(value) !== canonical(ref)) fault("RESOURCE_NOT_FOUND");
        return value;
      },
      space: async (ref) => {
        const value = await deps.resources.space(ref, check(ref));
        check(ref);
        return value;
      },
      message: async (ref) => {
        const value = await deps.resources.message(ref, check(ref));
        check(ref);
        return value;
      },
    },
    media: {
      resolve: async (media) => {
        const value = await deps.media.resolve(media, current());
        current();
        return value;
      },
    },
    streams: {
      open: async (ref, _context, abort) => {
        const value = await deps.streams.open(ref, check(ref), abort);
        current();
        return value;
      },
    },
  };
}
