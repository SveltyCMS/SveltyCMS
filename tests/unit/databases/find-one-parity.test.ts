/**
 * @file tests/unit/databases/find-one-parity.test.ts
 * @description
 * Parity guard for `SqlAdapterCore.findOne`: the compiled plan and BOTH fallback
 * branches (raw dynamic SQL and Drizzle) must answer the SAME query with the
 * SAME row. The fallbacks previously ignored `options.sort` (no ORDER BY) and
 * `options.fields` (they selected every physical column), so a query that failed
 * to compile returned an arbitrary row carrying all columns while the compiled
 * plan returned the sort-first row with only the requested fields.
 *
 * ### Features:
 * - real in-memory SQLite via `node:sqlite` + `drizzle-orm/sqlite-proxy`
 * - compiled vs dynamic-fallback vs Drizzle-fallback on one identical query
 * - asserts the `createdAt desc` sort-first row and the `_id`/`title` projection
 * - guards that omitting `sort`/`fields` still yields the full physical row
 */

import { afterAll, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { SqlAdapterCore } from "@src/databases/core/sql-adapter-core";
import type { DatabaseResult, DatabaseTransaction } from "@src/databases/db-interface";

const COLLECTION = "find_one_parity";

const probeTable = sqliteTable(COLLECTION, {
  _id: text("_id").primaryKey(),
  title: text("title"),
  status: text("status"),
  createdAt: text("createdAt"),
  data: text("data"),
});

/** Rows seeded oldest → newest; `createdAt desc` must surface `newest`. */
const ROWS = [
  { _id: "oldest", title: "Oldest", status: "active", createdAt: "2024-01-01T00:00:00.000Z" },
  { _id: "middle", title: "Middle", status: "active", createdAt: "2024-02-01T00:00:00.000Z" },
  { _id: "newest", title: "Newest", status: "active", createdAt: "2024-03-01T00:00:00.000Z" },
];
const NEWEST_ID = "newest";

/** Bound-parameter shapes `node:sqlite` accepts. */
type SqliteValue = string | number | bigint | null | Uint8Array;

/** The Drizzle `SQL` object exposes `toQuery` at runtime (see the SQLite adapter). */
type RenderableSql = SQL & {
  toQuery: (opts: {
    escapeName: (name: string) => string;
    escapeParam: () => string;
    casing: { getColumnCasing: (column: { name: string }) => string };
  }) => { sql: string; params: unknown[] };
};

function createNative(): DatabaseSync {
  const native = new DatabaseSync(":memory:");
  native.exec(
    `CREATE TABLE "${COLLECTION}" ("_id" TEXT PRIMARY KEY, "title" TEXT, "status" TEXT, "createdAt" TEXT, "data" TEXT)`,
  );
  const insert = native.prepare(
    `INSERT INTO "${COLLECTION}" ("_id","title","status","createdAt","data") VALUES (?,?,?,?,?)`,
  );
  for (const row of ROWS) {
    insert.run(row._id, row.title, row.status, row.createdAt, JSON.stringify({ hidden: true }));
  }
  return native;
}

function createDrizzle(native: DatabaseSync): unknown {
  return drizzle(async (sqlText, params, method) => {
    const statement = native.prepare(sqlText);
    const bound = params as SqliteValue[];
    if (method === "all") {
      return { rows: statement.all(...bound).map((row) => Object.values(row)) };
    }
    if (method === "get") {
      const row = statement.get(...bound);
      return { rows: row ? Object.values(row) : [] };
    }
    statement.run(...bound);
    return { rows: [] };
  });
}

/**
 * Minimal `SqlAdapterCore` over the in-memory SQLite. `compiled:false` shadows
 * the inherited `executeCompiled`, so `findOne` deterministically takes its
 * fallback path — exactly the shape a core without the prepared-plan fast path
 * has; `dynamic` toggles the raw-SQL vs Drizzle fallback branch.
 */
class FindOneProbe extends SqlAdapterCore {
  public type = "test";
  public readonly schema = {};
  public override db: unknown;
  public override raw: {
    execute: (sql: string, params?: unknown[]) => Promise<unknown[]>;
    client: unknown;
  };
  private readonly native: DatabaseSync;
  private readonly dynamic: boolean;
  /** Counts compiled-plan executions so a test can prove which branch ran. */
  public compiledCalls = 0;

  constructor(native: DatabaseSync, db: unknown, options: { compiled: boolean; dynamic: boolean }) {
    super();
    this.connected = true;
    this.native = native;
    this.db = db;
    this.dynamic = options.dynamic;
    this.raw = {
      execute: async (sqlText, params) =>
        this.native.prepare(sqlText).all(...((params ?? []) as SqliteValue[])),
      client: native,
    };
    if (!options.compiled) {
      Object.defineProperty(this, "executeCompiled", { value: undefined });
    }
  }

  public override getTable(): unknown {
    return probeTable;
  }

  public override createDynamicTableDefinition(): unknown {
    return probeTable;
  }

  public override getJsonField(field: string): SQL {
    return sql`json_extract(${probeTable.data}, ${"$." + field})`;
  }

  protected override isMissingTableError(): boolean {
    return false;
  }

  protected override get useDynamicSqlInFindMany(): boolean {
    return this.dynamic;
  }

  public override async executeDynamicSql(_db: unknown, sqlQuery: SQL): Promise<unknown[]> {
    const rendered = (sqlQuery as RenderableSql).toQuery({
      escapeName: (name: string) => `"${name.replace(/"/g, '""')}"`,
      escapeParam: () => "?",
      casing: { getColumnCasing: (column: { name: string }) => column.name },
    });
    return this.native.prepare(rendered.sql).all(...(rendered.params as SqliteValue[]));
  }

  public override async executeCompiled(
    sqlText: string,
    params: readonly unknown[],
  ): Promise<unknown[]> {
    this.compiledCalls += 1;
    return super.executeCompiled(sqlText, params);
  }

  public override async transaction<T>(
    fn: (transaction: DatabaseTransaction) => Promise<DatabaseResult<T>>,
  ): Promise<DatabaseResult<T>> {
    return fn({} as never);
  }
}

const native = createNative();
const drizzleDb = createDrizzle(native);
const compiledProbe = new FindOneProbe(native, drizzleDb, { compiled: true, dynamic: true });
const dynamicFallbackProbe = new FindOneProbe(native, drizzleDb, {
  compiled: false,
  dynamic: true,
});
const drizzleFallbackProbe = new FindOneProbe(native, drizzleDb, {
  compiled: false,
  dynamic: false,
});

afterAll(() => {
  native.close();
});

interface ProjectedRow {
  _id?: string;
  title?: string;
  status?: string;
  data?: string;
}

async function findFirstRow(probe: FindOneProbe): Promise<ProjectedRow> {
  const result = await probe.findOne(
    COLLECTION,
    { status: "active" } as never,
    { sort: { createdAt: "desc" }, fields: ["_id", "title"] } as never,
  );
  expect(result.success, result.message).toBe(true);
  expect(result.data).toBeTruthy();
  return result.data as ProjectedRow;
}

describe("findOne compiled vs fallback parity", () => {
  it("the compiled plan returns the sort-first row with only the projected fields", async () => {
    const callsBefore = compiledProbe.compiledCalls;
    const row = await findFirstRow(compiledProbe);
    // The compiled branch ran — the assertions below are not a fallback artifact.
    expect(compiledProbe.compiledCalls).toBeGreaterThan(callsBefore);
    expect(row._id).toBe(NEWEST_ID);
    expect(row.title).toBe("Newest");
    expect("status" in row).toBe(false);
    expect("data" in row).toBe(false);
  });

  it("the dynamic raw-SQL fallback matches the compiled plan", async () => {
    const row = await findFirstRow(dynamicFallbackProbe);
    expect(row._id).toBe(NEWEST_ID);
    expect(row.title).toBe("Newest");
    expect("status" in row).toBe(false);
    expect("data" in row).toBe(false);
  });

  it("the Drizzle fallback matches the compiled plan", async () => {
    const row = await findFirstRow(drizzleFallbackProbe);
    expect(row._id).toBe(NEWEST_ID);
    expect(row.title).toBe("Newest");
    expect("status" in row).toBe(false);
    expect("data" in row).toBe(false);
  });

  it("honors the tuple-array sort form in the fallback", async () => {
    const result = await dynamicFallbackProbe.findOne(COLLECTION, { status: "active" } as never, {
      sort: [["createdAt", "desc"]] as never,
      fields: ["_id"] as never,
    });
    expect(result.success).toBe(true);
    expect((result.data as ProjectedRow)._id).toBe(NEWEST_ID);
  });
});

describe("findOne fallback unchanged when no sort/fields are supplied", () => {
  it("compiled and fallback both return a full physical row", async () => {
    for (const probe of [compiledProbe, dynamicFallbackProbe, drizzleFallbackProbe]) {
      const result = await probe.findOne(COLLECTION, { status: "active" } as never, {});
      expect(result.success, result.message).toBe(true);
      const row = result.data as ProjectedRow;
      expect(row.status).toBe("active");
      expect(ROWS.map((r) => r._id)).toContain(row._id);
    }
  });
});
