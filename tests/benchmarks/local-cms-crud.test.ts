/**
 * @file tests/benchmarks/local-cms-crud.test.ts
 * @description LocalCMS SDK CRUD micro-benchmark (create / update / findById) (Optimized)
 * @summary Measures full CollectionsNamespace tax vs direct adapter baseline with isolated garbage collection and deterministic ID generation.
 */

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
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import type { DatabaseId } from "@src/content/types";

const COLLECTION = "BenchmarkStable";
const TENANT = "global" as unknown as DatabaseId;

let stopServer: (() => Promise<void>) | null = null;

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

async function runLocalCmsCrudBenchmark() {
  const dbType = getDbType().toUpperCase();
  console.log(`🚀 Starting LocalCMS CRUD Micro-Benchmark (${dbType})...\n`);

  const server = await setupBenchmarkServer();
  stopServer = server.stop;

  await ensureStableTestData();
  await stabilize(500);

  const { getDb, ensureFullInitialization } = await import("@src/databases/db");
  await ensureFullInitialization();
  const db = getDb();
  if (!db) throw new Error("Database not initialized");

  const { LocalCMS } = await import("@src/services/sdk");
  const cms = new LocalCMS(db);

  // Model and schema registration safety
  await db.collection
    .createModel({
      _id: COLLECTION,
      name: COLLECTION,
      fields: [
        { db_fieldName: "title", type: "string", widget: { Name: "Input" } },
        { db_fieldName: "count", type: "number", widget: { Name: "Input" } },
      ],
    } as any)
    .catch(() => {});

  try {
    await cms.collections.getSchema(COLLECTION, TENANT as any);
  } catch {
    await cms.collections.registerSchema(
      COLLECTION,
      {
        _id: COLLECTION,
        name: COLLECTION,
        fields: [
          { db_fieldName: "title", type: "string", widget: { Name: "Input" } as any },
          { db_fieldName: "count", type: "number", widget: { Name: "Input" } as any },
        ],
      } as any,
      TENANT as any,
    );
  }

  const systemUser = Object.freeze({ _id: "bench-user", role: "admin", isAdmin: true });
  const writeOpts = Object.freeze({
    user: systemUser,
    tenantId: TENANT,
    system: false,
    skipValidation: true,
  });

  const readOptsWarm = Object.freeze({
    tenantId: TENANT,
    bypassCache: false,
    user: systemUser,
  });

  const readOptsCold = Object.freeze({
    tenantId: TENANT,
    bypassCache: true,
    user: systemUser,
  });

  const directOpts = Object.freeze({ tenantId: TENANT });

  // Seed a stable UUIDv4 id for findById / update
  const seedId = crypto.randomUUID();
  const seedRes = await cms.collections.create(
    COLLECTION,
    { _id: seedId, title: "seed", count: 0 },
    writeOpts as any,
  );
  if (!seedRes?.success) {
    await db.crud.insert(
      COLLECTION,
      { _id: seedId as unknown as DatabaseId, title: "seed", count: 0, tenantId: TENANT } as any,
      directOpts,
    );
  }

  // Prime model and cache pathways
  await cms.collections.findById(COLLECTION, seedId, readOptsWarm as any);
  await cms.collections.findById(COLLECTION, seedId, readOptsWarm as any);

  const matrix = process.env.BENCHMARK_MATRIX === "1";
  const ITER = matrix ? 400 : 1200;
  const WARM = matrix ? 40 : 150;
  const results: any[] = [];

  try {
    // ── 1. DIRECT ADAPTER FIND ONE (READ BASELINE) ──────────────────────────
    forceGarbageCollection();
    await stabilize(100);

    console.log("   → 1. Measuring Adapter FIND ONE (Direct Baseline)...");
    const adapterFind = await runBenchmark({
      name: "Adapter FIND ONE",
      iterations: ITER,
      warmupIterations: WARM,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      silent: true,
      onIteration: async () => {
        const res = await db.crud.findOne(
          COLLECTION,
          { _id: seedId as unknown as DatabaseId },
          directOpts,
        );
        if (!res?.success) throw new Error("Adapter findOne failed");
      },
    });
    results.push({ ...adapterFind, layer: "DB", shortLabel: "Adapter Read" });

    // ── 2. LOCALCMS findById (WARM L1 HIT) ──────────────────────────────────
    forceGarbageCollection();
    await stabilize(100);

    console.log("   → 2. Measuring LocalCMS findById (Warm L1 Cache)...");
    const sdkFindWarm = await runBenchmark({
      name: "LocalCMS findById (Warm)",
      iterations: ITER,
      warmupIterations: WARM,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      silent: true,
      onIteration: async () => {
        const res = await cms.collections.findById(COLLECTION, seedId, readOptsWarm as any);
        if (!res?.success || !res.data) throw new Error("SDK findById warm failed");
      },
    });
    results.push({ ...sdkFindWarm, layer: "SDK", shortLabel: "findById (Warm)" });

    // ── 3. LOCALCMS findById (COLD / ADAPTER DISPATCH TAX) ───────────────────
    forceGarbageCollection();
    await stabilize(100);

    console.log("   → 3. Measuring LocalCMS findById (Cold / Cache Bypass)...");
    const sdkFindCold = await runBenchmark({
      name: "LocalCMS findById (Cold)",
      iterations: ITER,
      warmupIterations: WARM,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      silent: true,
      onIteration: async () => {
        const res = await cms.collections.findById(COLLECTION, seedId, readOptsCold as any);
        if (!res?.success || !res.data) throw new Error("SDK findById cold failed");
      },
    });
    results.push({ ...sdkFindCold, layer: "SDK", shortLabel: "findById (Cold)" });

    // ── 4. LOCALCMS CREATE (PRE-ALLOCATED DETERMINISTIC KEYS) ────────────────
    const createIterations = Math.min(ITER, 600);
    const createWarmup = Math.min(WARM, 80);
    const totalCreateRuns = (createIterations + createWarmup) * 2;
    const createIds = Array.from({ length: totalCreateRuns }, () => crypto.randomUUID());
    let createCursor = 0;

    forceGarbageCollection();
    await stabilize(100);

    console.log("   → 4. Measuring LocalCMS create()...");
    const sdkCreate = await runBenchmark({
      name: "LocalCMS create",
      iterations: createIterations,
      warmupIterations: createWarmup,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      silent: true,
      onIteration: async () => {
        const id = createIds[createCursor++];
        const res = await cms.collections.create(
          COLLECTION,
          { _id: id, title: "Benchmark Document", count: createCursor },
          writeOpts as any,
        );
        if (!res?.success) throw new Error("SDK create failed");
      },
    });
    results.push({ ...sdkCreate, layer: "SDK", shortLabel: "create" });

    // ── 5. LOCALCMS UPDATE ──────────────────────────────────────────────────
    let updateSeq = 0;
    forceGarbageCollection();
    await stabilize(100);

    console.log("   → 5. Measuring LocalCMS update()...");
    const sdkUpdate = await runBenchmark({
      name: "LocalCMS update",
      iterations: Math.min(ITER, 600),
      warmupIterations: Math.min(WARM, 80),
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      silent: true,
      onIteration: async () => {
        const seq = ++updateSeq;
        const res = await cms.collections.update(
          COLLECTION,
          seedId,
          { title: "Updated Title", count: seq },
          writeOpts as any,
        );
        if (!res?.success) throw new Error("SDK update failed");
      },
    });
    results.push({ ...sdkUpdate, layer: "SDK", shortLabel: "update" });

    // ── 6. MIXED CREATE → UPDATE → FINDBYID PIPELINE ────────────────────────
    const mixedIterations = Math.min(ITER, 400);
    const mixedWarmup = Math.min(WARM, 40);
    const totalMixedRuns = (mixedIterations + mixedWarmup) * 2;
    const mixedIds = Array.from({ length: totalMixedRuns }, () => crypto.randomUUID());
    let mixedCursor = 0;

    forceGarbageCollection();
    await stabilize(100);

    console.log("   → 6. Measuring LocalCMS Mixed C/U/R Pipeline...");
    const sdkMixed = await runBenchmark({
      name: "LocalCMS mixed C/U/R",
      iterations: mixedIterations,
      warmupIterations: mixedWarmup,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      silent: true,
      onIteration: async () => {
        const id = mixedIds[mixedCursor++];
        const created = await cms.collections.create(
          COLLECTION,
          { _id: id, title: "Mix Item", count: 0 },
          writeOpts as any,
        );
        if (!created?.success) throw new Error("Mixed create failed");

        const updated = await cms.collections.update(
          COLLECTION,
          id,
          { title: "Mix Item Updated", count: 1 },
          writeOpts as any,
        );
        if (!updated?.success) throw new Error("Mixed update failed");

        const found = await cms.collections.findById(COLLECTION, id, readOptsCold as any);
        if (!found?.success || !found.data) throw new Error("Mixed findById failed");
      },
    });
    results.push({ ...sdkMixed, layer: "SDK", shortLabel: "mixed" });

    // ── REPORTING & TELEMETRY ───────────────────────────────────────────────
    const taxWarmMs = Math.max(0, sdkFindWarm.avgMs - adapterFind.avgMs);
    const taxColdMs = Math.max(0, sdkFindCold.avgMs - adapterFind.avgMs);
    const coldTaxPct =
      adapterFind.avgMs > 0
        ? ((sdkFindCold.avgMs - adapterFind.avgMs) / adapterFind.avgMs) * 100
        : 0;

    printTruthTable({
      title: `SVELTYCMS — LOCALCMS CRUD TAX (${dbType})`,
      shortLabel: "SDK CRUD",
      subtitle: "CollectionsNamespace CRUD vs Direct Adapter Baseline",
      results,
    });

    printSummaryTable(
      [
        { key: "Database Engine", val: dbType, unit: "" },
        { key: "Adapter FIND ONE (Baseline)", val: adapterFind.avgMs.toFixed(3), unit: "ms" },
        { key: "SDK findById (Warm L1)", val: sdkFindWarm.avgMs.toFixed(3), unit: "ms" },
        { key: "SDK findById (Cold)", val: sdkFindCold.avgMs.toFixed(3), unit: "ms" },
        { key: "SDK create", val: sdkCreate.avgMs.toFixed(3), unit: "ms" },
        { key: "SDK update", val: sdkUpdate.avgMs.toFixed(3), unit: "ms" },
        { key: "SDK Mixed C/U/R Cycle", val: sdkMixed.avgMs.toFixed(3), unit: "ms" },
        {
          key: "SDK Wrapper Tax (Cold)",
          val: `+${taxColdMs.toFixed(3)} (${coldTaxPct.toFixed(1)}%)`,
          unit: "ms",
        },
        {
          key: "SDK Cache Benefit (Warm vs Cold)",
          val: (sdkFindCold.avgMs - sdkFindWarm.avgMs).toFixed(3),
          unit: "ms",
        },
      ],
      "LocalCMS CRUD Summary",
    );

    for (const r of results) exportResult(r);
    exportMetric("localcms.findById.warm_ms", sdkFindWarm.avgMs, "ms");
    exportMetric("localcms.findById.cold_ms", sdkFindCold.avgMs, "ms");
    exportMetric("localcms.create_ms", sdkCreate.avgMs, "ms");
    exportMetric("localcms.update_ms", sdkUpdate.avgMs, "ms");
    exportMetric("localcms.mixed_ms", sdkMixed.avgMs, "ms");
    exportMetric("localcms.sdk_tax_warm_ms", taxWarmMs, "ms");
    exportMetric("localcms.sdk_tax_cold_ms", taxColdMs, "ms");
  } finally {
    // Post-benchmark collection cleanup
    await db.crud
      .deleteMany(COLLECTION, {}, { bypassTenantCheck: true, permanent: true })
      .catch(() => {});
  }
}

test("LocalCMS CRUD Micro-Benchmark", async () => {
  try {
    await runLocalCmsCrudBenchmark();
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}, 600_000);
