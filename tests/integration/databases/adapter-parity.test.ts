/**
 * @file tests/integration/databases/adapter-parity.test.ts
 * @description Cross-adapter behavioral parity test matrix.
 *
 * Runs IDENTICAL operations against the active database adapter and validates
 * that results conform to the DatabaseResult<T> contract. Run against all 4
 * adapters for full coverage:
 *
 *   DB=sqlite,mongodb,postgresql,mariadb bun test ...
 *
 * ### What This Catches
 * - Adapters that throw instead of returning { success: false }
 * - Adapters returning different data shapes for the same query
 * - Missing properties in DatabaseResult
 * - Adapters where .success convention differs
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { validateDatabaseResult, assertDatabaseSuccess } from "@tests/helpers/result-validator";
import { ensureFullInitialization, getDb } from "@src/databases/db";
import { withSystemScope } from "@src/databases/system-tenant-scope";
import { generateUUID } from "@utils/native-utils";

const TEST_COLLECTION = "parity_test";
const TEST_TENANT = "parity-tenant";

let db: any = null;

beforeAll(async () => {
  await ensureFullInitialization();
  db = getDb();
  if (!db) throw new Error("Database not initialized");

  if (db.collection?.createModel) {
    await db.collection
      .createModel({
        _id: TEST_COLLECTION,
        name: TEST_COLLECTION,
        fields: [
          { db_fieldName: "title", widget: { Name: "Input" }, required: true },
          { db_fieldName: "status", widget: { Name: "Input" } },
          { db_fieldName: "value", widget: { Name: "Input" }, type: "number" },
          // Declared so the nested-object merge case also exercises a schema-declared
          // object path (Mongoose casts declared paths; undeclared ones pass through
          // with `strict: false` — covered separately by the `tags` case below).
          { db_fieldName: "metadata", widget: { Name: "Input" } },
          { db_fieldName: "tenantId", widget: { Name: "Input" } },
        ],
      })
      .catch(() => {});
  }

  if (db?.crud?.deleteMany) {
    await db.crud
      .deleteMany(TEST_COLLECTION, {}, withSystemScope("testing", { permanent: true }))
      .catch(() => {});
  }
});

afterAll(async () => {
  if (db?.crud?.deleteMany) {
    await db.crud
      .deleteMany(TEST_COLLECTION, {}, withSystemScope("testing", { permanent: true }))
      .catch(() => {});
  }
});

/** Enterprise _id contract: collection-table entries require UUIDv7 ids. */
function uid(_prefix: string): string {
  return generateUUID();
}

const tenantOpts = Object.freeze({ tenantId: TEST_TENANT });

