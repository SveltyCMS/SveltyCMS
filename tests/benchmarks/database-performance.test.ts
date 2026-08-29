/**
 * @file tests/benchmarks/database-performance.test.ts
 * @description Enterprise Database Adapter Benchmark (Optimized)
 * @summary Measures raw CRUD performance, indexing efficiency, and connection pool resilience.
 */

import { sql } from "drizzle-orm";
import {
  test,
  runBenchmark,
  exportResult,
  exportMetric,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
  assertSuccess,
} from "./modules/benchmark-utils";
import { validateBenchmarkEnvironment } from "./modules/benchmark-sanitizer";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";
import { toQueryOptions } from "@src/databases/policy";

const COLLECTION_ID = "benchmark_crud";
const TEST_TENANT = "global";
const STABLE_ID = "20000000-0000-4000-8000-000000000001";

// Global frozen option contexts to eliminate allocation footprints in hot loops
const GLOBAL_TENANT_OPTS = Object.freeze({
  ...toQueryOptions({ bypassCache: true }),
  tenantId: TEST_TENANT,
});

const MANY_READ_OPTS = Object.freeze({
  ...toQueryOptions({ bypassCache: true, inPlace: true }),
  limit: 50,
  tenantId: TEST_TENANT,
});

const PERM_DELETE_OPTS = Object.freeze({
  bypassTenantCheck: true,
  permanent: true,
});

let stopServer: (() => Promise<void>) | null = null;

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

export async function runDatabaseBenchmark() {
  console.log("🚀 Starting Enterprise Database Adapter Benchmark...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;

    await ensureStableTestData();
    await stabilize(500);

    const { getDb, ensureFullInitialization } = await import("@src/databases/db");
    await ensureFullInitialization();
    const db = getDb();
    if (!db) throw new Error("Database not initialized");

    const dbType = getDbType();

    // SQL adapters need createModel/migrations before CRUD
    await prepareCollection(db);

    await validateBenchmarkEnvironment({
      collectionId: COLLECTION_ID,
      db,
      tenantId: TEST_TENANT,
      warmupIterations: 100,
    });

    const scenarios = [
      { name: "INSERT", fn: createInsertTest(db) },
      { name: "FIND ONE", fn: createFindOneTest(db) },
      { name: "FIND MANY (limit 50)", fn: createFindManyTest(db) },
      { name: "QUERY BUILDER LIST (50)", fn: createQueryBuilderListTest(db) },
      { name: "FIND PAGE (50 hasMore)", fn: createFindPageTest(db) },
      { name: "FIND PAGE keyset", fn: createFindPageKeysetTest(db) },
      { name: "FIND MANY offset 50", fn: createFindManyOffsetTest(db) },
      { name: "LIST+COUNT (legacy)", fn: createLegacyListCountTest(db) },
      { name: "UPDATE", fn: createUpdateTest(db) },
      { name: "UPDATE (no-returning)", fn: createUpdateNoReturningTest(db) },
      { name: "NATIVE UPSERT", fn: createUpsertNativeTest(db) },
      { name: "COUNT", fn: createCountTest(db) },
      { name: "COUNT ESTIMATE", fn: createCountEstimateTest(db) },
      { name: "COUNT CACHED", fn: createCountCachedTest(db) },
      { name: "DELETE (Active Rows)", fn: createDeleteTest(db) },
      { name: "BULK INSERT (100)", fn: createBulkInsertTest(db) },
      {
        name: "BULK UPDATE (100 heterogeneous)",
        fn: createBulkUpdateTest(db, "heterogeneous"),
      },
      {
        name: "BULK UPDATE (100 homogeneous)",
        fn: createBulkUpdateTest(db, "homogeneous"),
      },
    ].filter((s) => s.fn !== null);

    const results: any[] = [];

    for (const scenario of scenarios) {
      forceGarbageCollection();
      await stabilize(100);

      console.log(`   → ${scenario.name}`);
      const result = await runBenchmark({
        name: scenario.name,
        iterations: 1000,
        warmupIterations: 100,
        runs: 2,
        concurrency: 1,
        trimOutliers: "iqr",
        measureMemory: true,
        silent: true,
        onIteration: scenario.fn,
      });

      results.push(result);
      exportResult(result);
    }

    const findResult = (name: string) =>
      results.find((r) => r.name === name) || { avgMs: 0, rps: 0 };
    const throughputs = results.map((r) => r.rps);
    const peakThroughput = Math.max(...throughputs);

    printTruthTable({
      title: `SVELTYCMS — DATABASE ADAPTER PERFORMANCE (${dbType.toUpperCase()})`,
      shortLabel: "DB Raw",
      subtitle: "Direct CRUD • Adapter Layer",
      results,
    });

    printSummaryTable([
      { key: "Avg Insert Latency", val: findResult("INSERT").avgMs.toFixed(3), unit: "ms" },
      {
        key: "Avg Read Latency (Single)",
        val: findResult("FIND ONE").avgMs.toFixed(3),
        unit: "ms",
      },
      {
        key: "Avg Read Latency (Many)",
        val: findResult("FIND MANY (limit 50)").avgMs.toFixed(3),
        unit: "ms",
      },
      { key: "Avg Update Latency", val: findResult("UPDATE").avgMs.toFixed(3), unit: "ms" },
      { key: "Avg Native Upsert", val: findResult("NATIVE UPSERT").avgMs.toFixed(3), unit: "ms" },
      {
        key: "Avg Delete Latency",
        val: findResult("DELETE (Active Rows)").avgMs.toFixed(3),
        unit: "ms",
      },
      { key: "Peak CRUD Throughput", val: Math.round(peakThroughput), unit: "ops/s" },
    ]);

    exportMetric("adapter.read.avg", findResult("FIND ONE").avgMs, "ms");
    exportMetric("adapter.write.avg", findResult("INSERT").avgMs, "ms");
    exportMetric("adapter.throughput.peak", peakThroughput, "ops/s");
  } catch (err: any) {
    logger.error(`Database benchmark failed: ${err.message}`);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }

  console.log("\n✅ Database adapter raw CRUD benchmark completed.");
}

