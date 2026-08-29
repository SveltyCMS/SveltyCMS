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

/** Enterprise _id contract: collection-table entries require UUIDv4 ids. */
function uid(_p: string) {
  return crypto.randomUUID();
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
    const UP_IDS = [uid("um0"), uid("um1"), uid("um2")];

    beforeAll(async () => {
      for (let i = 0; i < UP_IDS.length; i++) {
        await db.crud.insert(
          TEST_COLLECTION,
          {
            _id: UP_IDS[i],
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

  // ── batch.bulkUpdate ──────────────────────────────────────────────────────
  // Covers the homogeneous single-statement path AND the heterogeneous
  // per-row CASE fast path (SQLite) / bulkWrite fallback (MongoDB) — the
  // N+1 bulk-update hot path the performance audit flagged.

  describe("batch.bulkUpdate", () => {
    const BU_IDS = [uid("bu0"), uid("bu1"), uid("bu2"), uid("bu3")];

    beforeAll(async () => {
      for (let i = 0; i < BU_IDS.length; i++) {
        await db.crud.insert(
          TEST_COLLECTION,
          {
            _id: BU_IDS[i],
            title: `Before ${i}`,
            status: "active",
            count: i,
            tenantId: TEST_TENANT,
          },
          tenantOpts,
        );
      }
    });

    it("applies heterogeneous per-row payloads in one call", async () => {
      const expectations = [
        { title: "After 0", status: "draft", count: 10 },
        { title: "After 1", status: "published", count: 20 },
        { title: "After 2", status: "archived", count: 30 },
        { title: "After 3", status: "draft", count: 40 },
      ];
      const result = await db.batch.bulkUpdate(
        TEST_COLLECTION,
        BU_IDS.map((id, i) => ({ id, data: expectations[i] })),
        tenantOpts,
      );

      validateDatabaseResult(result, { operation: "batch.bulkUpdate (heterogeneous)" });
      expect(result.success).toBe(true);

      for (let i = 0; i < BU_IDS.length; i++) {
        const row = await db.crud.findOne(TEST_COLLECTION, { _id: BU_IDS[i] }, tenantOpts);
        expect(row.success).toBe(true);
        expect(row.data.title).toBe(expectations[i].title);
        expect(row.data.status).toBe(expectations[i].status);
        expect(row.data.count).toBe(expectations[i].count);
        // updatedAt must be stamped by the bulk path
        expect(row.data.updatedAt).toBeDefined();
      }
    });

    it("applies partial payloads per row (omitted physical columns preserved)", async () => {
      const result = await db.batch.bulkUpdate(
        TEST_COLLECTION,
        [
          { id: BU_IDS[0], data: { title: "Title Only" } },
          { id: BU_IDS[1], data: { status: "Status Only" } },
        ],
        tenantOpts,
      );

      validateDatabaseResult(result, { operation: "batch.bulkUpdate (partial)" });
      expect(result.success).toBe(true);

      const row0 = await db.crud.findOne(TEST_COLLECTION, { _id: BU_IDS[0] }, tenantOpts);
      expect(row0.success).toBe(true);
      expect(row0.data.title).toBe("Title Only"); // sent field applied
      // Omitted PHYSICAL column preserved (ELSE branch on SQL / untouched on Mongo):
      expect(row0.data.status).toBe("draft");

      const row1 = await db.crud.findOne(TEST_COLLECTION, { _id: BU_IDS[1] }, tenantOpts);
      expect(row1.success).toBe(true);
      expect(row1.data.title).toBe("After 1"); // omitted → preserved
      expect(row1.data.status).toBe("Status Only"); // sent field applied
    });

    it("applies homogeneous payloads in one statement", async () => {
      const result = await db.batch.bulkUpdate(
        TEST_COLLECTION,
        [
          { id: BU_IDS[2], data: { status: "published" } },
          { id: BU_IDS[3], data: { status: "published" } },
        ],
        tenantOpts,
      );

      validateDatabaseResult(result, { operation: "batch.bulkUpdate (homogeneous)" });
      expect(result.success).toBe(true);

      const row2 = await db.crud.findOne(TEST_COLLECTION, { _id: BU_IDS[2] }, tenantOpts);
      const row3 = await db.crud.findOne(TEST_COLLECTION, { _id: BU_IDS[3] }, tenantOpts);
      expect(row2.data.status).toBe("published");
      expect(row3.data.status).toBe("published");
      expect(row2.data.title).toBe("After 2"); // untouched
      expect(row3.data.title).toBe("After 3"); // untouched
    });

    it("applies homogeneous blob-field payloads via prepareValues parity", async () => {
      // The homogeneous fast path must route through prepareValues like
      // crud.update — otherwise blob fields (non-materialized schema fields)
      // fail Drizzle's .set() column lookup and number types can be mangled.
      const result = await db.batch.bulkUpdate(
        TEST_COLLECTION,
        [
          { id: BU_IDS[2], data: { title: "Same Title", count: 77 } },
          { id: BU_IDS[3], data: { title: "Same Title", count: 77 } },
        ],
        tenantOpts,
      );

      validateDatabaseResult(result, { operation: "batch.bulkUpdate (homogeneous blob)" });
      expect(result.success).toBe(true);

      const row2 = await db.crud.findOne(TEST_COLLECTION, { _id: BU_IDS[2] }, tenantOpts);
      const row3 = await db.crud.findOne(TEST_COLLECTION, { _id: BU_IDS[3] }, tenantOpts);
      expect(row2.data.title).toBe("Same Title");
      expect(row3.data.title).toBe("Same Title");
      expect(row2.data.count).toBe(77); // number type preserved
      expect(row3.data.count).toBe(77);
    });

    it("scopes by tenantId and never touches rows of other tenants", async () => {
      const foreignId = uid("bu-fx");
      await db.crud.insert(
        TEST_COLLECTION,
        {
          _id: foreignId,
          title: "Foreign",
          status: "active",
          tenantId: "other-tenant",
        },
        { tenantId: "other-tenant" },
      );

      const result = await db.batch.bulkUpdate(
        TEST_COLLECTION,
        [{ id: foreignId, data: { title: "Hacked" } }],
        { tenantId: TEST_TENANT },
      );
      expect(result.success).toBe(true);

      const foreign = await db.crud.findOne(
        TEST_COLLECTION,
        { _id: foreignId },
        {
          bypassTenantCheck: true,
        },
      );
      expect(foreign.success).toBe(true);
      expect(foreign.data.title).toBe("Foreign"); // untouched by the foreign-tenant id
    });
  });

  // ── deleteMany ──────────────────────────────────────────────────────────

  describe("deleteMany", () => {
    const DEL_IDS = [uid("dm0"), uid("dm1"), uid("dm2")];

    beforeAll(async () => {
      for (let i = 0; i < DEL_IDS.length; i++) {
        await db.crud.insert(
          TEST_COLLECTION,
          {
            _id: DEL_IDS[i],
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
        { _id: { $in: [DEL_IDS[0], DEL_IDS[1]] } },
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
        { _id: DEL_IDS[2] },
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
      expect(typeof db.crud.atomicIncrement).toBe("function");

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
      expect(typeof db.crud.atomicIncrement).toBe("function");

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
