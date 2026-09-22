/**
 * @file tests/integration/databases/aggregation-contract.test.ts
 * @description Cross-engine contract for `crud.aggregate()` — the MongoDB-style
 * pipeline must return the same numbers on SQLite, PostgreSQL, MariaDB and MongoDB.
 *
 * Features:
 * - `$group` (scalar `_id` + `$sum: 1` / `$sum: "$field"` / `$avg` / `$min` / `$max`),
 *   `$match` before the group, `$count`, `$sort` + `$limit`, `$project`
 * - tenant scoping without an explicit `$match` (a pipeline can never span tenants)
 * - fail-closed parity on the SQL engines: stages the translation cannot express
 *   (compound `_id`, `$match` after `$group`, `$lookup`) return a named
 *   `NOT_SUPPORTED` error instead of a wrong number — MongoDB runs them natively,
 *   so those assertions are skipped there
 *
 * Result typing is normalized (`String(_id)`, `Number(value)`): PostgreSQL renders
 * JSON-extracted scalars as text and returns `numeric`/`bigint` as strings, SQLite
 * returns typed values, MongoDB native BSON — the contract under test is the numbers,
 * not the driver's wire type.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureFullInitialization, getDb } from "@src/databases/db";
import { withSystemScope } from "@src/databases/system-tenant-scope";

const ENGINE = (process.env.DB_TYPE ?? "sqlite").toLowerCase() as
  | "sqlite"
  | "postgresql"
  | "mariadb"
  | "mongodb";
const COLLECTION = `aggcontract_${ENGINE}`;
const TENANT = "agg-contract-tenant";
const OTHER_TENANT = "agg-contract-other";
const tenantOpts = Object.freeze({ tenantId: TENANT });

/** Refusal assertions only make sense where the pipeline is translated to SQL. */
const describeSql = ENGINE === "mongodb" ? describe.skip : describe;
if (ENGINE === "mongodb") {
  console.log("⏭️ NOT_SUPPORTED checks skipped — MongoDB executes these stages natively");
}

/** Seeded documents: sum 20, avg 5 over four rows; `rank` is materialized (min 1, max 9). */
const SEED = [
  { title: "A", status: "draft", views: 2, rank: 9 },
  { title: "B", status: "draft", views: 3, rank: 1 },
  { title: "C", status: "published", views: 10, rank: 5 },
  { title: "D", status: "published", views: 5, rank: 3 },
];

let db: any = null;

/** Driver-agnostic value normalization (see the file header). */
const num = (value: unknown): number => Number(value);
const key = (value: unknown): string => String(value);

/** Runs a pipeline that must succeed. */
async function run(pipeline: unknown[], options: Record<string, unknown> = tenantOpts) {
  const res = await db.crud.aggregate(COLLECTION, pipeline, options);
  expect(res.success, `aggregate failed: ${res.message ?? ""}`).toBe(true);
  return res.data as Array<Record<string, unknown>>;
}