// ─────────────────────────────────────────────────────────────
// Test Factories
// ─────────────────────────────────────────────────────────────

function createInsertTest(db: any) {
  return async () => {
    const id = crypto.randomUUID();
    const result = await db.crud.insert(
      COLLECTION_ID,
      {
        _id: id as any,
        title: "Benchmark Insert Record",
        status: "active",
        tenantId: TEST_TENANT,
      },
      GLOBAL_TENANT_OPTS,
    );
    assertSuccess(result, "insert");
  };
}

function createFindOneTest(db: any) {
  const targetFilter = Object.freeze({ _id: STABLE_ID as any });
  return async () => {
    const res = await db.crud.findOne(COLLECTION_ID, targetFilter, GLOBAL_TENANT_OPTS);
    assertSuccess(res, "findOne");
  };
}

function createFindManyTest(db: any) {
  const queryFilter = Object.freeze({ tenantId: TEST_TENANT });
  return async () => {
    const res = await db.crud.findMany(COLLECTION_ID, queryFilter, MANY_READ_OPTS);
    assertSuccess(res, "findMany");
  };
}

function createQueryBuilderListTest(db: any) {
  return async () => {
    const res = await db
      .queryBuilder(COLLECTION_ID)
      .where({ tenantId: TEST_TENANT })
      .sort("createdAt", "desc")
      .paginate({ page: 1, pageSize: 50 })
      .execute();
    assertSuccess(res, "queryBuilderList");
  };
}

function createUpdateTest(db: any) {
  const targetId = STABLE_ID as any;
  const updatePayload = Object.freeze({
    title: "Updated Static Segment Baseline",
    status: "updated",
  });
  return async () => {
    const res = await db.crud.update(COLLECTION_ID, targetId, updatePayload, GLOBAL_TENANT_OPTS);
    assertSuccess(res, "update");
  };
}

function createUpdateNoReturningTest(db: any) {
  const targetId = STABLE_ID as any;
  const updatePayload = Object.freeze({
    title: "Updated Static Segment Baseline",
    status: "updated",
  });
  const opts = Object.freeze({
    ...GLOBAL_TENANT_OPTS,
    skipReturning: true,
  });
  return async () => {
    const res = await db.crud.update(COLLECTION_ID, targetId, updatePayload, opts as any);
    assertSuccess(res, "updateNoReturning");
  };
}

/**
 * Self-replenishing delete scenario:
 * Ensures every timed iteration executes an active row deletion against the DB.
 */
function createDeleteTest(db: any) {
  const deleteBuffer: string[] = [];
  const REFILL_BATCH = 250;

  return async () => {
    if (deleteBuffer.length === 0) {
      const freshBatch = Array.from({ length: REFILL_BATCH }, () => ({
        _id: crypto.randomUUID() as any,
        title: "Dynamic Deletion Seed",
        status: "to_delete",
        value: 0,
        tenantId: TEST_TENANT,
      }));
      await db.crud.insertMany(COLLECTION_ID, freshBatch, GLOBAL_TENANT_OPTS);
      for (let i = 0; i < freshBatch.length; i++) {
        deleteBuffer.push(freshBatch[i]._id);
      }
    }

    const id = deleteBuffer.pop()!;
    const res = await db.crud.delete(COLLECTION_ID, id as any, GLOBAL_TENANT_OPTS);
    assertSuccess(res, "delete");
  };
}

