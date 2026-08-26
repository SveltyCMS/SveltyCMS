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
 * The per-engine legacy tails (idempotent `ADD COLUMN IF NOT EXISTS`,
 * v0.0.8-era column renames, dynamic-collection `isDeleted` backfill) are
 * preserved verbatim from the previous hand-written migration files so
 * existing installations keep working; fresh installs are unaffected because
 * every tail statement is self-tolerating.
 *
 * ### Features:
 * - single declarative schema inventory for all three SQL engines
 * - per-dialect identifier quoting, types, defaults and ordering
 * - verbatim raw-SQL blocks (SQLite FTS5 virtual table + triggers, GIN
 *   indexes, partial indexes, engine-only tables) from RawSqlSpec entries
 * - per-statement warn-and-continue execution (never aborts the whole boot
 *   for one failing statement, matching the previous migration behaviour)
 * - idempotent legacy tails for pre-existing databases
 */

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
    .map((c) => (idx.postgresqlQuotedColumns?.includes(c) ? `"${c}"` : pgColumn(c)))
    .join(", ");
  const uniq = isUniqueFor(idx, "postgresql") ? "UNIQUE " : "";
  const method = idx.method?.postgresql ? ` USING ${idx.method.postgresql}` : "";
  const where = idx.where?.postgresql ? ` WHERE ${idx.where.postgresql}` : "";
  return `CREATE ${uniq}INDEX IF NOT EXISTS ${pgTableName(name)} ON ${pgTableName(
    table,
  )} (${cols})${method}${where}`;
}

function sqliteIndexStatement(idx: IndexSpec, table: string): string {
  const cols = (idx.columns.sqlite ?? []).map(sqliteIdent).join(", ");
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
      .map((c) => mariaColumn(c, idx.mariadbQuotedColumns?.includes(c) ?? false))
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
// Per-engine legacy tails (idempotent, for pre-existing databases)
// ---------------------------------------------------------------------------

async function runPostgresLegacyTails(sql: postgres.Sql): Promise<void> {
  const alters = [
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS "isRegistered" BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS "role" VARCHAR(50) NOT NULL DEFAULT 'user'`,
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS "is2FAEnabled" BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS "totpSecret" TEXT`,
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS "backupCodes" JSONB`,
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS "last2FAVerification" TIMESTAMP WITH TIME ZONE`,
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS "authenticators" JSONB`,
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS "preferences" JSONB`,
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS "failedAttempts" INT NOT NULL DEFAULT 0`,
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS "lockoutUntil" TIMESTAMP WITH TIME ZONE`,
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP WITH TIME ZONE`,
    `ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS "userAgent" VARCHAR(500)`,
    `ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS "deviceId" VARCHAR(64)`,
    `ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS "ipAddress" VARCHAR(64)`,
    `ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS "consumed" BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS "blocked" BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS "role" VARCHAR(50)`,
    `ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS "username" VARCHAR(255)`,
    `ALTER TABLE auth_api_keys ADD COLUMN IF NOT EXISTS "rateLimit" INT`,
    `ALTER TABLE auth_api_keys ADD COLUMN IF NOT EXISTS "status" VARCHAR(20) NOT NULL DEFAULT 'active'`,
    `ALTER TABLE auth_api_keys ADD COLUMN IF NOT EXISTS "lastUsed" TIMESTAMP WITH TIME ZONE`,
    `ALTER TABLE auth_api_keys ADD COLUMN IF NOT EXISTS "keyHash" VARCHAR(64)`,
    `ALTER TABLE auth_api_keys ADD COLUMN IF NOT EXISTS "prefix" VARCHAR(16)`,
    `ALTER TABLE content_nodes ADD COLUMN IF NOT EXISTS "collectionDef" JSONB`,
    `ALTER TABLE content_nodes ADD COLUMN IF NOT EXISTS "position" INT NOT NULL DEFAULT 0`,
    `ALTER TABLE content_nodes ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE content_nodes ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP WITH TIME ZONE`,
    `ALTER TABLE content_nodes ADD COLUMN IF NOT EXISTS "source" VARCHAR(50) NOT NULL DEFAULT 'filesystem'`,
    `ALTER TABLE system_virtual_folders ADD COLUMN IF NOT EXISTS "position" INT NOT NULL DEFAULT 0`,
    `ALTER TABLE media ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE media ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP WITH TIME ZONE`,
  ];
  try {
    for (const alter of alters) {
      await sql.unsafe(alter);
    }

    // 🚀 MIGRATION: Rename 'security' to 'password' if needed (v0.0.8 compatibility)
    try {
      const columns = await sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'auth_users' AND column_name = 'security'
      `;
      if (columns.length > 0) {
        logger.info("[PostgreSQL] Migrating 'security' column to 'password' in auth_users...");
        await sql.unsafe('ALTER TABLE auth_users RENAME COLUMN "security" TO "password"');
      }
    } catch {
      // Ignore
    }

    // 🚀 MIGRATION: Rename 'from'/'to' columns to 'source'/'target' in redirects_mv if needed
    try {
      const fromColumns = await sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'redirects_mv' AND column_name = 'from'
      `;
      if (fromColumns.length > 0) {
        logger.info(
          "[PostgreSQL] Migrating 'from'/'to' columns to 'source'/'target' in redirects_mv...",
        );
        await sql.unsafe('ALTER TABLE redirects_mv RENAME COLUMN "from" TO "source"');
        await sql.unsafe('ALTER TABLE redirects_mv RENAME COLUMN "to" TO "target"');
        try {
          await sql.unsafe("DROP INDEX IF EXISTS redirects_mv_tenant_from_idx");
        } catch {}
      }
    } catch {
      // Ignore
    }

    // 🚀 MIGRATION: Ensure compound lookup index (tenantId, source, active) exists
    try {
      await sql.unsafe(
        'CREATE INDEX IF NOT EXISTS idx_redirects_mv_lookup ON redirects_mv ("tenantId", "source", "active")',
      );
    } catch {
      // Index may already exist
    }

    // 🚀 MIGRATION: Ensure 'isDeleted' column exists in all dynamic collections
    try {
      const tables = await sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_name LIKE 'collection_%'
      `;
      for (const row of tables) {
        const tableName = row.table_name;
        await sql.unsafe(
          `ALTER TABLE ${quoteIdentifier(tableName, "postgresql")} ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT FALSE`,
        );
      }
    } catch {
      // Ignore
    }
  } catch {
    // Ignore error — the tails are best-effort compatibility shims
  }
}

