/**
 * @file tests/benchmarks/concurrency-throughput.test.ts
 * @description Multi-Document Concurrency Throughput
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
const BATCH = 20;
const GAP_MS = 25;

let stopServer: (() => Promise<void>) | null = null;

async function run() {
  const server = await setupBenchmarkServer();
  stopServer = server.stop;
  const baseUrl = server.baseUrl;

  await ensureStableTestData();
  await forceRefreshServer(baseUrl);

  const H = {
    "Content-Type": "application/json",
    "x-test-mode": "true",
    "x-test-secret": TEST_API_SECRET,
    "x-tenant-id": "global",
  };
  const dbType = getDbType();

  // Pre-seed all the documents we'll need via the testing API
  const maxDocs = 1000;
  console.log(
    `   → Pre-seeding ${maxDocs} throughput documents via testing API...`,
  );
  await fetch(`${baseUrl}/api/testing`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ action: "seed-throughput-docs", count: maxDocs }),
  }).catch(() => {});

  // Reset all counts to 0
  for (let i = 0; i < maxDocs; i += 50) {
    const batch = [];
    for (let j = i; j < Math.min(i + 50, maxDocs); j++) {
      batch.push(
        fetch(`${baseUrl}/api/collections/${COLLECTION_ID}/tp-${j}`, {
          method: "PATCH",
          headers: H,
          body: JSON.stringify({ count: 0 }),
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

  const results: { label: string; rps: number; total: number; ok: number }[] =
    [];

  for (const s of scales) {
    const total = s.docs * s.perDoc;
    console.log(`   ═══ ${s.label} (${total} writes) ═══`);

    const t0 = performance.now();
    const tasks: (() => Promise<Response>)[] = [];
    for (let d = 0; d < s.docs; d++) {
      for (let w = 0; w < s.perDoc; w++) {
        const id = `tp-${d}`;
        tasks.push(() =>
          fetch(`${baseUrl}/api/collections/${COLLECTION_ID}/${id}/increment`, {
            method: "POST",
            headers: H,
            body: JSON.stringify({ field: "count", amount: 1 }),
            signal: AbortSignal.timeout(30000),
          }),
        );
      }
    }

    const out: Response[] = [];
    for (let i = 0; i < tasks.length; i += BATCH) {
      const wave = tasks.slice(i, i + BATCH);
      out.push(...(await Promise.all(wave.map((t) => t()))));
      if (i + BATCH < tasks.length)
        await new Promise((r) => setTimeout(r, GAP_MS));
    }

    const duration = performance.now() - t0;
    const ok = out.filter((r) => r.ok).length;
    const rps = (total / duration) * 1000;
    results.push({ label: s.label, rps, total, ok });
    console.log(
      `   → ${ok}/${total} OK, ${rps.toFixed(0)} RPS, ${ok === total ? "✅" : "❌"}`,
    );
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
    results[2] && results[0]
      ? (results[2].rps / Math.max(1, results[0].rps)).toFixed(1)
      : "N/A";
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
    throw new Error("Throughput failed");
}

test("Multi-Doc Throughput", async () => {
  try {
    await run();
  } finally {
    if (stopServer) await stopServer().catch(() => {});
  }
}, 600000);
