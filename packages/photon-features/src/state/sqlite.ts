import { DatabaseSync } from "node:sqlite";
import type { Scope } from "../contracts/resources.js";
import {
  tables,
  type StateTables,
  type Table,
  type Transaction,
  type TransactionStore,
} from "./ports.js";
export const STORE_VERSION = 1;
export const migrations = tables
  .map(
    (table) =>
      `CREATE TABLE IF NOT EXISTS "${table}" (id TEXT PRIMARY KEY, scope TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 0), body TEXT NOT NULL CHECK(json_valid(body))); CREATE INDEX IF NOT EXISTS "${table}_scope" ON "${table}"(scope,id);`,
  )
  .join("\n");
const scopeKey = (s: Scope) =>
  JSON.stringify([s.projectId, s.provider, s.accountId, s.lineId, s.spaceId]);
function tableName(table: Table): string {
  if (!tables.includes(table)) throw new Error("INVALID_TABLE");
  return `"${table}"`;
}
/** Shared durable primitives. Outbox scheduling/authorization belongs to WT-01. */
export class SQLiteStore implements TransactionStore {
  private readonly db: DatabaseSync;
  private active = false;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;",
    );
    const version = Number(
      this.db.prepare("PRAGMA user_version").get()?.user_version,
    );
    if (version !== 0 && version !== STORE_VERSION) {
      this.db.close();
      throw new Error("UNSUPPORTED_STORE_VERSION");
    }
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.exec(migrations);
      this.db.exec(`PRAGMA user_version=${STORE_VERSION}; COMMIT`);
    } catch (e) {
      this.db.exec("ROLLBACK");
      this.db.close();
      throw e;
    }
  }
  transaction<T>(fn: (tx: Transaction) => T): T {
    if (this.active) throw new Error("NESTED_TRANSACTION");
    this.db.exec("BEGIN IMMEDIATE");
    this.active = true;
    let open = true;
    const guard = () => {
      if (!open) throw new Error("TRANSACTION_CLOSED");
    };
    const tx: Transaction = {
      get: <K extends Table>(table: K, id: string) => {
        guard();
        const row = this.db
          .prepare(`SELECT body FROM ${tableName(table)} WHERE id=?`)
          .get(id);
        return row
          ? (JSON.parse(String(row.body)) as StateTables[K])
          : undefined;
      },
      list: <K extends Table>(table: K, scope: Scope, limit: number) => {
        guard();
        if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
          throw new Error("INVALID_LIMIT");
        return this.db
          .prepare(
            `SELECT body FROM ${tableName(table)} WHERE scope=? ORDER BY id LIMIT ?`,
          )
          .all(scopeKey(scope), limit)
          .map((r) => JSON.parse(String(r.body)) as StateTables[K]);
      },
      listWork: (scope, principalId, taskId, generation, now, limit) => {
        guard();
        if (!Number.isInteger(limit) || limit < 1 || limit > 100)
          throw new Error("INVALID_LIMIT");
        return this.db
          .prepare(
            `SELECT body FROM handoffs WHERE scope=? AND json_extract(body,'$.principalId')=? AND json_extract(body,'$.taskId')=? AND json_extract(body,'$.generation')=? AND (json_extract(body,'$.state')='pending' OR (json_extract(body,'$.state')='claimed' AND json_extract(body,'$.claim.leaseUntil')<=?)) ORDER BY id LIMIT ?`,
          )
          .all(scopeKey(scope), principalId, taskId, generation, now, limit)
          .map((r) => JSON.parse(String(r.body)) as StateTables["handoffs"]);
      },
      put: <K extends Table>(
        table: K,
        record: StateTables[K],
        expected: number | null,
      ) => {
        guard();
        const name = tableName(table);
        const body = JSON.stringify(record);
        if (expected === null) {
          if (record.revision !== 0) throw new Error("STALE_FENCE");
          this.db
            .prepare(
              `INSERT INTO ${name}(id,scope,revision,body) VALUES(?,?,?,?)`,
            )
            .run(record.id, scopeKey(record.scope), 0, body);
        } else {
          if (record.revision !== expected + 1) throw new Error("STALE_FENCE");
          const r = this.db
            .prepare(
              `UPDATE ${name} SET revision=?,body=? WHERE id=? AND revision=? AND scope=?`,
            )
            .run(
              record.revision,
              body,
              record.id,
              expected,
              scopeKey(record.scope),
            );
          if (r.changes !== 1) throw new Error("STALE_FENCE");
        }
      },
    };
    try {
      const result = fn(tx);
      if (
        result !== null &&
        (typeof result === "object" || typeof result === "function") &&
        "then" in result
      )
        throw new Error("ASYNC_TRANSACTION_FORBIDDEN");
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    } finally {
      open = false;
      this.active = false;
    }
  }
  close(): void {
    if (this.active) throw new Error("TRANSACTION_ACTIVE");
    this.db.close();
  }
}
