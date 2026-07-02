/**
 * @file tests/benchmarks/concurrency-throughput.test.ts
 * @description Multi-Document Concurrency Throughput (Optimized)
 * @summary 100 writes across 10, 100, 1000 docs. Same work, different parallelism.
 * SQLite flat-lines (file lock); PG/MongoDB scale with doc count.
 */

import {
  test,
  setupBenchmarkServer,
  ensureStableTestData,
  forceRefreshServer,
  printTruthTable,
  printSummaryTable,
  getDbType,
  TEST_API_SECRET,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";

const COLLECTION_ID = "BenchmarkStable";
let BATCH = 20;
let GAP_MS = 25;

let stopServer: (() => Promise<void>) | null = null;

async function run() {
  const server = await setupBenchmarkServer();
  stopServer = server.stop;
  const baseUrl = server.baseUrl;

  await ensureStableTestData();
  await forceRefreshServer(baseUrl);

  // Canonical lowercase header layout mapping
  const H = {
    "content-type": "application/json",
    "x-test-mode": "true",
    "x-test-secret": TEST_API_SECRET,
    "x-tenant-id": "global",
  };
  const dbType = getDbType();

  const dbLower = dbType.toLowerCase();
  BATCH = dbLower.includes("sqlite") ? 20 : dbLower.includes("mongodb") ? 100 : 50;
  GAP_MS = dbLower.includes("sqlite") ? 25 : 0;
  console.log(`   → Throughput config: batch ${BATCH}, gap ${GAP_MS}ms (${dbType})`);

  const maxDocs = 1000;
  console.log(`   → Pre-seeding ${maxDocs} throughput documents via testing API...`);
  await fetch(`${baseUrl}/api/testing`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ action: "seed-throughput-docs", count: maxDocs }),
  }).catch(() => {});

  // Pre-serialize common payloads out of time-sensitive paths
  const resetPayload = JSON.stringify({ count: 0 });
  const incrementPayload = JSON.stringify({ field: "count", amount: 1 });

  // Reset all counts to 0
  for (let i = 0; i < maxDocs; i += 50) {
    const batch = [];
    const limit = Math.min(i + 50, maxDocs);
    for (let j = i; j < limit; j++) {
      batch.push(
        fetch(`${baseUrl}/api/collections/${COLLECTION_ID}/tp-${j}`, {
          method: "PATCH",
          headers: H,
          body: resetPayload,
        }).catch(() => {}),
      );
    }
    await Promise.all(batch);
  }
  await forceRefreshServer(baseUrl);

  const scales = [
    { label: "10 docs × 10", docs: 10, perDoc: 10 },
    { label: "100 docs × 1", docs: 100, perDoc: 1 },
    { label: "1000 docs × 1", docs: 1000, perDoc: 1 },
  ];

  const results: { label: string; rps: number; total: number; ok: number }[] = [];

  for (const s of scales) {
    const total = s.docs * s.perDoc;
    console.log(`   ═══ ${s.label} (${total} writes) ═══`);

    const tasks: (() => Promise<Response>)[] = [];
    for (let d = 0; d < s.docs; d++) {
      const targetUrl = `${baseUrl}/api/collections/${COLLECTION_ID}/tp-${d}/increment`;
      const timeoutSignal = AbortSignal.timeout(30000);

      for (let w = 0; w < s.perDoc; w++) {
        tasks.push(() =>
          fetch(targetUrl, {
            method: "POST",
            headers: H,
            body: incrementPayload,
            signal: timeoutSignal,
          }),
        );
      }
    }

    const out: Response[] = [];
    const t0 = performance.now();

    // Phased batch/wave processing loop execution
    for (let i = 0; i < tasks.length; i += BATCH) {
      const wave = tasks.slice(i, i + BATCH);
      const waveResponses = await Promise.all(wave.map((thunk) => thunk()));

      for (const res of waveResponses) {
        out.push(res);
      }

      if (i + BATCH < tasks.length && GAP_MS > 0) {
        await new Promise((r) => setTimeout(r, GAP_MS));
      }
    }

    const duration = performance.now() - t0;

    let ok = 0;
    for (const res of out) {
      if (res.ok) ok++;
      // Drain buffers immediately to prevent raw socket exhaustion
      await res.arrayBuffer().catch(() => {});
    }

    const rps = (total / duration) * 1000;
    results.push({ label: s.label, rps, total, ok });
    console.log(`   → ${ok}/${total} OK, ${rps.toFixed(0)} RPS, ${ok === total ? "✅" : "❌"}`);
  }

  printTruthTable({
    title: `SVELTYCMS — THROUGHPUT SCALING (${dbType.toUpperCase()})`,
    shortLabel: "Scale",
    subtitle: "100+ writes across N documents",
    results: results.map((r) => ({
      name: r.label,
      avgMs: 0,
      p95Ms: 0,
      rps: r.rps,
      layer: r.ok === r.total ? "✅" : "❌",
    })),
  });

  const sf =
    results[2] && results[0] ? (results[2].rps / Math.max(1, results[0].rps)).toFixed(1) : "N/A";

  printSummaryTable([
    { key: "Database", val: dbType.toUpperCase(), unit: "" },
    ...results.map((r) => ({
      key: r.label + " RPS",
      val: r.rps,
      unit: "req/s",
    })),
    { key: "Scaling (1000÷10)", val: sf + "×", unit: "" },
  ]);

  if (results.some((r) => r.ok !== r.total))
    throw new Error("Throughput failed due to lost updates");
}

test("Multi-Doc Throughput", async () => {
  try {
    await run();
  } finally {
    if (stopServer) await stopServer().catch(() => {});
  }
}, 600000);
