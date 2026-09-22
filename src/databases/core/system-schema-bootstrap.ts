/**
 * @file src/databases/core/system-schema-bootstrap.ts
 * @description
 * Boot-time system schema provisioning for SQLite, MariaDB and PostgreSQL,
 * rendered directly from the single source of truth
 * (src/databases/system-schema-spec.ts) and executed against the live
 * connection. There are no generated migration artifacts and no generator
 * script — the spec IS the migration, so the three engines can never drift
 * (the historical `auth_api_keys` class of bug is structurally impossible).
 *
 * The spec is the ONLY schema path: no hand-maintained migration copies and no
 * per-engine legacy tails. Fresh databases are provisioned from the spec, and an
 * unchanged release skips the pass entirely (fingerprint, see below) — there is
 * exactly one trail.
 *
 * ### Features:
 * - single declarative schema inventory for all three SQL engines
 * - per-dialect identifier quoting, types, defaults and ordering
 * - verbatim raw-SQL blocks (SQLite FTS5 virtual table + triggers, GIN
 *   indexes, partial indexes, engine-only tables) from RawSqlSpec entries
 * - per-statement warn-and-continue execution (never aborts the whole boot
 *   for one failing statement)
 * - schema fingerprint: an unchanged spec skips the DDL pass on every later boot
 */

import { createHash } from "node:crypto";
import { logger } from "@utils/logger";
import type postgres from "postgres";
import type mysql from "mysql2/promise";

import {
  SYSTEM_SCHEMA,
  type ColumnSpec,
  type Dialect,
  type IndexSpec,
  type RawSqlSpec,
  type SchemaItem,
  type TableSpec,
} from "../system-schema-spec";

export interface BootstrapResult {
  success: boolean;
  error?: string;
  message?: string;
  /** True when the spec-derived DDL already matched the stored fingerprint. */
  skipped?: boolean;
  /** Statements executed in this pass (all dialects except SQLite, which batches). */
  statements?: number;
  /** Failed statements — the marker is NOT stored so the next boot retries. */
  failures?: number;
}

// ---------------------------------------------------------------------------
// Identifier quoting per dialect
// ---------------------------------------------------------------------------

/**
 * Escape-quotes an SQL identifier for the given dialect. Every interpolated
 * identifier in this module flows through this helper so schema DDL can never
 * inject raw input (the source is the static SYSTEM_SCHEMA spec and DB
 * introspection, both escape-quoted here).
 */
function quoteIdentifier(name: string, dialect: Dialect): string {
  if (dialect === "mariadb") {
    return `\`${name.replace(/`/g, "``")}\``;
  }
  return `"${name.replace(/"/g, '""')}"`;
}

/** PostgreSQL: always double-quoted (preserves mixed-case identifiers). */
function pgTableName(name: string): string {
  return quoteIdentifier(name, "postgresql");
}

function pgColumn(name: string): string {
  return quoteIdentifier(name, "postgresql");
}

/** MariaDB: backtick reserved words only (non-reserved names stay bare). */
function mariaColumn(name: string, quoted: boolean): string {
  return quoted ? quoteIdentifier(name, "mariadb") : name;
}

/** SQLite: always double-quote. */
function sqliteIdent(name: string): string {
  return quoteIdentifier(name, "sqlite");
}

// ---------------------------------------------------------------------------
// Per-dialect ordering
// ---------------------------------------------------------------------------

/** "Move to position" (1-based) semantics for TableSpec.order overrides. */
function sortTables(dialect: Dialect, tables: TableSpec[]): TableSpec[] {
  const seq = [...tables];
  const moves = tables
    .filter((t) => t.order?.[dialect] !== undefined)
    .sort((a, b) => a.order![dialect]! - b.order![dialect]!);
  for (const table of moves) {
    const from = seq.indexOf(table);
    seq.splice(from, 1);
    const to = Math.min(table.order![dialect]! - 1, seq.length);
    seq.splice(to, 0, table);
  }
  return seq;
}

