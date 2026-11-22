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
 * - SQL compilation (`mapQuery` + SQLite dialect), evaluated by a precise
 *   LIKE/equality interpreter over the compiled SQL and bound parameters
 * - Mongo compilation (`MongoAdapterCore.mapQuery`), evaluated with Mongo's
 *   `$regex` / `$not` semantics
 * - in-memory evaluation (`documentMatches`)
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

/** SQL LIKE with an explicit ESCAPE character (`%`/`_` wildcards). */
function likeMatches(value: string, pattern: string, escape: string): boolean {
  // Every case-insensitive comparison compiles to `lower(col) LIKE lower(?)`,
  // so the pattern is folded exactly as the database folds it.
  const folded = pattern.toLowerCase();
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
  return new RegExp(`^${regex}$`, "s").test(value.toLowerCase());
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
  if (statement.includes("<>")) return title.toLowerCase() !== param.toLowerCase();
  if (statement.includes("=")) return title.toLowerCase() === param.toLowerCase();
  throw new Error(`unexpected compiled SQL: ${statement}`);
}

function selectWithSql(filter: Record<string, unknown>): string[] {
  const where = mapQuery(
    articles,
    filter,
    {},
    (table, name) => table[name],
    (field: string) => sql`json_extract(data, ${`$.${field}`})`,
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
    expected: ["1", "2", "4", "5", "6"],
  },
  {
    label: "$contains is case-insensitive (SQL/Mongo parity)",
    query: { "filter[title][contains]": "HELLO" },
    expected: ["1", "2", "3", "5", "6"],
  },
  {
    label: "$nicontains negates the case-insensitive substring",
    query: { "filter[title][_nicontains]": "hello" },
    expected: ["4"],
  },
  {
    label: "LIKE wildcards in the term stay literal",
    query: { "filter[title][contains]": "100%" },
    expected: ["6"],
  },
  {
    label: "$nicontains keeps LIKE wildcards literal",
    query: { "filter[title][_nicontains]": "100%" },
    expected: ["1", "2", "3", "4", "5"],
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
