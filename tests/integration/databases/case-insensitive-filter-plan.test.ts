/**
 * @file tests/integration/databases/case-insensitive-filter-plan.test.ts
 * @description Query-plan proof for the per-engine case-insensitive filters.
 *
 * Unit tests pin the SQL *shape*; this suite pins the *planner* on a seeded
 * collection with an `indexed: true` text field:
 * - SQLite uses `col = ? COLLATE NOCASE` and must pick the `_nocase` index.
 * - PostgreSQL uses `lower(col) = lower($1)` (the `_lower` btree) and
 *   `col ILIKE $1` (the `pg_trgm` GIN) for substring.
 * - MariaDB uses `col = ?` under its CI collation and must pick the column index.
 * - MariaDB `_bin` control: a binary column proves why the adapter probes
 *   `@@collation_server` and falls back to `lower()` on a case-sensitive server.
 *
 * Runs one engine per invocation (`DB_TYPE`), like the other integration suites.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTableName } from "drizzle-orm";
import { ensureFullInitialization, getDb } from "@src/databases/db";
import { withSystemScope } from "@src/databases/system-tenant-scope";

const ENGINE = (process.env.DB_TYPE ?? "sqlite").toLowerCase() as
  | "sqlite"
  | "postgresql"
  | "mariadb"
  | "mongodb";
const COLLECTION = `ciplan_${ENGINE}`;
const TENANT = "ciplan-tenant";
// PostgreSQL's trigram index only wins once the heap is large enough to make a
// scan expensive (5k narrow rows are cheaper to scan than to probe). The other
// engines assert plan shape, not cost, so they keep the smaller fixture.
const ROWS = ENGINE === "postgresql" ? 50_000 : 5_000;
const tenantOpts = Object.freeze({ tenantId: TENANT });

let db: any = null;

function physicalName(collection: string): string {
  return getTableName(db.getTable(collection)) as string;
}

function q(identifier: string): string {
  return ENGINE === "mariadb" ? `\`${identifier}\`` : `"${identifier}"`;
}

/** Render the exact SQL the adapter would execute for a filter (tenant clause included). */
function renderFilterSql(filter: Record<string, unknown>): { sql: string; params: unknown[] } {
  const table = db.getTable(COLLECTION);
  const condition = db.mapQuery(table, filter, tenantOpts);
  return db.db.select({ _id: table._id }).from(table).where(condition).toSQL();
}

async function planFor(filter: Record<string, unknown>, analyze = false): Promise<string> {
  const rendered = renderFilterSql(filter);
  if (ENGINE === "sqlite") {
    const rows = (await db.raw.execute(
      `EXPLAIN QUERY PLAN ${rendered.sql}`,
      rendered.params,
    )) as Array<{ detail?: string }>;
    return rows.map((row) => String(row.detail ?? "")).join("\n");
  }
  if (ENGINE === "postgresql") {
    const verb = analyze ? "EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)" : "EXPLAIN (FORMAT TEXT)";
    const rows = (await db.raw.execute(`${verb} ${rendered.sql}`, rendered.params)) as Array<{
      "QUERY PLAN": string;
    }>;
    return rows.map((row) => row["QUERY PLAN"]).join("\n");
  }
  const rows = (await db.raw.execute(`EXPLAIN ${rendered.sql}`, rendered.params)) as Array<{
    key?: string | null;
    table?: string;
    type?: string;
  }>;
  return JSON.stringify(rows);
}

const describeSql = ENGINE === "mongodb" ? describe.skip : describe;
if (ENGINE === "mongodb") {
  console.log("⏭️ SQL plan checks skipped — engine is mongodb (no SQL planner)");
}