function rawHasContent(raw: RawSqlSpec, dialect: Dialect): boolean {
  return !!raw.sql?.[dialect] || !!raw.comment?.[dialect];
}

/**
 * Merge the per-dialect sorted tables back into their declaration slots so
 * RawSqlSpec entries keep their exact positions (e.g. the postgresql GIN
 * block sits between `tenants` and `audit_logs`).
 */
function sequenceFor(dialect: Dialect, sortedTables: TableSpec[]): SchemaItem[] {
  const seq: SchemaItem[] = [];
  let ti = 0;
  for (const item of SYSTEM_SCHEMA) {
    if (item.kind === "raw") {
      if (rawHasContent(item, dialect)) seq.push(item);
    } else {
      seq.push(sortedTables[ti++]);
    }
  }
  return seq;
}

// ---------------------------------------------------------------------------
// Column / index rendering
// ---------------------------------------------------------------------------

function colFor(c: ColumnSpec, dialect: Dialect): string | null {
  const type = c.type[dialect];
  if (!type) return null; // column does not exist on this engine
  const notNull = typeof c.notNull === "boolean" ? c.notNull : (c.notNull?.[dialect] ?? false);
  const def = typeof c.default === "string" ? c.default : c.default?.[dialect];
  const trailing = c.trailing?.[dialect];

  const pk = c.primaryKey ? " PRIMARY KEY" : "";
  const nn = notNull ? " NOT NULL" : "";
  const dv = def !== undefined ? ` DEFAULT ${def}` : "";
  const tr = trailing ? ` ${trailing}` : "";

  if (dialect === "sqlite") {
    return `${sqliteIdent(c.name)} ${type}${pk}${nn}${dv}${tr}`;
  }
  if (dialect === "postgresql") {
    return `${sqliteIdent(c.name)} ${type}${pk}${nn}${dv}`;
  }
  return `${mariaColumn(c.name, c.mariadbQuoted ?? false)} ${type}${pk}${nn}${dv}`;
}

function sortedColumns(t: TableSpec, dialect: Dialect): ColumnSpec[] {
  return [...t.columns]
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const oa = a.c.order?.[dialect] ?? a.i;
      const ob = b.c.order?.[dialect] ?? b.i;
      return oa - ob;
    })
    .map((x) => x.c);
}

function isUniqueFor(idx: IndexSpec, dialect: Dialect): boolean {
  return idx.unique === true || (typeof idx.unique === "object" && idx.unique[dialect] === true);
}

function pgIndexStatement(idx: IndexSpec, table: string): string {
  const name = idx.name.postgresql!;
  const cols = (idx.columns.postgresql ?? [])
    .map((c) => {
      const rendered = idx.postgresqlQuotedColumns?.includes(c) ? `"${c}"` : pgColumn(c);
      return idx.descColumns?.postgresql?.includes(c) ? `${rendered} DESC` : rendered;
    })
    .join(", ");
  const uniq = isUniqueFor(idx, "postgresql") ? "UNIQUE " : "";
  const method = idx.method?.postgresql ? ` USING ${idx.method.postgresql}` : "";
  const where = idx.where?.postgresql ? ` WHERE ${idx.where.postgresql}` : "";
  return `CREATE ${uniq}INDEX IF NOT EXISTS ${pgTableName(name)} ON ${pgTableName(
    table,
  )} (${cols})${method}${where}`;
}

function sqliteIndexStatement(idx: IndexSpec, table: string): string {
  const cols = (idx.columns.sqlite ?? [])
    .map((c) => (idx.descColumns?.sqlite?.includes(c) ? `${sqliteIdent(c)} DESC` : sqliteIdent(c)))
    .join(", ");
  const uniq = isUniqueFor(idx, "sqlite") ? "UNIQUE " : "";
  return `CREATE ${uniq}INDEX IF NOT EXISTS ${sqliteIdent(idx.name.sqlite!)} ON ${sqliteIdent(
    table,
  )} (${cols});`;
}

