/**
 * @file tests/integration/databases/postgresql-adapter.test.ts
 * @description
 * Integration tests for the PostgreSQL adapter.
 * Performs full CRUD round-trips with Drizzle ORM mappings.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IDBAdapter, DatabaseId } from "../../../src/databases/db-interface";
import { isDockerRunning } from "../helpers/docker";

// In-process adapter suite: run whenever Postgres Docker is available (not only DB_TYPE=postgresql).
const pgDockerRunning = isDockerRunning("postgres");
const describePostgres = pgDockerRunning ? describe : describe.skip;
if (!pgDockerRunning) {
  console.log("⏭️ PostgreSQL adapter suite skipped — no Docker container matching 'postgres'");
}

describePostgres("PostgreSQL Adapter Integration", () => {
  let db: IDBAdapter | null = null;
  const TEST_TENANT = "test_tenant_postgres" as any as DatabaseId;

  beforeAll(async () => {
    try {
      const { PostgreSQLAdapter } =
        await import("../../../src/databases/postgresql/postgres-adapter");
      db = new PostgreSQLAdapter() as any;

      // Docker-compose defaults — isolated DB name for this suite.
      const host = "127.0.0.1";
      const port = "5432";
      const user = "postgres";
      const pass = "postgres";
      const dbName = "sveltycms_test";

      const connStr = `postgres://${user}:${pass}@${host}:${port}/${dbName}`;

      const result = await db!.connect(connStr);
      if (!result.success) {
        throw new Error(result.message);
      }
      await (db as any).provision?.();
    } catch (err: any) {
      console.warn("PostgreSQL not available. Failing suite.", err.message);
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

  describe("Functional CRUD Operations", () => {
    const testCollection = "system_preferences";
    let createdId: DatabaseId;

    it("should handle full record lifecycle on system_preferences", async () => {
      if (!db) return;

      const testId = `pref-pg-${Date.now()}` as any as DatabaseId;
      const testDoc = {
        _id: testId,
        key: "test_postgres_key",
        value: { adapter: "postgresql", validated: true },
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
        expect(val.adapter).toBe("postgresql");
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

      const docId = `tenant-pg-${Date.now()}` as any as DatabaseId;
      const testDoc = {
        _id: docId,
        key: "tenant_test_pg",
        value: { isolated: true },
        scope: "test",
        visibility: "private",
      };

      // Insert under TEST_TENANT
      await db.crud.insert(testCollection, testDoc as any, {
        tenantId: TEST_TENANT,
      });

      // Should NOT find under different tenant
      const otherTenant = "other_tenant_pg" as any as DatabaseId;
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
