/**
 * @file src/databases/system-schema-spec.ts
 * @description
 * Single source of truth for the SveltyCMS relational system schema.
 *
 * The three hand-maintained migration files (postgresql/mariadb/sqlite) used
 * to drift apart because every engine had its own copy of the ~26 CREATE TABLE
 * blocks — e.g. `auth_api_keys` existed in the SQLite migrations but was
 * silently missing from PostgreSQL and MariaDB, breaking API keys on those
 * engines. This module replaces those copies with ONE declarative inventory:
 *
 * - tables + columns are declared once, with per-dialect SQL types/defaults
 * - indexes are declared once, with per-dialect names
 * - hand-written dialect SQL that cannot be derived (SQLite FTS5 virtual table
 *   + triggers, the auth_users partial unique indexes, engine-only tables,
 *   one-off legacy statements) lives in RawSqlSpec entries and is preserved
 *   verbatim by the generator
 *
 * The generator (scripts/generate-system-migrations.ts) renders the three
 * migration files from this spec. The parity test
 * (tests/unit/databases/schema-spec-parity.test.ts) asserts the spec matches
 * the Drizzle `schema.ts` files, so adding a column to one without the other
 * fails CI.
 *
 * ### Features:
 * - declarative table/column/index inventory shared by all three engines
 * - per-dialect type, nullability, default and identifier-quoting rules
 * - verbatim raw-SQL escape hatch for hand-tuned dialect constructs
 */

export const DIALECTS = ["sqlite", "postgresql", "mariadb"] as const;
export type Dialect = (typeof DIALECTS)[number];

/** SQL column: logical name + per-dialect type/nullability/default. */
export interface ColumnSpec {
  name: string;
  /** Full SQL type per dialect (e.g. "VARCHAR(255)", "JSONB", "INTEGER"). A dialect key that is absent means the column does NOT exist on that engine. */
  type: Partial<Record<Dialect, string>>;
  /** NOT NULL per dialect. Absent/`false` = nullable. */
  notNull?: boolean | Partial<Record<Dialect, boolean>>;
  /** DEFAULT literal per dialect (raw SQL text, e.g. "'user'", "0", "CURRENT_TIMESTAMP"). */
  default?: string | Partial<Record<Dialect, string>>;
  /** Renders "PRIMARY KEY" after the type. */
  primaryKey?: boolean;
  /** Trailing per-dialect keywords appended after DEFAULT (e.g. sqlite inline "UNIQUE"). */
  trailing?: Partial<Record<Dialect, string>>;
  /** Backtick the identifier in MariaDB (reserved words: key, usage). */
  mariadbQuoted?: boolean;
  /** Per-dialect sort-position override (fractional allowed). */
  order?: Partial<Record<Dialect, number>>;
}

/** Index: per-dialect name + columns. Rendered inline (MariaDB) or as standalone statements. */
export interface IndexSpec {
  /** Index name per dialect — engines historically use different names (e.g. `path_tenant_idx` vs `idx_content_nodes_path_tenant`). */
  name: Partial<Record<Dialect, string>>;
  /** Indexed columns per dialect (MariaDB `path_unique` only indexes `path`, other engines include `tenantId`). */
  columns: Partial<Record<Dialect, string[]>>;
  /** UNIQUE per dialect (e.g. sqlite `idx_system_themes_name_tenant` is unique while postgresql `themes_name_idx` is not). */
  unique?: boolean | Partial<Record<Dialect, boolean>>;
  /** Index method per dialect (e.g. postgresql "gin"). */
  method?: Partial<Record<Dialect, string>>;
  /** Partial-index predicate per dialect (e.g. the postgresql unconsumed-token index). */
  where?: Partial<Record<Dialect, string>>;
  /** MariaDB inline-index columns that need backticks (reserved words). */
  mariadbQuotedColumns?: string[];
  /** Postgresql index columns that are quoted even though the default rule would not quote them (historical hand-quirks). */
  postgresqlQuotedColumns?: string[];
  /** Standalone-statement quote style for postgresql. Default: backtick when any identifier needs quoting, else double quotes. */
  postgresqlQuote?: "'" | '"' | "`";
  /** SQLite: render directly after the owning table instead of in the grouped unique-index section. */
  sqliteAfterTable?: boolean;
  /** SQLite: no blank line before this statement. */
  sqliteNoGapBefore?: boolean;
}

/** Table: shared column list, optional inline indexes and table-local raw SQL. */
export interface TableSpec {
  kind: "table";
  name: string;
  /** Comment line rendered above the DDL (postgresql/mariadb). */
  comment: string;
  columns: ColumnSpec[];
  indexes?: IndexSpec[];
  /** Raw per-dialect SQL emitted right after the table DDL, before its indexes (e.g. the postgresql `DROP INDEX` for the legacy path unique). */
  extensions?: Partial<Record<Dialect, string[]>>;
  /** SQLite-only inline table constraints rendered after the last column (e.g. `UNIQUE("path", "tenantId")`). */
  sqliteTableConstraints?: string[];
  /** Backtick the table name in MariaDB (e.g. `404_logs` starts with a digit). */
  mariadbQuotedTable?: boolean;
  /** Per-dialect sort-position override ("move to position" semantics, 1-based). */
  order?: Partial<Record<Dialect, number>>;
}

/** Raw SQL block preserved verbatim. Postgresql/mariadb entries are single statements; the sqlite entry is one multi-statement block (already indented). */
export interface RawSqlSpec {
  kind: "raw";
  /** Statements per dialect. Postgresql/mariadb: each element renders as one `queries` array entry. SQLite: a single element containing the full block. */
  sql?: Partial<Record<Dialect, string[]>>;
  /** Comment line(s) rendered above the SQL (postgresql/mariadb). */
  comment?: Partial<Record<Dialect, string[]>>;
  /** SQLite: render after the grouped unique-index section instead of before it. */
  sqliteAfterGroupedIndexes?: boolean;
}

export type SchemaItem = TableSpec | RawSqlSpec;

// ---------------------------------------------------------------------------
// Per-dialect type helpers
// ---------------------------------------------------------------------------

/** Variable-length string: TEXT (sqlite) vs VARCHAR(n) (postgresql/mariadb). */
function varchar(len: number): Partial<Record<Dialect, string>> {
  return { sqlite: "TEXT", postgresql: `VARCHAR(${len})`, mariadb: `VARCHAR(${len})` };
}

/** Unbounded text. */
function text(): Partial<Record<Dialect, string>> {
  return { sqlite: "TEXT", postgresql: "TEXT", mariadb: "TEXT" };
}

/** Boolean: INTEGER 0/1 (sqlite) vs BOOLEAN. */
function boolCol(): Partial<Record<Dialect, string>> {
  return { sqlite: "INTEGER", postgresql: "BOOLEAN", mariadb: "BOOLEAN" };
}

/** Integer: INTEGER (sqlite) vs INT. */
function intCol(): Partial<Record<Dialect, string>> {
  return { sqlite: "INTEGER", postgresql: "INT", mariadb: "INT" };
}

/** JSON: TEXT (sqlite) vs JSONB (postgresql) vs JSON (mariadb). */
function jsonCol(): Partial<Record<Dialect, string>> {
  return { sqlite: "TEXT", postgresql: "JSONB", mariadb: "JSON" };
}

/** Timestamp: INTEGER ms epoch (sqlite) vs TIMESTAMP WITH TIME ZONE vs DATETIME. */
function tsCol(): Partial<Record<Dialect, string>> {
  return {
    sqlite: "INTEGER",
    postgresql: "TIMESTAMP WITH TIME ZONE",
    mariadb: "DATETIME",
  };
}

