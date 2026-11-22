/**
 * @file tests/unit/databases/case-insensitive-filter-compilation.test.ts
 * @description
 * Per-engine SQL shape for the case-insensitive filter operators, plus a
 * semantics table that evaluates each engine's predicate on representative
 * inputs (ASCII, non-ASCII, LIKE wildcards, empty string).
 *
 * `mapQuery()` takes an optional trailing dialect hint (`SqlDialect["id"]`) and
 * compiles `$ieq`/`$nieq`/`$contains`/`$nicontains` (and `$regex` with
 * `$options: "i"`) to the cheapest form it can **prove** equivalent:
 *
 * - SQLite: `col = ? COLLATE NOCASE` / `col LIKE ?` — NOCASE and `lower()` are
 *   both ASCII-only without ICU, and LIKE is case-insensitive by default.
 * - MariaDB: `col = ?` (string values only) / `col LIKE ?` under the column's
 *   CI collation.
 * - PostgreSQL: `lower()` equality (locale-aware, served by the `lower(col)`
 *   btree) and `ILIKE` for substrings (served by `pg_trgm`).
 * - Unknown dialect (no hint): the original `lower()`-on-both-sides predicate.
 *
 * ### Features:
 * - exact compiled SQL + bound params for every operator × engine
 * - text-only gating: numeric columns keep `lower()`
 * - LIKE wildcard escaping stays bound, never inlined
 * - semantics: ASCII/Unicode folding, wildcards, empty string per engine
 */

