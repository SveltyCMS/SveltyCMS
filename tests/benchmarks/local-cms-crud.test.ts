/**
 * @file tests/benchmarks/local-cms-crud.test.ts
 * @description LocalCMS SDK CRUD micro-benchmark (create / update / findById).
 * @summary Measures full CollectionsNamespace tax — not raw db.crud — so SDK
 * overhead (schema hot flags, sanitize, hooks gate, cache, modifyRequest skip)
 * is tracked on every run.
 *
 * ### Features:
 * - create → update → findById loop through `cms.collections.*`
 * - Direct adapter FIND ONE baseline for SDK tax delta
 * - Serial runs for microsecond-stable p50/p95
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

async function runLocalCmsCrudBenchmark() {
  console.log(`🚀 Starting LocalCMS CRUD Micro-Benchmark (${getDbType().toUpperCase()})...\n`);

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

  // Ensure schema is registered (content store may lag in sandbox)
  try {
    await cms.collections.getSchema(COLLECTION, TENANT as any);
  } catch {
    cms.collections.registerSchema(
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

  const systemUser = { _id: "bench-user", role: "admin", isAdmin: true };
  const writeOpts = Object.freeze({
    user: systemUser,
    tenantId: TENANT,
    system: false,
    skipValidation: true,
  });
  const readOpts = Object.freeze({
    tenantId: TENANT,
    bypassCache: false,
  });
  const readOptsCold = Object.freeze({
    tenantId: TENANT,
    bypassCache: true,
  });

  // Seed a stable id for findById / update
  const seedId = `local-cms-crud-${Date.now()}`;
  const seedRes = await cms.collections.create(
    COLLECTION,
    { _id: seedId, title: "seed", count: 0 },
    writeOpts as any,
  );
  if (!seedRes?.success) {
    // Fallback: adapter insert if SDK create fails (schema edge)
    await db.crud.insert(
      COLLECTION,
      { _id: seedId as unknown as DatabaseId, title: "seed", count: 0, tenantId: TENANT } as any,
      { tenantId: TENANT },
    );
  }

  // Warm schema + model path once
  await cms.collections.findById(COLLECTION, seedId, readOpts as any);
  await cms.collections.findById(COLLECTION, seedId, readOpts as any);

  const matrix = process.env.BENCHMARK_MATRIX === "1";
  const ITER = matrix ? 400 : 1200;
  const WARM = matrix ? 40 : 150;
  const results: any[] = [];

  // ── 1. Adapter baseline FIND ONE ──────────────────────────────────────
  console.log("   → Adapter FIND ONE (baseline)...");
  const adapterFind = await runBenchmark({
    name: "Adapter FIND ONE",
    iterations: ITER,
    warmupIterations: WARM,
    runs: 3,
    concurrency: 1,
    trimOutliers: "iqr",
    silent: true,
    onIteration: async () => {
      const res = await db.crud.findOne(
        COLLECTION,
        { _id: seedId as unknown as DatabaseId },
        { tenantId: TENANT },
      );
      if (!res?.success) throw new Error("adapter findOne failed");
    },
  });
  results.push({ ...adapterFind, layer: "DB", shortLabel: "Adapter" });

  // ── 2. LocalCMS findById (warm cache) ─────────────────────────────────
  console.log("   → LocalCMS findById (warm)...");
  const sdkFindWarm = await runBenchmark({
    name: "LocalCMS findById (warm)",
    iterations: ITER,
    warmupIterations: WARM,
    runs: 3,
    concurrency: 1,
    trimOutliers: "iqr",
    silent: true,
    onIteration: async () => {
      const res = await cms.collections.findById(COLLECTION, seedId, readOpts as any);
      if (!res?.success || !res.data) throw new Error("sdk findById warm failed");
    },
  });
  results.push({ ...sdkFindWarm, layer: "SDK", shortLabel: "findById warm" });

  // ── 3. LocalCMS findById (cold / bypass cache) ────────────────────────
  console.log("   → LocalCMS findById (cold)...");
  const sdkFindCold = await runBenchmark({
    name: "LocalCMS findById (cold)",
    iterations: ITER,
    warmupIterations: WARM,
    runs: 3,
    concurrency: 1,
    trimOutliers: "iqr",
    silent: true,
    onIteration: async () => {
      const res = await cms.collections.findById(COLLECTION, seedId, readOptsCold as any);
      if (!res?.success || !res.data) throw new Error("sdk findById cold failed");
    },
  });
  results.push({ ...sdkFindCold, layer: "SDK", shortLabel: "findById cold" });

  // ── 4. LocalCMS create ────────────────────────────────────────────────
  console.log("   → LocalCMS create...");
  let createSeq = 0;
  const sdkCreate = await runBenchmark({
    name: "LocalCMS create",
    iterations: Math.min(ITER, 600),
    warmupIterations: Math.min(WARM, 80),
    runs: 3,
    concurrency: 1,
    trimOutliers: "iqr",
    silent: true,
    onIteration: async () => {
      createSeq++;
      const id = `lc-c-${createSeq}-${Math.random().toString(36).slice(2, 8)}`;
      const res = await cms.collections.create(
        COLLECTION,
        { _id: id, title: `t${createSeq}`, count: createSeq },
        writeOpts as any,
      );
      if (!res?.success) throw new Error("sdk create failed");
    },
  });
  results.push({ ...sdkCreate, layer: "SDK", shortLabel: "create" });

  // ── 5. LocalCMS update ────────────────────────────────────────────────
  console.log("   → LocalCMS update...");
  let updateSeq = 0;
  const sdkUpdate = await runBenchmark({
    name: "LocalCMS update",
    iterations: Math.min(ITER, 600),
    warmupIterations: Math.min(WARM, 80),
    runs: 3,
    concurrency: 1,
    trimOutliers: "iqr",
    silent: true,
    onIteration: async () => {
      updateSeq++;
      const res = await cms.collections.update(
        COLLECTION,
        seedId,
        { title: `u${updateSeq}`, count: updateSeq },
        writeOpts as any,
      );
      if (!res?.success) throw new Error("sdk update failed");
    },
  });
  results.push({ ...sdkUpdate, layer: "SDK", shortLabel: "update" });

  // ── 6. Mixed create→update→findById ───────────────────────────────────
  console.log("   → LocalCMS mixed (create→update→findById)...");
  let mixSeq = 0;
  const sdkMixed = await runBenchmark({
    name: "LocalCMS mixed C/U/R",
    iterations: Math.min(ITER, 400),
    warmupIterations: Math.min(WARM, 40),
    runs: 2,
    concurrency: 1,
    trimOutliers: "iqr",
    silent: true,
    onIteration: async () => {
      mixSeq++;
      const id = `lc-m-${mixSeq}-${Math.random().toString(36).slice(2, 8)}`;
      const created = await cms.collections.create(
        COLLECTION,
        { _id: id, title: `m${mixSeq}`, count: 0 },
        writeOpts as any,
      );
      if (!created?.success) throw new Error("mixed create failed");
      const updated = await cms.collections.update(
        COLLECTION,
        id,
        { title: `m${mixSeq}-u`, count: 1 },
        writeOpts as any,
      );
      if (!updated?.success) throw new Error("mixed update failed");
      const found = await cms.collections.findById(COLLECTION, id, readOptsCold as any);
      if (!found?.success || !found.data) throw new Error("mixed findById failed");
    },
  });
  results.push({ ...sdkMixed, layer: "SDK", shortLabel: "mixed" });

  printTruthTable({
    title: `SVELTYCMS — LOCALCMS CRUD TAX (${getDbType().toUpperCase()})`,
    shortLabel: "SDK CRUD",
    subtitle: "CollectionsNamespace create / update / findById vs adapter baseline",
    results,
  });

  const taxWarm = Math.max(0, sdkFindWarm.avgMs - adapterFind.avgMs);
  const taxCold = Math.max(0, sdkFindCold.avgMs - adapterFind.avgMs);
  const taxPct =
    adapterFind.avgMs > 0 ? ((sdkFindWarm.avgMs - adapterFind.avgMs) / adapterFind.avgMs) * 100 : 0;

  printSummaryTable([
    { key: "Adapter FIND ONE", val: adapterFind.avgMs, unit: "ms" },
    { key: "SDK findById warm", val: sdkFindWarm.avgMs, unit: "ms" },
    { key: "SDK findById cold", val: sdkFindCold.avgMs, unit: "ms" },
    { key: "SDK create", val: sdkCreate.avgMs, unit: "ms" },
    { key: "SDK update", val: sdkUpdate.avgMs, unit: "ms" },
    { key: "SDK mixed C/U/R", val: sdkMixed.avgMs, unit: "ms" },
    { key: "SDK tax (warm)", val: taxWarm, unit: "ms" },
    { key: "SDK tax (cold)", val: taxCold, unit: "ms" },
    { key: "SDK tax % (warm)", val: taxPct, unit: "%" },
  ]);

  for (const r of results) exportResult(r);
  exportMetric("localcms.findById.warm", sdkFindWarm.avgMs, "ms");
  exportMetric("localcms.findById.cold", sdkFindCold.avgMs, "ms");
  exportMetric("localcms.create", sdkCreate.avgMs, "ms");
  exportMetric("localcms.update", sdkUpdate.avgMs, "ms");
  exportMetric("localcms.mixed", sdkMixed.avgMs, "ms");
  exportMetric("localcms.sdk_tax_warm_ms", taxWarm, "ms");
}

test("LocalCMS CRUD Micro-Benchmark", async () => {
  try {
    await runLocalCmsCrudBenchmark();
  } finally {
    if (stopServer) await stopServer().catch(() => {});
  }
}, 600000);
