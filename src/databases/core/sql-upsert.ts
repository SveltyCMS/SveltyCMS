/**
 * @file src/databases/core/sql-upsert.ts
 * @description
 * Shared SQL upsert and conflict-resolution pipeline for SQL database adapters.
 * Implements single-record and batch upserts via INSERT ... ON CONFLICT / ON DUPLICATE KEY
 * with dialect-aware JSON merge, tenant isolation, and find-then-insert fallback.
 *
 * ### Features:
 * - Single-record PK upsert with ON CONFLICT / ON DUPLICATE KEY
 * - Batch upsert chunked by parameter ceilings (SQLite 900, PostgreSQL/MariaDB 65k)
 * - Safe tenant-isolated conflict updates (never mutates tenantId or cross-tenant rows)
 * - RFC 7396 aware JSON merge fallback to hydrated update
 * - Atomic write-lock serialization for non-PK conflict targets
 */

import type {
  BaseEntity,
  BaseQueryOptions,
  DatabaseResult,
  DatabaseId,
  EntityCreate,
  EntityUpdate,
  QueryFilter,
} from "../db-interface";
import { executeWrite } from "./drizzle-sql-helpers";
import {
  convertArrayDatesToISO,
  convertISOToDates,
  getTenantCondition,
  assertSafeSqlIdentifier,
} from "./relational-utils";
import { getTableName, sql, type SQL, type Table, type Column } from "drizzle-orm";
import { extractPkConflictId, getJsonDataPatch } from "./query-primitives";

/**
 * Structural view of the Drizzle insert builder's conflict-resolution surface.
 * `getDrizzleInstance` is opaque on the adapter contract, so the handle is
 * described once here instead of casting at every call site.
 */
export type DrizzleUpsertStatement = {
  run?: () => Promise<unknown>;
  returning: () => Promise<unknown[]>;
  onDuplicateKeyUpdate(config: { set: Record<string, unknown> }): DrizzleUpsertStatement;
  onConflictDoUpdate(config: {
    target: unknown;
    set: Record<string, unknown>;
    setWhere?: unknown;
  }): DrizzleUpsertStatement;
};

/** Write-side handle returned by `getDrizzleInstance`. */
export type DrizzleWriteHandle = {
  insert(table: unknown): {
    values(rows: unknown): DrizzleUpsertStatement;
  };
};

/**
 * Structural contract required by the SQL upsert pipeline from its host adapter.
 */