async function runMariaDbLegacyTails(connection: mysql.Pool): Promise<void> {
  // Optional FTS index — best-effort only
  try {
    await connection.query(
      `CREATE FULLTEXT INDEX content_nodes_fts_idx ON content_nodes (name, description)`,
    );
  } catch {
    // Index may already exist or engine may not support FULLTEXT on these columns
  }

  const alters = [
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS isRegistered BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS role VARCHAR(50) NOT NULL DEFAULT 'user'`,
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS is2FAEnabled BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS totpSecret VARCHAR(255)`,
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS backupCodes JSON`,
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS last2FAVerification DATETIME`,
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS authenticators JSON`,
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS failedAttempts INT NOT NULL DEFAULT 0`,
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS lockoutUntil DATETIME`,
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS isDeleted BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS deletedAt DATETIME`,
    `ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS userAgent VARCHAR(500)`,
    `ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS deviceId VARCHAR(64)`,
    `ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS ipAddress VARCHAR(64)`,
    `ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS consumed BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS blocked BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS role VARCHAR(50)`,
    `ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS username VARCHAR(255)`,
    `ALTER TABLE auth_api_keys ADD COLUMN IF NOT EXISTS rateLimit INT`,
    `ALTER TABLE auth_api_keys ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'`,
    `ALTER TABLE auth_api_keys ADD COLUMN IF NOT EXISTS lastUsed DATETIME`,
    `ALTER TABLE auth_api_keys ADD COLUMN IF NOT EXISTS keyHash VARCHAR(64)`,
    `ALTER TABLE auth_api_keys ADD COLUMN IF NOT EXISTS prefix VARCHAR(16)`,
    `ALTER TABLE content_nodes ADD COLUMN IF NOT EXISTS collectionDef JSON`,
    `ALTER TABLE content_nodes ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'filesystem'`,
    `ALTER TABLE content_nodes ADD COLUMN IF NOT EXISTS position INT NOT NULL DEFAULT 0`,
    `ALTER TABLE content_nodes ADD COLUMN IF NOT EXISTS isDeleted BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE content_nodes ADD COLUMN IF NOT EXISTS deletedAt DATETIME`,
    `ALTER TABLE system_virtual_folders ADD COLUMN IF NOT EXISTS position INT NOT NULL DEFAULT 0`,
    `ALTER TABLE media ADD COLUMN IF NOT EXISTS isDeleted BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE media ADD COLUMN IF NOT EXISTS deletedAt DATETIME`,
  ];
  try {
    for (const alter of alters) {
      await connection.query(alter);
    }

    // 🚀 MIGRATION: Rename 'security' to 'password' if needed (v0.0.8 compatibility)
    try {
      const [columns] = await connection.query("SHOW COLUMNS FROM auth_users LIKE 'security'");
      if (Array.isArray(columns) && columns.length > 0) {
        logger.info("[MariaDB] Migrating 'security' column to 'password' in auth_users...");
        await connection.query("ALTER TABLE auth_users CHANGE security password VARCHAR(255)");
      }
    } catch {
      // Ignore
    }

    // 🚀 MIGRATION: Rename 'from'/'to' columns to 'source'/'target' in redirects_mv if needed
    try {
      const [columns] = await connection.query("SHOW COLUMNS FROM redirects_mv LIKE 'from'");
      if (Array.isArray(columns) && columns.length > 0) {
        logger.info(
          "[MariaDB] Migrating 'from'/'to' columns to 'source'/'target' in redirects_mv...",
        );
        await connection.query(
          "ALTER TABLE redirects_mv CHANGE `from` source VARCHAR(500) NOT NULL",
        );
        await connection.query(
          "ALTER TABLE redirects_mv CHANGE `to` target VARCHAR(2000) NOT NULL",
        );
        try {
          await connection.query("ALTER TABLE redirects_mv DROP INDEX tenant_from_idx");
        } catch {}
        try {
          await connection.query(
            "ALTER TABLE redirects_mv ADD INDEX tenant_source_idx (tenantId, source)",
          );
        } catch {}
      }
    } catch (err) {
      logger.error("[MariaDB] redirects_mv column migration failed:", err);
    }

    // 🚀 MIGRATION: Add compound lookup index (tenantId, source, active) for redirects_mv
    try {
      await connection.query(
        "CREATE INDEX IF NOT EXISTS idx_redirects_mv_lookup ON redirects_mv (tenantId, source, active)",
      );
    } catch {
      // Index may already exist
    }
  } catch {
    // Column already exists or other error we can ignore
  }

  // 🚀 MIGRATION: Ensure 'isDeleted' column exists in all dynamic collections
  try {
    const [tables] = await connection.query("SHOW TABLES LIKE 'collection_%'");
    if (Array.isArray(tables)) {
      for (const row of tables) {
        const tableName = Object.values(row as any)[0] as string;
        // MariaDB supports ADD COLUMN IF NOT EXISTS
        await connection.query(
          `ALTER TABLE ${quoteIdentifier(tableName, "mariadb")} ADD COLUMN IF NOT EXISTS isDeleted BOOLEAN NOT NULL DEFAULT FALSE`,
        );
      }
    }
  } catch {
    // Ignore
  }
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
    if (!message.includes("already exists") && !message.includes("duplicate column name")) {
      logger.error(`[SQLite Schema Bootstrap] FAILED: ${message}`);
      throw err;
    }
  }
}