// ---------------------------------------------------------------------------
// Per-dialect default helpers
// ---------------------------------------------------------------------------

/** now() for each engine. */
function dNow(): Partial<Record<Dialect, string>> {
  return {
    sqlite: "(strftime('%s', 'now') * 1000)",
    postgresql: "CURRENT_TIMESTAMP",
    mariadb: "CURRENT_TIMESTAMP",
  };
}

/** now() with MariaDB's ON UPDATE clause for updatedAt. */
function dNowUpdate(): Partial<Record<Dialect, string>> {
  return {
    sqlite: "(strftime('%s', 'now') * 1000)",
    postgresql: "CURRENT_TIMESTAMP",
    mariadb: "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
  };
}

function dFalse(): Partial<Record<Dialect, string>> {
  return { sqlite: "0", postgresql: "FALSE", mariadb: "FALSE" };
}

function dTrue(): Partial<Record<Dialect, string>> {
  return { sqlite: "1", postgresql: "TRUE", mariadb: "TRUE" };
}

function dInt(n: number | string): Partial<Record<Dialect, string>> {
  const v = String(n);
  return { sqlite: v, postgresql: v, mariadb: v };
}

function dStr(s: string): Partial<Record<Dialect, string>> {
  const v = `'${s}'`;
  return { sqlite: v, postgresql: v, mariadb: v };
}

// ---------------------------------------------------------------------------
// Shared column builders
// ---------------------------------------------------------------------------

/** NOT NULL on postgresql + mariadb only (SQLite historically omits it). */
const pgMaria = { postgresql: true, mariadb: true };

/** UUID primary key: `_id VARCHAR(36) PRIMARY KEY` (+ gen_random_uuid() default on postgresql). */
function pkId(): ColumnSpec {
  return {
    name: "_id",
    type: varchar(36),
    primaryKey: true,
    default: { postgresql: "gen_random_uuid()::text" },
  };
}

/** createdAt/updatedAt pair. */
function timestamps(): ColumnSpec[] {
  return [
    { name: "createdAt", type: tsCol(), notNull: pgMaria, default: dNow() },
    { name: "updatedAt", type: tsCol(), notNull: pgMaria, default: dNowUpdate() },
  ];
}

// ---------------------------------------------------------------------------
// The schema — declared in PostgreSQL file order; per-dialect `order`
// overrides re-position tables for mariadb/sqlite ("move to position", 1-based).
// ---------------------------------------------------------------------------

