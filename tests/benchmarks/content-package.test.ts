/**
 * @file tests/benchmarks/content-package.test.ts
 * @description Content Package Import/Export Performance Benchmark (Direct Service Mode)
 * @summary Measures export/import throughput via ContentPackageService directly,
 *   following the same pattern as config-promotion.test.ts.
 *
 * ### Features:
 * - Export throughput at 100 entries
 * - Import throughput at 100 entries
 */

import {
  test,
  runBenchmark,
  setupBenchmarkServer,
  ensureStableTestData,
  printTruthTable,
  getDbType,
  TEST_API_SECRET,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";

const COLLECTION = "bench_migration_large";
const STATIC_CONTENT = "<p>Content package benchmark entry data.</p>".repeat(4);
let stopServer: (() => Promise<void>) | null = null;

async function runAudit() {
  console.log("\n🚀 Content Package Benchmark\n");
  const server = await setupBenchmarkServer();
  stopServer = server.stop;
  const baseUrl = server.baseUrl;
  await ensureStableTestData();

  const headers = Object.freeze({
    "content-type": "application/json",
    "x-test-mode": "true",
    "x-test-secret": TEST_API_SECRET,
    "x-tenant-id": "global",
  } as const);

  const dbType = getDbType();
  const allResults: any[] = [];

  // Seed 100 entries via bulk API (collection exists from ensureStableTestData)
  const count = 100;
  const ids: string[] = [];
  const runMark = Date.now();
  console.log("   → Seeding " + count + " entries...");

  const entries = Array.from({ length: count }, (_, i) => {
    const id = "pkg-" + runMark + "-" + i;
    ids.push(id);
    return {
      _id: id,
      title: "Entry " + i,
      content: STATIC_CONTENT,
      score: i % 100,
      category: i % 5 === 0 ? "featured" : "standard",
    };
  });

  const res = await fetch(baseUrl + "/api/collections/" + COLLECTION + "/bulk", {
    method: "POST",
    headers,
    body: JSON.stringify(entries),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error("Seed failed: " + res.status + " " + text.slice(0, 200));
  }
  console.log("   → Seeded " + ids.length + " entries.");

  // Export benchmark (direct service call)
  const exportResult = await runBenchmark({
    name: "Content Export (100 entries)",
    iterations: 5,
    warmupIterations: 2,
    runs: 1,
    concurrency: 1,
    measureMemory: true,
    silent: true,
    onIteration: async () => {
      await fetch(baseUrl + "/api/content-export/run", {
        method: "POST",
        headers,
        body: JSON.stringify({ collections: [COLLECTION], relationDepth: 1, includeMedia: false }),
      });
    },
  });
  allResults.push({ ...exportResult, layer: "Export" });

  // Import benchmark
  const pkgRes = await fetch(baseUrl + "/api/content-export/run", {
    method: "POST",
    headers,
    body: JSON.stringify({ collections: [COLLECTION], relationDepth: 1, includeMedia: false }),
  });
  const pkg = await pkgRes.json().catch(() => ({}));
  const importResult = await runBenchmark({
    name: "Content Import Plan (100 entries)",
    iterations: 3,
    warmupIterations: 1,
    runs: 1,
    concurrency: 1,
    measureMemory: true,
    silent: true,
    onIteration: async () => {
      await fetch(baseUrl + "/api/content-import/plan", {
        method: "POST",
        headers,
        body: JSON.stringify({
          collections: pkg.collections ? Object.keys(pkg.collections) : [COLLECTION],
          duplicateStrategy: "skip",
        }),
      });
    },
  });
  allResults.push({ ...importResult, layer: "Import" });

  // Cleanup
  for (const id of ids) {
    await fetch(baseUrl + "/api/collections/" + COLLECTION + "/" + id + "?permanent=true", {
      method: "DELETE",
      headers,
    }).catch(() => {});
  }

  printTruthTable({
    title: "CONTENT PACKAGE AUDIT (" + dbType.toUpperCase() + ")",
    shortLabel: "ContentPkg",
    subtitle: "Direct Service + REST Seed",
    results: allResults,
  });

  console.log("\n✅ Content Package benchmark completed.");
}

test("Content Package I/O Performance", async () => {
  try {
    await runAudit();
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}, 300_000);
