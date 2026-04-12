/**
 * @file tests/benchmarks/content-scan.bench.ts
 * @description Professional benchmark for SveltyCMS Content Scan (self-healing collections discovery).
 */

import { test } from "bun:test";
import { runBenchmark, exportResult } from "./benchmark-utils";
import fs from "node:fs/promises";
import path from "node:path";

const COLLECTIONS_DIR = path.resolve(process.cwd(), ".compiledCollections");

async function scanFilesRecursively(dir: string, ext: string = ".js"): Promise<string[] | any> {
  const exists = await fs.stat(dir).catch(() => null);
  if (!exists) return [];

  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const nested = await scanFilesRecursively(fullPath, ext);
      if (nested) files.push(...nested);
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      files.push(fullPath);
    }
  }

  return files;
}

test("Content Scan Performance (Self-Healing Collections)", async () => {
  console.log("🚀 Starting professional SveltyCMS Content Scan Benchmark...\n");

  if (!(await fs.stat(COLLECTIONS_DIR).catch(() => null))) {
    console.warn(`⚠️ Directory not found: ${COLLECTIONS_DIR}`);
    console.log("   Creating empty directory for benchmark...");
    await fs.mkdir(COLLECTIONS_DIR, { recursive: true });
  }

  const iterations = 50;
  const warmupIterations = 10;

  const scanResult = await runBenchmark({
    name: "Self-Healing Content Scan",
    iterations,
    warmupIterations,
    concurrency: 1, // Pure latency for filesystem scans
    runs: 3,
    onIteration: async () => {
      const files = await scanFilesRecursively(COLLECTIONS_DIR);
      if (process.env.TEST_MODE === "true" && files.length === 0) {
        // Only warn in test mode since empty directory is possible
      }
    },
  });

  // Final clean summary
  console.log("\n" + "=".repeat(65));
  console.log("   📊 SveltyCMS CONTENT SCAN SUMMARY");
  console.log("=".repeat(65));
  console.log(`Average duration      : ${scanResult.avgMs.toFixed(2)} ms`);
  console.log(`p95 duration          : ${scanResult.p95Ms.toFixed(2)} ms`);
  console.log(`Throughput            : ${scanResult.rps.toFixed(1)} scans/sec`);
  console.log(`Std Deviation         : ${scanResult.stdDev.toFixed(2)} ms`);
  console.log("=".repeat(65) + "\n");

  exportResult(scanResult);
}, 300000);
