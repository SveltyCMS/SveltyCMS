/**
 * @file tests/unit/databases/filter-case-insensitive-parity.test.ts
 * @description Cross-implementation parity for case-insensitive filter operators.
 *
 * Before this change SQL answered `$contains` case-insensitively, Mongo used
 * `/i`, and the in-memory path (`documentMatches`) was case-sensitive — the
 * same REST filter returned different rows depending on the code path. These
 * tests drive one filter through all three implementations and assert the same
 * matching rows:
 * - REST parsing → `$ieq` / `$nieq` / `$nicontains` / `$contains`
 * - SQL compilation (`mapQuery` + the SQLite dialect hint, so `$ieq`/`$nieq`
 *   compile to `col = ? COLLATE NOCASE` and `$contains` to `col LIKE ?`),
 *   evaluated by a LIKE/equality interpreter over the compiled SQL and params
 * - Mongo compilation (`MongoAdapterCore.mapQuery`), evaluated with Mongo's
 *   `$regex` / `$not` semantics
 * - in-memory evaluation (`documentMatches`)
 *
 * SQLite folds ASCII only (no ICU), so the interpreter folds `[A-Z]` exactly
 * like `lower()` / `COLLATE NOCASE` do. The divergences that follow from that
 * (and from the in-memory empty-term guard) are pinned in the last describe.
 */

