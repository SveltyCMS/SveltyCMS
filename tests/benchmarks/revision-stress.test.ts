/**
 * @file tests/benchmarks/revision-stress.test.ts
 * @description Revision History Growth Stress Benchmark (Optimized)
 * @summary Measures latest read degradation, history retrieval speed, and storage footprint under heavy revision growth (100 revisions).
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
  benchmarkAuthHeaders,
  getDbType,
  forceRefreshServer,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

const REVISION_COLLECTION = "bench_revisions";
const STRESS_TARGET_ID = "30000000-0000-4000-8000-000000000001";
const CLEAN_TARGET_ID = "30000000-0000-4000-8000-000000000002";
const TOTAL_REVISIONS = 100;

let stopServer: (() => Promise<void>) | null = null;

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

async function runRevisionAudit() {
  const dbType = getDbType().toUpperCase();
  console.log(
    `🚀 Starting Revision & History Growth Audit (${TOTAL_REVISIONS} revisions • ${dbType})...\n`,
  );

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await ensureStableTestData();

    const requestHeaders: Record<string, string> = {
      ...benchmarkAuthHeaders(),
      "content-type": "application/json",
      "x-tenant-id": "global",
      connection: "keep-alive",
    };

    // ── 1. PROVISION REVISION SCHEMA & IN-MEMORY CONTENT STORE ──────────────
    try {
      const { getDb, getDbInitPromise } = await import("@src/databases/db");
      await getDbInitPromise(false, "CORE").catch(() => {});
      const _db = getDb();
      if (!_db) throw new Error("Database adapter not initialized");

      await (_db as any).collection.createModel({
        _id: REVISION_COLLECTION,
        name: REVISION_COLLECTION,
        fields: [
          { db_fieldName: "title", widget: { Name: "Input" }, required: true },
          { db_fieldName: "content", widget: { Name: "RichText" } },
        ],
        revision: true,
      });

      const node = {
        _id: REVISION_COLLECTION,
        path: `/collection/${REVISION_COLLECTION.toLowerCase()}`,
        name: REVISION_COLLECTION,
        nodeType: "collection",
        collectionDef: {
          _id: REVISION_COLLECTION,
          name: REVISION_COLLECTION,
          fields: [
            { db_fieldName: "title", widget: { Name: "Input" }, required: true },
            { db_fieldName: "content", widget: { Name: "RichText" } },
          ],
          revision: true,
        },
        status: "publish",
        source: "api",
        tenantId: "global",
      };
      await (_db as any).content?.nodes?.upsertContentStructureNode(node);
    } catch (e: any) {
      if (process.env.BENCHMARK_DEBUG === "true") {
        process.stderr.write(`[DEBUG] revision collection provisioning: ${e.message}\n`);
      }
    }

    const refreshRes = await fetch(`${baseUrl}/api/content/collections`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10_000),
    });

    if (!refreshRes.ok) {
      const t = await refreshRes.text().catch(() => "");
      throw new Error(`Content refresh failed (${refreshRes.status}): ${t.slice(0, 200)}`);
    }

    await forceRefreshServer(baseUrl);
    await stabilize(1000);

    // ── 2. SEED CLEAN BASELINE AND HEAVY REVISION TARGETS ────────────────────
    console.log(
      `   → Seeding clean entry (${CLEAN_TARGET_ID}) and heavy entry with ${TOTAL_REVISIONS} revisions...`,
    );

    // Clean target (1 revision baseline)
    await fetch(`${baseUrl}/api/collections/${REVISION_COLLECTION}`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        _id: CLEAN_TARGET_ID,
        title: "Clean Entry Baseline",
        content: "Clean baseline document content.",
      }),
      signal: AbortSignal.timeout(10_000),
    });

    // Stress target initial insertion
    await fetch(`${baseUrl}/api/collections/${REVISION_COLLECTION}`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        _id: STRESS_TARGET_ID,
        title: "Initial Revision Version",
        content: "Initial content state.",
      }),
      signal: AbortSignal.timeout(10_000),
    });

    // Pre-serialize update payloads
    const revisionPayloads = Array.from({ length: TOTAL_REVISIONS }, (_, r) =>
      JSON.stringify({
        title: `Revision Iteration ${r + 1}`,
        content: `Updated revision state content payload iteration ${r + 1}.`,
      }),
    );

    // Execute sequential wave updates
    const REVISION_WAVE = 10;
    for (let i = 0; i < TOTAL_REVISIONS; i += REVISION_WAVE) {
      const end = Math.min(i + REVISION_WAVE, TOTAL_REVISIONS);
      const wave = [];
      for (let r = i; r < end; r++) {
        wave.push(
          fetch(`${baseUrl}/api/collections/${REVISION_COLLECTION}/${STRESS_TARGET_ID}`, {
            method: "PATCH",
            headers: requestHeaders,
            body: revisionPayloads[r],
            signal: AbortSignal.timeout(15_000),
          }).then(async (res) => {
            if (!res.ok) {
              const t = await res.text().catch(() => "");
              throw new Error(`Revision PATCH ${r + 1} failed: HTTP ${res.status} - ${t}`);
            }
            await res.arrayBuffer().catch(() => {});
          }),
        );
      }
      await Promise.all(wave);
    }

    await forceRefreshServer(baseUrl);
    await stabilize(1000);

    const results: any[] = [];
    const cleanUrl = `${baseUrl}/api/collections/${REVISION_COLLECTION}/${CLEAN_TARGET_ID}`;
    const heavyUrl = `${baseUrl}/api/collections/${REVISION_COLLECTION}/${STRESS_TARGET_ID}`;
    const historyUrl = `${baseUrl}/api/collections/${REVISION_COLLECTION}/${STRESS_TARGET_ID}/revisions`;

    // ── 3. CLEAN BASELINE READ (0-1 REVISIONS) ───────────────────────────────
    forceGarbageCollection();
    await stabilize(150);

    console.log("   → 1. Measuring Baseline Read Latency (Single Revision Document)...");
    const cleanReadResult = await runBenchmark({
      name: "Clean Document Read (Baseline)",
      iterations: 500,
      warmupIterations: 50,
      runs: 2,
      concurrency: 4,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const res = await fetch(cleanUrl, {
          method: "GET",
          headers: requestHeaders,
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`Clean read failed: HTTP ${res.status}`);
        await res.arrayBuffer().catch(() => {});
      },
    });
    results.push({ ...cleanReadResult, shortLabel: "Clean Read", layer: "Baseline" });

    // ── 4. LATEST VERSION READ (HEAVY 100-REVISION HISTORY) ──────────────────
    forceGarbageCollection();
    await stabilize(150);

    console.log(
      `   → 2. Measuring Latest Version Read Latency (${TOTAL_REVISIONS} Historical Revisions)...`,
    );
    const heavyReadResult = await runBenchmark({
      name: `Latest Read (${TOTAL_REVISIONS} Revisions)`,
      iterations: 500,
      warmupIterations: 50,
      runs: 2,
      concurrency: 4,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const res = await fetch(heavyUrl, {
          method: "GET",
          headers: requestHeaders,
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`Heavy read failed: HTTP ${res.status}`);
        await res.arrayBuffer().catch(() => {});
      },
    });
    results.push({ ...heavyReadResult, shortLabel: "Heavy Read", layer: "Read Path" });

    // ── 5. FULL REVISION HISTORY LIST RETRIEVAL ─────────────────────────────
    forceGarbageCollection();
    await stabilize(150);

    console.log(
      `   → 3. Measuring Full History List Retrieval (${TOTAL_REVISIONS} Revisions Payload)...`,
    );
    const listResult = await runBenchmark({
      name: "History List Retrieval",
      iterations: 250,
      warmupIterations: 30,
      runs: 2,
      concurrency: 2,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const res = await fetch(historyUrl, {
          method: "GET",
          headers: requestHeaders,
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`History list failed: HTTP ${res.status}`);
        await res.arrayBuffer().catch(() => {});
      },
    });
    results.push({ ...listResult, shortLabel: "History List", layer: "History" });

    // ── 6. REPORTING & TELEMETRY ────────────────────────────────────────────
    const degradationRatio = (
      heavyReadResult.avgMs / Math.max(cleanReadResult.avgMs, 0.001)
    ).toFixed(2);
    const readDeltaMs = Math.max(0, heavyReadResult.avgMs - cleanReadResult.avgMs);

    printTruthTable({
      title: "SVELTYCMS — REVISION STRESS AUDIT",
      shortLabel: "Revision",
      subtitle: `${TOTAL_REVISIONS} Revisions per Entry • Baseline vs Stressed • ${dbType}`,
      results,
    });

    printSummaryTable(
      [
        { key: "Database Engine", val: dbType, unit: "" },
        { key: "Clean Baseline Read", val: cleanReadResult.avgMs.toFixed(2), unit: "ms" },
        {
          key: `Latest Read (${TOTAL_REVISIONS} Revisions)`,
          val: heavyReadResult.avgMs.toFixed(2),
          unit: "ms",
        },
        { key: "History Overhead Delta", val: `+${readDeltaMs.toFixed(2)}`, unit: "ms" },
        { key: "Read Path Degradation", val: `${degradationRatio}×`, unit: "" },
        { key: "Full History List Latency", val: listResult.avgMs.toFixed(2), unit: "ms" },
        {
          key: "Full History List p95",
          val: (listResult.p95Ms || listResult.avgMs).toFixed(2),
          unit: "ms",
        },
        { key: "History Query Throughput", val: Math.round(listResult.rps || 0), unit: "req/s" },
        {
          key: "Revision Isolation SLA",
          val:
            parseFloat(degradationRatio) <= 1.25
              ? "EXCELLENT (Zero-Tax)"
              : parseFloat(degradationRatio) <= 1.8
                ? "GOOD"
                : "DEGRADED",
          unit: "",
        },
      ],
      "Revision Stress Summary",
    );

    exportMetric("revision.clean_read_avg_ms", cleanReadResult.avgMs, "ms");
    exportMetric("revision.heavy_read_avg_ms", heavyReadResult.avgMs, "ms");
    exportMetric("revision.read_degradation_ratio", parseFloat(degradationRatio), "x");
    exportMetric("revision.history_list_avg_ms", listResult.avgMs, "ms");
    exportMetric("revision.history_list_p95_ms", listResult.p95Ms || listResult.avgMs, "ms");
    exportMetric("revision.history_list_rps", Math.round(listResult.rps || 0), "req/s");

    for (const r of results) exportResult(r);
  } catch (err: any) {
    logger.error(`Revision audit failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("Revision & History Stress Performance", async () => {
  await runRevisionAudit();
}, 900_000);
