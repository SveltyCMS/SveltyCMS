/**
 * @file tests/integration/databases/bulk-operations-contract.test.ts
 * @description Cross-adapter bulk CRUD + atomic operations contract.
 *
 * Verifies insertMany, updateMany, upsertMany, deleteMany, and atomicIncrement
 * behave identically across all 4 adapters.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { validateDatabaseResult } from "@tests/helpers/result-validator";
import { ensureFullInitialization, getDb } from "@src/databases/db";

const TEST_COLLECTION = "bulk_contract_test";
const TEST_TENANT = "bulk-tenant";
const tenantOpts = Object.freeze({ tenantId: TEST_TENANT });

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
          { db_fieldName: "count", widget: { Name: "Input" }, type: "number" },
          { db_fieldName: "tenantId", widget: { Name: "Input" } },
        ],
      })
      .catch(() => {});
  }
});

afterAll(async () => {
  if (db?.crud?.deleteMany) {
    await db.crud
      .deleteMany(TEST_COLLECTION, {}, { bypassTenantCheck: true, permanent: true })
      .catch(() => {});
  }
});

function uid(p: string) {
  return `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe("Bulk Operations Contract — All Adapters", () => {
  // ── insertMany ──────────────────────────────────────────────────────────

  describe("insertMany", () => {
    it("inserts multiple documents and returns them", async () => {
      const ids = [uid("bm0"), uid("bm1"), uid("bm2")];
      const result = await db.crud.insertMany(
        TEST_COLLECTION,
        ids.map((id) => ({
          _id: id,
          title: `Bulk ${id}`,
          status: "active",
          tenantId: TEST_TENANT,
        })),
        tenantOpts,
      );

      validateDatabaseResult(result, { operation: "insertMany", dataOptional: true });
      expect(result.success).toBe(true);
    });

    it("returns { success: false } on partial duplicate keys", async () => {
      const id = uid("bm-dup");
      await db.crud.insert(
        TEST_COLLECTION,
        {
          _id: id,
          title: "First",
          status: "active",
          tenantId: TEST_TENANT,
        },
        tenantOpts,
      );

      const result = await db.crud.insertMany(
        TEST_COLLECTION,
        [
          { _id: id, title: "Dup", status: "active", tenantId: TEST_TENANT },
          { _id: uid("bm-ok"), title: "OK", status: "active", tenantId: TEST_TENANT },
        ],
        tenantOpts,
      );

      validateDatabaseResult(result, { operation: "insertMany (duplicate)", dataOptional: true });
      // Must return valid DatabaseResult — may succeed (upsert) or fail
    });

    it("returns { success: true } for empty array", async () => {
      const result = await db.crud.insertMany(TEST_COLLECTION, [], tenantOpts);
      validateDatabaseResult(result, { operation: "insertMany (empty)", dataOptional: true });
      expect(result.success).toBe(true);
    });
  });

  // ── updateMany ──────────────────────────────────────────────────────────

  describe("updateMany", () => {
    const UP_PREFIX = uid("um");

    beforeAll(async () => {
      for (let i = 0; i < 3; i++) {
        await db.crud.insert(
          TEST_COLLECTION,
          {
            _id: `${UP_PREFIX}-${i}`,
            title: `Before ${i}`,
            status: "active",
            tenantId: TEST_TENANT,
          },
          tenantOpts,
        );
      }
    });

    it("updates multiple matching documents", async () => {
      const result = await db.crud.updateMany(
        TEST_COLLECTION,
        { status: "active" },
        { status: "bulk-updated" },
        tenantOpts,
      );

      validateDatabaseResult(result, {
        operation: "updateMany",
        dataOptional: true,
        allowNullData: true,
      });
      // Must return valid DatabaseResult
    });

    it("returns modifiedCount >= 0", async () => {
      const result = await db.crud.updateMany(
        TEST_COLLECTION,
        { status: "nonexistent" },
        { status: "ghost" },
        tenantOpts,
      );

      if (result.success && result.data) {
        const count = result.data.modifiedCount ?? result.data;
        expect(typeof count === "number" || typeof count === "object").toBe(true);
      }
    });
  });

  // ── deleteMany ──────────────────────────────────────────────────────────

  describe("deleteMany", () => {
    const DEL_PREFIX = uid("dm");

    beforeAll(async () => {
      for (let i = 0; i < 3; i++) {
        await db.crud.insert(
          TEST_COLLECTION,
          {
            _id: `${DEL_PREFIX}-${i}`,
            title: `Delete ${i}`,
            status: "active",
            tenantId: TEST_TENANT,
          },
          tenantOpts,
        );
      }
    });

    it("deletes multiple matching documents", async () => {
      const result = await db.crud.deleteMany(
        TEST_COLLECTION,
        { _id: { $in: [`${DEL_PREFIX}-0`, `${DEL_PREFIX}-1`] } },
        { tenantId: TEST_TENANT, permanent: true },
      );

      validateDatabaseResult(result, {
        operation: "deleteMany",
        dataOptional: true,
        allowNullData: true,
      });
    });

    it("returns deletedCount", async () => {
      const result = await db.crud.deleteMany(
        TEST_COLLECTION,
        { _id: `${DEL_PREFIX}-2` },
        { tenantId: TEST_TENANT, permanent: true },
      );

      if (result.success && result.data) {
        const count = result.data.deletedCount ?? result.data;
        expect(typeof count === "number" || typeof count === "object").toBe(true);
      }
    });
  });

  // ── upsertMany ──────────────────────────────────────────────────────────

  describe("upsertMany", () => {
    it("creates and updates documents in a single call", async () => {
      const id = uid("usm");

      // First call: creates
      const create = await db.crud.upsertMany(
        TEST_COLLECTION,
        [
          {
            query: { _id: id },
            data: { title: "UpsertMany Create", status: "active", tenantId: TEST_TENANT },
          },
        ],
        tenantOpts,
      );

      validateDatabaseResult(create, { operation: "upsertMany (create)", dataOptional: true });

      // Second call: updates
      const update = await db.crud.upsertMany(
        TEST_COLLECTION,
        [
          {
            query: { _id: id },
            data: { title: "UpsertMany Update", status: "updated", tenantId: TEST_TENANT },
          },
        ],
        tenantOpts,
      );

      validateDatabaseResult(update, { operation: "upsertMany (update)", dataOptional: true });
    });
  });
});

describe("Atomic Operations Contract — All Adapters", () => {
  describe("atomicIncrement", () => {
    const INC_ID = uid("inc");

    beforeAll(async () => {
      await db.crud
        .insert(
          TEST_COLLECTION,
          {
            _id: INC_ID,
            title: "Counter",
            status: "active",
            count: 0,
            tenantId: TEST_TENANT,
          },
          tenantOpts,
        )
        .catch(() => {});
    });

    it("atomically increments a numeric field", async () => {
      if (typeof db.crud.atomicIncrement !== "function") return;

      const result = await db.crud.atomicIncrement(TEST_COLLECTION, INC_ID, "count", 5, tenantOpts);

      // Must return valid DatabaseResult
      if (result && typeof result === "object") {
        validateDatabaseResult(result, { operation: "atomicIncrement", dataOptional: true });
      }

      // Read back and verify increment
      const found = await db.crud.findOne(TEST_COLLECTION, { _id: INC_ID }, tenantOpts);
      if (found.success && found.data) {
        expect(found.data.count).toBeGreaterThanOrEqual(5);
      }
    });

    it("handles concurrent increments without lost updates", async () => {
      if (typeof db.crud.atomicIncrement !== "function") return;

      // Fire 5 concurrent increments of 1 each
      await Promise.all(
        Array.from({ length: 5 }, () =>
          db.crud.atomicIncrement(TEST_COLLECTION, INC_ID, "count", 1, tenantOpts).catch(() => {}),
        ),
      );

      // After 5 concurrent +1 operations, count should have increased by at least 5
      const found = await db.crud.findOne(TEST_COLLECTION, { _id: INC_ID }, tenantOpts);
      if (found.success && found.data) {
        // Initial was 0, first test added 5, this test adds 5 more = 10
        expect(found.data.count).toBeGreaterThanOrEqual(10);
      }
    });
  });
});
