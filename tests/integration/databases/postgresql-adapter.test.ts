/**
 * @file tests/integration/databases/postgresql-adapter.test.ts
 * @description
 * Integration tests for the PostgreSQL adapter.
 * Performs full CRUD round-trips with Drizzle ORM mappings.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IDBAdapter, DatabaseId } from "../../../src/databases/db-interface";
import { withSystemScope } from "../../../src/databases/system-tenant-scope";
import { connectWithRetry, shouldRunAdapterSuite } from "./adapter-test-env";

const gate = shouldRunAdapterSuite("postgresql");
const describePostgres = gate.run ? describe : describe.skip;
if (!gate.run) {
  console.log(`⏭️ PostgreSQL adapter suite skipped — ${gate.reason}`);
}

describePostgres("PostgreSQL Adapter Integration", () => {
  let db: IDBAdapter | null = null;
  const TEST_TENANT = "test_tenant_postgres" as any as DatabaseId;

  beforeAll(async () => {
    try {
      const { PostgreSQLAdapter } =
        await import("../../../src/databases/postgresql/postgres-adapter");
      db = new PostgreSQLAdapter() as any;

      await connectWithRetry("postgresql", async (uri) => {
        const result = await db!.connect(uri);
        return {
          success: !!result?.success,
          message: result && !result.success ? result.message : undefined,
        };
      });
      await (db as any).provision?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[PostgreSQL Adapter Integration] setup failed: ${msg}`);
      db = null;
      throw new Error(`PostgreSQL Adapter Integration setup failed: ${msg}`);
    }
  }, 90_000);

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

  // Regression: the job queue's first poll disclosed a raw-Drizzle write path that
  // handed ISO text to Drizzle's timestamp mapping (`prepareValues` binds ISO text on
  // ISO-bind dialects). Every dispatch failed with "e.toISOString is not a function",
  // so scheduled publishing and session cleanup never ran on PostgreSQL.
  describe("Background job queue writes", () => {
    it("round-trips dispatch → claim → backoff → complete", async () => {
      if (!db) return;

      const created = await db.system.jobs.create({
        taskType: "probe-job",
        payload: { probe: true },
        status: "pending",
        attempts: 0,
        maxAttempts: 3,
        nextRunAt: new Date(),
        progress: 0,
        metadata: {},
      } as any);
      expect(created.success).toBe(true);
      if (!created.success || !created.data?._id) {
        throw new Error(`job create failed: ${created.success ? "no id" : created.message}`);
      }
      const jobId = created.data._id;

      // Atomic claim: only succeeds while the row is still pending.
      const claimed = await db.system.jobs.update(
        jobId,
        { status: "running", attempts: 1 },
        { filter: { _id: jobId, status: "pending" } },
      );
      expect(claimed.success).toBe(true);
      if (!claimed.success) throw new Error(`claim failed: ${claimed.message}`);
      expect(claimed.data?.status).toBe("running");

      // Failure path: backoff timestamp + a human-readable lastError (never coerced
      // into a Date by the date-column walk).
      const backoff = await db.system.jobs.update(jobId, {
        status: "pending",
        lastError: "probe: handler blew up",
        nextRunAt: new Date(Date.now() + 60_000),
      });
      expect(backoff.success).toBe(true);
      if (!backoff.success) throw new Error(`backoff failed: ${backoff.message}`);
      expect(backoff.data?.lastError).toBe("probe: handler blew up");
      expect(typeof backoff.data?.nextRunAt).toBe("string");

      // A future nextRunAt must keep the job out of the ready set.
      const notReady = await db.system.jobs.getNextReady(10, withSystemScope("scheduler"));
      expect(notReady.success).toBe(true);
      if (!notReady.success) throw new Error(`getNextReady failed: ${notReady.message}`);
      expect(notReady.data?.some((j) => j._id === jobId)).toBe(false);

      // Completion path taken by both consumers after the handler resolves.
      const completed = await db.system.jobs.update(jobId, { status: "completed", progress: 100 });
      expect(completed.success).toBe(true);
      if (!completed.success) throw new Error(`complete failed: ${completed.message}`);
      expect(completed.data?.status).toBe("completed");

      await db.system.jobs.delete(jobId);
    });
  });
});
