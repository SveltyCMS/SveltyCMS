/**
 * @file tests/benchmarks/concurrency-throughput.test.ts
 * @description Multi-Document Concurrency Throughput (Optimized)
 * @summary Phased wave writes across 10 / 100 / 1000 documents with inline stream consumption.
 */

import {
  test,
  setupBenchmarkServer,
  ensureStableTestData,
  forceRefreshServer,
  printTruthTable,
  printSummaryTable,
  getDbType,
  benchmarkAuthHeaders,
  seedThroughputDocs,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";

const COLLECTION_ID = "BenchmarkStable";
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
  const dbLower = dbType.toLowerCase();

  // Adapter-specific concurrency and throttling parameters
  const BATCH = dbLower.includes("sqlite") ? 20 : dbLower.includes("mongodb") ? 100 : 50;
  const GAP_MS = dbLower.includes("sqlite") ? 25 : 0;
  console.log(`   → Throughput config: batch ${BATCH}, gap ${GAP_MS}ms (${dbType})`);

  const maxDocs = 1000;
  console.log(`   → Pre-seeding ${maxDocs} throughput documents...`);
  let docIds = (await seedThroughputDocs(maxDocs).catch(() => [])) || [];

  if (!docIds || docIds.length < maxDocs) {
    // Generate deterministic UUID fallback array to ensure zero undefined URL interpolation
    docIds = Array.from(
      { length: maxDocs },
      (_, i) => `20000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    );
  }

  const resetPayload = JSON.stringify({ count: 0 });
  const incrementPayload = JSON.stringify({ field: "count", amount: 1 });

  // ── RESET STATE (Drained Chunks) ──────────────────────────────────────────
  for (let i = 0; i < maxDocs; i += 50) {
    const chunk = docIds.slice(i, Math.min(i + 50, maxDocs));
    await Promise.all(
      chunk.map((id) =>
        fetch(`${baseUrl}/api/collections/${COLLECTION_ID}/${id}`, {
          method: "PATCH",
          headers: H,
          body: resetPayload,
        })
          .then((res) => res.arrayBuffer())
          .catch(() => {}),
      ),
    );
  }
  await forceRefreshServer(baseUrl);

  // ── EXPLICIT WRITE WORKER ────────────────────────────────────────────────
  async function executeIncrement(url: string): Promise<{ ok: boolean; latency: number }> {
    const start = performance.now();
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: H,
        body: incrementPayload,
        signal: AbortSignal.timeout(30000), // Independent per-request timeout
      });

      // Release socket back to pool immediately
      await res.arrayBuffer().catch(() => {});
      return { ok: res.ok, latency: performance.now() - start };
    } catch {
      return { ok: false, latency: performance.now() - start };
    }
  }

  const scales = [
    { label: "10 docs × 10 (100 writes)", docs: 10, perDoc: 10 },
    { label: "100 docs × 1 (100 writes)", docs: 100, perDoc: 1 },
    { label: "1000 docs × 1 (1000 writes)", docs: 1000, perDoc: 1 },
  ];

  const results: {
    label: string;
    rps: number;
    avgMs: number;
    p95Ms: number;
    total: number;
    ok: number;
  }[] = [];

  for (const s of scales) {
    const total = s.docs * s.perDoc;
    console.log(`   ═══ ${s.label} ─ ${total} writes ═══`);

    const targetUrls: string[] = [];
    for (let d = 0; d < s.docs; d++) {
      const targetUrl = `${baseUrl}/api/collections/${COLLECTION_ID}/${docIds[d]}/increment`;
      for (let w = 0; w < s.perDoc; w++) {
        targetUrls.push(targetUrl);
      }
    }

    const latencies: number[] = [];
    let ok = 0;
    const t0 = performance.now();

    // Phased wave execution with immediate drainage
    for (let i = 0; i < targetUrls.length; i += BATCH) {
      const waveUrls = targetUrls.slice(i, i + BATCH);
      const waveResults = await Promise.all(waveUrls.map((url) => executeIncrement(url)));

      for (const res of waveResults) {
        if (res.ok) ok++;
        latencies.push(res.latency);
      }

      if (i + BATCH < targetUrls.length && GAP_MS > 0) {
        await new Promise((r) => setTimeout(r, GAP_MS));
      }
    }

    const duration = performance.now() - t0;
    const rps = (total / duration) * 1000;

    latencies.sort((a, b) => a - b);
    const avgMs = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    const p95Ms = latencies.length ? latencies[Math.floor(latencies.length * 0.95)] : 0;

    results.push({ label: s.label, rps, avgMs, p95Ms, total, ok });
    console.log(
      `   → ${ok}/${total} OK, ${rps.toFixed(0)} RPS, avg: ${avgMs.toFixed(1)}ms, p95: ${p95Ms.toFixed(1)}ms (${
        ok === total ? "✅" : "❌"
      })`,
    );
  }

  // ── REPORTING ─────────────────────────────────────────────────────────────
  printTruthTable({
    title: `SVELTYCMS — THROUGHPUT SCALING (${dbType.toUpperCase()})`,
    shortLabel: "Scale",
    subtitle: "Wave-parallel PATCH-increment writes — loads labeled per phase",
    results: results.map((r) => ({
      name: r.label,
      avgMs: r.avgMs,
      p95Ms: r.p95Ms,
      rps: r.rps,
      layer: r.ok === r.total ? "✅" : "❌",
    })),
  });

  const sf =
    results[2] && results[0] ? (results[2].rps / Math.max(1, results[0].rps)).toFixed(1) : "N/A";

  printSummaryTable([
    { key: "Database", val: dbType.toUpperCase(), unit: "" },
    ...results.map((r) => ({
      key: `${r.label} Throughput`,
      val: r.rps.toFixed(0),
      unit: "RPS",
    })),
    ...results.map((r) => ({
      key: `${r.label} Latency (Avg/P95)`,
      val: `${r.avgMs.toFixed(1)} / ${r.p95Ms.toFixed(1)}`,
      unit: "ms",
    })),
    { key: "RPS @ 10× load ÷ baseline", val: `${sf}×`, unit: "" },
  ]);

  if (results.some((r) => r.ok !== r.total)) {
    throw new Error("Throughput failed due to lost updates or connection drops");
  }
}

test("Multi-Doc Throughput", async () => {
  try {
    await run();
  } finally {
    if (stopServer) await stopServer().catch(() => {});
  }
}, 600_000);