export const SYSTEM_SCHEMA: SchemaItem[] = [
  // ── postgresql bootstrap ───────────────────────────────────────────────────
  {
    kind: "raw",
    comment: { postgresql: ["Ensure pgcrypto extension for gen_random_uuid()"] },
    sql: { postgresql: [`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`] },
  },

  // ── Auth Users ─────────────────────────────────────────────────────────────
  {
    kind: "table",
    name: "auth_users",
    comment: "Auth Users",
    columns: [
      pkId(),
      { name: "email", type: varchar(255), notNull: true },
      { name: "username", type: varchar(255) },
      { name: "password", type: varchar(255) },
      { name: "emailVerified", type: boolCol(), notNull: pgMaria, default: dFalse() },
      { name: "blocked", type: boolCol(), notNull: pgMaria, default: dFalse() },
      {
        name: "isAdmin",
        type: boolCol(),
        notNull: pgMaria,
        default: dFalse(),
        order: { sqlite: 12 },
      },
      { name: "firstName", type: varchar(255) },
      { name: "lastName", type: varchar(255) },
      { name: "avatar", type: text() },
      {
        name: "roleIds",
        type: jsonCol(),
        notNull: pgMaria,
        default: { sqlite: dStr("[]").sqlite, postgresql: dStr("[]").postgresql },
      },
      { name: "role", type: varchar(50), notNull: true, default: dStr("user") },
      { name: "isRegistered", type: boolCol(), notNull: pgMaria, default: dFalse() },
      { name: "is2FAEnabled", type: boolCol(), notNull: pgMaria, default: dFalse() },
      {
        name: "totpSecret",
        type: { sqlite: "TEXT", postgresql: "TEXT", mariadb: "VARCHAR(255)" },
      },
      { name: "backupCodes", type: jsonCol() },
      { name: "last2FAVerification", type: tsCol() },
      { name: "authenticators", type: jsonCol() },
      { name: "preferences", type: { sqlite: "TEXT", postgresql: "JSONB" } },
      { name: "failedAttempts", type: intCol(), notNull: pgMaria, default: dInt(0) },
      { name: "lockoutUntil", type: tsCol() },
      { name: "tenantId", type: varchar(36) },
      ...timestamps(),
    ],
    indexes: [
      {
        name: { postgresql: "auth_users_email_idx", mariadb: "email_idx" },
        columns: { postgresql: ["email"], mariadb: ["email"] },
      },
      {
        name: { postgresql: "auth_users_tenant_idx", mariadb: "tenant_idx" },
        columns: { postgresql: ["tenantId"], mariadb: ["tenantId"] },
      },
      {
        name: { postgresql: "auth_users_email_tenant_unique", mariadb: "email_tenant_unique" },
        columns: { postgresql: ["email", "tenantId"], mariadb: ["email", "tenantId"] },
        unique: true,
      },
    ],
  },

  // ── Auth Sessions ──────────────────────────────────────────────────────────
  {
    kind: "table",
    name: "auth_sessions",
    comment: "Auth Sessions",
    columns: [
      pkId(),
      { name: "user_id", type: varchar(36), notNull: true },
      { name: "expires", type: tsCol(), notNull: true },
      { name: "tenantId", type: varchar(36) },
      ...timestamps(),
    ],
    indexes: [
      {
        name: { postgresql: "auth_sessions_user_idx", mariadb: "user_idx" },
        columns: { postgresql: ["user_id"], mariadb: ["user_id"] },
      },
      {
        name: { postgresql: "auth_sessions_expires_idx", mariadb: "expires_idx" },
        columns: { postgresql: ["expires"], mariadb: ["expires"] },
      },
      {
        name: { postgresql: "auth_sessions_tenant_idx", mariadb: "tenant_idx" },
        columns: { postgresql: ["tenantId"], mariadb: ["tenantId"] },
      },
    ],
  },

  // ── Auth Tokens ────────────────────────────────────────────────────────────
  {
    kind: "table",
    name: "auth_tokens",
    comment: "Auth Tokens",
    columns: [
      pkId(),
      { name: "user_id", type: varchar(36), notNull: true },
      { name: "email", type: varchar(255), notNull: true },
      { name: "token", type: varchar(255), notNull: true },
      { name: "type", type: varchar(50), notNull: true },
      { name: "expires", type: tsCol(), notNull: true },
      { name: "consumed", type: boolCol(), notNull: pgMaria, default: dFalse() },
      { name: "blocked", type: boolCol(), notNull: pgMaria, default: dFalse() },
      { name: "role", type: varchar(50) },
      { name: "username", type: varchar(255) },
      { name: "tenantId", type: varchar(36) },
      ...timestamps(),
    ],
    indexes: [
      {
        name: { postgresql: "auth_tokens_token_idx", mariadb: "token_idx" },
        columns: { postgresql: ["token"], mariadb: ["token"] },
      },
      {
        name: { postgresql: "auth_tokens_user_idx", mariadb: "user_idx" },
        columns: { postgresql: ["user_id"], mariadb: ["user_id"] },
      },
      {
        name: { postgresql: "auth_tokens_expires_idx", mariadb: "expires_idx" },
        columns: { postgresql: ["expires"], mariadb: ["expires"] },
      },
      {
        name: { postgresql: "auth_tokens_tenant_idx", mariadb: "tenant_idx" },
        columns: { postgresql: ["tenantId"], mariadb: ["tenantId"] },
      },
    ],
  },

  // ── Auth API Keys ──────────────────────────────────────────────────────────
  {
    kind: "table",
    name: "auth_api_keys",
    comment: "Auth API Keys",
    columns: [
      pkId(),
      { name: "name", type: varchar(255), notNull: true },
      { name: "hash", type: varchar(255), notNull: true },
      { name: "prefix", type: varchar(12), notNull: true },
      { name: "userId", type: varchar(36), notNull: true },
      {
        name: "scopes",
        type: jsonCol(),
        notNull: pgMaria,
        default: { sqlite: dStr("[]").sqlite, postgresql: dStr("[]").postgresql },
      },
      {
        name: "permissions",
        type: jsonCol(),
        notNull: pgMaria,
        default: { sqlite: dStr("[]").sqlite, postgresql: dStr("[]").postgresql },
      },
      { name: "revoked", type: boolCol(), notNull: pgMaria, default: dFalse() },
      { name: "usageCount", type: intCol(), notNull: pgMaria, default: dInt(0) },
      { name: "lastUsedAt", type: tsCol() },
      { name: "lastUsedIp", type: varchar(45) },
      { name: "expiresAt", type: tsCol() },
      { name: "tenantId", type: varchar(36) },
      ...timestamps(),
    ],
    indexes: [
      {
        name: { postgresql: "auth_api_keys_hash_unique", mariadb: "hash_unique" },
        columns: { postgresql: ["hash"], mariadb: ["hash"] },
        unique: true,
      },
      {
        name: { postgresql: "auth_api_keys_user_idx", mariadb: "api_key_user_idx" },
        columns: { postgresql: ["userId"], mariadb: ["userId"] },
      },
      {
        name: { postgresql: "auth_api_keys_tenant_idx", mariadb: "api_key_tenant_idx" },
        columns: { postgresql: ["tenantId"], mariadb: ["tenantId"] },
      },
      {
        name: { postgresql: "auth_api_keys_tenant_hash_idx", mariadb: "tenant_hash_idx" },
        columns: { postgresql: ["tenantId", "hash"], mariadb: ["tenantId", "hash"] },
        postgresqlQuotedColumns: ["hash"],
      },
    ],
  },

  // ── Roles ──────────────────────────────────────────────────────────────────
  {
    kind: "table",
    name: "roles",
    comment: "Roles",
    columns: [
      pkId(),
      { name: "name", type: varchar(255), notNull: true },
      { name: "description", type: text() },
      {
        name: "permissions",
        type: jsonCol(),
        notNull: pgMaria,
        default: { sqlite: dStr("[]").sqlite, postgresql: dStr("[]").postgresql },
      },
      { name: "isAdmin", type: boolCol(), notNull: pgMaria, default: dFalse() },
      { name: "icon", type: varchar(100) },
      { name: "color", type: varchar(50) },
      { name: "tenantId", type: varchar(36) },
      ...timestamps(),
    ],
    indexes: [
      {
        name: { postgresql: "roles_name_idx", mariadb: "name_idx" },
        columns: { postgresql: ["name"], mariadb: ["name"] },
      },
      {
        name: { postgresql: "roles_tenant_idx", mariadb: "tenant_idx" },
        columns: { postgresql: ["tenantId"], mariadb: ["tenantId"] },
      },
    ],
  },

  // ── Content Nodes ──────────────────────────────────────────────────────────
  {
    kind: "table",
    name: "content_nodes",
    comment: "Content Nodes",
    columns: [
      pkId(),
      { name: "path", type: varchar(500), notNull: true },
      { name: "parentId", type: varchar(36) },
      { name: "nodeType", type: varchar(50), notNull: true },
      { name: "status", type: varchar(50), notNull: true, default: dStr("draft") },
      { name: "name", type: varchar(500) },
      { name: "slug", type: varchar(500) },
      { name: "icon", type: varchar(100) },
      { name: "description", type: text() },
      {
        name: "collectionDef",
        type: jsonCol(),
        default: { sqlite: dStr("{}").sqlite },
        order: { sqlite: 16 },
      },
      { name: "data", type: jsonCol(), default: { sqlite: dStr("{}").sqlite } },
      { name: "metadata", type: jsonCol(), default: { sqlite: dStr("{}").sqlite } },
      {
        name: "translations",
        type: jsonCol(),
        default: { sqlite: dStr("[]").sqlite },
      },
      { name: "position", type: intCol(), notNull: pgMaria, default: dInt(0) },
      { name: "isPublished", type: boolCol(), notNull: pgMaria, default: dFalse() },
      { name: "publishedAt", type: tsCol() },
      {
        name: "isDeleted",
        type: boolCol(),
        notNull: pgMaria,
        default: dFalse(),
        order: { sqlite: 17 },
      },
      { name: "deletedAt", type: tsCol() },
      { name: "source", type: varchar(50), notNull: true, default: dStr("filesystem") },
      { name: "tenantId", type: varchar(36) },
      ...timestamps(),
    ],
    extensions: { postgresql: ["DROP INDEX IF EXISTS content_nodes_path_unique"] },
    sqliteTableConstraints: ['UNIQUE("path", "tenantId")'],
    indexes: [
      {
        name: {
          postgresql: "content_nodes_path_tenant_unique",
          mariadb: "path_unique",
          sqlite: "idx_content_nodes_path_tenant",
        },
        columns: {
          postgresql: ["path", "tenantId"],
          mariadb: ["path"],
          sqlite: ["path", "tenantId"],
        },
        unique: true,
        postgresqlQuote: "'",
      },
      {
        name: { postgresql: "content_nodes_parent_idx", mariadb: "parent_idx" },
        columns: { postgresql: ["parentId"], mariadb: ["parentId"] },
      },
      {
        name: { postgresql: "content_nodes_nodeType_idx", mariadb: "nodeType_idx" },
        columns: { postgresql: ["nodeType"], mariadb: ["nodeType"] },
      },
      {
        name: { postgresql: "content_nodes_status_idx", mariadb: "status_idx" },
        columns: { postgresql: ["status"], mariadb: ["status"] },
      },
      {
        name: { postgresql: "content_nodes_tenant_idx", mariadb: "tenant_idx" },
        columns: { postgresql: ["tenantId"], mariadb: ["tenantId"] },
      },
    ],
  },

  // ── Content Drafts ─────────────────────────────────────────────────────────
  {
    kind: "table",
    name: "content_drafts",
    comment: "Content Drafts",
    columns: [
      pkId(),
      { name: "contentId", type: varchar(36), notNull: true },
      { name: "data", type: jsonCol(), notNull: true },
      { name: "version", type: intCol(), notNull: pgMaria, default: dInt(1) },
      { name: "status", type: varchar(50), notNull: pgMaria, default: dStr("draft") },
      { name: "authorId", type: varchar(36), notNull: true },
      { name: "tenantId", type: varchar(36) },
      ...timestamps(),
    ],
    indexes: [
      {
        name: { postgresql: "content_drafts_content_idx", mariadb: "content_idx" },
        columns: { postgresql: ["contentId"], mariadb: ["contentId"] },
      },
      {
        name: { postgresql: "content_drafts_author_idx", mariadb: "author_idx" },
        columns: { postgresql: ["authorId"], mariadb: ["authorId"] },
      },
      {
        name: { postgresql: "content_drafts_status_idx", mariadb: "status_idx" },
        columns: { postgresql: ["status"], mariadb: ["status"] },
      },
      {
        name: { postgresql: "content_drafts_tenant_idx", mariadb: "tenant_idx" },
        columns: { postgresql: ["tenantId"], mariadb: ["tenantId"] },
      },
    ],
  },

  // ── Content Revisions ──────────────────────────────────────────────────────
  {
    kind: "table",
    name: "content_revisions",
    comment: "Content Revisions",
    columns: [
      pkId(),
      { name: "contentId", type: varchar(36), notNull: true },
      { name: "data", type: jsonCol(), notNull: true },
      { name: "version", type: intCol(), notNull: pgMaria, default: dInt(1) },
      { name: "commitMessage", type: text() },
      { name: "authorId", type: varchar(36), notNull: true },
      { name: "tenantId", type: varchar(36) },
      ...timestamps(),
    ],
    indexes: [
      {
        name: { postgresql: "content_revisions_content_idx", mariadb: "content_idx" },
        columns: { postgresql: ["contentId"], mariadb: ["contentId"] },
      },
      {
        name: { postgresql: "content_revisions_version_idx", mariadb: "version_idx" },
        columns: { postgresql: ["version"], mariadb: ["version"] },
      },
      {
        name: { postgresql: "content_revisions_author_idx", mariadb: "author_idx" },
        columns: { postgresql: ["authorId"], mariadb: ["authorId"] },
      },
      {
        name: { postgresql: "content_revisions_tenant_idx", mariadb: "tenant_idx" },
        columns: { postgresql: ["tenantId"], mariadb: ["tenantId"] },
      },
    ],
  },

  // ── Themes ─────────────────────────────────────────────────────────────────
  {
    kind: "table",
    name: "themes",
    comment: "Themes",
    order: { sqlite: 12 },
    columns: [
      pkId(),
      { name: "name", type: varchar(255), notNull: true },
      { name: "path", type: varchar(500), notNull: true },
      { name: "isActive", type: boolCol(), notNull: pgMaria, default: dFalse() },
      { name: "isDefault", type: boolCol(), notNull: pgMaria, default: dFalse() },
      {
        name: "config",
        type: jsonCol(),
        notNull: true,
        default: { sqlite: dStr("{}").sqlite, postgresql: dStr("{}").postgresql },
      },
      { name: "previewImage", type: text() },
      { name: "customCss", type: text() },
      { name: "tenantId", type: varchar(36) },
      ...timestamps(),
    ],
    indexes: [
      {
        name: {
          postgresql: "themes_name_idx",
          mariadb: "name_idx",
          sqlite: "idx_system_themes_name_tenant",
        },
        columns: { postgresql: ["name"], mariadb: ["name"], sqlite: ["name", "tenantId"] },
        unique: { postgresql: false, mariadb: false, sqlite: true },
      },
      {
        name: { postgresql: "themes_active_idx", mariadb: "active_idx" },
        columns: { postgresql: ["isActive"], mariadb: ["isActive"] },
      },
      {
        name: { postgresql: "themes_tenant_idx", mariadb: "tenant_idx" },
        columns: { postgresql: ["tenantId"], mariadb: ["tenantId"] },
      },
    ],
  },

  // ── Widgets ────────────────────────────────────────────────────────────────
  {
    kind: "table",
    name: "widgets",
    comment: "Widgets",
    order: { sqlite: 13 },
    columns: [
      pkId(),
      {
        name: "name",
        type: varchar(255),
        notNull: true,
        trailing: { sqlite: "UNIQUE" },
      },
      { name: "isActive", type: boolCol(), notNull: pgMaria, default: dTrue() },
      {
        name: "instances",
        type: jsonCol(),
        notNull: pgMaria,
        default: { sqlite: dStr("{}").sqlite, postgresql: dStr("{}").postgresql },
      },
      {
        name: "dependencies",
        type: jsonCol(),
        notNull: pgMaria,
        default: { sqlite: dStr("[]").sqlite, postgresql: dStr("[]").postgresql },
      },
      { name: "tenantId", type: varchar(36) },
      ...timestamps(),
    ],
    indexes: [
      {
        name: { postgresql: "widgets_name_unique", mariadb: "name_unique" },
        columns: { postgresql: ["name"], mariadb: ["name"] },
        unique: true,
      },
      {
        name: { postgresql: "widgets_active_idx", mariadb: "active_idx" },
        columns: { postgresql: ["isActive"], mariadb: ["isActive"] },
      },
      {
        name: { postgresql: "widgets_tenant_idx", mariadb: "tenant_idx" },
        columns: { postgresql: ["tenantId"], mariadb: ["tenantId"] },
      },
    ],
  },

  // ── Media Items ────────────────────────────────────────────────────────────
  {
    kind: "table",
    name: "media_items",
    comment: "Media Items",
    order: { sqlite: 9 },
    columns: [
      pkId(),
      { name: "filename", type: varchar(500), notNull: true },
      { name: "originalFilename", type: varchar(500), notNull: true },
      { name: "hash", type: varchar(255), notNull: true },
      { name: "path", type: varchar(1000), notNull: true },
      { name: "size", type: intCol(), notNull: true },
      { name: "mimeType", type: varchar(255), notNull: true },
      { name: "folderId", type: varchar(36) },
      { name: "originalId", type: varchar(36) },
      {
        name: "thumbnails",
        type: jsonCol(),
        notNull: pgMaria,
        default: { sqlite: dStr("{}").sqlite, postgresql: dStr("{}").postgresql },
      },
      {
        name: "metadata",
        type: jsonCol(),
        notNull: pgMaria,
        default: { sqlite: dStr("{}").sqlite, postgresql: dStr("{}").postgresql },
      },
      { name: "access", type: varchar(50), notNull: pgMaria, default: dStr("public") },
      { name: "createdBy", type: varchar(36), notNull: true },
      { name: "updatedBy", type: varchar(36), notNull: true },
      { name: "tenantId", type: varchar(36) },
      ...timestamps(),
    ],
    indexes: [
      {
        name: { postgresql: "media_items_hash_idx", mariadb: "hash_idx" },
        columns: { postgresql: ["hash"], mariadb: ["hash"] },
      },
      {
        name: { postgresql: "media_items_folder_idx", mariadb: "folder_idx" },
        columns: { postgresql: ["folderId"], mariadb: ["folderId"] },
      },
      {
        name: { postgresql: "media_items_created_by_idx", mariadb: "created_by_idx" },
        columns: { postgresql: ["createdBy"], mariadb: ["createdBy"] },
      },
      {
        name: { postgresql: "media_items_tenant_idx", mariadb: "tenant_idx" },
        columns: { postgresql: ["tenantId"], mariadb: ["tenantId"] },
      },
    ],
  },

  // ── System Virtual Folders ─────────────────────────────────────────────────
  {
    kind: "table",
    name: "system_virtual_folders",
    comment: "System Virtual Folders",
    order: { sqlite: 10 },
    columns: [
      pkId(),
      { name: "name", type: varchar(500), notNull: true },
      { name: "path", type: varchar(1000), notNull: true },
      { name: "parentId", type: varchar(36) },
      { name: "icon", type: varchar(100) },
      { name: "position", type: intCol(), notNull: pgMaria, default: dInt(0) },
      { name: "type", type: varchar(50), notNull: pgMaria, default: dStr("folder") },
      { name: "metadata", type: jsonCol(), default: { sqlite: dStr("{}").sqlite } },
      { name: "tenantId", type: varchar(36) },
      ...timestamps(),
    ],
    indexes: [
      {
        name: { postgresql: "system_virtual_folders_path_unique", mariadb: "path_unique" },
        columns: { postgresql: ["path"], mariadb: ["path"] },
        unique: true,
      },
      {
        name: { postgresql: "system_virtual_folders_parent_idx", mariadb: "parent_idx" },
        columns: { postgresql: ["parentId"], mariadb: ["parentId"] },
      },
      {
        name: { postgresql: "system_virtual_folders_type_idx", mariadb: "type_idx" },
        columns: { postgresql: ["type"], mariadb: ["type"] },
      },
      {
        name: { postgresql: "system_virtual_folders_tenant_idx", mariadb: "tenant_idx" },
        columns: { postgresql: ["tenantId"], mariadb: ["tenantId"] },
      },
    ],
  },

  // ── System Preferences ─────────────────────────────────────────────────────
  {
    kind: "table",
    name: "system_preferences",
    comment: "System Preferences",
    order: { sqlite: 11 },
    columns: [
      pkId(),
      { name: "key", type: varchar(255), notNull: true, mariadbQuoted: true },
      { name: "value", type: jsonCol(), default: { sqlite: dStr("{}").sqlite } },
      {
        name: "category",
        type: varchar(255),
        default: { sqlite: dStr("general").sqlite },
      },
      { name: "scope", type: varchar(50), notNull: pgMaria, default: dStr("system") },
      { name: "userId", type: varchar(36) },
      { name: "visibility", type: varchar(50), notNull: pgMaria, default: dStr("private") },
      { name: "tenantId", type: varchar(36) },
      ...timestamps(),
    ],
    indexes: [
      {
        name: {
          postgresql: "system_preferences_key_idx",
          mariadb: "key_idx",
          sqlite: "idx_system_prefs_key_tenant",
        },
        columns: {
          postgresql: ["key"],
          mariadb: ["key"],
          sqlite: ["key", "tenantId"],
        },
        unique: { postgresql: false, mariadb: false, sqlite: true },
        mariadbQuotedColumns: ["key"],
      },
      {
        name: { postgresql: "system_preferences_category_idx", mariadb: "category_idx" },
        columns: { postgresql: ["category"], mariadb: ["category"] },
        postgresqlQuotedColumns: ["category"],
      },
      {
        name: { postgresql: "system_preferences_scope_idx", mariadb: "scope_idx" },
        columns: { postgresql: ["scope"], mariadb: ["scope"] },
      },
      {
        name: { postgresql: "system_preferences_user_idx", mariadb: "user_idx" },
        columns: { postgresql: ["userId"], mariadb: ["userId"] },
      },
      {
        name: { postgresql: "system_preferences_tenant_idx", mariadb: "tenant_idx" },
        columns: { postgresql: ["tenantId"], mariadb: ["tenantId"] },
      },
      {
        name: { postgresql: "system_preferences_key_tenant_unique" },
        columns: { postgresql: ["key", "tenantId"] },
        unique: true,
      },
    ],
  },

  // ── Website Tokens ─────────────────────────────────────────────────────────
  {
    kind: "table",
    name: "website_tokens",
    comment: "Website Tokens",
    columns: [
      pkId(),
      { name: "name", type: varchar(255), notNull: true },
      { name: "token", type: varchar(255), notNull: true, trailing: { sqlite: "UNIQUE" } },
      { name: "createdBy", type: varchar(36), notNull: true, order: { sqlite: 5.5 } },
      {
        name: "permissions",
        type: jsonCol(),
        notNull: pgMaria,
        default: { sqlite: dStr("[]").sqlite, postgresql: dStr("[]").postgresql },
      },
      { name: "expiresAt", type: tsCol() },
      { name: "tenantId", type: varchar(36) },
      ...timestamps(),
    ],
    indexes: [
      {
        name: { postgresql: "website_tokens_token_unique", mariadb: "token_unique" },
        columns: { postgresql: ["token"], mariadb: ["token"] },
        unique: true,
      },
      {
        name: { postgresql: "website_tokens_name_idx", mariadb: "name_idx" },
        columns: { postgresql: ["name"], mariadb: ["name"] },
      },
      {
        name: { postgresql: "website_tokens_tenant_idx", mariadb: "tenant_idx" },
        columns: { postgresql: ["tenantId"], mariadb: ["tenantId"] },
      },
    ],
  },

  // ── Plugin: PageSpeed Results ──────────────────────────────────────────────
  {
    kind: "table",
    name: "plugin_pagespeed_results",
    comment: "Plugin: PageSpeed Results",
    columns: [
      pkId(),
      { name: "entryId", type: varchar(36), notNull: true },
      { name: "collectionId", type: varchar(36), notNull: true },
      { name: "tenantId", type: varchar(36) },
      { name: "language", type: varchar(10), notNull: pgMaria, default: dStr("en") },
      { name: "device", type: varchar(20), notNull: pgMaria, default: dStr("mobile") },
      { name: "url", type: varchar(2000), notNull: true },
      { name: "performanceScore", type: intCol(), notNull: pgMaria, default: dInt(0) },
      { name: "fetchedAt", type: tsCol(), notNull: pgMaria, default: dNow() },
      ...timestamps(),
    ],
    indexes: [
      {
        name: { postgresql: "plugin_pagespeed_entry_idx", mariadb: "entry_idx" },
        columns: { postgresql: ["entryId"], mariadb: ["entryId"] },
      },
      {
        name: { postgresql: "plugin_pagespeed_collection_idx", mariadb: "collection_idx" },
        columns: { postgresql: ["collectionId"], mariadb: ["collectionId"] },
      },
      {
        name: { postgresql: "plugin_pagespeed_tenant_idx", mariadb: "tenant_idx" },
        columns: { postgresql: ["tenantId"], mariadb: ["tenantId"] },
      },
      {
        name: { postgresql: "plugin_pagespeed_device_idx", mariadb: "device_idx" },
        columns: { postgresql: ["device"], mariadb: ["device"] },
      },
    ],
  },

  // ── Plugin States ──────────────────────────────────────────────────────────
  {
    kind: "table",
    name: "plugin_states",
    comment: "Plugin States",
    columns: [
      pkId(),
      { name: "pluginId", type: varchar(255), notNull: true },
      { name: "tenantId", type: varchar(36) },
      { name: "enabled", type: boolCol(), notNull: pgMaria, default: dFalse() },
      { name: "settings", type: jsonCol(), default: { sqlite: dStr("{}").sqlite } },
      { name: "updatedBy", type: varchar(36) },
      ...timestamps(),
    ],
    indexes: [
      {
        name: { postgresql: "plugin_states_plugin_idx", mariadb: "plugin_idx" },
        columns: { postgresql: ["pluginId"], mariadb: ["pluginId"] },
      },
      {
        name: { postgresql: "plugin_states_tenant_idx", mariadb: "tenant_idx" },
        columns: { postgresql: ["tenantId"], mariadb: ["tenantId"] },
      },
      {
        name: {
          postgresql: "plugin_states_plugin_tenant_unique",
          mariadb: "plugin_tenant_unique",
          sqlite: "idx_plugin_states_unique",
        },
        columns: {
          postgresql: ["pluginId", "tenantId"],
          mariadb: ["pluginId", "tenantId"],
          sqlite: ["pluginId", "tenantId"],
        },
        unique: true,
      },
    ],
  },

  // ── Plugin Storage ─────────────────────────────────────────────────────────
  {
    kind: "table",
    name: "plugin_storage",
    comment: "Plugin Storage",
    columns: [
      pkId(),
      { name: "plugin", type: varchar(255), notNull: true },
      { name: "collection", type: varchar(255), notNull: true },
      { name: "tenantId", type: varchar(36) },
      {
        name: "data",
        type: jsonCol(),
        notNull: true,
        default: { sqlite: dStr("{}").sqlite, postgresql: dStr("{}").postgresql },
      },
      ...timestamps(),
    ],
    indexes: [
      {
        name: {
          postgresql: "plugin_storage_plugin_idx",
          mariadb: "plugin_storage_plugin_idx",
          sqlite: "idx_plugin_storage_plugin",
        },
        columns: { postgresql: ["plugin"], mariadb: ["plugin"], sqlite: ["plugin"] },
        postgresqlQuotedColumns: ["plugin"],
        sqliteAfterTable: true,
      },
      {
        name: {
          postgresql: "plugin_storage_collection_idx",
          mariadb: "plugin_storage_collection_idx",
          sqlite: "idx_plugin_storage_collection",
        },
        columns: { postgresql: ["collection"], mariadb: ["collection"], sqlite: ["collection"] },
        postgresqlQuotedColumns: ["collection"],
        sqliteAfterTable: true,
      },
      {
        name: {
          postgresql: "plugin_storage_tenant_idx",
          mariadb: "plugin_storage_tenant_idx",
          sqlite: "idx_plugin_storage_tenant",
        },
        columns: { postgresql: ["tenantId"], mariadb: ["tenantId"], sqlite: ["tenantId"] },
        sqliteAfterTable: true,
      },
      {
        name: {
          postgresql: "plugin_storage_plugin_collection_idx",
          mariadb: "plugin_storage_plugin_collection_idx",
          sqlite: "idx_plugin_storage_plugin_collection",
        },
        columns: {
          postgresql: ["plugin", "collection"],
          mariadb: ["plugin", "collection"],
          sqlite: ["plugin", "collection"],
        },
        postgresqlQuotedColumns: ["plugin", "collection"],
        sqliteAfterTable: true,
      },
    ],
  },

  // ── Plugin Migrations ──────────────────────────────────────────────────────
  {
    kind: "table",
    name: "plugin_migrations",
    comment: "Plugin Migrations",
    columns: [
      pkId(),
      { name: "pluginId", type: varchar(255), notNull: true },
      { name: "migrationId", type: varchar(255), notNull: true },
      { name: "version", type: intCol(), notNull: true },
      { name: "tenantId", type: varchar(36) },
      { name: "appliedAt", type: tsCol(), notNull: pgMaria, default: dNow() },
      ...timestamps(),
    ],
    indexes: [
      {
        name: { postgresql: "plugin_migrations_plugin_idx", mariadb: "plugin_idx" },
        columns: { postgresql: ["pluginId"], mariadb: ["pluginId"] },
      },
      {
        name: { postgresql: "plugin_migrations_tenant_idx", mariadb: "tenant_idx" },
        columns: { postgresql: ["tenantId"], mariadb: ["tenantId"] },
      },
      {
        name: {
          postgresql: "plugin_migrations_unique",
          mariadb: "plugin_migration_unique",
          sqlite: "idx_plugin_migrations_unique",
        },
        columns: {
          postgresql: ["pluginId", "migrationId", "tenantId"],
          mariadb: ["pluginId", "migrationId", "tenantId"],
          sqlite: ["pluginId", "migrationId", "tenantId"],
        },
        unique: true,
      },
    ],
  },

  // ── Tenants ────────────────────────────────────────────────────────────────
  {
    kind: "table",
    name: "tenants",
    comment: "Tenants",
    order: { postgresql: 19, mariadb: 15, sqlite: 21 },
    columns: [
      pkId(),
      { name: "name", type: varchar(255), notNull: true },
      { name: "ownerId", type: varchar(36), notNull: true },
      { name: "status", type: varchar(20), notNull: pgMaria, default: dStr("active") },
      { name: "plan", type: varchar(20), notNull: pgMaria, default: dStr("free") },
      {
        name: "quota",
        type: jsonCol(),
        notNull: pgMaria,
        default: { sqlite: dStr("{}").sqlite, postgresql: dStr("{}").postgresql },
      },
      {
        name: "usage",
        type: jsonCol(),
        notNull: pgMaria,
        default: { sqlite: dStr("{}").sqlite, postgresql: dStr("{}").postgresql },
        mariadbQuoted: true,
      },
      {
        name: "settings",
        type: jsonCol(),
        default: { sqlite: dStr("{}").sqlite, postgresql: dStr("{}").postgresql },
      },
      ...timestamps(),
    ],
    indexes: [
      {
        name: { postgresql: "tenants_name_idx", mariadb: "tenant_name_idx" },
        columns: { postgresql: ["name"], mariadb: ["name"] },
      },
      {
        name: { postgresql: "tenants_owner_idx", mariadb: "tenant_owner_idx" },
        columns: { postgresql: ["ownerId"], mariadb: ["ownerId"] },
      },
    ],
  },

  // ── GIN Indexes on high-query JSONB columns (postgresql only) ──────────────
  {
    kind: "raw",
    comment: {
      postgresql: [
        "── GIN Indexes on high-query JSONB columns ──",
        "Enables @>, ?, ?| operators for efficient containment/existence queries",
      ],
    },
    sql: {
      postgresql: [
        "CREATE INDEX IF NOT EXISTS content_nodes_data_gin ON content_nodes USING gin (data)",
        "CREATE INDEX IF NOT EXISTS content_nodes_metadata_gin ON content_nodes USING gin (metadata)",
        "CREATE INDEX IF NOT EXISTS media_items_metadata_gin ON media_items USING gin (metadata)",
        "CREATE INDEX IF NOT EXISTS roles_permissions_gin ON roles USING gin (permissions)",
        'CREATE INDEX IF NOT EXISTS auth_users_roleIds_gin ON auth_users USING gin ("roleIds")',
      ],
    },
  },

  // ── Partial index for unconsumed tokens (postgresql only) ──────────────────
  {
    kind: "raw",
    comment: { postgresql: ["── Partial index for unconsumed tokens ──"] },
    sql: {
      postgresql: [
        "CREATE INDEX IF NOT EXISTS auth_tokens_active_idx ON auth_tokens (token) WHERE consumed = FALSE AND blocked = FALSE",
      ],
    },
  },

  // ── Audit Logs ─────────────────────────────────────────────────────────────
  {
    kind: "table",
    name: "audit_logs",
    comment: "Audit Logs",
    order: { sqlite: 23 },
    columns: [
      pkId(),
      { name: "action", type: varchar(255), notNull: true },
      { name: "actorEmail", type: varchar(255) },
      { name: "actorId", type: varchar(36) },
      { name: "actorRole", type: varchar(50) },
      { name: "correlationId", type: varchar(36) },
      {
        name: "details",
        type: jsonCol(),
        notNull: pgMaria,
        default: { sqlite: dStr("{}").sqlite, postgresql: dStr("{}").postgresql },
      },
      { name: "errorDetails", type: text() },
      { name: "eventType", type: varchar(100), notNull: true },
      { name: "ipAddress", type: varchar(45) },
      { name: "result", type: varchar(50), notNull: true },
      { name: "sessionId", type: varchar(36) },
      { name: "severity", type: varchar(20), notNull: true },
      { name: "targetId", type: varchar(255) },
      { name: "targetType", type: varchar(100) },
      {
        name: "timestamp",
        type: tsCol(),
        notNull: true,
        default: { postgresql: "CURRENT_TIMESTAMP", mariadb: "CURRENT_TIMESTAMP" },
      },
      { name: "userAgent", type: text() },
      { name: "tenantId", type: varchar(36) },
      ...timestamps(),
      { name: "previousHash", type: varchar(64) },
      { name: "chainHash", type: varchar(64) },
    ],
    indexes: [
      {
        name: { postgresql: "audit_logs_timestamp_idx", mariadb: "timestamp_idx" },
        columns: { postgresql: ["timestamp"], mariadb: ["timestamp"] },
      },
      {
        name: { postgresql: "audit_logs_event_type_idx", mariadb: "event_type_idx" },
        columns: { postgresql: ["eventType"], mariadb: ["eventType"] },
      },
      {
        name: { postgresql: "audit_logs_tenant_idx", mariadb: "tenant_idx" },
        columns: { postgresql: ["tenantId"], mariadb: ["tenantId"] },
      },
    ],
  },

  // ── Svelty Jobs ────────────────────────────────────────────────────────────
  {
    kind: "table",
    name: "svelty_jobs",
    comment: "Svelty Jobs",
    order: { sqlite: 19 },
    columns: [
      pkId(),
      { name: "taskType", type: varchar(255), notNull: true },
      {
        name: "payload",
        type: jsonCol(),
        notNull: true,
        default: { postgresql: dStr("{}").postgresql },
      },
      { name: "status", type: varchar(50), notNull: pgMaria, default: dStr("pending") },
      { name: "attempts", type: intCol(), notNull: pgMaria, default: dInt(0) },
      { name: "maxAttempts", type: intCol(), notNull: pgMaria, default: dInt(3) },
      { name: "nextRunAt", type: tsCol(), notNull: pgMaria, default: dNow() },
      { name: "lastError", type: text() },
      { name: "tenantId", type: varchar(36) },
      ...timestamps(),
    ],
    indexes: [
      {
        name: { postgresql: "svelty_jobs_status_idx", mariadb: "status_idx" },
        columns: { postgresql: ["status"], mariadb: ["status"] },
        postgresqlQuote: "`",
      },
      {
        name: { postgresql: "svelty_jobs_next_run_idx", mariadb: "next_run_idx" },
        columns: { postgresql: ["nextRunAt"], mariadb: ["nextRunAt"] },
      },
      {
        name: { postgresql: "svelty_jobs_tenant_idx", mariadb: "tenant_idx" },
        columns: { postgresql: ["tenantId"], mariadb: ["tenantId"] },
      },
    ],
  },

  // ── Transactional outbox ───────────────────────────────────────────────────
  {
    kind: "table",
    name: "svelty_outbox",
    comment: "Transactional outbox",
    order: { sqlite: 20 },
    columns: [
      pkId(),
      { name: "tenantId", type: varchar(36) },
      { name: "eventType", type: varchar(255), notNull: true },
      { name: "aggregateType", type: varchar(255), notNull: true },
      { name: "aggregateId", type: varchar(255), notNull: true },
      {
        name: "payload",
        type: jsonCol(),
        notNull: true,
        default: { sqlite: dStr("{}").sqlite, postgresql: dStr("{}").postgresql },
      },
      { name: "status", type: varchar(50), notNull: true, default: dStr("pending") },
      { name: "deliveredAt", type: tsCol() },
      { name: "attempts", type: intCol(), notNull: true, default: dInt(0) },
      { name: "lastError", type: text() },
      ...timestamps(),
    ],
    indexes: [
      {
        name: {
          postgresql: "outbox_status_idx",
          mariadb: "outbox_status_idx",
          sqlite: "idx_outbox_status",
        },
        columns: { postgresql: ["status"], mariadb: ["status"], sqlite: ["status"] },
        postgresqlQuote: "`",
        sqliteAfterTable: true,
        sqliteNoGapBefore: true,
      },
      {
        name: {
          postgresql: "outbox_tenant_idx",
          mariadb: "outbox_tenant_idx",
          sqlite: "idx_outbox_tenant",
        },
        columns: { postgresql: ["tenantId"], mariadb: ["tenantId"], sqlite: ["tenantId"] },
        sqliteAfterTable: true,
      },
      {
        name: {
          postgresql: "outbox_event_type_idx",
          mariadb: "outbox_event_type_idx",
          sqlite: "idx_outbox_event_type",
        },
        columns: { postgresql: ["eventType"], mariadb: ["eventType"], sqlite: ["eventType"] },
        sqliteAfterTable: true,
      },
      {
        name: {
          postgresql: "outbox_created_at_idx",
          mariadb: "outbox_created_at_idx",
          sqlite: "idx_outbox_created_at",
        },
        columns: { postgresql: ["createdAt"], mariadb: ["createdAt"], sqlite: ["createdAt"] },
        sqliteAfterTable: true,
      },
    ],
  },

  // ── 404 Logs ───────────────────────────────────────────────────────────────
  {
    kind: "table",
    name: "404_logs",
    comment: "404 Logs",
    order: { sqlite: 22 },
    mariadbQuotedTable: true,
    columns: [
      pkId(),
      {
        name: "path",
        type: { sqlite: "TEXT", postgresql: "VARCHAR(2000)", mariadb: "VARCHAR(500)" },
        notNull: true,
      },
      { name: "tenantId", type: varchar(36), notNull: pgMaria },
      { name: "hits", type: intCol(), notNull: pgMaria, default: dInt(1) },
      { name: "lastHit", type: tsCol(), notNull: pgMaria, default: dNow() },
      {
        name: "metadata",
        type: jsonCol(),
        notNull: pgMaria,
        default: { sqlite: dStr("{}").sqlite, postgresql: dStr("{}").postgresql },
      },
      ...timestamps(),
    ],
    indexes: [
      {
        name: {
          postgresql: "404_logs_path_tenant_idx",
          mariadb: "path_tenant_idx",
          sqlite: "idx_404_logs_path_tenant",
        },
        columns: {
          postgresql: ["path", "tenantId"],
          mariadb: ["path", "tenantId"],
          sqlite: ["path", "tenantId"],
        },
        unique: true,
      },
    ],
  },

  // ── Redirects MV ───────────────────────────────────────────────────────────
  {
    kind: "table",
    name: "redirects_mv",
    comment: "Redirects MV",
    columns: [
      pkId(),
      { name: "tenantId", type: varchar(36), notNull: true },
      {
        name: "source",
        type: { sqlite: "TEXT", postgresql: "VARCHAR(2000)", mariadb: "VARCHAR(500)" },
        notNull: true,
      },
      { name: "target", type: varchar(2000), notNull: true },
      { name: "type", type: intCol(), notNull: pgMaria, default: dInt(301) },
      { name: "isRegex", type: boolCol(), notNull: pgMaria, default: dFalse() },
      { name: "active", type: boolCol(), notNull: pgMaria, default: dTrue() },
      {
        name: "metadata",
        type: jsonCol(),
        notNull: pgMaria,
        default: { sqlite: dStr("{}").sqlite, postgresql: dStr("{}").postgresql },
      },
      ...timestamps(),
    ],
    indexes: [
      {
        name: { mariadb: "tenant_source_idx" },
        columns: { mariadb: ["tenantId", "source"] },
      },
      {
        name: {
          postgresql: "idx_redirects_mv_lookup",
          mariadb: "idx_redirects_mv_lookup",
          sqlite: "idx_redirects_mv_lookup",
        },
        columns: {
          postgresql: ["tenantId", "source", "active"],
          mariadb: ["tenantId", "source", "active"],
          sqlite: ["tenantId", "source", "active"],
        },
        postgresqlQuotedColumns: ["source", "active"],
        sqliteAfterTable: true,
        sqliteNoGapBefore: true,
      },
    ],
  },

  // ── Workflow Definitions ───────────────────────────────────────────────────
  {
    kind: "table",
    name: "workflow_definitions",
    comment: "Workflow Definitions",
    order: { sqlite: 24 },
    columns: [
      pkId(),
      { name: "tenantId", type: varchar(36) },
      { name: "collectionId", type: varchar(255), notNull: true },
      { name: "name", type: varchar(255), notNull: true },
      { name: "description", type: text() },
      {
        name: "states",
        type: jsonCol(),
        notNull: pgMaria,
        default: { sqlite: dStr("[]").sqlite, postgresql: dStr("[]").postgresql },
      },
      {
        name: "transitions",
        type: jsonCol(),
        notNull: pgMaria,
        default: { sqlite: dStr("[]").sqlite, postgresql: dStr("[]").postgresql },
      },
      ...timestamps(),
    ],
  },

  // ── Workflow Instances ─────────────────────────────────────────────────────
  {
    kind: "table",
    name: "workflow_instances",
    comment: "Workflow Instances",
    order: { sqlite: 25 },
    columns: [
      pkId(),
      { name: "tenantId", type: varchar(36) },
      { name: "entryId", type: varchar(36), notNull: true },
      { name: "collectionId", type: varchar(255), notNull: true },
      { name: "currentState", type: varchar(100), notNull: true },
      {
        name: "history",
        type: jsonCol(),
        notNull: pgMaria,
        default: { sqlite: dStr("[]").sqlite, postgresql: dStr("[]").postgresql },
      },
      ...timestamps(),
    ],
    indexes: [
      {
        name: { postgresql: "workflow_instances_entry_idx", mariadb: "entry_idx" },
        columns: { postgresql: ["entryId", "collectionId"], mariadb: ["entryId", "collectionId"] },
      },
    ],
  },

  // ── SQLite-only tables (collection_redirects / collection_404_logs) ────────
  {
    kind: "raw",
    sql: {
      sqlite: [
        `      CREATE TABLE IF NOT EXISTS "collection_redirects" (
        "_id" TEXT PRIMARY KEY,
        "tenantId" TEXT,
        "data" TEXT NOT NULL DEFAULT '{}',
        "status" TEXT NOT NULL DEFAULT 'draft',
        "isDeleted" INTEGER NOT NULL DEFAULT 0,
        "createdAt" INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        "updatedAt" INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
      );`,
      ],
    },
  },
  {
    kind: "raw",
    sql: {
      sqlite: [
        `      CREATE TABLE IF NOT EXISTS "collection_404_logs" (
        "_id" TEXT PRIMARY KEY,
        "tenantId" TEXT,
        "data" TEXT NOT NULL DEFAULT '{}',
        "status" TEXT NOT NULL DEFAULT 'draft',
        "isDeleted" INTEGER NOT NULL DEFAULT 0,
        "createdAt" INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        "updatedAt" INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
      );`,
      ],
    },
  },

  // ── SQLite: auth_users email uniqueness (partial indexes + legacy dedupe) ──
  {
    kind: "raw",
    sqliteAfterGroupedIndexes: true,
    sql: {
      sqlite: [
        `      -- auth_users email uniqueness: SQLite treats NULL tenantId as distinct in a
      -- plain unique index, so we need two partial indexes (single-tenant vs
      -- multi-tenant). Legacy DBs may already carry duplicate emails from the era
      -- before this constraint existed — dedupe first (keep the oldest account),
      -- then enforce. The relational createUser() additionally fails closed on
      -- duplicates so the error is deterministic across adapters.
      DELETE FROM "auth_users" WHERE "_id" NOT IN (
        SELECT MIN("_id") FROM "auth_users" GROUP BY "email", COALESCE("tenantId", '')
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_auth_users_email"
        ON "auth_users" ("email") WHERE "tenantId" IS NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_auth_users_email_tenant"
        ON "auth_users" ("email", "tenantId") WHERE "tenantId" IS NOT NULL;`,
      ],
    },
  },

  // ── Full-text search (sqlite FTS5 virtual table + triggers, pg expression index) ──
  {
    kind: "raw",
    sqliteAfterGroupedIndexes: true,
    comment: {
      postgresql: ["Full-text search indexes (not auto-created by Drizzle ORM)"],
    },
    sql: {
      postgresql: [
        `CREATE INDEX IF NOT EXISTS content_nodes_fts_idx ON content_nodes USING GIN (to_tsvector('english', coalesce("name", '') || ' ' || coalesce("description", '') || ' ' || coalesce(CAST("data" AS text), '')))`,
      ],
      sqlite: [
        `      -- Full-text search virtual table (not auto-created by Drizzle ORM)
      -- Keep an internal mirror keyed by _id so we don't depend on nonexistent title/content columns
      -- or SQLite rowid semantics for the text primary key.
      DROP TRIGGER IF EXISTS "content_nodes_ai";
      DROP TRIGGER IF EXISTS "content_nodes_ad";
      DROP TRIGGER IF EXISTS "content_nodes_au";
      DROP TABLE IF EXISTS "content_nodes_fts";
      CREATE VIRTUAL TABLE IF NOT EXISTS "content_nodes_fts" USING fts5(
        "_id" UNINDEXED,
        "name",
        "description",
        "data"
      );
      -- Triggers to keep FTS5 in sync
      CREATE TRIGGER IF NOT EXISTS "content_nodes_ai" AFTER INSERT ON "content_nodes" BEGIN
        INSERT INTO "content_nodes_fts"("_id", "name", "description", "data")
        VALUES (new._id, COALESCE(new.name, ''), COALESCE(new.description, ''), COALESCE(new.data, ''));
      END;
      CREATE TRIGGER IF NOT EXISTS "content_nodes_ad" AFTER DELETE ON "content_nodes" BEGIN
        DELETE FROM "content_nodes_fts" WHERE "_id" = old._id;
      END;
      CREATE TRIGGER IF NOT EXISTS "content_nodes_au" AFTER UPDATE ON "content_nodes" BEGIN
        DELETE FROM "content_nodes_fts" WHERE "_id" = old._id;
        INSERT INTO "content_nodes_fts"("_id", "name", "description", "data")
        VALUES (new._id, COALESCE(new.name, ''), COALESCE(new.description, ''), COALESCE(new.data, ''));
      END;
      INSERT INTO "content_nodes_fts"("_id", "name", "description", "data")
      SELECT "_id", COALESCE("name", ''), COALESCE("description", ''), COALESCE("data", '')
      FROM "content_nodes";`,
      ],
    },
  },

  // ── MariaDB trailing note (fulltext index is applied best-effort after the loop) ──
  {
    kind: "raw",
    comment: {
      mariadb: ["Full-text search indexes are applied best-effort after core tables."],
    },
  },
];
