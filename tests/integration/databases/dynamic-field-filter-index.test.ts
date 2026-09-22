/**
 * @file tests/integration/databases/dynamic-field-filter-index.test.ts
 * @description
 * Dynamic-field filter acceleration — the engine-native answer per adapter.
 *
 * A field that is NOT materialized into a column lives in the JSON `data` blob, so
 * equality filters on it used to be translated to a text extraction
 * (`data->>'field' = $1`), which no index can serve. PostgreSQL has a form that an
 * index CAN serve — containment `data @> '{"field": value}'::jsonb` against a
 * `jsonb_path_ops` GIN index — so it now emits that (see `getJsonEquals`), and
 * `createModel` provisions the GIN index for every dynamic collection table.
 *
 * This suite guards both halves:
 * 1. **Semantics** — the filter still returns exactly the rows it should (numbers,
 *    strings, booleans, `$in`), on every engine, so the PostgreSQL rewrite cannot
 *    drift. Type fidelity is asserted: a number probe matches a stored number, not a
 *    stored string (MongoDB/SQLite semantics — the old text comparison matched both).
 * 2. **Plan** — on PostgreSQL the SQL the adapter itself builds must be served by the
 *    GIN index, not a sequential scan (asserted by running `EXPLAIN` on that exact
 *    rendered SQL, so the check cannot test a hand-written stand-in).
 *
 * SQLite/MariaDB intentionally keep the extraction form: neither has a single index
 * that serves arbitrary JSON paths, so their native answer is column materialization
 * (`indexed` / `materialize: true` fields), which the row-store hybrid already does.
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
const COLLECTION = `dynfilter_${ENGINE}`;
/** Bulk-seeded table used ONLY by the PostgreSQL plan checks (never the row probes). */
const PLAN_COLLECTION = `dynfilter_plan_${ENGINE}`;
const TENANT = "dynfilter-tenant";
const tenantOpts = Object.freeze({ tenantId: TENANT });

let db: any = null;

/** Physical table name of a test collection — derived from the adapter, never guessed. */
function physicalName(collection: string): string {
  return getTableName(db.getTable(collection)) as string;
}

/**
 * Render the exact SQL the adapter would execute for a filter: its own condition
 * (via `mapQuery`, including the tenant clause) inside a select on the same table.
 * Asserting on this — rather than on a hand-written stand-in — is what makes the
 * plan assertion meaningful.
 */
function renderFilterSql(
  filter: Record<string, unknown>,
  collection: string = COLLECTION,
): { sql: string; params: unknown[] } {
  const table = db.getTable(collection);
  const condition = db.mapQuery(table, filter, tenantOpts);
  return db.db.select({ _id: table._id }).from(table).where(condition).toSQL();
}

/** PostgreSQL-only assertions (plan checks) — skipped elsewhere with a reason. */
const describePg = ENGINE === "postgresql" ? describe : describe.skip;
if (ENGINE !== "postgresql") {
  console.log(
    `⏭️ GIN plan checks skipped — engine is ${ENGINE}, containment+GIN is PostgreSQL-specific`,
  );
}