describe("Adapter Parity — CRUD Operations", () => {
  // ── INSERT ──────────────────────────────────────────────────────────────

  describe("insert", () => {
    it("succeeds with valid data and returns a valid DatabaseResult", async () => {
      const id = uid("insert");
      const result = await db.crud.insert(
        TEST_COLLECTION,
        { _id: id, title: "Parity Insert", status: "active", tenantId: TEST_TENANT },
        tenantOpts,
      );

      validateDatabaseResult(result, { operation: "insert", dataOptional: true });
      const data = assertDatabaseSuccess(result, { operation: "insert", dataOptional: true });
      expect(data).toBeDefined();
    });

    it("rejects non-UUIDv4 _id on collection tables (enterprise _id contract)", async () => {
      const result = await db.crud.insert(
        TEST_COLLECTION,
        { _id: "not-a-uuid", title: "Bad", status: "active", tenantId: TEST_TENANT },
        tenantOpts,
      );
      expect(result.success).toBe(false);
      expect((result as any).error?.code).toBe("INVALID_ID_FORMAT");
    });

    it("rejects non-UUIDv4 update id on collection tables", async () => {
      const result = await db.crud.update(
        TEST_COLLECTION,
        "not-a-uuid" as any,
        { title: "Nope" },
        tenantOpts,
      );
      expect(result.success).toBe(false);
      expect((result as any).error?.code).toBe("INVALID_ID_FORMAT");
    });

    it("returns a valid DatabaseResult on duplicate _id (may upsert or fail)", async () => {
      const id = uid("dup");
      await db.crud.insert(
        TEST_COLLECTION,
        { _id: id, title: "First", status: "active", tenantId: TEST_TENANT },
        tenantOpts,
      );

      const result = await db.crud.insert(
        TEST_COLLECTION,
        { _id: id, title: "Duplicate", status: "active", tenantId: TEST_TENANT },
        tenantOpts,
      );

      // Must return a valid DatabaseResult (never throw)
      validateDatabaseResult(result, { operation: "insert (duplicate)", dataOptional: true });
    });
  });

  // ── FIND ONE ────────────────────────────────────────────────────────────

  describe("findOne", () => {
    const FIND_ID = uid("findone");
    beforeAll(async () => {
      await db.crud.insert(
        TEST_COLLECTION,
        { _id: FIND_ID, title: "Find Me", status: "active", value: 42, tenantId: TEST_TENANT },
        tenantOpts,
      );
    });

    it("returns the document for an existing _id", async () => {
      const result = await db.crud.findOne(TEST_COLLECTION, { _id: FIND_ID }, tenantOpts);
      validateDatabaseResult(result, { operation: "findOne" });
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it("returns { success: true, data: null } for non-existing _id", async () => {
      const result = await db.crud.findOne(
        TEST_COLLECTION,
        { _id: "nonexistent-parity-id" },
        tenantOpts,
      );

      validateDatabaseResult(result, { operation: "findOne (missing)", allowNullData: true });
      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });
  });

  // ── FIND MANY ───────────────────────────────────────────────────────────

  describe("findMany", () => {
    const MANY_IDS = [uid("many0"), uid("many1"), uid("many2"), uid("many3"), uid("many4")];
    beforeAll(async () => {
      for (let i = 0; i < MANY_IDS.length; i++) {
        await db.crud.insert(
          TEST_COLLECTION,
          {
            _id: MANY_IDS[i],
            title: `Item ${i}`,
            status: i % 2 === 0 ? "active" : "inactive",
            tenantId: TEST_TENANT,
          },
          tenantOpts,
        );
      }
    });

    it("returns an array of results for matching query", async () => {
      const result = await db.crud.findMany(
        TEST_COLLECTION,
        { status: "active" },
        { ...tenantOpts, limit: 10 },
      );

      validateDatabaseResult(result, { operation: "findMany" });
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it("respects limit option", async () => {
      const result = await db.crud.findMany(TEST_COLLECTION, {}, { ...tenantOpts, limit: 2 });
      validateDatabaseResult(result, { operation: "findMany (limit)" });
      expect(result.success).toBe(true);
      expect(result.data.length).toBeLessThanOrEqual(2);
    });

    it("returns empty array for no matches", async () => {
      const result = await db.crud.findMany(
        TEST_COLLECTION,
        { status: "nonexistent-filter" },
        tenantOpts,
      );

      validateDatabaseResult(result, { operation: "findMany (empty)", allowNullData: true });
      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  // ── UPDATE ──────────────────────────────────────────────────────────────

  describe("update", () => {
    const UPDATE_ID = uid("update");
    beforeAll(async () => {
      await db.crud.insert(
        TEST_COLLECTION,
        {
          _id: UPDATE_ID,
          title: "Original",
          status: "active",
          tenantId: TEST_TENANT,
        },
        tenantOpts,
      );
    });

    it("returns a valid DatabaseResult when updating", async () => {
      const result = await db.crud.update(
        TEST_COLLECTION,
        UPDATE_ID,
        { title: "Updated" },
        tenantOpts,
      );

      validateDatabaseResult(result, { operation: "update", dataOptional: true });
      expect(result.success).toBe(true);
    });

    it("returns a valid DatabaseResult for non-existing _id", async () => {
      const result = await db.crud.update(
        TEST_COLLECTION,
        "nonexistent-update-id",
        { title: "Ghost" },
        tenantOpts,
      );

      // Must return valid DatabaseResult (may succeed or fail depending on adapter)
      validateDatabaseResult(result, { operation: "update (missing)", dataOptional: true });
    });

    // ── PARTIAL-UPDATE MERGE ─────────────────────────────────────────────
    // A PATCH must not destroy the fields it does not mention. MongoDB gets this
    // from per-field `$set`; the SQL adapters write one whole-column assignment for
    // the JSON `data` blob, which used to REPLACE it — collapsing documents to the
    // patch (measured externally: 30,940 of 100,000 docs → 61-byte stubs).
    const MERGE_ID = uid("merge");
    /** Engines whose PATCH merges fields the payload never mentions. */
    const ENGINE = process.env.DB_TYPE ?? "sqlite";

    it("merges a partial patch instead of replacing the data blob", async () => {
      await db.crud.insert(
        TEST_COLLECTION,
        {
          _id: MERGE_ID,
          title: "Keep me",
          status: "active",
          value: 7,
          metadata: { title: "SEO", description: "desc" },
          tags: ["a", "b"],
          tenantId: TEST_TENANT,
        },
        tenantOpts,
      );

      const res = await db.crud.update(TEST_COLLECTION, MERGE_ID, { title: "Patched" }, tenantOpts);
      expect(res.success).toBe(true);

      const after = assertDatabaseSuccess(
        await db.crud.findById(TEST_COLLECTION, MERGE_ID, tenantOpts),
        { operation: "findById (merge)" },
      ) as Record<string, unknown>;
      expect(after.title).toBe("Patched");
      // Every untouched field survives — these are what the pre-fix path deleted.
      expect(after.status).toBe("active");
      expect(after.value).toBe(7);
      expect(after.tags).toEqual(["a", "b"]);
      expect(after.metadata).toEqual({ title: "SEO", description: "desc" });
    });

    it("merges nested objects shallowly (a patched object replaces, never recurses)", async () => {
      await db.crud.update(TEST_COLLECTION, MERGE_ID, { metadata: { title: "New" } }, tenantOpts);

      const after = assertDatabaseSuccess(
        await db.crud.findById(TEST_COLLECTION, MERGE_ID, tenantOpts),
        { operation: "findById (nested merge)" },
      ) as Record<string, unknown>;
      // MongoDB `$set: {metadata: …}` replaces the whole object — `description` is
      // gone. `json_patch`/`JSON_MERGE_PATCH` would have kept it (that is why the
      // nested shape takes the JS merge path on SQLite/MariaDB instead).
      expect(after.metadata).toEqual({ title: "New" });
      expect(after.status).toBe("active");
    });

    it("keeps an explicit null in the patch (null is a value, not a delete)", async () => {
      await db.crud.update(
        TEST_COLLECTION,
        MERGE_ID,
        { value: null, title: "Null patch" },
        tenantOpts,
      );

      const after = assertDatabaseSuccess(
        await db.crud.findById(TEST_COLLECTION, MERGE_ID, tenantOpts),
        { operation: "findById (null merge)" },
      ) as Record<string, unknown>;
      expect(after.value).toBeNull();
      expect(after.title).toBe("Null patch");
      expect(after.metadata).toEqual({ title: "New" });
    });

    it("writes a dynamic field the collection schema does not declare", async () => {
      // Parity guard for dynamic fields: MongoDB's Mongoose `strict` schema used to
      // DROP undeclared `$set` paths silently, so a patch to a field that is not in
      // the model was a no-op there while the SQL adapters stored it in the JSON
      // `data` blob. `tags` is deliberately absent from this collection's schema.
      const res = await db.crud.update(TEST_COLLECTION, MERGE_ID, { tags: ["x", "y"] }, tenantOpts);
      expect(res.success).toBe(true);

      const after = assertDatabaseSuccess(
        await db.crud.findById(TEST_COLLECTION, MERGE_ID, tenantOpts),
        { operation: "findById (dynamic field)" },
      ) as Record<string, unknown>;
      expect(after.tags).toEqual(["x", "y"]);
      expect(after.title).toBe("Null patch");
    });

    // `replaceData` is the explicit opt-out for full-document writers (sync, seeds):
    // the payload IS the blob. MongoDB has no counterpart — its `$set` never replaced
    // anything, so nothing there depends on it, and inventing a "delete every field the
    // payload omits" operation would add a destructive path Mongo does not have.
    it.skipIf(ENGINE === "mongodb")(
      "replaces the blob wholesale when the caller opts out with replaceData: true",
      async () => {
        const res = await db.crud.update(TEST_COLLECTION, MERGE_ID, { title: "Only me" }, {
          ...tenantOpts,
          replaceData: true,
        } as typeof tenantOpts);
        expect(res.success).toBe(true);

        const after = assertDatabaseSuccess(
          await db.crud.findById(TEST_COLLECTION, MERGE_ID, tenantOpts),
          { operation: "findById (replace)" },
        ) as Record<string, unknown>;
        expect(after.title).toBe("Only me");
        expect(after.metadata).toBeUndefined();
        expect(after.tags).toBeUndefined();
      },
    );
  });

  // ── DELETE ──────────────────────────────────────────────────────────────

  describe("delete", () => {
    const DELETE_ID = uid("delete");
    beforeAll(async () => {
      await db.crud.insert(
        TEST_COLLECTION,
        {
          _id: DELETE_ID,
          title: "Delete Me",
          status: "active",
          tenantId: TEST_TENANT,
        },
        tenantOpts,
      );
    });

    it("returns a valid DatabaseResult when deleting", async () => {
      const result = await db.crud.delete(TEST_COLLECTION, DELETE_ID, tenantOpts);
      validateDatabaseResult(result, {
        operation: "delete",
        allowNullData: true,
        dataOptional: true,
      });
      expect(result.success).toBe(true);
    });

    it("returns a valid DatabaseResult for already-deleted document", async () => {
      const result = await db.crud.delete(TEST_COLLECTION, DELETE_ID, tenantOpts);
      validateDatabaseResult(result, {
        operation: "delete (already deleted)",
        allowNullData: true,
        dataOptional: true,
      });
    });
  });

  // ── COUNT ───────────────────────────────────────────────────────────────

  describe("count", () => {
    beforeAll(async () => {
      await db.crud.insert(
        TEST_COLLECTION,
        {
          _id: uid("cnt"),
          title: "Count Me",
          status: "active",
          tenantId: TEST_TENANT,
        },
        tenantOpts,
      );
    });

    it("returns a number >= 0", async () => {
      const result = await db.crud.count(TEST_COLLECTION, {}, tenantOpts);
      validateDatabaseResult(result, { operation: "count" });
      expect(result.success).toBe(true);
      expect(typeof result.data).toBe("number");
      expect(result.data).toBeGreaterThanOrEqual(0);
    });

    it("returns 0 for filter with no matches", async () => {
      const result = await db.crud.count(
        TEST_COLLECTION,
        { status: "nonexistent-xyz" },
        tenantOpts,
      );
      validateDatabaseResult(result, { operation: "count (no matches)" });
      expect(result.success).toBe(true);
      expect(result.data).toBe(0);
    });
  });

  // ── UPSERT ──────────────────────────────────────────────────────────────

  describe("upsert", () => {
    const UPSERT_ID = uid("upsert");

    it("creates a document that does not exist", async () => {
      const result = await db.crud.upsert(
        TEST_COLLECTION,
        { _id: UPSERT_ID },
        { title: "Upserted New", status: "active", tenantId: TEST_TENANT },
        tenantOpts,
      );

      validateDatabaseResult(result, { operation: "upsert (create)", dataOptional: true });
      expect(result.success).toBe(true);
    });

    it("updates a document that already exists", async () => {
      const result = await db.crud.upsert(
        TEST_COLLECTION,
        { _id: UPSERT_ID },
        { title: "Upserted Updated", status: "updated", tenantId: TEST_TENANT },
        tenantOpts,
      );

      validateDatabaseResult(result, { operation: "upsert (update)", dataOptional: true });
      expect(result.success).toBe(true);
    });

    it("keeps the fields a partial upsert payload does not mention", async () => {
      // Contract = MongoDB's `$set` on the conflict branch: naming only `title` must not
      // delete `value`/`tags`. The SQL conflict branch assigned the whole JSON `data`
      // blob, i.e. the same data-loss class as the partial-PATCH bug — found by the
      // benchmark's own document-integrity guard, which caught the measured document
      // losing a field mid-run (`tests/benchmarks/modules/document-integrity.ts`).
      const KEEP_ID = uid("upsert-keep");
      await db.crud.insert(
        TEST_COLLECTION,
        { _id: KEEP_ID, title: "Seed", value: 7, tags: ["a"], tenantId: TEST_TENANT },
        tenantOpts,
      );

      const res = await db.crud.upsert(
        TEST_COLLECTION,
        { _id: KEEP_ID },
        { title: "Upserted Partial", tenantId: TEST_TENANT },
        tenantOpts,
      );
      expect(res.success).toBe(true);

      const after = assertDatabaseSuccess(
        await db.crud.findById(TEST_COLLECTION, KEEP_ID, tenantOpts),
        { operation: "findById (upsert merge)" },
      ) as Record<string, unknown>;
      expect(after.title).toBe("Upserted Partial");
      expect(after.value).toBe(7);
      expect(after.tags).toEqual(["a"]);
    });
  });

  // ── WRITE ACK: skipReturning (adapter-agnostic) ──────────────────────────

  describe("write ack (skipReturning)", () => {
    const ACK_ID = uid("ack");

    it("echoes the written fields and skips the row read-back", async () => {
      await db.crud.insert(
        TEST_COLLECTION,
        {
          _id: ACK_ID,
          title: "Ack seed",
          body: "stored body",
          value: 1,
          tenantId: TEST_TENANT,
        },
        tenantOpts,
      );

      const res = await db.crud.update(
        TEST_COLLECTION,
        ACK_ID,
        { value: 2 },
        { ...tenantOpts, skipReturning: true },
      );
      const ack = assertDatabaseSuccess(res, { operation: "update (skipReturning)" }) as Record<
        string,
        unknown
      >;

      // The ack carries the id…
      expect(ack._id).toBe(ACK_ID);
      // …and NOT the fields the caller did not name: those live in the stored row, and
      // reading them back is exactly what the flag opts out of. This is the cross-adapter
      // assertion — MongoDB used to answer with the full document (`findOneAndUpdate`), so
      // the flag was silently SQL-only and the write-ack path cost a document read on one
      // engine. (How the *written* field is echoed is engine-specific — a materialized
      // column on SQLite/PostgreSQL/MariaDB, a `$set` echo on MongoDB — so it is asserted
      // through the fresh read below instead of the ack's shape.)
      expect(ack.title).toBeUndefined();
      expect(ack.body).toBeUndefined();

      // The write itself is complete: a fresh read shows the patch applied AND the untouched
      // fields intact (the merge contract holds on this path too).
      const after = assertDatabaseSuccess(
        await db.crud.findById(TEST_COLLECTION, ACK_ID, tenantOpts),
        { operation: "findById (after skipReturning)" },
      ) as Record<string, unknown>;
      expect(Number(after.value)).toBe(2);
      expect(after.title).toBe("Ack seed");
      expect(after.body).toBe("stored body");
    });
  });
});