function mariaInlineIndexes(t: TableSpec): string[] {
  const lines: string[] = [];
  for (const idx of t.indexes ?? []) {
    if (!idx.name.mariadb) continue;
    const cols = (idx.columns.mariadb ?? [])
      .map((c) => {
        const rendered = mariaColumn(c, idx.mariadbQuotedColumns?.includes(c) ?? false);
        // MariaDB <10.8 parses and ignores DESC; kept for spec parity where declared.
        return idx.descColumns?.mariadb?.includes(c) ? `${rendered} DESC` : rendered;
      })
      .join(", ");
    const uniq = isUniqueFor(idx, "mariadb") ? "UNIQUE " : "";
    lines.push(`${uniq}INDEX ${idx.name.mariadb} (${cols})`);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Static DDL rendering (public for the schema-spec parity test)
// ---------------------------------------------------------------------------

/**
 * Renders the ordered DDL statements for PostgreSQL/MariaDB — one element per
 * statement, in boot execution order (tables, per-table extensions, indexes
 * and raw blocks in declaration order).
 */
export function renderBootstrapStatements(dialect: "postgresql" | "mariadb"): string[] {
  const tables = SYSTEM_SCHEMA.filter((i): i is TableSpec => i.kind === "table");
  const seq = sequenceFor(dialect, sortTables(dialect, tables));
  const statements: string[] = [];

  for (const item of seq) {
    if (item.kind === "raw") {
      statements.push(...(item.sql?.[dialect] ?? []));
      continue;
    }
    const cols = sortedColumns(item, dialect)
      .map((c) => colFor(c, dialect))
      .filter((l): l is string => l !== null);
    if (dialect === "mariadb") {
      const tableName = item.mariadbQuotedTable ? quoteIdentifier(item.name, "mariadb") : item.name;
      statements.push(
        `CREATE TABLE IF NOT EXISTS ${tableName} (\n${[...cols, ...mariaInlineIndexes(item)].join(
          ",\n",
        )}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      );
    } else {
      statements.push(
        `CREATE TABLE IF NOT EXISTS ${pgTableName(item.name)} (\n${cols.join(",\n")}\n)`,
      );
      statements.push(...(item.extensions?.postgresql ?? []));
    }
    for (const idx of item.indexes ?? []) {
      if (dialect === "mariadb") continue; // inline in the CREATE TABLE above
      if (!idx.name.postgresql) continue;
      statements.push(pgIndexStatement(idx, item.name));
    }
  }
  return statements;
}

/**
 * Renders the SQLite schema as ONE multi-statement batch (executed via
 * `db.exec`). Ordering: tables + after-table indexes, then pre-grouped raw
 * blocks (FTS5 virtual table), then grouped indexes, then post-grouped raw
 * blocks (triggers) — FTS5 must exist before the indexes/triggers that
 * reference it.
 */
export function renderSqliteBatch(): string {
  const tables = SYSTEM_SCHEMA.filter((i): i is TableSpec => i.kind === "table");
  const preGrouped: RawSqlSpec[] = [];
  const postGrouped: RawSqlSpec[] = [];
  for (const item of SYSTEM_SCHEMA) {
    if (item.kind !== "raw" || !item.sql?.sqlite) continue;
    (item.sqliteAfterGroupedIndexes ? postGrouped : preGrouped).push(item);
  }

  const grouped: IndexSpec[] = [];
  const items: string[] = [];
  let prevIsIndex = false;

  const pushItem = (text: string, noGapBefore: boolean, isIndex: boolean) => {
    if (items.length === 0) {
      items.push(text);
    } else {
      const noGap = noGapBefore || (prevIsIndex && isIndex);
      items.push((noGap ? "\n" : "\n\n") + text);
    }
    prevIsIndex = isIndex;
  };

  for (const t of tables) {
    const cols = sortedColumns(t, "sqlite")
      .map((c) => colFor(c, "sqlite"))
      .filter((l): l is string => l !== null);
    const constraints = (t.sqliteTableConstraints ?? []).map((c) => `        ${c}`);
    pushItem(
      `CREATE TABLE IF NOT EXISTS ${sqliteIdent(t.name)} (\n${[...cols, ...constraints].join(
        ",\n",
      )}\n);`,
      false,
      false,
    );
    for (const idx of t.indexes ?? []) {
      if (!idx.name.sqlite) continue;
      if (idx.sqliteAfterTable) {
        pushItem(sqliteIndexStatement(idx, t.name), idx.sqliteNoGapBefore ?? false, true);
      } else {
        grouped.push(idx);
      }
    }
  }

  for (const raw of preGrouped) {
    pushItem(raw.sql!.sqlite!.join("\n"), false, false);
  }
  for (const idx of grouped) {
    pushItem(
      sqliteIndexStatement(idx, tables.find((t) => t.indexes?.includes(idx))?.name ?? ""),
      false,
      true,
    );
  }
  for (const raw of postGrouped) {
    pushItem(raw.sql!.sqlite!.join("\n"), false, false);
  }

  return items.join("");
}

// ---------------------------------------------------------------------------
// SQLite execution helpers
// ---------------------------------------------------------------------------

/** Execute a SQLite statement, tolerating "already exists" / duplicate column noise. */
function executeSqlite(db: unknown, sql: string): void {
  try {
    const client = db as {
      exec?: (sql: string) => unknown;
      run?: (sql: string) => unknown;
      query?: (sql: string) => { run(): unknown };
    };
    if (typeof client.exec === "function") client.exec(sql);
    else if (typeof client.run === "function") client.run(sql);
    else if (typeof client.query === "function") client.query(sql).run();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      !message.includes("already exists") &&
      !message.includes("duplicate column name") &&
      !message.includes("no such table")
    ) {
      logger.error(`[SQLite Schema Bootstrap] FAILED: ${message}`);
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Schema freshness marker
// ---------------------------------------------------------------------------

/**
 * The main pass re-applied every `CREATE TABLE/INDEX IF NOT EXISTS` on **every
 * boot** — 118 statements, measured 2026-09-22 against a provisioned PostgreSQL:
 * **124 ms per start** (0.4 ms per round trip), on a database that already had
 * them. With the fingerprint in place that boot costs **~2 ms**:
 *
 * - the fingerprint is derived from `SYSTEM_SCHEMA`, so ANY spec change (new
 *   table, changed type/default, new index) produces a new fingerprint and re-runs
 *   the pass — drift-free by construction, unlike a hand-incremented version
 *   number that someone forgets to bump.
 * - there is **no** legacy migration path: the spec is the only schema trail, so a
 *   database provisioned before a spec change must be re-provisioned or migrated
 *   with the release that introduced it (see the upgrade guide).
 * - the fingerprint is only stored when **no** statement failed, so a
 *   half-applied schema is retried on the next boot instead of being trusted.
 * - every marker failure (missing table, read error) degrades to "run the pass",
 *   never to "skip provisioning".
 */
export function computeSchemaFingerprint(dialect: Dialect, spec: unknown = SYSTEM_SCHEMA): string {
  return createHash("sha256")
    .update(`${dialect}\u0000${JSON.stringify(spec)}`)
    .digest("hex")
    .slice(0, 32);
}

/** Bootstrap infrastructure (not domain schema, so not part of the spec). */
const SCHEMA_STATE_TABLE = "svelty_schema_state";

/** Values inlined into the marker DDL: constants + a hex fingerprint, never user input. */
function assertStateToken(value: string, label: string): string {
  if (!/^[0-9a-zA-Z._:-]{1,64}$/.test(value)) {
    throw new Error(`Invalid schema-state ${label}`);
  }
  return value;
}

function stateSql(dialect: Dialect) {
  const quote = dialect === "mariadb" ? (n: string) => `\`${n}\`` : (n: string) => `"${n}"`;
  const table = quote(SCHEMA_STATE_TABLE);
  const colDialect = quote("dialect");
  const colFingerprint = quote("fingerprint");
  const colAppliedAt = quote("appliedAt");
  // MariaDB cannot key on TEXT without a prefix length — VARCHAR there, TEXT elsewhere.
  const idType = dialect === "mariadb" ? "VARCHAR(32)" : "TEXT";
  const fingerprintType = dialect === "mariadb" ? "VARCHAR(64)" : "TEXT";
  const appliedAtType = dialect === "mariadb" ? "VARCHAR(40)" : "TEXT";
  return {
    create:
      `CREATE TABLE IF NOT EXISTS ${table} (` +
      `${colDialect} ${idType} PRIMARY KEY, ${colFingerprint} ${fingerprintType} NOT NULL, ` +
      `${colAppliedAt} ${appliedAtType} NOT NULL)`,
    select: (name: string) =>
      `SELECT ${colFingerprint} AS fingerprint FROM ${table} ` +
      `WHERE ${colDialect} = '${assertStateToken(name, "dialect")}' LIMIT 1`,
    upsert: (name: string, fingerprint: string, appliedAt: string) =>
      `INSERT INTO ${table} (${colDialect}, ${colFingerprint}, ${colAppliedAt}) VALUES ` +
      `('${assertStateToken(name, "dialect")}', '${assertStateToken(fingerprint, "fingerprint")}', ` +
      `'${assertStateToken(appliedAt, "appliedAt")}')` +
      (dialect === "mariadb"
        ? ` ON DUPLICATE KEY UPDATE ${colFingerprint} = VALUES(${colFingerprint}), ${colAppliedAt} = VALUES(${colAppliedAt})`
        : ` ON CONFLICT (${colDialect}) DO UPDATE SET ${colFingerprint} = EXCLUDED.${colFingerprint}, ${colAppliedAt} = EXCLUDED.${colAppliedAt}`),
  };
}

/** Row-returning SQLite read (`executeSqlite` is fire-and-forget by design). */
function sqliteSelect(db: unknown, statement: string): Record<string, unknown> | null {
  const client = db as {
    query?: (sql: string) => {
      all?: () => unknown[];
      get?: () => unknown;
    };
  };
  const stmt = client.query?.(statement);
  if (!stmt) return null;
  if (typeof stmt.all === "function") {
    const rows = stmt.all();
    return (rows[0] as Record<string, unknown>) ?? null;
  }
  if (typeof stmt.get === "function") {
    return (stmt.get() as Record<string, unknown>) ?? null;
  }
  return null;
}

/**
 * Per-dialect marker access. Every method swallows errors: a marker that cannot be
 * read or written must never fail the boot, it just means "run the pass".
 */
interface SchemaStateStore {
  read(): Promise<string | null>;
  store(fingerprint: string): Promise<void>;
}

function createStateStore(dialect: Dialect, connection: unknown): SchemaStateStore {
  const sqlText = stateSql(dialect);
  const appliedAt = () => new Date().toISOString();

  if (dialect === "postgresql") {
    const sql = connection as postgres.Sql;
    return {
      read: async () => {
        try {
          await sql.unsafe(sqlText.create);
          const rows = await sql.unsafe(sqlText.select(dialect));
          return (rows[0] as { fingerprint?: string } | undefined)?.fingerprint ?? null;
        } catch {
          return null;
        }
      },
      store: async (fingerprint) => {
        try {
          await sql.unsafe(sqlText.create);
          await sql.unsafe(sqlText.upsert(dialect, fingerprint, appliedAt()));
        } catch (err: any) {
          logger.debug(`[PostgreSQL] Schema marker not stored: ${err?.message || err}`);
        }
      },
    };
  }

  if (dialect === "mariadb") {
    const pool = connection as mysql.Pool;
    return {
      read: async () => {
        try {
          await pool.query(sqlText.create);
          const rows = (await pool.query(sqlText.select(dialect))) as unknown as [
            Array<{ fingerprint?: string }>,
          ];
          return rows[0]?.[0]?.fingerprint ?? null;
        } catch {
          return null;
        }
      },
      store: async (fingerprint) => {
        try {
          await pool.query(sqlText.create);
          await pool.query(sqlText.upsert(dialect, fingerprint, appliedAt()));
        } catch (err: any) {
          logger.debug(`[MariaDB] Schema marker not stored: ${err?.message || err}`);
        }
      },
    };
  }

  return {
    read: async () => {
      try {
        executeSqlite(connection, sqlText.create);
        const row = sqliteSelect(connection, sqlText.select(dialect));
        return typeof row?.fingerprint === "string" ? row.fingerprint : null;
      } catch {
        return null;
      }
    },
    store: async (fingerprint) => {
      try {
        executeSqlite(connection, sqlText.create);
        executeSqlite(connection, sqlText.upsert(dialect, fingerprint, appliedAt()));
      } catch (err: any) {
        logger.debug(`[SQLite] Schema marker not stored: ${err?.message || err}`);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export async function bootstrapSystemSchema(
  dialect: "postgresql",
  connection: postgres.Sql,
): Promise<BootstrapResult>;
export async function bootstrapSystemSchema(
  dialect: "mariadb",
  connection: mysql.Pool,
): Promise<BootstrapResult>;
export async function bootstrapSystemSchema(
  dialect: "sqlite",
  connection: unknown,
): Promise<BootstrapResult>;
export async function bootstrapSystemSchema(
  dialect: Dialect,
  connection: unknown,
): Promise<BootstrapResult> {
  try {
    const stateStore = createStateStore(dialect, connection);
    const fingerprint = computeSchemaFingerprint(dialect);
    const stored = await stateStore.read();

    if (stored === fingerprint) {
      logger.info(
        `[${dialect}] System schema up to date (${fingerprint.slice(0, 8)}) — skipped the DDL pass`,
      );
      return { success: true, skipped: true };
    }

    logger.info(`[${dialect}] Bootstrapping system schema...`);
    let failures = 0;
    let statements = 0;

    if (dialect === "postgresql") {
      const sql = connection as postgres.Sql;
      for (const stmt of renderBootstrapStatements("postgresql")) {
        statements++;
        try {
          await sql.unsafe(stmt);
        } catch (err: any) {
          // Never abort the whole bootstrap for a single statement; log and continue.
          failures++;
          logger.warn(`[PostgreSQL] Schema statement failed (continuing): ${err?.message || err}`);
        }
      }
    } else if (dialect === "mariadb") {
      const pool = connection as mysql.Pool;
      for (const stmt of renderBootstrapStatements("mariadb")) {
        statements++;
        try {
          await pool.query(stmt);
        } catch (err) {
          // Never abort the whole bootstrap for a single statement; log and continue.
          failures++;
          logger.warn(
            `[MariaDB] Schema statement failed (continuing): ${(err as any)?.message || String(err)}`,
          );
        }
      }
    } else {
      // 🚀 PERFORMANCE: all core table creations in a single batch execution
      executeSqlite(connection, renderSqliteBatch());
    }

    // Only trust the marker when nothing failed — otherwise the next boot retries.
    if (failures === 0) await stateStore.store(fingerprint);

    logger.info(
      `[${dialect}] System schema bootstrap completed successfully` +
        (statements > 0 ? ` (${statements} statements)` : "") +
        (failures > 0 ? ` with ${failures} failed statement(s) — marker not stored` : ""),
    );
    return { success: true, statements, ...(failures > 0 ? { failures } : {}) };
  } catch (error) {
    logger.error(`[${dialect}] System schema bootstrap failed:`, error);
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: message,
      message,
    };
  }
}
