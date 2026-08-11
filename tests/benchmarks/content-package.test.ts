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
  benchmarkAuthHeaders,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";

const COLLECTION = "BenchmarkStable";
// 🛡️ HONEST COLLECTION: the old value (bench_migration_large) only exists when
// migration-scale ran first (matrix order) — standalone runs exported into a
// phantom collection: bulk seed succeeded (no schema check) but export/import
// 500'd with "Collection not found" and the test ignored the status codes.
// BenchmarkStable is provisioned by ensureStableTestData in every run.
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
    ...benchmarkAuthHeaders(),
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
      const res = await fetch(baseUrl + "/api/content-export/run", {
        method: "POST",
        headers,
        body: JSON.stringify({ collections: [COLLECTION], relationDepth: 1, includeMedia: false }),
      });
      if (!res.ok) throw new Error(`Content export failed: ${res.status}`);
      await res.arrayBuffer();
    },
  });
  allResults.push({ ...exportResult, layer: "Export" });

  // Import benchmark — the plan endpoint takes the EXPORTED ContentPackage
  // itself (manifest, collections, checksums), not a collection list.
  const pkgRes = await fetch(baseUrl + "/api/content-export/run", {
    method: "POST",
    headers,
    body: JSON.stringify({ collections: [COLLECTION], relationDepth: 1, includeMedia: false }),
  });
  if (!pkgRes.ok) throw new Error(`Package fetch failed: ${pkgRes.status}`);
  const pkgBody = (await pkgRes.json().catch(() => ({}))) as any;
  let pkg: any = pkgBody?.data || pkgBody;
  // Large exports (>1MB) return { jobId, sizeBytes } — download the package.
  if (pkg?.jobId) {
    const dlRes = await fetch(`${baseUrl}/api/content-export/download/${pkg.jobId}`, {
      headers,
    });
    if (!dlRes.ok) throw new Error(`Package download failed: ${dlRes.status}`);
    const dlBody = (await dlRes.json().catch(() => ({}))) as any;
    pkg = dlBody?.data || dlBody;
    process.stderr.write(
      `[CP-DEBUG] dl keys=${Object.keys(pkg).join(",")} hasManifest=${!!pkg.manifest}\n`,
    );
  }
  const importPlanBody = JSON.stringify({ ...pkg, duplicateStrategy: "skip" });
  process.stderr.write(`[CP-DEBUG] planBodyLen=${importPlanBody.length}\n`);
  const importResult = await runBenchmark({
    name: "Content Import Plan (100 entries)",
    iterations: 3,
    warmupIterations: 1,
    runs: 1,
    concurrency: 1,
    measureMemory: true,
    silent: true,
    onIteration: async () => {
      const res = await fetch(baseUrl + "/api/content-import/plan", {
        method: "POST",
        headers,
        body: importPlanBody,
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Import plan failed: ${res.status} ${errText.slice(0, 200)}`);
      }
      await res.arrayBuffer();
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
