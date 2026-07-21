/**
 * @file tests/integration/databases/mariadb-adapter.test.ts
 * @description
 * High-performance integration tests for the MariaDB adapter.
 * Performs full CRUD round-trips with Drizzle ORM mappings.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IDBAdapter, DatabaseId } from "../../../src/databases/db-interface";
import { isDockerRunning } from "../helpers/docker";

// 1. CONFIGURATION (Isolation for CI)
// @ts-ignore - optional test config
const { privateEnv: _privateEnv } = (await import("../../../config/private.test").catch(() => ({
  _privateEnv: { DB_TYPE: process.env.DB_TYPE || "sqlite" },
}))) as any;

// In-process adapter suite: run whenever MariaDB Docker is available (not only DB_TYPE=mariadb).
const mariadbDockerRunning = isDockerRunning("mariadb");
const describeMariaDB = mariadbDockerRunning ? describe : describe.skip;
if (!mariadbDockerRunning) {
  console.log("⏭️ MariaDB adapter suite skipped — no Docker container matching 'mariadb'");
}

describeMariaDB("MariaDB Adapter Integration", () => {
  let db: IDBAdapter | null = null;
  const TEST_TENANT = "test_tenant_mariadb" as any as DatabaseId;

  beforeAll(async () => {
    try {
      const { MariaDBAdapter } = await import("../../../src/databases/mariadb/mariadb-adapter");
      db = new MariaDBAdapter() as any;

      // Always use Docker-compose defaults for this in-process suite (not CMS DB_TYPE).
      const host = "127.0.0.1";
      const port = "3306";
      const user = "root";
      const pass = "mariadb";
      const dbName = "sveltycms_test";

      const connStr = `mariadb://${user}:${pass}@${host}:${port}/${dbName}`;

      const result = await db!.connect(connStr);
      if (!result.success) {
        throw new Error(result.message);
      }
      await (db as any).provision?.();
    } catch (err: any) {
      console.warn(
        "MariaDB not available on 127.0.0.1/sveltycms_test. Failing suite.",
        err.message,
      );
      db = null;
      throw err;
    }
  });

  afterAll(async () => {
    if (db && db.isConnected()) {
      await db.disconnect();
    }
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

  describe("Functional CRUD Operations (Drizzle Contract)", () => {
    const testCollection = "system_preferences";
    let createdId: DatabaseId;

    it("should handle full record lifecycle on system_preferences", async () => {
      if (!db) return;

      const testId = `pref-mariadb-${Date.now()}` as any as DatabaseId;
      const testDoc = {
        _id: testId,
        key: "test_mariadb_key",
        value: { adapter: "mariadb", validated: true },
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
        expect((insertRes.data as any).key).toBe("test_mariadb_key");
      }

      // 2. FindOne
      const findRes = await db.crud.findOne(testCollection, {
        _id: createdId as any,
        tenantId: TEST_TENANT,
      } as any);
      expect(findRes.success).toBe(true);
      if (findRes.success && findRes.data) {
        console.log("DEBUG findOne data:", JSON.stringify(findRes.data, null, 2));
        const val =
          typeof (findRes.data as any).value === "string"
            ? JSON.parse((findRes.data as any).value)
            : (findRes.data as any).value;
        expect(val.adapter).toBe("mariadb");
      }

      // 3. Update
      const updateRes = await db.crud.update(
        testCollection,
        createdId as any,
        {
          scope: "updated_scope",
        } as any,
        { tenantId: TEST_TENANT },
      );
      expect(updateRes.success).toBe(true);
      if (updateRes.success && updateRes.data) {
        expect((updateRes.data as any).scope).toBe("updated_scope");
      }

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

    it("should resolve redirectsMV correctly", async () => {
      if (!db) return;
      const res = await db.crud.findMany("redirectsMV", {
        tenantId: "test_tenant_mariadb",
        source: "/",
        active: true,
      } as any);
      expect(res.success).toBe(true);
    });
  });
});