function createUpsertNativeTest(db: any) {
  const targetId = STABLE_ID;
  const mongoPayload = Object.freeze({ title: "Native Static Segment Baseline Mongo" });

  if (db.type === "mongodb") {
    return async () => {
      const res = await db.crud.upsert(
        COLLECTION_ID,
        { _id: targetId },
        mongoPayload,
        GLOBAL_TENANT_OPTS,
      );
      assertSuccess(res, "upsert (mongo)");
    };
  }

  let table: any;
  let idCol: any;
  try {
    table = db.getTable(COLLECTION_ID);
    idCol = db.getColumn(table, "_id");
  } catch {
    table = null;
    idCol = null;
  }

  const sqlKeys = idCol ? [idCol] : [];
  const sqlPayload = Object.freeze(
    idCol
      ? {
          [idCol.name]: targetId,
          title: "Native Static Segment Baseline SQL",
          tenantId: TEST_TENANT,
        }
      : { _id: targetId, title: "Native Static Segment Baseline SQL", tenantId: TEST_TENANT },
  );

  return async () => {
    if (table && idCol && typeof db.upsertNative === "function") {
      await db.upsertNative(table, sqlPayload, sqlKeys);
    } else {
      const res = await db.crud.upsert(
        COLLECTION_ID,
        { _id: targetId },
        sqlPayload,
        GLOBAL_TENANT_OPTS,
      );
      assertSuccess(res, "upsert");
    }
  };
}

function createCountTest(db: any) {
  const countFilter = Object.freeze({ status: "active" });
  const opts = Object.freeze({
    ...GLOBAL_TENANT_OPTS,
    mode: "exact" as const,
    bypassCache: true,
  });
  return async () => {
    const res = await db.crud.count(COLLECTION_ID, countFilter, opts);
    assertSuccess(res, "count");
  };
}

function createFindPageTest(db: any) {
  const queryFilter = Object.freeze({ tenantId: TEST_TENANT });
  const pageOpts = Object.freeze({
    limit: 50,
    tenantId: TEST_TENANT,
    total: "none" as const,
    skipMeta: true,
  });
  return async () => {
    const res = await db.crud.findPage(COLLECTION_ID, queryFilter, pageOpts);
    assertSuccess(res, "findPage");
  };
}

function createFindPageKeysetTest(db: any) {
  const queryFilter = Object.freeze({ tenantId: TEST_TENANT });
  let cursor: string | undefined;

  return async () => {
    if (!cursor) {
      const first = await db.crud.findPage(COLLECTION_ID, queryFilter, {
        limit: 20,
        tenantId: TEST_TENANT,
        total: "none",
        skipMeta: true,
      });
      assertSuccess(first, "findPage warm");
      cursor = first.data?.nextCursor;
      if (!cursor) return;
    }
    const res = await db.crud.findPage(COLLECTION_ID, queryFilter, {
      limit: 20,
      tenantId: TEST_TENANT,
      total: "none",
      skipMeta: true,
      cursor,
    });
    assertSuccess(res, "findPage keyset");
  };
}

function createFindManyOffsetTest(db: any) {
  const queryFilter = Object.freeze({ tenantId: TEST_TENANT });
  const offsetOpts = Object.freeze({
    limit: 20,
    offset: 50,
    tenantId: TEST_TENANT,
    skipMeta: true,
  });
  return async () => {
    const res = await db.crud.findMany(COLLECTION_ID, queryFilter, offsetOpts);
    assertSuccess(res, "findMany offset");
  };
}

function createLegacyListCountTest(db: any) {
  const queryFilter = Object.freeze({ tenantId: TEST_TENANT });
  const countOpts = Object.freeze({
    ...GLOBAL_TENANT_OPTS,
    mode: "exact" as const,
    bypassCache: true,
    skipMeta: true,
  });
  return async () => {
    const [listRes, countRes] = await Promise.all([
      db.crud.findMany(COLLECTION_ID, queryFilter, MANY_READ_OPTS),
      db.crud.count(COLLECTION_ID, queryFilter, countOpts),
    ]);
    assertSuccess(listRes, "findMany");
    assertSuccess(countRes, "count");
  };
}

function createCountEstimateTest(db: any) {
  const empty = Object.freeze({});
  const opts = Object.freeze({
    mode: "estimate" as const,
    bypassCache: true,
    skipMeta: true,
  });
  return async () => {
    const res = await db.crud.count(COLLECTION_ID, empty, opts);
    assertSuccess(res, "countEstimate");
  };
}

function createCountCachedTest(db: any) {
  const countFilter = Object.freeze({ status: "active" });
  const opts = Object.freeze({
    ...GLOBAL_TENANT_OPTS,
    mode: "exact" as const,
    skipMeta: true,
    bypassCache: false,
  });
  let warmed = false;
  return async () => {
    if (!warmed) {
      await db.crud.count(COLLECTION_ID, countFilter, opts);
      warmed = true;
    }
    const res = await db.crud.count(COLLECTION_ID, countFilter, opts);
    assertSuccess(res, "countCached");
  };
}

