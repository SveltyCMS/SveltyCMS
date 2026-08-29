/**
 * @file tests/benchmarks/concurrency-max.test.ts
 * @description Max Throughput — sliding-window queue, zero-allocation pipeline (Optimized)
 * @summary Eliminates wave synchronization barriers and measures exact per-request latency.
 */

import {
  test,
  setupBenchmarkServer,
  ensureStableTestData,
  forceRefreshServer,
  printTruthTable,
  printSummaryTable,
  exportResult,
  getDbType,
  benchmarkAuthHeaders,
  seedThroughputDocs,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";

const COLLECTION_ID = "BenchmarkStable";
const DOCS = 100;
const WRITES_PER_DOC = 10; // 1,000 total writes

let stopServer: (() => Promise<void>) | null = null;

async function run() {
  const server = await setupBenchmarkServer();
  stopServer = server.stop;
  const baseUrl = server.baseUrl;

  await ensureStableTestData();
  await forceRefreshServer(baseUrl);

  const H: HeadersInit = {
    "content-type": "application/json",
    ...benchmarkAuthHeaders(),
    "x-tenant-id": "global",
    connection: "keep-alive",
  };
  const dbType = getDbType();

  // ── SEED DOCS ─────────────────────────────────────────────────────────────
  console.log("   → Seeding 100 docs...");
  let docIds = (await seedThroughputDocs(DOCS).catch(() => [])) || [];

  if (!docIds || docIds.length < DOCS) {
    // Fallback deterministic IDs if seeder returns partial or empty set
    docIds = Array.from(
      { length: DOCS },
      (_, i) => `20000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    );
  }

  const seedPayload = JSON.stringify({ count: 0 });

  // Pre-seed batching in parallel chunks
  const seedBatchSize = 50;
  for (let i = 0; i < DOCS; i += seedBatchSize) {
    const chunk = docIds.slice(i, i + seedBatchSize);
    await Promise.all(
      chunk.map((id) =>
        fetch(`${baseUrl}/api/collections/${COLLECTION_ID}/${id}`, {
          method: "PATCH",
          headers: H,
          body: seedPayload,
        })
          .then((res) => res.arrayBuffer())
          .catch(() => {}),
      ),
    );
  }
  await forceRefreshServer(baseUrl);

  const totalWrites = DOCS * WRITES_PER_DOC;
  // Sliding-window worker limit to prevent socket/pool exhaustion on network DBs
  const MAX_CONCURRENCY = dbType === "sqlite" ? totalWrites : dbType === "mongodb" ? 100 : 40;

  console.log(
    `   → Blasting ${totalWrites} writes (concurrency=${MAX_CONCURRENCY}${
      dbType === "sqlite" ? ", full blast" : ", pool-safe sliding window"
    })...`,
  );

  let retryCount = 0;

  async function executeWrite(url: string, body: string, retries = 8, delay = 80): Promise<number> {
    const reqStart = performance.now();
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: H,
          body,
          signal: AbortSignal.timeout(30000),
        });

        // Drain stream immediately to release socket back to keep-alive pool
        await res.arrayBuffer().catch(() => {});

        if (res.ok) return performance.now() - reqStart;

        // Retry 429/502/503/504 pool pressure
        if ([429, 502, 503, 504].includes(res.status) && i < retries - 1) {
          retryCount++;
          await new Promise((r) => setTimeout(r, delay * (i + 1) + Math.random() * 40));
          continue;
        }

        throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        if (i === retries - 1) throw err;
        retryCount++;
        await new Promise((r) => setTimeout(r, delay + Math.random() * 50));
      }
    }
    throw new Error("Fetch failed after max retries");
  }

  // Pre-generate target URLs and reuse static string payload
  const incrementPayload = JSON.stringify({ field: "count", amount: 1 });
  const urls: string[] = [];
  for (let d = 0; d < DOCS; d++) {
    const targetUrl = `${baseUrl}/api/collections/${COLLECTION_ID}/${docIds[d]}/increment`;
    for (let w = 0; w < WRITES_PER_DOC; w++) {
      urls.push(targetUrl);
    }
  }

  // ── SLIDING WINDOW PIPELINE ───────────────────────────────────────────────
  const latencies: number[] = Array.from<number>({ length: totalWrites });
  let jobCursor = 0;
  let ok = 0;

  const t0 = performance.now();

  const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, totalWrites) }, async () => {
    while (true) {
      const idx = jobCursor++;
      if (idx >= totalWrites) break;
      try {
        latencies[idx] = await executeWrite(urls[idx], incrementPayload);
        ok++;
      } catch {
        latencies[idx] = -1;
      }
    }
  });

  await Promise.all(workers);
  const duration = performance.now() - t0;

  // ── STATS CALCULATION ─────────────────────────────────────────────────────
  const validLatencies = latencies.filter((l) => l >= 0).sort((a, b) => a - b);
  const avgMs = validLatencies.length
    ? validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length
    : 0;
  const p95Ms = validLatencies.length
    ? validLatencies[Math.floor(validLatencies.length * 0.95)]
    : 0;
  const rps = (totalWrites / duration) * 1000;

  console.log(
    `   → ${ok}/${totalWrites} OK, ${rps.toFixed(0)} RPS, ${duration.toFixed(0)}ms (p95: ${p95Ms.toFixed(1)}ms)`,
  );

  printTruthTable({
    title: `SVELTYCMS — MAX THROUGHPUT (${dbType.toUpperCase()})`,
    shortLabel: "Max",
    subtitle: `${totalWrites} writes × ${DOCS} docs • Sliding-window ${MAX_CONCURRENCY}c`,
    results: [
      {
        name: "Full Blast",
        avgMs,
        p95Ms,
        rps,
        layer: ok === totalWrites ? "✅" : "❌",
      },
    ],
  });

  printSummaryTable([
    { key: "Database", val: dbType.toUpperCase(), unit: "" },
    { key: "Total Writes", val: totalWrites, unit: "writes" },
    { key: "Duration", val: duration.toFixed(1), unit: "ms" },
    { key: "Throughput", val: rps.toFixed(0), unit: "RPS" },
    { key: "Latency (Avg)", val: avgMs.toFixed(2), unit: "ms" },
    { key: "Latency (P95)", val: p95Ms.toFixed(2), unit: "ms" },
    { key: "Success Rate", val: `${ok}/${totalWrites}`, unit: "" },
    { key: "Retries (429/503/504)", val: retryCount, unit: "" },
  ]);

  await exportResult({
    name: "Full Blast",
    avgMs,
    p95Ms,
    rps,
    errorCount: totalWrites - ok,
    status: ok === totalWrites ? "SUCCESS" : "FAILED",
  }).catch(() => {});

  if (ok !== totalWrites) throw new Error(`Lost ${totalWrites - ok} writes`);
}

test("Max Throughput — No Throttle", async () => {
  try {
    await run();
  } finally {
    if (stopServer) await stopServer().catch(() => {});
  }
}, 300_000);