import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { SQLiteSyncDialect, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import {
  PgDialect,
  integer as pgInteger,
  pgTable,
  varchar as pgVarchar,
} from "drizzle-orm/pg-core";
import {
  MySqlDialect,
  int as myInt,
  mysqlTable,
  varchar as myVarchar,
} from "drizzle-orm/mysql-core";
import { mapQuery } from "@src/databases/core/drizzle-sql-helpers";
import { documentMatches } from "@src/content/schema-model";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const sqliteArticles = sqliteTable("articles", {
  _id: text("_id").primaryKey(),
  title: text("title"),
  views: integer("views"),
});

const mariaArticles = mysqlTable("articles", {
  _id: myVarchar("_id", { length: 36 }).primaryKey(),
  title: myVarchar("title", { length: 255 }),
  views: myInt("views"),
});

const pgArticles = pgTable("articles", {
  _id: pgVarchar("_id"),
  title: pgVarchar("title"),
  views: pgInteger("views"),
});

type Dialect = "sqlite" | "mariadb" | "postgresql";

const TABLES: Record<Dialect, unknown> = {
  sqlite: sqliteArticles,
  mariadb: mariaArticles,
  postgresql: pgArticles,
};

interface SqlRenderer {
  sqlToQuery(query: never): { sql: string; params: unknown[] };
}

const DIALECTS: Record<Dialect, SqlRenderer> = {
  sqlite: new SQLiteSyncDialect(),
  mariadb: new MySqlDialect(),
  postgresql: new PgDialect(),
};

/** Compile one filter through `mapQuery` and render it with the engine dialect. */
function compile(dialect: Dialect, filter: Record<string, unknown>) {
  const table = TABLES[dialect] as Record<string, unknown>;
  const where = mapQuery(
    table,
    filter,
    {},
    (t: Record<string, unknown>, name: string) => t[name] as never,
    (field: string) => sql`json_extract(data, ${`$.${field}`})`,
    undefined,
    undefined,
    undefined,
    dialect,
  );
  expect(where, `mapQuery produced no WHERE clause for ${JSON.stringify(filter)}`).toBeDefined();
  const compiled = DIALECTS[dialect].sqlToQuery(where as never);
  return { sql: compiled.sql, params: [...compiled.params] };
}

/** Compile without a dialect hint — the shared default (`lower()` on both sides). */
function compileWithoutHint(filter: Record<string, unknown>) {
  const where = mapQuery(
    sqliteArticles,
    filter,
    {},
    (t: Record<string, unknown>, name: string) => t[name] as never,
    (field: string) => sql`json_extract(data, ${`$.${field}`})`,
  );
  expect(where).toBeDefined();
  const compiled = new SQLiteSyncDialect().sqlToQuery(where as never);
  return { sql: compiled.sql, params: [...compiled.params] };
}

// ─── Compiled SQL per engine ──────────────────────────────────────────────────

describe("case-insensitive operator SQL per engine", () => {
  it("SQLite: NOCASE equality, default-insensitive LIKE", () => {
    expect(compile("sqlite", { title: { $ieq: "hello" } })).toEqual({
      sql: '"articles"."title" = ? COLLATE NOCASE',
      params: ["hello"],
    });
    expect(compile("sqlite", { title: { $nieq: "hello" } })).toEqual({
      sql: '"articles"."title" <> ? COLLATE NOCASE',
      params: ["hello"],
    });
    expect(compile("sqlite", { title: { $contains: "hello" } })).toEqual({
      sql: '"articles"."title" LIKE ? ESCAPE ?',
      params: ["%hello%", "\\"],
    });
    expect(compile("sqlite", { title: { $nicontains: "hello" } })).toEqual({
      sql: '"articles"."title" NOT LIKE ? ESCAPE ?',
      params: ["%hello%", "\\"],
    });
  });

  it("MariaDB: plain comparison under the column's CI collation", () => {
    expect(compile("mariadb", { title: { $ieq: "hello" } })).toEqual({
      sql: "`articles`.`title` = ?",
      params: ["hello"],
    });
    expect(compile("mariadb", { title: { $nieq: "hello" } })).toEqual({
      sql: "`articles`.`title` <> ?",
      params: ["hello"],
    });
    expect(compile("mariadb", { title: { $contains: "hello" } })).toEqual({
      sql: "`articles`.`title` LIKE ? ESCAPE ?",
      params: ["%hello%", "\\"],
    });
    expect(compile("mariadb", { title: { $nicontains: "hello" } })).toEqual({
      sql: "`articles`.`title` NOT LIKE ? ESCAPE ?",
      params: ["%hello%", "\\"],
    });
  });

  it("PostgreSQL: lower() equality, ILIKE substrings", () => {
    expect(compile("postgresql", { title: { $ieq: "hello" } })).toEqual({
      sql: 'lower("articles"."title") = lower($1)',
      params: ["hello"],
    });
    expect(compile("postgresql", { title: { $nieq: "hello" } })).toEqual({
      sql: 'lower("articles"."title") <> lower($1)',
      params: ["hello"],
    });
    expect(compile("postgresql", { title: { $contains: "hello" } })).toEqual({
      sql: '"articles"."title" ILIKE $1 ESCAPE $2',
      params: ["%hello%", "\\"],
    });
    expect(compile("postgresql", { title: { $nicontains: "hello" } })).toEqual({
      sql: '"articles"."title" NOT ILIKE $1 ESCAPE $2',
      params: ["%hello%", "\\"],
    });
  });

  it("keeps lower() for every operator when no dialect is known", () => {
    expect(compileWithoutHint({ title: { $ieq: "hello" } }).sql).toBe(
      'lower("articles"."title") = lower(?)',
    );
    expect(compileWithoutHint({ title: { $nieq: "hello" } }).sql).toBe(
      'lower("articles"."title") <> lower(?)',
    );
    expect(compileWithoutHint({ title: { $contains: "hello" } }).sql).toBe(
      'lower("articles"."title") LIKE lower(?) ESCAPE ?',
    );
    expect(compileWithoutHint({ title: { $nicontains: "hello" } }).sql).toBe(
      'lower("articles"."title") NOT LIKE lower(?) ESCAPE ?',
    );
  });

  it("keeps lower() for non-text columns (numeric affinity would change semantics)", () => {
    expect(compile("sqlite", { views: { $ieq: 5 } }).sql).toBe(
      'lower("articles"."views") = lower(?)',
    );
    expect(compile("mariadb", { views: { $ieq: 5 } }).sql).toBe(
      "lower(`articles`.`views`) = lower(?)",
    );
    expect(compile("postgresql", { views: { $ieq: 5 } }).sql).toBe(
      'lower("articles"."views") = lower($1)',
    );
  });

  it("keeps lower() when MariaDB would compare a text column numerically", () => {
    // MariaDB compares a string column against a number numerically, so the
    // plain form would make `'05'` match `5`; SQLite's TEXT affinity keeps the
    // comparison textual either way.
    expect(compile("mariadb", { title: { $ieq: 5 } }).sql).toBe(
      "lower(`articles`.`title`) = lower(?)",
    );
    expect(compile("sqlite", { title: { $ieq: 5 } }).sql).toBe(
      '"articles"."title" = ? COLLATE NOCASE',
    );
  });

  it("compiles $regex with $options:'i' to the engine's insensitive LIKE", () => {
    const filter = { title: { $regex: "^hello$", $options: "i" } };
    expect(compile("sqlite", filter)).toEqual({
      sql: '"articles"."title" LIKE ? ESCAPE ?',
      params: ["hello", "\\"],
    });
    expect(compile("mariadb", filter)).toEqual({
      sql: "`articles`.`title` LIKE ? ESCAPE ?",
      params: ["hello", "\\"],
    });
    expect(compile("postgresql", filter)).toEqual({
      sql: '"articles"."title" ILIKE $1 ESCAPE $2',
      params: ["hello", "\\"],
    });
    // Without the i option the predicate stays case-sensitive LIKE everywhere.
    expect(compile("postgresql", { title: { $regex: "^hello$" } }).sql).toBe(
      '"articles"."title" LIKE $1 ESCAPE $2',
    );
  });

  it("binds the LIKE escape character instead of inlining it", () => {
    const compiled = compile("mariadb", { title: { $contains: "100%" } });
    expect(compiled.params).toEqual(["%100\\%%", "\\"]);
    expect(compiled.sql).not.toContain("ESCAPE '");
  });
});

// ─── Semantics per engine ─────────────────────────────────────────────────────

interface Row {
  _id: string;
  title: string;
}

const rows: Row[] = [
  { _id: "1", title: "Hello World" },
  { _id: "2", title: "hello world" },
  { _id: "3", title: "HELLO" },
  { _id: "4", title: "goodbye" },
  { _id: "5", title: "say hello!" },
  { _id: "6", title: "100% hello" },
  { _id: "7", title: "ÄÖÜ" },
  { _id: "8", title: "äöü" },
  { _id: "9", title: "%_x" },
];

/**
 * SQLite folds ASCII only (no ICU in the runtime build): `lower()` and
 * `COLLATE NOCASE` agree on `[A-Z]` and leave every other code point untouched.
 * MariaDB's CI collations and PostgreSQL's `lower()`/`ILIKE` fold Unicode.
 */
function fold(value: string, dialect: Dialect): string {
  return dialect === "sqlite"
    ? value.replace(/[A-Z]/g, (char) => char.toLowerCase())
    : value.toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** SQL LIKE evaluated against the engine's folding rules. */
function likeMatches(value: string, pattern: string, escape: string, dialect: Dialect): boolean {
  const folded = fold(pattern, dialect);
  let regex = "";
  for (let i = 0; i < folded.length; i++) {
    const char = folded[i];
    if (char === escape && i + 1 < folded.length) {
      regex += escapeRegExp(folded[++i]);
      continue;
    }
    if (char === "%") {
      regex += ".*";
      continue;
    }
    if (char === "_") {
      regex += ".";
      continue;
    }
    regex += escapeRegExp(char);
  }
  return new RegExp(`^${regex}$`, "s").test(fold(value, dialect));
}

/** Evaluate the compiled predicate shape for one row. */
function sqlMatches(statement: string, params: unknown[], row: Row, dialect: Dialect): boolean {
  const param = String(params[0] ?? "");
  if (statement.includes("LIKE")) {
    const hit = likeMatches(row.title, param, String(params[1] ?? "\\"), dialect);
    return statement.includes("NOT LIKE") || statement.includes("NOT ILIKE") ? !hit : hit;
  }
  const hit = fold(row.title, dialect) === fold(param, dialect);
  return statement.includes("<>") ? !hit : hit;
}

function selectWithSql(dialect: Dialect, filter: Record<string, unknown>): string[] {
  const compiled = compile(dialect, filter);
  return rows
    .filter((row) => sqlMatches(compiled.sql, compiled.params, row, dialect))
    .map((row) => row._id);
}

function selectInMemory(filter: Record<string, unknown>): string[] {
  return rows.filter((row) => documentMatches(row, filter)).map((row) => row._id);
}

interface SemanticsCase {
  label: string;
  filter: Record<string, unknown>;
  sqlite: string[];
  mariadb: string[];
  postgresql: string[];
}

const semanticsCases: SemanticsCase[] = [
  {
    label: "$contains is case-insensitive",
    filter: { title: { $contains: "HELLO" } },
    sqlite: ["1", "2", "3", "5", "6"],
    mariadb: ["1", "2", "3", "5", "6"],
    postgresql: ["1", "2", "3", "5", "6"],
  },
  {
    label: "$nicontains negates the substring",
    filter: { title: { $nicontains: "hello" } },
    sqlite: ["4", "7", "8", "9"],
    mariadb: ["4", "7", "8", "9"],
    postgresql: ["4", "7", "8", "9"],
  },
  {
    label: "$ieq matches one value regardless of case",
    filter: { title: { $ieq: "hello" } },
    sqlite: ["3"],
    mariadb: ["3"],
    postgresql: ["3"],
  },
  {
    label: "$nieq excludes that value",
    filter: { title: { $nieq: "hello" } },
    sqlite: ["1", "2", "4", "5", "6", "7", "8", "9"],
    mariadb: ["1", "2", "4", "5", "6", "7", "8", "9"],
    postgresql: ["1", "2", "4", "5", "6", "7", "8", "9"],
  },
  {
    label: "LIKE wildcards in the term stay literal",
    filter: { title: { $contains: "%_x" } },
    sqlite: ["9"],
    mariadb: ["9"],
    postgresql: ["9"],
  },
  {
    label: "an empty $contains term matches every row",
    filter: { title: { $contains: "" } },
    sqlite: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
    mariadb: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
    postgresql: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
  },
];

describe("case-insensitive operator semantics per engine", () => {
  for (const testCase of semanticsCases) {
    it(testCase.label, () => {
      expect(selectWithSql("sqlite", testCase.filter)).toEqual(testCase.sqlite);
      expect(selectWithSql("mariadb", testCase.filter)).toEqual(testCase.mariadb);
      expect(selectWithSql("postgresql", testCase.filter)).toEqual(testCase.postgresql);
    });
  }
});

/**
 * Documented divergences — all pre-existing, none introduced by this change.
 *
 * SQLite has no ICU in the runtime build, so `lower()` and `COLLATE NOCASE`
 * fold ASCII only; the in-memory matcher and MongoDB use Unicode folding.
 * The empty-string guard lives in `documentMatches` (`expected.length > 0`),
 * not in SQL.
 */
describe("documented cross-implementation divergences (unchanged)", () => {
  it("SQLite folds ASCII only; in-memory and MongoDB fold Unicode", () => {
    expect(selectWithSql("sqlite", { title: { $ieq: "ÄÖÜ" } })).toEqual(["7"]);
    expect(selectWithSql("mariadb", { title: { $ieq: "ÄÖÜ" } })).toEqual(["7", "8"]);
    expect(selectWithSql("postgresql", { title: { $ieq: "ÄÖÜ" } })).toEqual(["7", "8"]);
    // The in-memory matcher follows the Unicode-folding engines.
    expect(selectInMemory({ title: { $ieq: "ÄÖÜ" } })).toEqual(["7", "8"]);
  });

  it("an empty $contains term is a no-op in memory but matches everything in SQL", () => {
    expect(selectInMemory({ title: { $contains: "" } })).toEqual([]);
    expect(selectWithSql("sqlite", { title: { $contains: "" } })).toHaveLength(rows.length);
  });

  it("the in-memory matcher agrees with the Unicode-folding engines", () => {
    const unicode = { title: { $contains: "ü" } };
    expect(selectInMemory(unicode)).toEqual(["7", "8"]);
    expect(selectWithSql("postgresql", unicode)).toEqual(["7", "8"]);
    expect(selectWithSql("mariadb", unicode)).toEqual(["7", "8"]);
    // ASCII-only SQLite never folds "Ü" to "ü".
    expect(selectWithSql("sqlite", unicode)).toEqual(["8"]);
  });
});