import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { SQLiteSyncDialect, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { mapQuery } from "@src/databases/core/drizzle-sql-helpers";
import { MongoAdapterCore } from "@src/databases/mongodb/adapter-core";
import { documentMatches } from "@src/content/schema-model";
import { parseCollectionQueryParams } from "@src/utils/api-params";
import type { IBatchAdapter, ICrudAdapter } from "@src/databases/db-interface";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const articles = sqliteTable("articles", {
  _id: text("_id").primaryKey(),
  title: text("title").notNull(),
});

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

class TestMongoCore extends MongoAdapterCore {
  public get crud(): ICrudAdapter {
    throw new Error("crud not used in parity tests");
  }
  public get batch(): IBatchAdapter {
    throw new Error("batch not used in parity tests");
  }
}

const mongoCore = new TestMongoCore();

// ─── SQL evaluation ───────────────────────────────────────────────────────────

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** SQLite folds ASCII only: `lower()` and `COLLATE NOCASE` agree exactly. */
function foldAscii(value: string): string {
  return value.replace(/[A-Z]/g, (char) => char.toLowerCase());
}

/** SQL LIKE with an explicit ESCAPE character (`%`/`_` wildcards). */
function likeMatches(value: string, pattern: string, escape: string): boolean {
  const folded = foldAscii(pattern);
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
  return new RegExp(`^${regex}$`, "s").test(foldAscii(value));
}

/** Evaluates the predicate shapes the case-insensitive operators compile to. */
function sqlMatches(statement: string, params: unknown[], row: Row): boolean {
  const title = row.title;
  const param = String(params[0] ?? "");
  if (statement.includes("NOT LIKE")) {
    return !likeMatches(title, param, String(params[1] ?? "\\"));
  }
  if (statement.includes("LIKE")) {
    return likeMatches(title, param, String(params[1] ?? "\\"));
  }
  if (statement.includes("<>")) return foldAscii(title) !== foldAscii(param);
  if (statement.includes("=")) return foldAscii(title) === foldAscii(param);
  throw new Error(`unexpected compiled SQL: ${statement}`);
}

function selectWithSql(filter: Record<string, unknown>): string[] {
  const where = mapQuery(
    articles,
    filter,
    {},
    (table, name) => (table as Record<string, unknown>)[name] as never,
    (field: string) => sql`json_extract(data, ${`$.${field}`})`,
    undefined,
    undefined,
    undefined,
    "sqlite",
  );
  expect(where, `mapQuery produced no WHERE clause for ${JSON.stringify(filter)}`).toBeDefined();
  const compiled = new SQLiteSyncDialect().sqlToQuery(where as never);
  return rows
    .filter((row) => sqlMatches(compiled.sql, [...compiled.params], row))
    .map((row) => row._id);
}

// ─── Mongo evaluation ─────────────────────────────────────────────────────────

function mongoMatches(row: Row, filter: Record<string, unknown>): boolean {
  const condition = filter.title;
  const test = (matcher: unknown): boolean => {
    if (matcher instanceof RegExp) return matcher.test(row.title);
    return String(matcher) === row.title;
  };
  if (condition instanceof RegExp) return test(condition);
  if (condition && typeof condition === "object" && !Array.isArray(condition)) {
    return Object.entries(condition as Record<string, unknown>).every(([operator, value]) => {
      if (operator === "$regex") return test(value);
      if (operator === "$not") return !test(value);
      if (operator === "$eq") return String(value) === row.title;
      throw new Error(`unexpected Mongo operator: ${operator}`);
    });
  }
  return String(condition) === row.title;
}

function selectWithMongo(filter: Record<string, unknown>): string[] {
  const query = mongoCore.mapQuery(filter);
  return rows.filter((row) => mongoMatches(row, query)).map((row) => row._id);
}

function selectInMemory(filter: Record<string, unknown>): string[] {
  return rows.filter((row) => documentMatches(row, filter)).map((row) => row._id);
}

// ─── Parity matrix ────────────────────────────────────────────────────────────

const cases: Array<{ label: string; query: Record<string, string>; expected: string[] }> = [
  {
    label: "$ieq matches one value regardless of case",
    query: { "filter[title][_ieq]": "hello" },
    expected: ["3"],
  },
  {
    label: "$nieq excludes that value regardless of case",
    query: { "filter[title][_nieq]": "hello" },
    expected: ["1", "2", "4", "5", "6", "7", "8", "9"],
  },
  {
    label: "$contains is case-insensitive (SQL/Mongo parity)",
    query: { "filter[title][contains]": "HELLO" },
    expected: ["1", "2", "3", "5", "6"],
  },
  {
    label: "$nicontains negates the case-insensitive substring",
    query: { "filter[title][_nicontains]": "hello" },
    expected: ["4", "7", "8", "9"],
  },
  {
    label: "LIKE wildcards in the term stay literal",
    query: { "filter[title][contains]": "100%" },
    expected: ["6"],
  },
  {
    label: "$nicontains keeps LIKE wildcards literal",
    query: { "filter[title][_nicontains]": "100%" },
    expected: ["1", "2", "3", "4", "5", "7", "8", "9"],
  },
];

describe("case-insensitive filter operator parity (SQL / Mongo / in-memory)", () => {
  for (const testCase of cases) {
    it(testCase.label, () => {
      const filter = parseCollectionQueryParams(new URLSearchParams(testCase.query)).filter;

      const sqlIds = selectWithSql(filter);
      const mongoIds = selectWithMongo(filter);
      const memoryIds = selectInMemory(filter);

      // Assert the SQL/Mongo implementations match the expected rows first, so a
      // shared-but-wrong result cannot pass as "parity".
      expect(sqlIds).toEqual(testCase.expected);
      expect(mongoIds).toEqual(testCase.expected);
      expect(memoryIds).toEqual(testCase.expected);
    });
  }
});

// ─── Documented divergences (pre-existing, unchanged by the compile change) ────

describe("documented divergences between SQLite and the Unicode-folding paths", () => {
  it("SQLite compares non-ASCII exactly; Mongo and in-memory fold Unicode", () => {
    const filter = parseCollectionQueryParams(
      new URLSearchParams({ "filter[title][_ieq]": "ÄÖÜ" }),
    ).filter;

    // ASCII-only NOCASE/lower() — the same result the old lower() predicate gave.
    expect(selectWithSql(filter)).toEqual(["7"]);
    expect(selectWithMongo(filter)).toEqual(["7", "8"]);
    expect(selectInMemory(filter)).toEqual(["7", "8"]);
  });

  it("an empty $contains term matches every SQL/Mongo row but no in-memory row", () => {
    const filter = parseCollectionQueryParams(
      new URLSearchParams({ "filter[title][contains]": "" }),
    ).filter;

    expect(selectWithSql(filter)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    expect(selectWithMongo(filter)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    // `documentMatches` treats an empty term as "no match" by design.
    expect(selectInMemory(filter)).toEqual([]);
  });
});