function createBulkInsertTest(db: any) {
  return async () => {
    const batch = Array.from({ length: 100 }, () => ({
      _id: crypto.randomUUID() as any,
      title: "Bulk item",
      tenantId: TEST_TENANT,
    }));
    const res = await db.crud.insertMany(COLLECTION_ID, batch, GLOBAL_TENANT_OPTS);
    assertSuccess(res, "insertMany");
  };
}

function createBulkUpdateTest(db: any, mode: "heterogeneous" | "homogeneous") {
  const seededIds: string[] = [];
  let seeded = false;

  return async () => {
    if (!seeded) {
      const batch = Array.from({ length: 100 }, () => ({
        _id: crypto.randomUUID() as any,
        title: `Bulk upd ${mode}`,
        status: "active",
        value: 0,
        tenantId: TEST_TENANT,
      }));
      const seed = await db.crud.insertMany(COLLECTION_ID, batch, GLOBAL_TENANT_OPTS);
      assertSuccess(seed, "insertMany seed");
      for (let i = 0; i < batch.length; i++) {
        seededIds.push(batch[i]._id);
      }
      seeded = true;
    }

    const stamp = Date.now() % 100000;
    const updates = seededIds.map((id, i) => ({
      id,
      data:
        mode === "homogeneous"
          ? { title: "Bulk sync title", status: "published", value: 42 }
          : {
              title: `Bulk title ${i}-${stamp}`,
              status: i % 3 === 0 ? "draft" : "published",
              value: (i * 7 + 1) % 1000,
            },
    }));

    const res = await db.batch.bulkUpdate(COLLECTION_ID, updates, GLOBAL_TENANT_OPTS);
    assertSuccess(res, "bulkUpdate");
  };
}

// ─────────────────────────────────────────────────────────────
// Setup & Schema Migration
// ─────────────────────────────────────────────────────────────

async function prepareCollection(db: any) {
  console.log("   [DB Trace] Preparing collection and schema table...");
  const tableName = `collection_${COLLECTION_ID}`;

  if (db.collection?.createModel) {
    if (db.type !== "mongodb") {
      try {
        const q = db.type === "mariadb" || db.type === "mysql" ? "`" : '"';
        await db.execute(sql.raw(`DROP TABLE IF EXISTS ${q}${tableName}${q}`));
      } catch {}
    }

    await db.collection
      .createModel({
        _id: COLLECTION_ID,
        name: COLLECTION_ID,
        fields: [
          { db_fieldName: "title", widget: { Name: "Input" }, required: true },
          { db_fieldName: "status", widget: { Name: "Input" } },
          { db_fieldName: "value", widget: { Name: "Input" }, type: "number" },
          { db_fieldName: "tenantId", widget: { Name: "Input" } },
        ],
      })
      .catch(() => {});

    if (db.type !== "mongodb") {
      try {
        const q = db.type === "mariadb" || db.type === "mysql" ? "`" : '"';
        await db.execute(
          sql.raw(
            `CREATE INDEX IF NOT EXISTS ${q}idx_${COLLECTION_ID}_status${q} ON ${q}${tableName}${q} (${q}status${q})`,
          ),
        );
        await db.execute(
          sql.raw(
            `CREATE INDEX IF NOT EXISTS ${q}idx_${COLLECTION_ID}_tenant${q} ON ${q}${tableName}${q} (${q}tenantId${q})`,
          ),
        );
      } catch {}
    }
  }

  console.log("   [DB Trace] Purging stale benchmark records...");
  await db.crud.deleteMany(COLLECTION_ID, {}, PERM_DELETE_OPTS);

  console.log("   [DB Trace] Seeding stable baseline entity...");
  const seedRes = await db.crud.insert(
    COLLECTION_ID,
    {
      _id: STABLE_ID as any,
      title: "Stable Benchmark Entry",
      status: "active",
      value: 100,
      tenantId: TEST_TENANT,
    },
    GLOBAL_TENANT_OPTS,
  );
  assertSuccess(seedRes, "prepareCollection seed");

  // Initial delete pool replenishment
  const initialDeleteBatch = Array.from({ length: 500 }, () => ({
    _id: crypto.randomUUID() as any,
    title: "To remove initial",
    status: "to_delete",
    value: 0,
    tenantId: TEST_TENANT,
  }));
  await db.crud.insertMany(COLLECTION_ID, initialDeleteBatch, GLOBAL_TENANT_OPTS);
  console.log("   [DB Trace] Collection schema and index setup complete.");
}

test("Database Adapter CRUD Performance", async () => {
  await runDatabaseBenchmark();
}, 600_000);