describe(`Aggregation contract — ${ENGINE}`, () => {
  beforeAll(async () => {
    await ensureFullInitialization();
    db = getDb();
    if (!db) throw new Error("Database not initialized");

    // Only `title` is declared: `status`/`views` stay in the JSON blob on the SQL
    // engines, which is the harder path (`->>` extraction + numeric cast).
    if (db.collection?.createModel) {
      await db.collection
        .createModel({
          _id: COLLECTION,
          name: COLLECTION,
          fields: [
            { db_fieldName: "title", widget: { Name: "Input" }, required: true },
            { db_fieldName: "tenantId", widget: { Name: "Input" } },
            // Materialized (`materialize: true`) → a real numeric column on the SQL
            // engines, which is the only type-safe source for `$min`/`$max` there.
            {
              db_fieldName: "rank",
              widget: { Name: "Number" },
              type: "number",
              materialize: true,
            },
          ],
        })
        .catch(() => {});
    }

    // Idempotent across runs (the SQLite file persists between them).
    await db.crud
      .deleteMany(COLLECTION, {}, withSystemScope("testing", { permanent: true }))
      .catch(() => {});

    for (const doc of SEED) {
      const res = await db.crud.insert(
        COLLECTION,
        { _id: crypto.randomUUID(), ...doc, tenantId: TENANT },
        tenantOpts,
      );
      expect(res.success, `seed insert failed: ${res.message ?? ""}`).toBe(true);
    }
    // Same collection, different tenant — must never contribute to a scoped pipeline.
    const other = await db.crud.insert(
      COLLECTION,
      {
        _id: crypto.randomUUID(),
        title: "Z",
        status: "draft",
        views: 1000,
        tenantId: OTHER_TENANT,
      },
      { tenantId: OTHER_TENANT },
    );
    expect(other.success, `other-tenant seed failed: ${other.message ?? ""}`).toBe(true);
  }, 120_000);

  afterAll(async () => {
    if (db?.crud?.deleteMany) {
      await db.crud
        .deleteMany(COLLECTION, {}, withSystemScope("testing", { permanent: true }))
        .catch(() => {});
    }
  });

  it('groups by a dynamic field with `$sum: 1` and `$sum: "$field"`', async () => {
    const rows = await run([
      { $group: { _id: "$status", total: { $sum: 1 }, views: { $sum: "$views" } } },
      { $sort: { _id: 1 } },
    ]);

    expect(rows.map((r) => key(r._id))).toEqual(["draft", "published"]);
    expect(rows.map((r) => num(r.total))).toEqual([2, 2]);
    // The dynamic-field sum is the path that needs the numeric extraction cast.
    expect(rows.map((r) => num(r.views))).toEqual([5, 15]);
  });

  it("computes `$sum` / `$avg` over one group (JSON-blob fields)", async () => {
    const rows = await run([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          views: { $sum: "$views" },
          avg: { $avg: "$views" },
        },
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(num(rows[0].total)).toBe(4);
    expect(num(rows[0].views)).toBe(20);
    expect(num(rows[0].avg)).toBe(5);
  });

  it("orders `$min`/`$max` natively on a materialized column", async () => {
    const rows = await run([
      { $group: { _id: null, min: { $min: "$rank" }, max: { $max: "$rank" } } },
    ]);

    expect(num(rows[0].min)).toBe(1);
    expect(num(rows[0].max)).toBe(9);
  });

  it("treats `$min`/`$max` on a dynamic field as engine-dependent", async () => {
    // A blob field has no declared type, so MIN/MAX compare whatever the extraction
    // returns. SQLite's `json_extract` is typed and MongoDB is native → correct
    // numbers; PostgreSQL and MariaDB extract TEXT (verified: both return "10" as the
    // MIN of {10, 2}) and have no JSON-typed aggregate → the stage must refuse rather
    // than answer lexicographically. Materializing the field is the fix (test above).
    const res = await db.crud.aggregate(COLLECTION, [
      { $group: { _id: null, min: { $min: "$views" } } },
    ]);

    if (ENGINE === "sqlite" || ENGINE === "mongodb") {
      expect(res.success, `aggregate failed: ${res.message ?? ""}`).toBe(true);
      expect(num((res.data as Array<Record<string, unknown>>)[0].min)).toBe(2);
    } else {
      expect(res.success).toBe(false);
      expect(res.error?.code).toBe("NOT_SUPPORTED");
      expect(res.message).toContain('$min on the dynamic field "views"');
      expect(res.message).toContain("materialize: true");
    }
  });

  it("narrows the input with `$match` before `$group`", async () => {
    const rows = await run([
      { $match: { status: "published" } },
      { $group: { _id: "$status", total: { $sum: 1 }, views: { $sum: "$views" } } },
    ]);

    expect(rows).toHaveLength(1);
    expect(key(rows[0]._id)).toBe("published");
    expect(num(rows[0].total)).toBe(2);
    expect(num(rows[0].views)).toBe(15);
  });

  it("counts the matched documents with `$count`", async () => {
    const rows = await run([{ $match: { status: "draft" } }, { $count: "total" }]);
    expect(rows).toHaveLength(1);
    expect(num(rows[0].total)).toBe(2);
  });

  it("sorts and limits the grouped rows", async () => {
    const rows = await run([
      { $group: { _id: "$status", views: { $sum: "$views" } } },
      { $sort: { views: -1 } },
      { $limit: 1 },
    ]);

    expect(rows).toHaveLength(1);
    expect(key(rows[0]._id)).toBe("published");
    expect(num(rows[0].views)).toBe(15);
  });

  it("projects the group alias and keeps `_id` unless excluded", async () => {
    const kept = await run([
      { $group: { _id: "$status", total: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $project: { total: 1 } },
    ]);
    expect(kept.map((r) => Object.keys(r).sort())).toEqual([
      ["_id", "total"],
      ["_id", "total"],
    ]);

    const dropped = await run([
      { $group: { _id: "$status", total: { $sum: 1 } } },
      { $project: { total: 1, _id: 0 } },
    ]);
    expect(dropped.every((r) => !("_id" in r))).toBe(true);
    expect(dropped.map((r) => num(r.total)).sort()).toEqual([2, 2]);
  });

  it("scopes the pipeline to the tenant without an explicit `$match`", async () => {
    const scoped = await run([{ $group: { _id: null, views: { $sum: "$views" } } }]);
    expect(num(scoped[0].views)).toBe(20); // the 1000-view other-tenant row is excluded

    const otherTenant = await run([{ $group: { _id: null, views: { $sum: "$views" } } }], {
      tenantId: OTHER_TENANT,
    });
    expect(num(otherTenant[0].views)).toBe(1000);
  });

  describeSql("fail-closed on stages the SQL translation cannot express", () => {
    it("refuses a compound `$group._id`", async () => {
      const res = await db.crud.aggregate(COLLECTION, [
        { $group: { _id: { status: "$status", title: "$title" }, total: { $sum: 1 } } },
      ]);
      expect(res.success).toBe(false);
      expect(res.error?.code).toBe("NOT_SUPPORTED");
      expect(res.message).toContain("scalar $group._id");
    });

    it("refuses `$match` after `$group` and points at the input-narrowing fix", async () => {
      const res = await db.crud.aggregate(COLLECTION, [
        { $group: { _id: "$status", total: { $sum: 1 } } },
        { $match: { total: 2 } },
      ]);
      expect(res.success).toBe(false);
      expect(res.error?.code).toBe("NOT_SUPPORTED");
      expect(res.message).toContain("before $group");
    });

    it("names an unsupported stage instead of returning a wrong result", async () => {
      const res = await db.crud.aggregate(COLLECTION, [
        { $match: { status: "draft" } },
        { $lookup: { from: "other", localField: "a", foreignField: "b", as: "joined" } },
      ]);
      expect(res.success).toBe(false);
      expect(res.error?.code).toBe("NOT_SUPPORTED");
      expect(res.message).toContain("$lookup");
    });
  });
});