export interface SqlUpsertContext {
  readonly type: string;
  readonly insertReturnsRows: boolean;
  readonly persistTimestampsAsDate: boolean;
  readonly convertDatesOptions: Record<string, unknown>;
  getTable(collection: string): Table;
  getColumn(table: unknown, name: string): Column | undefined;
  ensureTableSchemaRegistered(table: unknown, collection: string): void;
  isMissingTableError(err: unknown): boolean;
  getDrizzleInstance(options?: BaseQueryOptions): DrizzleWriteHandle;
  prepareValues(
    table: unknown,
    data: unknown,
    id: unknown,
    now: Date | string,
    options: unknown,
    isUpdateOverride?: boolean,
  ): Record<string, unknown>;
  writeNow(): Date | string;
  withWriteLock<T>(fn: () => T | Promise<T>): Promise<T>;
  validateEntryId(
    collection: string,
    id: DatabaseId | undefined | null,
  ): DatabaseResult<unknown> | null;
  wrap<T>(
    operation: () => Promise<T>,
    errorCode: string,
    metricName?: string,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<T>>;
  findOne<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<T | null>>;
  update<T extends BaseEntity>(
    collection: string,
    id: DatabaseId,
    data: EntityUpdate<T>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<T>>;
  insert<T extends BaseEntity>(
    collection: string,
    data: EntityCreate<T>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<T>>;
  canMergeJsonInOneStatement(patch: Record<string, unknown>): boolean;
  quoteIdentifier(name: string): string;
  jsonMergeWrapper(colSql: string): { prefix: string; suffix: string };
  jsonUpsertMergeSet(table: unknown): SQL;
}

/**
 * Conflict-branch SET expression for the JSON `data` column: the dialect merge of the
 * STORED blob with the row the INSERT proposed (`excluded."data"` on PostgreSQL/SQLite,
 * `VALUES(data)` on MariaDB).
 */
export function buildJsonUpsertMergeSet(ctx: SqlUpsertContext, table: unknown): SQL {
  const plainName = assertSafeSqlIdentifier(ctx.getColumn(table, "data")?.name ?? "data", "column");
  const tableName = assertSafeSqlIdentifier(getTableName(table as Table), "table");
  const storedRef = `${ctx.quoteIdentifier(tableName)}.${ctx.quoteIdentifier(plainName)}`;
  const { prefix, suffix } = ctx.jsonMergeWrapper(storedRef);
  const mysql = ctx.type === "mariadb" || ctx.type === "mysql";
  const incoming = mysql
    ? sql`VALUES(${sql.identifier(plainName)})`
    : sql`excluded.${sql.identifier(plainName)}`;
  return sql`${sql.raw(prefix)}${incoming}${sql.raw(suffix)}`;
}

/** findOne then insert/update — used when the conflict target is not `_id`. */
export async function upsertByFind<T extends BaseEntity>(
  ctx: SqlUpsertContext,
  collection: string,
  query: QueryFilter<T>,
  data: EntityCreate<T>,
  options: BaseQueryOptions,
): Promise<DatabaseResult<T>> {
  // 🔒 FIND-THEN-INSERT/UPDATE is a read-modify-write race without a lock: two
  // callers can both miss `findOne` and both INSERT → duplicate rows / unique
  // violation. Serialize under the adapter's write lock (reentrant; a no-op
  // where the engine has no cross-process writers).
  return ctx.withWriteLock(async () => {
    const existing = await ctx.findOne(collection, query, options);
    if (existing.success && existing.data) {
      const existingId =
        (existing.data as { _id?: DatabaseId; id?: DatabaseId })._id ||
        (existing.data as { id?: DatabaseId }).id;
      if (existingId) {
        return ctx.update(collection, existingId, data as EntityUpdate<T>, options);
      }
    }
    return ctx.insert(collection, data, options);
  });
}

/**
 * One INSERT … ON CONFLICT (_id) / ON DUPLICATE KEY per chunk.
 * SQLite/PostgreSQL use `excluded.*`; MariaDB uses `VALUES()`.
 */
export async function executeUpsertById<T extends BaseEntity>(
  ctx: SqlUpsertContext,
  collection: string,
  rows: Array<{ id: string; data: EntityCreate<T> }>,
  options: BaseQueryOptions,
  opts: { returning: boolean },
): Promise<T[]> {
  const table = ctx.getTable(collection);
  if (!table) throw new Error(`Collection table not found: ${collection}`);
  ctx.ensureTableSchemaRegistered(table, collection);

  const idCol = ctx.getColumn(table, "_id") || ctx.getColumn(table, "id");
  if (!idCol) throw new Error("ID column not found");

  const now = ctx.writeNow();
  const len = rows.length;
  const batchValues: Record<string, unknown>[] = Array.from({ length: len });
  for (let i = 0; i < len; i++) {
    batchValues[i] = ctx.prepareValues(table, rows[i].data, rows[i].id, now, options);
  }
  if (!ctx.persistTimestampsAsDate) {
    for (let i = 0; i < len; i++) {
      batchValues[i] = convertISOToDates(
        { ...batchValues[i] },
        { ...ctx.convertDatesOptions, table: collection },
      );
    }
  }

  const mysql = ctx.type === "mariadb" || ctx.type === "mysql";
  const skipReturning =
    !opts.returning || (options as { skipReturning?: boolean }).skipReturning === true;
  const wantReturning = !skipReturning && ctx.insertReturnsRows && !mysql;

  const cols = new Set<string>();
  for (let i = 0; i < len; i++) {
    for (const k in batchValues[i]) cols.add(k);
  }

  // 🛡️ TENANT ISOLATION: `tenantId` is never written by the conflict branch —
  // ownership is immutable, so a cross-tenant PK collision can no longer
  // reassign the row to the caller's tenant. The remaining assignments are
  // additionally guarded (setWhere on PG/SQLite, IF() on MariaDB) so a
  // conflict against another tenant's row leaves it untouched.
  const tenantCol = ctx.getColumn(table, "tenantId");
  const tenantColName = tenantCol?.name;
  const setObj: Record<string, unknown> = {};
  for (const k of cols) {
    if (k === "_id" || k === "id" || k === "createdAt" || k === "tenantId") continue;
    const phys = assertSafeSqlIdentifier(ctx.getColumn(table, k)?.name ?? k, "column");
    setObj[k] = mysql
      ? tenantColName
        ? sql`IF(${sql.identifier(tenantColName)} <=> VALUES(${sql.identifier(tenantColName)}), VALUES(${sql.identifier(phys)}), ${sql.identifier(phys)})`
        : sql`VALUES(${sql.identifier(phys)})`
      : sql`excluded.${sql.identifier(phys)}`;
  }

  // 🔀 PARTIAL-UPSERT MERGE: the conflict branch MERGES the JSON `data` blob instead of
  // assigning the proposed one, so a payload that omits a field keeps the stored value
  // (MongoDB `$set` semantics). A patch the dialect operator cannot express exactly
  // (nested object / explicit null on SQLite + MariaDB, whose operators are RFC 7396)
  // takes the per-row find→update path instead, which hydrates and merges in JS.
  if (cols.has("data")) {
    const mergeable = batchValues.every((v) => {
      const patch = getJsonDataPatch(v);
      return patch ? ctx.canMergeJsonInOneStatement(patch) : true;
    });
    if (!mergeable) {
      const out: T[] = [];
      for (const row of rows) {
        const res = await upsertByFind(
          ctx,
          collection,
          { _id: row.id } as unknown as QueryFilter<T>,
          row.data,
          options,
        );
        if (res.success && res.data) out.push(res.data as T);
      }
      return out;
    }
    const dataMerge = ctx.jsonUpsertMergeSet(table);
    const dataColName = assertSafeSqlIdentifier(
      ctx.getColumn(table, "data")?.name ?? "data",
      "column",
    );
    // MySQL/MariaDB `ON DUPLICATE KEY UPDATE` has no WHERE clause, so the blob
    // merge gets the same tenant guard as the scalar columns above — otherwise a
    // cross-tenant PK collision still rewrote the victim's JSON payload.
    // PG/SQLite are covered by `setWhere` on the whole DO UPDATE.
    setObj.data =
      mysql && tenantColName
        ? sql`IF(${sql.identifier(tenantColName)} <=> VALUES(${sql.identifier(tenantColName)}), ${dataMerge}, ${sql.identifier(dataColName)})`
        : dataMerge;
  }
  if (Object.keys(setObj).length === 0) {
    const idName = idCol.name || "_id";
    setObj[idName] = sql`${idCol}`;
  }

  const maxParams = mysql || ctx.type === "postgresql" ? 65_000 : 900;
  const chunkSize = Math.max(1, Math.floor(maxParams / Math.max(cols.size, 1)));

  const run = async (): Promise<T[]> => {
    const db = ctx.getDrizzleInstance(options);
    const out: T[] = [];
    for (let start = 0; start < len; start += chunkSize) {
      const chunk = batchValues.slice(start, start + chunkSize);
      const insert = db.insert(table).values(chunk);
      // Scope the conflict UPDATE to the caller's tenant so a PK collision with
      // another tenant's row is a no-op instead of a cross-tenant overwrite.
      const setWhere = tenantCol ? getTenantCondition(tenantCol, options) : undefined;
      const upserted = mysql
        ? insert.onDuplicateKeyUpdate({ set: setObj })
        : setWhere
          ? insert.onConflictDoUpdate({ target: idCol, set: setObj, setWhere })
          : insert.onConflictDoUpdate({ target: idCol, set: setObj });
      if (wantReturning) {
        const results = await (upserted as { returning: () => Promise<unknown[]> }).returning();
        out.push(
          ...(convertArrayDatesToISO(results as Record<string, unknown>[], {
            ...ctx.convertDatesOptions,
            table: collection,
          }) as T[]),
        );
      } else {
        await executeWrite(upserted);
        out.push(
          ...(convertArrayDatesToISO(chunk as Record<string, unknown>[], {
            ...ctx.convertDatesOptions,
            table: collection,
          }) as T[]),
        );
      }
    }
    return out;
  };

  try {
    return await run();
  } catch (err: unknown) {
    const provision = ctx as unknown as {
      createModel?: (schema: { _id: string; name: string; fields: [] }) => Promise<unknown>;
    };
    if (ctx.isMissingTableError(err) && typeof provision.createModel === "function") {
      await provision.createModel({ _id: collection, name: collection, fields: [] });
      return await run();
    }
    throw err;
  }
}

/**
 * Execute a single-record upsert. If the query specifies an `_id` conflict,
 * executes atomic ON CONFLICT / ON DUPLICATE KEY; otherwise falls back to find-then-insert.
 */
export async function executeSqlUpsert<T extends BaseEntity>(
  ctx: SqlUpsertContext,
  collection: string,
  query: QueryFilter<T>,
  data: EntityCreate<T>,
  options: BaseQueryOptions = {},
): Promise<DatabaseResult<T>> {
  const conflictId = extractPkConflictId(query);
  const invalid = ctx.validateEntryId(collection, conflictId as DatabaseId | null);
  if (invalid) return invalid as DatabaseResult<T>;
  if (!conflictId) {
    return upsertByFind(ctx, collection, query, data, options);
  }
  return ctx.wrap(
    async () => {
      const rows = await executeUpsertById(ctx, collection, [{ id: conflictId, data }], options, {
        returning: true,
      });
      return rows[0];
    },
    "UPSERT_FAILED",
    undefined,
    { ...options, isWrite: true },
  );
}

/**
 * Execute a multi-record upsert batch. Partitions items into PK-addressed items
 * (batched into executeUpsertById) and non-PK items (delegated to upsertByFind).
 */
export async function executeSqlUpsertMany<T extends BaseEntity>(
  ctx: SqlUpsertContext,
  collection: string,
  items: Array<{ query: QueryFilter<T>; data: EntityCreate<T> }>,
  options: BaseQueryOptions = {},
): Promise<DatabaseResult<T[]>> {
  if (!items.length) return { success: true, data: [] };
  for (const item of items) {
    const invalid = ctx.validateEntryId(
      collection,
      extractPkConflictId(item.query) as DatabaseId | null,
    );
    if (invalid) return invalid as DatabaseResult<T[]>;
  }
  return ctx.wrap(
    async () => {
      const byId: Array<{ id: string; data: EntityCreate<T> }> = [];
      const rest: Array<{ query: QueryFilter<T>; data: EntityCreate<T> }> = [];
      for (const item of items) {
        const id = extractPkConflictId(item.query);
        if (id) byId.push({ id, data: item.data });
        else rest.push(item);
      }
      const out: T[] = [];
      if (byId.length > 0) {
        const rows = await executeUpsertById(ctx, collection, byId, options, {
          returning: (options as { skipReturning?: boolean }).skipReturning !== true,
        });
        out.push(...rows);
      }
      for (const item of rest) {
        const res = await upsertByFind(ctx, collection, item.query, item.data, options);
        if (res.success && res.data) out.push(res.data as T);
      }
      return out;
    },
    "UPSERT_MANY_FAILED",
    undefined,
    { ...options, isWrite: true },
  );
}
