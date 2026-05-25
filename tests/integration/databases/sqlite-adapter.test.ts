/**
 * @file tests/integration/databases/sqlite-adapter.test.ts
 * @description
 * Integration tests for the SQLite adapter.
 * Performs full CRUD round-trips against a file-based SQLite database.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { unlinkSync } from "node:fs";
import type { IDBAdapter, DatabaseId } from "../../../src/databases/db-interface";

// @ts-ignore - optional test config generated at runtime
const { privateEnv } = (await import("../../../config/private.test").catch(() => ({
  privateEnv: { DB_TYPE: process.env.DB_TYPE || "sqlite" },
}))) as any;

const isSQLite = privateEnv?.DB_TYPE === "sqlite";
const describeSQLite = isSQLite ? describe : describe.skip;

const TEST_DB_PATH = "sveltycms_test_integration.sqlite";

describeSQLite("SQLite Adapter Integration", () => {
  let db: IDBAdapter | null = null;
  const TEST_TENANT = "test_tenant_sqlite" as any as DatabaseId;

  beforeAll(async () => {
    if (!isSQLite) return;

    try {
      const { SQLiteAdapter } = await import("../../../src/databases/sqlite/sqlite-adapter");
      db = new SQLiteAdapter() as any;

      // Clean up any leftover test DB from previous runs
      try {
        unlinkSync(TEST_DB_PATH);
      } catch {}

      const result = await db!.connect(TEST_DB_PATH);
      if (!result.success) {
        throw new Error(result.message);
      }
    } catch (err: any) {
      console.warn("SQLite adapter setup failed. Skipping functional tests.", err.message);
      db = null;
      throw err;
    }
  });

  afterAll(async () => {
    if (db && db.isConnected()) {
      await db.disconnect();
    }
    // Clean up test DB file
    try {
      unlinkSync(TEST_DB_PATH);
    } catch {}
  });

  describe("Connection & Setup", () => {
    it("should report connectivity correctly", () => {
      if (!db) return;
      expect(db.isConnected()).toBe(true);
    });

    it("should have CRUD initialized", () => {
      if (!db) return;
      expect(db.crud).toBeDefined();
    });
  });

  describe("Functional CRUD Operations", () => {
    const testCollection = "system_preferences";
    let createdId: DatabaseId;

    it("should handle full record lifecycle on system_preferences", async () => {
      if (!db) return;

      const testId = `pref-sqlite-${Date.now()}` as any as DatabaseId;
      const testDoc = {
        _id: testId,
        key: "test_sqlite_key",
        value: { adapter: "sqlite", validated: true },
        scope: "test",
        visibility: "private",
      };

      // 1. Insert
      const insertRes = await db.crud.insert(testCollection, testDoc as any, {
        tenantId: TEST_TENANT,
      });
      expect(insertRes.success).toBe(true);
      if (insertRes.success && insertRes.data) {
        createdId = (insertRes.data as any)._id;
        expect(createdId).toBeDefined();
      }

      // 2. FindOne
      const findRes = await db.crud.findOne(testCollection, {
        _id: createdId as any,
        tenantId: TEST_TENANT,
      } as any);
      expect(findRes.success).toBe(true);
      if (findRes.success && findRes.data) {
        const val =
          typeof (findRes.data as any).value === "string"
            ? JSON.parse((findRes.data as any).value)
            : (findRes.data as any).value;
        expect(val.adapter).toBe("sqlite");
      }

      // 3. Update
      const updateRes = await db.crud.update(
        testCollection,
        createdId as any,
        { scope: "updated_scope" } as any,
        { tenantId: TEST_TENANT },
      );
      expect(updateRes.success).toBe(true);

      // 4. Exists
      const existsRes = await db.crud.exists(testCollection, { _id: createdId as any } as any, {
        tenantId: TEST_TENANT,
      });
      expect(existsRes.success).toBe(true);
      if (existsRes.success) {
        expect(existsRes.data).toBe(true);
      }

      // 5. Delete cleanup
      const deleteRes = await db.crud.delete(testCollection, createdId, {
        tenantId: TEST_TENANT,
      });
      expect(deleteRes.success).toBe(true);

      // 6. Verify deletion
      const verifyRes = await db.crud.findOne(testCollection, { _id: createdId as any } as any, {
        tenantId: TEST_TENANT,
      });
      expect(verifyRes.success).toBe(true);
      if (verifyRes.success) {
        expect(verifyRes.data).toBeNull();
      }
    });

    it("should support query builder filtering", async () => {
      if (!db) return;
      const qb = db.queryBuilder(testCollection);
      const res = await qb.where({ scope: "test", tenantId: TEST_TENANT } as any).execute();
      expect(res.success).toBe(true);
    });

    it("should enforce tenant isolation", async () => {
      if (!db) return;

      const docId = `tenant-sqlite-${Date.now()}` as any as DatabaseId;
      const testDoc = {
        _id: docId,
        key: "tenant_test_sqlite",
        value: { isolated: true },
        scope: "test",
        visibility: "private",
      };

      // Insert under TEST_TENANT
      await db.crud.insert(testCollection, testDoc as any, {
        tenantId: TEST_TENANT,
      });

      // Should NOT find under different tenant
      const otherTenant = "other_tenant_sqlite" as any as DatabaseId;
      const findRes = await db.crud.findOne(testCollection, {
        _id: docId as any,
        tenantId: otherTenant,
      } as any);
      expect(findRes.success).toBe(true);
      if (findRes.success) {
        expect(findRes.data).toBeNull();
      }

      // Cleanup
      await db.crud.delete(testCollection, docId, { tenantId: TEST_TENANT });
    });
  });
});