describeSql(`Case-insensitive filter plans — ${ENGINE}`, () => {
  beforeAll(async () => {
    await ensureFullInitialization();
    db = getDb();
    if (!db) throw new Error("Database not initialized");

    await db.collection.createModel({
      _id: COLLECTION,
      name: COLLECTION,
      fields: [
        {
          db_fieldName: "title",
          type: "string",
          widget: { Name: "Input" },
          indexed: true,
          required: true,
        },
        { db_fieldName: "tenantId", type: "string", widget: { Name: "Input" } },
      ],
    });

    const table = q(physicalName(COLLECTION));
    if (ENGINE === "sqlite") {
      await db.raw.execute(
        `WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n < ?)
         INSERT INTO ${table} ("_id","tenantId","title")
         SELECT 'id-'||n, ?, 'Row '||n||' token-'||n FROM seq`,
        [ROWS, TENANT],
      );
      await db.raw.execute(`ANALYZE ${table}`);
    } else if (ENGINE === "postgresql") {
      await db.raw.execute(
        `INSERT INTO ${table} ("_id","tenantId","title")
         SELECT 'id-'||g, $1, 'Row '||g||' token-'||g FROM generate_series(1, $2) AS g`,
        [TENANT, ROWS],
      );
      await db.raw.execute(`ANALYZE ${table}`);
    } else {
      await db.raw.execute(
        `INSERT INTO ${table} (\`_id\`,\`tenantId\`,\`title\`)
         SELECT CONCAT('id-',seq), ?, CONCAT('Row ',seq,' token-',seq) FROM seq_1_to_${ROWS}`,
        [TENANT],
      );
      await db.raw.execute(`ANALYZE TABLE ${table}`);
    }
  }, 120_000);

  afterAll(async () => {
    await db?.crud
      ?.deleteMany(
        COLLECTION,
        {},
        withSystemScope("testing", { permanent: true, confirmWipe: true }),
      )
      .catch(() => {});
  });

  it("equality picks the case-insensitive index", async () => {
    const plan = await planFor({ title: { $ieq: "Row 4242 token-4242" } }, true);
    if (ENGINE === "sqlite") {
      expect(plan).toContain(`${physicalName(COLLECTION)}_title_nocase`);
      expect(plan).toMatch(/USING (COVERING )?INDEX/);
    } else if (ENGINE === "postgresql") {
      expect(plan).toContain(`${physicalName(COLLECTION)}_title_lower`);
      expect(plan).toMatch(/Index (Only )?Scan|Bitmap Index Scan/);
      expect(plan).not.toMatch(/Seq Scan on/);
    } else {
      expect(plan).toContain("title");
      expect(plan).toMatch(/"key":"[^"]*title/i);
    }
  });

  it("substring uses the trigram index on PostgreSQL", async () => {
    const plan = await planFor({ title: { $contains: "token-4242" } }, true);
    if (ENGINE === "postgresql") {
      expect(plan).toContain(`${physicalName(COLLECTION)}_title_trgm`);
      expect(plan).toMatch(/Bitmap Index Scan|Index Scan/);
      expect(plan).not.toMatch(/Seq Scan on/);
    } else if (ENGINE === "sqlite") {
      // SQLite LIKE has no trigram planner; the assertion is semantic, not plan-based.
      expect(plan).toMatch(/SCAN|SEARCH/);
    } else {
      // MariaDB has no trigram index; a leading-% LIKE is a scan by definition.
      expect(plan).toContain("title");
    }
  });
});

const describeMaria = ENGINE === "mariadb" ? describe : describe.skip;
describeMaria("MariaDB binary collation control", () => {
  it("proves `col = ?` is case-sensitive on a `_bin` column (the reason for the server probe)", async () => {
    const table = `${physicalName(COLLECTION)}_binctrl`;
    await db.raw.execute(
      `CREATE TABLE IF NOT EXISTS \`${table}\` (\`_id\` VARCHAR(64) PRIMARY KEY, \`title\` VARCHAR(255) COLLATE utf8mb4_bin)`,
    );
    await db.raw.execute(`DELETE FROM \`${table}\``);
    await db.raw.execute(`INSERT INTO \`${table}\` (\`_id\`,\`title\`) VALUES ('1','Hello')`);

    const [binary] = (await db.raw.execute(
      `SELECT COUNT(*) AS c FROM \`${table}\` WHERE \`title\` = 'hello'`,
    )) as Array<{ c: number | string }>;
    const [folded] = (await db.raw.execute(
      `SELECT COUNT(*) AS c FROM \`${table}\` WHERE LOWER(\`title\`) = LOWER('hello')`,
    )) as Array<{ c: number | string }>;

    expect(Number(binary.c)).toBe(0);
    expect(Number(folded.c)).toBe(1);

    await db.raw.execute(`DROP TABLE IF EXISTS \`${table}\``);
  });
});
