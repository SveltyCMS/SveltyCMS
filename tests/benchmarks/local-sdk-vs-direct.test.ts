/**
 * @file tests/benchmarks/local-sdk-vs-direct.test.ts
 * @description SDK (LocalCMS collections namespace) vs direct adapter CRUD comparison (Optimized)
 * @summary Measures the exact SDK tax across Create, Find, and Update pathways with isolated GC sweeps and zero-allocation key pools.
 */

import {
  test,
  setupBenchmarkServer,
  printTruthTable,
  printSummaryTable,
  exportResult,
  exportMetric,
  getDbType,
  stabilize,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { LocalCMS } from "@src/services/sdk";
import { ensureFullInitialization, getDb } from "@src/databases/db";
import type { DatabaseId } from "@src/databases/db-interface";
import { toQueryOptions } from "@src/databases/policy";

let stopServer: (() => Promise<void>) | null = null;

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

async function run() {
  const dbType = getDbType().toUpperCase();
  console.log(`🚀 Starting Local SDK vs Direct Adapter Benchmark (${dbType})...\n`);

  const server = await setupBenchmarkServer();
  stopServer = server.stop;

  await ensureFullInitialization();
  const db = getDb() as any;
  const cms = new LocalCMS(db);
  const T = "global" as DatabaseId;

  // Provision collection schema
  await db.collection
    .createModel({
      _id: "SdkVsDirect",
      name: "SdkVsDirect",
      fields: [{ db_fieldName: "title", widget: { Name: "Input" }, type: "string" }],
    })
    .catch(() => {});

  const systemOpts = Object.freeze({ system: true, tenantId: T });
  const detachedWriteOpts = Object.freeze({
    ...systemOpts,
    ...toQueryOptions({ sideEffects: "none" }),
  });
  const tenantOpts = Object.freeze({ tenantId: T });

  const N = 2000;
  const known = crypto.randomUUID();

  // Pre-seed known key
  await db.crud
    .insert("SdkVsDirect", { _id: known, title: "w", tenantId: T }, tenantOpts)
    .catch(() => {});

  // Pre-allocate deterministic key pools to eliminate Math.random / string churn in loops
  const directKeys = Array.from({ length: N }, () => crypto.randomUUID());
  const sdkKeys = Array.from({ length: N }, () => crypto.randomUUID());
  const detachedKeys = Array.from({ length: N }, () => crypto.randomUUID());

  const results: any[] = [];

  try {
    // ════════════════════════════════════════════════════════════════════════
    // 1. CREATE COMPARISON
    // ════════════════════════════════════════════════════════════════════════
    forceGarbageCollection();
    await stabilize(100);

    console.log("   → 1. Measuring Direct insert (Baseline)...");
    let ok = 0;
    let t0 = performance.now();
    for (let i = 0; i < N; i++) {
      const r = await db.crud.insert(
        "SdkVsDirect",
        { _id: directKeys[i], title: "hello", tenantId: T },
        tenantOpts,
      );
      if (r?.success) ok++;
    }
    const directCreateMs = performance.now() - t0;
    const directCreateRps = ok / (directCreateMs / 1000);
    const directCreateAvg = directCreateMs / N;

    results.push({
      name: "Direct insert",
      avgMs: directCreateAvg,
      p95Ms: directCreateAvg,
      rps: directCreateRps,
      layer: "DB",
      shortLabel: "Direct Insert",
    });

    forceGarbageCollection();
    await stabilize(100);

    console.log("   → 2. Measuring SDK create (Full Pipeline)...");
    ok = 0;
    t0 = performance.now();
    for (let i = 0; i < N; i++) {
      const r = await cms.collections
        .create("SdkVsDirect", { _id: sdkKeys[i], title: "hello" }, systemOpts)
        .catch(() => null);
      if (r?.success) ok++;
    }
    const sdkCreateMs = performance.now() - t0;
    const sdkCreateRps = ok / (sdkCreateMs / 1000);
    const sdkCreateAvg = sdkCreateMs / N;

    results.push({
      name: "SDK create (full)",
      avgMs: sdkCreateAvg,
      p95Ms: sdkCreateAvg,
      rps: sdkCreateRps,
      layer: "SDK",
      shortLabel: "SDK Create",
    });

    // ════════════════════════════════════════════════════════════════════════
    // 2. FIND ONE COMPARISON
    // ════════════════════════════════════════════════════════════════════════
    forceGarbageCollection();
    await stabilize(100);

    console.log("   → 3. Measuring Direct findOne (Baseline)...");
    ok = 0;
    t0 = performance.now();
    for (let i = 0; i < N; i++) {
      const r = await db.crud.findOne("SdkVsDirect", { _id: known }, tenantOpts);
      if (r?.success) ok++;
    }
    const directFindMs = performance.now() - t0;
    const directFindRps = ok / (directFindMs / 1000);
    const directFindAvg = directFindMs / N;

    results.push({
      name: "Direct findOne",
      avgMs: directFindAvg,
      p95Ms: directFindAvg,
      rps: directFindRps,
      layer: "DB",
      shortLabel: "Direct Find",
    });

    forceGarbageCollection();
    await stabilize(100);

    console.log("   → 4. Measuring SDK find (Bypass Cache)...");
    ok = 0;
    t0 = performance.now();
    for (let i = 0; i < N; i++) {
      const r = await cms.collections
        .find("SdkVsDirect", { tenantId: T, filter: { _id: known }, bypassCache: true })
        .catch(() => null);
      if (r?.success) ok++;
    }
    const sdkFindMs = performance.now() - t0;
    const sdkFindRps = ok / (sdkFindMs / 1000);
    const sdkFindAvg = sdkFindMs / N;

    results.push({
      name: "SDK find (bypassCache)",
      avgMs: sdkFindAvg,
      p95Ms: sdkFindAvg,
      rps: sdkFindRps,
      layer: "SDK",
      shortLabel: "SDK Find",
    });

    // ════════════════════════════════════════════════════════════════════════
    // 3. UPDATE COMPARISON
    // ════════════════════════════════════════════════════════════════════════
    forceGarbageCollection();
    await stabilize(100);

    console.log("   → 5. Measuring Direct update (Baseline)...");
    ok = 0;
    t0 = performance.now();
    for (let i = 0; i < N; i++) {
      const r = await db.crud.update("SdkVsDirect", known, { title: "updated" }, tenantOpts);
      if (r?.success) ok++;
    }
    const directUpdateMs = performance.now() - t0;
    const directUpdateRps = ok / (directUpdateMs / 1000);
    const directUpdateAvg = directUpdateMs / N;

    results.push({
      name: "Direct update",
      avgMs: directUpdateAvg,
      p95Ms: directUpdateAvg,
      rps: directUpdateRps,
      layer: "DB",
      shortLabel: "Direct Update",
    });

    forceGarbageCollection();
    await stabilize(100);

    console.log("   → 6. Measuring SDK update (Full Pipeline)...");
    ok = 0;
    t0 = performance.now();
    for (let i = 0; i < N; i++) {
      const r = await cms.collections
        .update("SdkVsDirect", known, { title: "updated" }, systemOpts)
        .catch(() => null);
      if (r?.success) ok++;
    }
    const sdkUpdateMs = performance.now() - t0;
    const sdkUpdateRps = ok / (sdkUpdateMs / 1000);
    const sdkUpdateAvg = sdkUpdateMs / N;

    results.push({
      name: "SDK update (full)",
      avgMs: sdkUpdateAvg,
      p95Ms: sdkUpdateAvg,
      rps: sdkUpdateRps,
      layer: "SDK",
      shortLabel: "SDK Update",
    });

    // ════════════════════════════════════════════════════════════════════════
    // 4. DETACHED MODE (EXPLICIT WritePolicy sideEffects: none)
    // ════════════════════════════════════════════════════════════════════════
    forceGarbageCollection();
    await stabilize(100);

    console.log("   → 7. Measuring SDK create (Detached Mode)...");
    ok = 0;
    t0 = performance.now();
    for (let i = 0; i < N; i++) {
      const r = await cms.collections
        .create("SdkVsDirect", { _id: detachedKeys[i], title: "detached" }, detachedWriteOpts)
        .catch(() => null);
      if (r?.success) ok++;
    }
    const detachedCreateMs = performance.now() - t0;
    const detachedCreateRps = ok / (detachedCreateMs / 1000);
    const detachedCreateAvg = detachedCreateMs / N;

    results.push({
      name: "SDK create (detached)",
      avgMs: detachedCreateAvg,
      p95Ms: detachedCreateAvg,
      rps: detachedCreateRps,
      layer: "DETACHED",
      shortLabel: "SDK Create Detached",
    });

    forceGarbageCollection();
    await stabilize(100);

    console.log("   → 8. Measuring SDK update (Detached Mode)...");
    ok = 0;
    t0 = performance.now();
    for (let i = 0; i < N; i++) {
      const r = await cms.collections
        .update("SdkVsDirect", known, { title: "detached_update" }, detachedWriteOpts)
        .catch(() => null);
      if (r?.success) ok++;
    }
    const detachedUpdateMs = performance.now() - t0;
    const detachedUpdateRps = ok / (detachedUpdateMs / 1000);
    const detachedUpdateAvg = detachedUpdateMs / N;

    results.push({
      name: "SDK update (detached)",
      avgMs: detachedUpdateAvg,
      p95Ms: detachedUpdateAvg,
      rps: detachedUpdateRps,
      layer: "DETACHED",
      shortLabel: "SDK Update Detached",
    });

    // ════════════════════════════════════════════════════════════════════════
    // REPORTING & TELEMETRY
    // ════════════════════════════════════════════════════════════════════════
    const createTaxMs = Math.max(0, sdkCreateAvg - directCreateAvg);
    const findTaxMs = Math.max(0, sdkFindAvg - directFindAvg);
    const updateTaxMs = Math.max(0, sdkUpdateAvg - directUpdateAvg);
    const detachedSavingMs = Math.max(0, sdkCreateAvg - detachedCreateAvg);

    printTruthTable({
      title: `SVELTYCMS — SDK VS DIRECT ADAPTER (${dbType})`,
      shortLabel: "SDK-vs-Direct",
      subtitle: `cms.collections.* vs db.crud.* • ${N} ops each`,
      results,
    });

    printSummaryTable(
      [
        { key: "Database Engine", val: dbType, unit: "" },
        { key: "Direct Insert Latency", val: directCreateAvg.toFixed(3), unit: "ms" },
        { key: "SDK Create Latency", val: sdkCreateAvg.toFixed(3), unit: "ms" },
        { key: "SDK Create Tax (Full)", val: `+${createTaxMs.toFixed(3)}`, unit: "ms" },
        { key: "Direct Find Latency", val: directFindAvg.toFixed(3), unit: "ms" },
        { key: "SDK Find Latency", val: sdkFindAvg.toFixed(3), unit: "ms" },
        { key: "SDK Find Tax", val: `+${findTaxMs.toFixed(3)}`, unit: "ms" },
        { key: "Direct Update Latency", val: directUpdateAvg.toFixed(3), unit: "ms" },
        { key: "SDK Update Latency", val: sdkUpdateAvg.toFixed(3), unit: "ms" },
        { key: "SDK Update Tax", val: `+${updateTaxMs.toFixed(3)}`, unit: "ms" },
        { key: "SDK Create (Detached)", val: detachedCreateAvg.toFixed(3), unit: "ms" },
        { key: "Detached Mode Savings", val: `-${detachedSavingMs.toFixed(3)}`, unit: "ms" },
      ],
      "SDK vs Direct Summary",
    );

    exportMetric("sdk.tax.create_ms", createTaxMs, "ms");
    exportMetric("sdk.tax.find_ms", findTaxMs, "ms");
    exportMetric("sdk.tax.update_ms", updateTaxMs, "ms");
    exportMetric("sdk.tax.detached_create_ms", detachedCreateAvg, "ms");

    for (const r of results) exportResult(r);
  } finally {
    // Clean up inserted test documents
    await db.crud
      .deleteMany("SdkVsDirect", {}, { bypassTenantCheck: true, permanent: true })
      .catch(() => {});
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("Local SDK vs Direct Adapter CRUD", async () => {
  await run();
}, 600_000);