async function runSqliteTails(db: unknown): Promise<void> {
  // 🚀 MIGRATION: Add missing auth columns for upgraded databases (idempotent)
  executeSqlite(db, `ALTER TABLE "auth_users" ADD COLUMN "isRegistered" INTEGER DEFAULT 0`);
  executeSqlite(db, `ALTER TABLE "auth_users" ADD COLUMN "role" TEXT DEFAULT 'user'`);
  executeSqlite(db, `ALTER TABLE "auth_users" ADD COLUMN "is2FAEnabled" INTEGER DEFAULT 0`);
  executeSqlite(db, `ALTER TABLE "auth_users" ADD COLUMN "totpSecret" TEXT`);
  executeSqlite(db, `ALTER TABLE "auth_users" ADD COLUMN "backupCodes" TEXT`);
  executeSqlite(db, `ALTER TABLE "auth_users" ADD COLUMN "last2FAVerification" INTEGER`);
  executeSqlite(db, `ALTER TABLE "auth_users" ADD COLUMN "authenticators" TEXT`);
  executeSqlite(db, `ALTER TABLE "auth_users" ADD COLUMN "failedAttempts" INTEGER DEFAULT 0`);
  executeSqlite(db, `ALTER TABLE "auth_users" ADD COLUMN "lockoutUntil" INTEGER`);
  executeSqlite(db, `ALTER TABLE "auth_users" ADD COLUMN "preferences" TEXT`);
  executeSqlite(db, `ALTER TABLE "auth_users" ADD COLUMN "isDeleted" INTEGER DEFAULT 0`);
  executeSqlite(db, `ALTER TABLE "auth_users" ADD COLUMN "deletedAt" INTEGER`);

  executeSqlite(db, `ALTER TABLE "auth_sessions" ADD COLUMN "userAgent" TEXT`);
  executeSqlite(db, `ALTER TABLE "auth_sessions" ADD COLUMN "deviceId" TEXT`);
  executeSqlite(db, `ALTER TABLE "auth_sessions" ADD COLUMN "ipAddress" TEXT`);

  executeSqlite(db, `ALTER TABLE "auth_tokens" ADD COLUMN "consumed" INTEGER DEFAULT 0`);
  executeSqlite(db, `ALTER TABLE "auth_tokens" ADD COLUMN "blocked" INTEGER DEFAULT 0`);
  executeSqlite(db, `ALTER TABLE "auth_tokens" ADD COLUMN "role" TEXT`);
  executeSqlite(db, `ALTER TABLE "auth_tokens" ADD COLUMN "username" TEXT`);

  executeSqlite(db, `ALTER TABLE "auth_api_keys" ADD COLUMN "rateLimit" INTEGER`);
  executeSqlite(db, `ALTER TABLE "auth_api_keys" ADD COLUMN "status" TEXT DEFAULT 'active'`);
  executeSqlite(db, `ALTER TABLE "auth_api_keys" ADD COLUMN "lastUsed" INTEGER`);
  executeSqlite(db, `ALTER TABLE "auth_api_keys" ADD COLUMN "keyHash" TEXT`);
  executeSqlite(db, `ALTER TABLE "auth_api_keys" ADD COLUMN "prefix" TEXT`);

  executeSqlite(db, `ALTER TABLE "content_nodes" ADD COLUMN "collectionDef" TEXT`);
  executeSqlite(db, `ALTER TABLE "content_nodes" ADD COLUMN "position" INTEGER DEFAULT 0`);
  executeSqlite(db, `ALTER TABLE "content_nodes" ADD COLUMN "isDeleted" INTEGER DEFAULT 0`);
  executeSqlite(db, `ALTER TABLE "content_nodes" ADD COLUMN "deletedAt" INTEGER`);
  executeSqlite(db, `ALTER TABLE "content_nodes" ADD COLUMN "source" TEXT DEFAULT 'filesystem'`);
  executeSqlite(db, `ALTER TABLE "system_virtual_folders" ADD COLUMN "position" INTEGER DEFAULT 0`);
  executeSqlite(db, `ALTER TABLE "media" ADD COLUMN "isDeleted" INTEGER DEFAULT 0`);
  executeSqlite(db, `ALTER TABLE "media" ADD COLUMN "deletedAt" INTEGER`);

  // 🚀 MIGRATION: Rename 'security' to 'password' if needed
  try {
    const prepared = (db as { prepare?: (sql: string) => { all(): Array<{ name: string }> } })
      .prepare;
    const tableInfo = prepared ? prepared('PRAGMA table_info("auth_users")').all() : [];
    const hasSecurity = tableInfo.some((c) => c.name === "security");
    const hasPassword = tableInfo.some((c) => c.name === "password");

    if (hasSecurity && !hasPassword) {
      logger.info("[SQLite] Migrating 'security' column to 'password' in auth_users...");
      executeSqlite(db, 'ALTER TABLE "auth_users" RENAME COLUMN "security" TO "password"');
    }
  } catch {
    // Ignore
  }
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
    logger.info(`[${dialect}] Bootstrapping system schema...`);

    if (dialect === "postgresql") {
      const sql = connection as postgres.Sql;
      for (const stmt of renderBootstrapStatements("postgresql")) {
        try {
          await sql.unsafe(stmt);
        } catch (err: any) {
          // Never abort the whole bootstrap for a single statement; log and continue.
          logger.warn(`[PostgreSQL] Schema statement failed (continuing): ${err?.message || err}`);
        }
      }
      await runPostgresLegacyTails(sql);
    } else if (dialect === "mariadb") {
      const pool = connection as mysql.Pool;
      for (const stmt of renderBootstrapStatements("mariadb")) {
        try {
          await pool.query(stmt);
        } catch (err) {
          // Never abort the whole bootstrap for a single statement; log and continue.
          logger.warn(
            `[MariaDB] Schema statement failed (continuing): ${(err as any)?.message || String(err)}`,
          );
        }
      }
      await runMariaDbLegacyTails(pool);
    } else {
      // 🚀 PERFORMANCE: all core table creations in a single batch execution
      executeSqlite(connection, renderSqliteBatch());
      await runSqliteTails(connection);
    }

    logger.info(`[${dialect}] System schema bootstrap completed successfully`);
    return { success: true };
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
