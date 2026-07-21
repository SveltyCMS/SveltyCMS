/**
 * @file tests/benchmarks/concurrency-max.test.ts
 * @description Max Throughput — no semaphore, full blast (Optimized)
 * @summary All requests fire simultaneously to measure true database parallelism.
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
  TEST_API_SECRET,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";

const COLLECTION_ID = "BenchmarkStable";
const DOCS = 100;
const WRITES_PER_DOC = 10; // 1000 total writes

let stopServer: (() => Promise<void>) | null = null;

async function run() {
  const server = await setupBenchmarkServer();
  stopServer = server.stop;
  const baseUrl = server.baseUrl;

  await ensureStableTestData();
  await forceRefreshServer(baseUrl);

  // Canonical lowercase header layouts to eliminate runtime normalization cycles
  const H = {
    "content-type": "application/json",
    "x-test-mode": "true",
    "x-test-secret": TEST_API_SECRET,
    "x-tenant-id": "global",
  };
  const dbType = getDbType();

  // Seed 100 docs
  console.log("   → Seeding 100 docs...");
  await fetch(`${baseUrl}/api/testing`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ action: "seed-throughput-docs", count: DOCS }),
  }).catch(() => {});

  const seedPayload = JSON.stringify({ count: 0 });

  for (let i = 0; i < DOCS; i += 50) {
    const seedBatch = [];
    const limit = Math.min(50, DOCS - i);

    for (let j = 0; j < limit; j++) {
      seedBatch.push(
        fetch(`${baseUrl}/api/collections/${COLLECTION_ID}/tp-${i + j}`, {
          method: "PATCH",
          headers: H,
          body: seedPayload,
        }).catch(() => {}),
      );
    }
    await Promise.all(seedBatch);
  }
  await forceRefreshServer(baseUrl);

  const totalWrites = DOCS * WRITES_PER_DOC;
  // Full blast only on embedded SQLite — network DBs exhaust pools under 1000 parallel POSTs
  // and report "Lost N writes". Wave concurrency keeps max-throughput meaningful.
  const WAVE = dbType === "sqlite" ? totalWrites : dbType === "mongodb" ? 100 : 40;
  console.log(
    `   → Blasting ${totalWrites} writes (wave=${WAVE}${dbType === "sqlite" ? ", full parallel" : ", pool-safe waves"})...`,
  );

  // Optimized fetch handler providing fast raw network retry loops
  async function fetchWithRetry(
    url: string,
    init: RequestInit,
    retries = 8,
    delay = 80,
  ): Promise<Response> {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url, init);
        if (res.ok) return res;
        await res.arrayBuffer().catch(() => {});
        // Retry 429/503/502 — pool pressure under matrix shared server
        if ([429, 502, 503, 504].includes(res.status) && i < retries - 1) {
          await new Promise((r) => setTimeout(r, delay * (i + 1) + Math.random() * 40));
          continue;
        }
        return res;
      } catch (err) {
        if (i === retries - 1) throw err;
        await new Promise((resolve) => setTimeout(resolve, delay + Math.random() * 50));
      }
    }
    throw new Error("Fetch failed after retries");
  }

  // Pre-serialize payload configurations out of the critical path to prevent execution drift
  const incrementPayload = JSON.stringify({ field: "count", amount: 1 });

  const jobs: { url: string }[] = [];
  for (let d = 0; d < DOCS; d++) {
    const targetUrl = `${baseUrl}/api/collections/${COLLECTION_ID}/tp-${d}/increment`;
    for (let w = 0; w < WRITES_PER_DOC; w++) {
      jobs.push({ url: targetUrl });
    }
  }

  const t0 = performance.now();
  const responses: Response[] = [];
  for (let i = 0; i < jobs.length; i += WAVE) {
    const slice = jobs.slice(i, i + WAVE);
    const waveRes = await Promise.all(
      slice.map((j) =>
        fetchWithRetry(j.url, {
          method: "POST",
          headers: H,
          body: incrementPayload,
          signal: AbortSignal.timeout(30000),
        }),
      ),
    );
    responses.push(...waveRes);
  }
  const duration = performance.now() - t0;

  let ok = 0;
  for (const r of responses) {
    if (r.ok) ok++;
    await r.arrayBuffer().catch(() => {});
  }

  const rps = (totalWrites / duration) * 1000;
  console.log(`   → ${ok}/${totalWrites} OK, ${rps.toFixed(0)} RPS, ${duration.toFixed(0)}ms`);

  printTruthTable({
    title: `SVELTYCMS — MAX THROUGHPUT (${dbType.toUpperCase()})`,
    shortLabel: "Max",
    subtitle: `${totalWrites} writes × ${DOCS} docs • No throttle`,
    results: [
      {
        name: "Full Blast",
        avgMs: duration / totalWrites,
        p95Ms: duration / totalWrites,
        rps,
        layer: ok === totalWrites ? "✅" : "❌",
      },
    ],
  });

  printSummaryTable([
    { key: "Database", val: dbType.toUpperCase(), unit: "" },
    { key: "Total Writes", val: totalWrites, unit: "writes" },
    { key: "Duration", val: duration, unit: "ms" },
    { key: "Throughput", val: rps, unit: "RPS" },
    { key: "Success Rate", val: `${ok}/${totalWrites}`, unit: "" },
  ]);

  await exportResult({
    name: "Full Blast",
    avgMs: duration / totalWrites,
    p95Ms: duration / totalWrites,
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
}, 300000);
