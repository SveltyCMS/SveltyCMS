/**
 * @file tests/benchmarks/content-scan.bench.ts
 * @description High-fidelity benchmark for SveltyCMS Content Scan (self-healing collections discovery).
 *              Measures filesystem + metadata processing performance under realistic conditions.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import { runBenchmark, exportResult } from "./benchmark-utils";
import { logger } from "@utils/logger.server";
import fs from "node:fs/promises";
import path from "node:path";

const COLLECTIONS_DIR = path.resolve(process.cwd(), ".compiledCollections");

async function prepareRealisticScanEnvironment() {
  console.log("📂 Preparing realistic content scan environment...");

  // Ensure directory exists
  await fs.mkdir(COLLECTIONS_DIR, { recursive: true });

  // Create a realistic number of fake collection files (idempotent)
  const TARGET_FILE_COUNT = 120; // typical medium-large project

  const existingFiles = await fs.readdir(COLLECTIONS_DIR).catch(() => []);
  const currentCount = existingFiles.filter(
    (f) => f.endsWith(".js") && f.startsWith("mock_"),
  ).length;

  if (currentCount < TARGET_FILE_COUNT) {
    console.log(`   Creating ${TARGET_FILE_COUNT - currentCount} mock collection files...`);
    for (let i = currentCount; i < TARGET_FILE_COUNT; i++) {
      const fakeContent = `// Mock compiled collection ${i}\nexport default ${JSON.stringify(
        {
          _id: `mock_collection_${i}`,
          name: `Mock Collection ${i}`,
          fields: [
            { name: "title", type: "text" },
            { name: "description", type: "text" },
          ],
        },
        null,
        2,
      )};`;

      await fs.writeFile(
        path.join(COLLECTIONS_DIR, `mock_collection_${i}.js`),
        fakeContent,
        "utf-8",
      );
    }
  }

  console.log(`   ✅ ${TARGET_FILE_COUNT} mock collection files ready for scanning.`);
}

test("Content Scan Performance (Self-Healing Collections)", async () => {
  console.log("🚀 Starting High-Fidelity SveltyCMS Content Scan Benchmark...\n");

  logger.level = "silent";

  await prepareRealisticScanEnvironment();

  const ITERATIONS = 800; // Much higher for better statistics
  const WARMUP = 150;
  const RUNS = 4; // Multiple runs for stability

  console.log(`🔬 Running content scan benchmark (${ITERATIONS} iterations, ${RUNS} runs)...`);

  const scanResult = await runBenchmark({
    name: "Content Scan (Self-Healing Collections)",
    iterations: ITERATIONS,
    warmupIterations: WARMUP,
    concurrency: 1, // Pure latency for I/O bound operation
    runs: RUNS,
    trimOutliers: "iqr",
    measureMemory: true,
    onSetup: async () => {
      // Clear in-memory cache before each run to ensure direct FS scan
      const { cacheService } = await import("@src/databases/cache/cache-service");

      // We clear precisely the Schema category cache to force disk re-scan
      await cacheService.clearByPattern("schema:*", null);
    },
    onIteration: async () => {
      // Call the REAL content scan facade
      const { contentSystem } = await import("@src/content");
      const collections = await contentSystem.scanForCollections();

      if (!Array.isArray(collections)) {
        throw new Error("Content scan did not return expected array");
      }
    },
    silent: true,
  });

  logger.level = "info";

  // ===================================================================
  // Professional Summary
  // ===================================================================
  console.log("\n" + "=".repeat(120));
  console.log("   📊 SVELTYCMS CONTENT SCAN PERFORMANCE AUDIT");
  console.log("   High-Fidelity • Realistic Dataset (120 collections) • IQR + MoE");
  console.log("=".repeat(120));

  console.log(`| ${"Metric".padEnd(28)} | ${"Value".padEnd(22)} |`);
  console.log("|" + "-".repeat(28 + 22 + 6) + "|");

  console.log(
    `| Average Duration           | ${scanResult.avgMs.toFixed(3)} ms (±${scanResult.marginOfError.toFixed(3)}) |`,
  );
  console.log(`| p95 Duration               | ${scanResult.p95Ms.toFixed(3)} ms |`);
  console.log(`| p99 Duration               | ${scanResult.p99Ms.toFixed(3)} ms |`);
  console.log(`| Std Deviation              | ${scanResult.stdDev.toFixed(3)} ms |`);
  console.log(`| Throughput                 | ${scanResult.rps.toFixed(1)} scans/sec |`);
  console.log(`| RSS Memory Delta           | ${scanResult.rssDelta?.toFixed(2) ?? "—"} MB |`);
  console.log("=".repeat(120));

  console.log(`\n✨ Insights:`);
  console.log(
    `   • Scanning ${120} collections takes ~${scanResult.avgMs.toFixed(2)} ms on average`,
  );
  console.log(`   • Total Cold Boot Throughput: ${scanResult.rps.toFixed(1)} operations/second`);
  console.log(`   • Memory delta indicates the impact of schema parsing and metadata caching`);

  exportResult(scanResult);

  console.log("\n✅ Content Scan benchmark completed.");
}, 300000);
