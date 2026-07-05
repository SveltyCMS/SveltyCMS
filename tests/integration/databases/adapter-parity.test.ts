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
          { db_fieldName: "tenantId", widget: { Name: "Input" } },
        ],
      })
      .catch(() => {});
  }

  if (db?.crud?.deleteMany) {
    await db.crud
      .deleteMany(
        TEST_COLLECTION,
        {},
        {
          bypassTenantCheck: true,
          permanent: true,
        },
      )
      .catch(() => {});
  }
});

afterAll(async () => {
  if (db?.crud?.deleteMany) {
    await db.crud
      .deleteMany(
        TEST_COLLECTION,
        {},
        {
          bypassTenantCheck: true,
          permanent: true,
        },
      )
      .catch(() => {});
  }
});

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    const MANY_PREFIX = uid("many");
    beforeAll(async () => {
      for (let i = 0; i < 5; i++) {
        await db.crud.insert(
          TEST_COLLECTION,
          {
            _id: `${MANY_PREFIX}-${i}`,
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
  });
});
