/**
 * @file tests/benchmarks/content-scan.bench.ts
 * @description Elite-grade benchmark for SveltyCMS Content Scan (self-healing collections discovery).
 * Measures filesystem + metadata processing performance with realistic multi-extension projects.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import { runBenchmark, exportResult, exportMetric, stabilize } from "./benchmark-utils";
import { logger } from "@utils/logger.server";
import fs from "node:fs/promises";
import path from "node:path";

const COLLECTIONS_DIR = path.resolve(process.cwd(), ".compiledCollections");
const TARGET_FILE_COUNT = parseInt(process.env.BENCHMARK_SCAN_FILES || "120", 10);

async function cleanupMockFiles() {
  const files = await fs.readdir(COLLECTIONS_DIR).catch(() => []);
  for (const f of files) {
    if (f.startsWith("mock_")) {
      await fs.rm(path.join(COLLECTIONS_DIR, f), { recursive: true, force: true });
    }
  }
}

async function prepareRealisticScanEnvironment() {
  console.log(`📂 Preparing elite content scan environment (${TARGET_FILE_COUNT} files)...`);

  await fs.mkdir(COLLECTIONS_DIR, { recursive: true });

  for (let i = 0; i < TARGET_FILE_COUNT; i++) {
    const ext = i % 3 === 0 ? "ts" : i % 3 === 1 ? "json" : "js";
    const subDir = i % 5 === 0 ? "nested" : "";
    const finalDir = path.join(COLLECTIONS_DIR, subDir);
    if (subDir) await fs.mkdir(finalDir, { recursive: true });

    const fileName = `mock_collection_${i}.${ext}`;
    const data = {
      _id: `mock_collection_${i}`,
      name: `Mock Collection ${i}`,
      fields: [{ name: "title", type: "text" }],
    };

    const content =
      ext === "json"
        ? JSON.stringify(data, null, 2)
        : `export default ${JSON.stringify(data, null, 2)};`;

    await fs.writeFile(path.join(finalDir, fileName), content, "utf-8");
  }

  console.log(`   ✅ ${TARGET_FILE_COUNT} multi-extension mock files ready.`);
}

test("Content Scan Performance (Self-Healing Collections)", async () => {
  console.log("🚀 Starting Elite SveltyCMS Content Scan Benchmark...\n");

  logger.level = "silent";

  await cleanupMockFiles(); // Start clean
  await prepareRealisticScanEnvironment();

  const { contentSystem } = await import("@src/content");
  const { cacheService } = await import("@src/databases/cache/cache-service");

  const ITERATIONS = 800;
  const WARMUP = 80;
  const RUNS = 4;

  console.log(`🔬 Running content scan audit (${ITERATIONS} iterations)...`);

  const scanResult = await runBenchmark({
    name: "Content Scan (Self-Healing)",
    iterations: ITERATIONS,
    warmupIterations: WARMUP,
    concurrency: 1,
    runs: RUNS,
    trimOutliers: "iqr",
    measureMemory: true,
    onSetup: async () => {
      // Clear schema cache to force re-scan
      await cacheService.clearByPattern("schema:*", null);
      if ((contentSystem as any).clearCache) await (contentSystem as any).clearCache();
      await stabilize();
    },
    onIteration: async () => {
      const collections = await contentSystem.scanForCollections();
      if (!Array.isArray(collections) || collections.length === 0) {
        throw new Error("Scan returned empty or invalid result");
      }
    },
    silent: true,
  });

  logger.level = "info";

  // ===================================================================
  // Summary
  // ===================================================================
  console.log("\n" + "=".repeat(120));
  console.log("   📊 SVELTYCMS CONTENT SCAN PERFORMANCE AUDIT");
  console.log(
    `   High-Fidelity • ${TARGET_FILE_COUNT} collections • Multi-Extension • Automated Hygiene`,
  );
  console.log("=".repeat(120));

  console.log(`| ${"Metric".padEnd(28)} | ${"Value".padEnd(22)} |`);
  console.log("|" + "-".repeat(28 + 22 + 6) + "|");

  console.log(
    `| Average Duration           | ${scanResult.avgMs.toFixed(3)} ms (±${scanResult.marginOfError.toFixed(3)}) |`,
  );
  console.log(`| p95 Duration               | ${scanResult.p95Ms.toFixed(3)} ms |`);
  console.log(`| p99 Duration               | ${scanResult.p99Ms.toFixed(3)} ms |`);
  console.log(`| Throughput                 | ${scanResult.rps.toFixed(1)} scans/sec |`);
  console.log(`| RSS Memory Delta           | ${scanResult.rssDelta?.toFixed(2) ?? "—"} MB |`);
  console.log("=".repeat(120));

  console.log(`\n✨ Insights:`);
  console.log(
    `   • Scanning ${TARGET_FILE_COUNT} collections takes ~${scanResult.avgMs.toFixed(2)} ms on average`,
  );
  console.log(`   • Memory delta shows schema parsing and metadata index overhead`);

  // Structured Matrix Exports (Infrastructure v2)
  exportMetric("internals.scan.avg", scanResult.avgMs, "ms", {
    p95: scanResult.p95Ms,
    fileCount: TARGET_FILE_COUNT,
  });

  exportResult({ ...scanResult, fileCount: TARGET_FILE_COUNT, scanType: "self-healing" });

  // Cleanup after benchmark
  await cleanupMockFiles();
  console.log("\n✅ Content Scan benchmark completed and cleaned up.");
}, 300000);