describe(`Dynamic-field filter — ${ENGINE}`, () => {
  beforeAll(async () => {
    await ensureFullInitialization();
    db = getDb();
    if (!db) throw new Error("Database not initialized");

    // Only `title` is declared: `views`/`flag` stay in the `data` blob, which is the
    // whole point of this suite (a materialized field would be a column filter).
    if (db.collection?.createModel) {
      await db.collection
        .createModel({
          _id: COLLECTION,
          name: COLLECTION,
          fields: [
            { db_fieldName: "title", widget: { Name: "Input" }, required: true },
            { db_fieldName: "tenantId", widget: { Name: "Input" } },
          ],
        })
        .catch(() => {});
    }

    for (let i = 0; i < 3; i++) {
      await db.crud.insert(
        COLLECTION,
        {
          _id: crypto.randomUUID(),
          title: `Row ${i}`,
          views: 100 + i,
          flag: i === 0,
          tenantId: TENANT,
        },
        tenantOpts,
      );
    }
    // A row whose numeric field is stored as TEXT — the type-fidelity probe.
    await db.crud.insert(
      COLLECTION,
      { _id: crypto.randomUUID(), title: "Stringly typed", views: "101", tenantId: TENANT },
      tenantOpts,
    );
  }, 120_000);

  afterAll(async () => {
    if (db?.crud?.deleteMany) {
      await db.crud
        .deleteMany(COLLECTION, {}, withSystemScope("testing", { permanent: true }))
        .catch(() => {});
    }
  });

  it("matches a numeric dynamic field (number probe)", async () => {
    const res = await db.crud.findMany(COLLECTION, { views: 102 }, tenantOpts);
    expect(res.success).toBe(true);
    const rows = res.data as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Row 2");
  });

  it("matches a string dynamic field", async () => {
    const res = await db.crud.findMany(COLLECTION, { title: "Row 1" }, tenantOpts);
    expect(res.success).toBe(true);
    expect((res.data as unknown[]).length).toBe(1);
  });

  it("matches `$in` on a dynamic field", async () => {
    const res = await db.crud.findMany(COLLECTION, { views: { $in: [100, 102] } }, tenantOpts);
    expect(res.success).toBe(true);
    const titles = (res.data as Array<Record<string, unknown>>).map((r) => r.title).sort();
    expect(titles).toEqual(["Row 0", "Row 2"]);
  });

  it("keeps JSON types distinct on the engines that compare JSON type-aware", async () => {
    // PostgreSQL containment, SQLite's typed `json_extract` and MongoDB's type-aware
    // comparison all agree here; the previous PostgreSQL text comparison did not.
    const res = await db.crud.findMany(COLLECTION, { views: 101 }, tenantOpts);
    expect(res.success).toBe(true);
    const titles = (res.data as Array<Record<string, unknown>>).map((r) => r.title);
    expect(titles).toContain("Row 1");
    if (ENGINE === "mariadb") {
      // MariaDB's JSON functions hand back TEXT (`JSON_UNQUOTE(JSON_EXTRACT(...))`),
      // so `= 101` coerces and a text-stored "101" matches too. Documented looseness
      // of that engine's JSON comparison — the other three are type-strict. Fixing it
      // needs a `JSON_TYPE(...)` predicate on every dynamic-field filter, i.e. a
      // function call per row on the hottest filter path, which is not worth it.
      expect(titles).toContain("Stringly typed");
    } else {
      expect(titles).toEqual(["Row 1"]);
      expect(titles).not.toContain("Stringly typed");
    }
  });

  it("matches a nested value through a dotted path (cross-engine parity)", async () => {
    // SQLite used to quote the whole path (`$."meta.lang"` = one literal key), so a
    // dotted filter matched nothing there while PostgreSQL (`#>>'{meta,lang}'`) and
    // MariaDB (`$.meta.lang`) resolved it nested. PostgreSQL additionally probes
    // containment with a nested object (`{"meta":{"lang":…}}`).
    await db.crud.insert(
      COLLECTION,
      { _id: crypto.randomUUID(), title: "Nested", meta: { lang: "en" }, tenantId: TENANT },
      tenantOpts,
    );

    const res = await db.crud.findMany(COLLECTION, { "meta.lang": "en" }, tenantOpts);
    expect(res.success).toBe(true);
    const titles = (res.data as Array<Record<string, unknown>>).map((r) => r.title);
    expect(titles).toContain("Nested");

    const missing = await db.crud.findMany(COLLECTION, { "meta.lang": "de" }, tenantOpts);
    expect(missing.success).toBe(true);
    expect((missing.data as unknown[]).length).toBe(0);
  });

  it("matches a numeric range on a dynamic field (no lexicographic trap)", async () => {
    // Regression guard for a real defect: on PostgreSQL the extraction is TEXT, so
    // `views >= 4` was lexicographic and MISSED stored 16/32 (`'16' < '4'`). The
    // JSONB comparison (`data->'views' >= '4'::jsonb`) is numeric; SQLite's typed
    // `json_extract` and MariaDB's coercing comparison already behaved correctly.
    for (const views of [4, 16, 32]) {
      await db.crud.insert(
        COLLECTION,
        { _id: crypto.randomUUID(), title: `Range ${views}`, views, tenantId: TENANT },
        tenantOpts,
      );
    }

    const res = await db.crud.findMany(COLLECTION, { views: { $gte: 4 } }, tenantOpts);
    expect(res.success).toBe(true);
    const titles = (res.data as Array<Record<string, unknown>>).map((r) => r.title);
    // The bug case: with the old lexicographic comparison PostgreSQL returned only
    // "Range 4" ('16' < '4'), so asserting 16/32 individually is what catches it.
    expect(titles).toContain("Range 4");
    expect(titles).toContain("Range 16");
    expect(titles).toContain("Range 32");

    const below = await db.crud.findMany(COLLECTION, { views: { $lt: 4 } }, tenantOpts);
    expect(below.success).toBe(true);
    expect((below.data as unknown[]).length).toBe(0);

    // Type strictness in BOTH directions. PostgreSQL's jsonb order is
    // Object > Array > Boolean > Number > String > Null, so every non-numeric value
    // sorts BELOW every number: an unguarded `views < 4` admitted the `"101"`-stored
    // row (measured: `'"101"'::jsonb < '4'::jsonb` is true), while `>=` dropped it.
    // SQLite's typed `json_extract` and MongoDB's type-aware comparison never did
    // either, so a stored string must stay out of a numeric range on all engines.
    const wide = await db.crud.findMany(COLLECTION, { views: { $gt: 0, $lt: 1000 } }, tenantOpts);
    expect(wide.success).toBe(true);
    const wideTitles = (wide.data as Array<Record<string, unknown>>).map((r) => r.title);
    expect(wideTitles).toContain("Range 4");
    // The key is absent in this row: `jsonb_typeof(NULL)` is NULL, never a number.
    expect(wideTitles).not.toContain("Nested");
    if (ENGINE === "mariadb") {
      // `JSON_UNQUOTE` coerces `"101"` → 101, so the text-stored value does enter the
      // range there — the same documented looseness as the `$eq` probe above.
      expect(wideTitles).toContain("Stringly typed");
    } else {
      expect(wideTitles).not.toContain("Stringly typed");
    }
  });

  it("uses the engine-native filter form (containment on PostgreSQL, extraction elsewhere)", async () => {
    if (ENGINE === "mongodb") return; // the builder is not SQL — nothing to render here
    const rendered = renderFilterSql({ views: 102 });
    if (ENGINE === "postgresql") {
      expect(rendered.sql).toContain("@>");
      expect(rendered.sql).not.toContain("->>");
    } else {
      // No single index serves arbitrary JSON paths on these engines — the filter
      // keeps the extraction form and column materialization is the native answer.
      expect(rendered.sql).toContain(ENGINE === "mariadb" ? "JSON_EXTRACT" : "json_extract");
    }
  });
});

