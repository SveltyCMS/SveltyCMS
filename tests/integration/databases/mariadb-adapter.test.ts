/**
 * @file tests/integration/databases/mariadb-adapter.test.ts
 * @description
 * High-performance integration tests for the MariaDB adapter.
 * Performs full CRUD round-trips with Drizzle ORM mappings.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IDBAdapter, DatabaseId } from "../../../src/databases/db-interface";
import { connectWithRetry, shouldRunAdapterSuite } from "./adapter-test-env";

const gate = shouldRunAdapterSuite("mariadb");
const describeMariaDB = gate.run ? describe : describe.skip;
if (!gate.run) {
  console.log(`⏭️ MariaDB adapter suite skipped — ${gate.reason}`);
}

describeMariaDB("MariaDB Adapter Integration", () => {
  let db: IDBAdapter | null = null;
  const TEST_TENANT = "test_tenant_mariadb" as any as DatabaseId;

  beforeAll(async () => {
    try {
      const { MariaDBAdapter } = await import("../../../src/databases/mariadb/mariadb-adapter");
      db = new MariaDBAdapter() as any;

      await connectWithRetry("mariadb", async (uri) => {
        const result = await db!.connect(uri);
        return {
          success: !!result?.success,
          message: result && !result.success ? result.message : undefined,
        };
      });
      await (db as any).provision?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[MariaDB Adapter Integration] setup failed: ${msg}`);
      db = null;
      throw new Error(`MariaDB Adapter Integration setup failed: ${msg}`);
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

  // Adapter parity: MariaDB has no UPDATE … RETURNING, so the atomic claim falls
  // back to the affected-row count. Both branches must report the claimed row —
  // a missing claim result makes the job queue drop the job as "someone else's".
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

      const claimed = await db.system.jobs.update(
        jobId,
        { status: "running", attempts: 1 },
        { filter: { _id: jobId, status: "pending" } },
      );
      expect(claimed.success, (claimed as any).message).toBe(true);
      if (!claimed.success) throw new Error(`claim failed: ${claimed.message}`);
      expect(claimed.data?.status).toBe("running");

      const backoff = await db.system.jobs.update(jobId, {
        status: "pending",
        lastError: "probe: handler blew up",
        nextRunAt: new Date(Date.now() + 60_000),
      });
      expect(backoff.success, (backoff as any).message).toBe(true);
      if (!backoff.success) throw new Error(`backoff failed: ${backoff.message}`);
      expect(backoff.data?.lastError).toBe("probe: handler blew up");

      const completed = await db.system.jobs.update(jobId, { status: "completed", progress: 100 });
      expect(completed.success).toBe(true);
      if (!completed.success) throw new Error(`complete failed: ${completed.message}`);
      expect(completed.data?.status).toBe("completed");

      await db.system.jobs.delete(jobId);
    });
  });
});
