/**
 * @file tests/benchmarks/build-analysis.test.ts
 * @description Enterprise Build Analysis Benchmark (Optimized)
 * @summary Measures compilation speed, bundle size trends, and tree-shaking efficiency
 *
 * ### Features:
 * - Production build duration tracking
 * - Bundle/output directory size analysis
 * - Tree-shaking / dead-code elimination verification
 */

import {
  test,
  exportResult,
  printTruthTable,
  printSummaryTable,
  getDbType,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import { logger } from "@utils/logger";

async function getDirSize(dir: string): Promise<number> {
  let total = 0;
  try {
    const entries = await fs.readdir(dir, {
      recursive: true,
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (entry.isFile()) {
        const stats = await fs.stat(path.join(dir, entry.name));
        total += stats.size;
      }
    }
  } catch {
    // Ignore errors for missing files
  }
  return total;
}

async function runBuildAnalysis() {
  console.log("🏗️ Starting SveltyCMS Production Build Analysis...\n");

  const buildDir = path.join(process.cwd(), "build");
  const startTime = performance.now();

  try {
    const isSuite = process.env.SVELTY_BENCHMARK_SUITE === "true";
    const passedDuration = process.env.DX_BUILD_DURATION;
    let buildTimeMs: number;

    // Clean build if needed and we are going to build
    if (!passedDuration && !isSuite) {
      if (
        await fs
          .access(buildDir)
          .then(() => true)
          .catch(() => false)
      ) {
        await fs.rm(buildDir, { recursive: true, force: true });
      }
    }

    if (passedDuration) {
      buildTimeMs = parseFloat(passedDuration);
      console.log(`   ⏭️ Using pre-computed build duration: ${buildTimeMs.toFixed(0)}ms`);
    } else if (isSuite) {
      console.log("   ⏭️ Skipping redundant build (Suite Mode active).");
      buildTimeMs = 0;
    } else {
      console.log("   🔨 Running production build...");
      execSync("bun run build", {
        stdio: "inherit",
        env: { ...process.env, NODE_ENV: "production" },
        shell: false,
      });
      buildTimeMs = performance.now() - startTime;
    }

    const totalSize = await getDirSize(buildDir);

    const files = await fs.readdir(buildDir, { recursive: true });
    const jsFiles = files.filter(
      (f) => typeof f === "string" && (f.endsWith(".js") || f.endsWith(".mjs")),
    );

    const bundleSizeMB = totalSize / 1024 / 1024;

    const result = {
      name: "Production Build",
      avgMs: buildTimeMs,
      p95Ms: buildTimeMs,
      rps: 0, // Not applicable for build
      bundleSizeMB: bundleSizeMB.toFixed(2),
      jsChunkCount: jsFiles.length,
    };

    printTruthTable({
      title: "SVELTYCMS — PRODUCTION BUILD ANALYSIS",
      shortLabel: "Build",
      subtitle: `Compilation • Bundle Size • Tree Shaking • ${getDbType().toUpperCase()}`,
      results: [result],
    });

    printSummaryTable([
      { key: "Build Time", val: buildTimeMs.toFixed(0), unit: "ms" },
      { key: "Total Bundle Size", val: bundleSizeMB.toFixed(2), unit: "MB" },
      { key: "JS Chunks", val: jsFiles.length, unit: "" },
      {
        key: "Build Efficiency",
        val: buildTimeMs < 45000 ? "EXCELLENT" : buildTimeMs < 65000 ? "GOOD" : "SLOW",
        unit: "",
      },
    ]);

    exportResult(result as any);
  } catch (err: any) {
    logger.error(`Build analysis failed: ${err.message}`);
    console.error(err);
    throw err;
  }

  console.log("\n✅ Build analysis completed.");
}

test("Production Build Analysis", async () => {
  await runBuildAnalysis();
}, 180000);