describePg("Dynamic-field filter plan — postgresql", () => {
  beforeAll(async () => {
    // A handful of rows would make the planner choose a sequential scan no matter
    // what exists, so the plan check runs against its OWN table with real
    // statistics — never the collection the row probes assert on (which would make
    // the two blocks depend on each other and on the previous run's leftovers).
    if (db.collection?.createModel) {
      await db.collection
        .createModel({
          _id: PLAN_COLLECTION,
          name: PLAN_COLLECTION,
          fields: [
            { db_fieldName: "title", widget: { Name: "Input" } },
            { db_fieldName: "tenantId", widget: { Name: "Input" } },
          ],
        })
        .catch(() => {});
    }
    await db.raw.execute(
      `INSERT INTO "${physicalName(PLAN_COLLECTION)}" ("_id","tenantId","data") SELECT gen_random_uuid()::text, $1, jsonb_build_object('title','bulk','views', g) FROM generate_series(1, 5000) AS g`,
      [TENANT],
    );
    await db.raw.execute(`ANALYZE "${physicalName(PLAN_COLLECTION)}"`);
  });

  afterAll(async () => {
    await db.crud
      .deleteMany(PLAN_COLLECTION, {}, withSystemScope("testing", { permanent: true }))
      .catch(() => {});
  });

  it("provisions the containment GIN index on the collection table", async () => {
    const rows = (await db.raw.execute(
      `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = $1 AND indexname LIKE '%_data_gin'`,
      [physicalName(PLAN_COLLECTION)],
    )) as Array<{ indexname: string; indexdef: string }>;
    expect(rows.length, `no *_data_gin index on ${physicalName(PLAN_COLLECTION)}`).toBe(1);
    expect(rows[0].indexdef).toContain("gin");
    expect(rows[0].indexdef).toContain("jsonb_path_ops");
  });

  it("serves the adapter's own filter SQL from that index (no sequential scan)", async () => {
    const rendered = renderFilterSql({ views: 4242 }, PLAN_COLLECTION);
    const rows = (await db.raw.execute(
      `EXPLAIN (ANALYZE, FORMAT TEXT) ${rendered.sql}`,
      rendered.params,
    )) as Array<{ "QUERY PLAN": string }>;
    const plan = rows.map((r) => r["QUERY PLAN"]).join("\n");
    expect(plan).toContain("_data_gin");
    expect(plan).toMatch(/Bitmap Index Scan|Index Scan/);
    expect(plan).not.toMatch(/Seq Scan on/);
  });
});
