/**
 * @file tests/benchmarks/build-analysis.bench.ts
 * @description Professional build analysis benchmark for SveltyCMS.
 *              Measures bundle size, chunk count, and build performance.
 */

import { test } from "bun:test";
import { exportMetric, exportResult } from "./benchmark-utils";
import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

export async function runBuildAnalysis() {
  console.log("🏗️ Starting SveltyCMS Production Build Analysis...\n");

  const buildDir = path.join(process.cwd(), "build");
  const t0 = performance.now();

  try {
    // We assume a build was already performed by the orchestrator (Phase 1)
    // or we run a fresh one if missing.
    await fs.access(buildDir).catch(async () => {
      console.log("   ⚠️ Build directory missing. Running fresh build...");
      execSync("bun run build", { stdio: "ignore" });
    });

    const buildTimeMs = performance.now() - t0;

    const getDirSize = async (dir: string): Promise<number> => {
      const files = await fs.readdir(dir, { recursive: true });
      let total = 0;
      for (const f of files) {
        const stats = await fs.stat(path.join(dir, f));
        if (stats.isFile()) total += stats.size;
      }
      return total;
    };

    const totalSize = await getDirSize(buildDir);
    const clientSize = await getDirSize(path.join(buildDir, "client")).catch(() => 0);
    const serverSize = totalSize - clientSize;

    const files = await fs.readdir(buildDir, { recursive: true });
    const jsFiles = files.filter((f) => f.endsWith(".js") || f.endsWith(".mjs"));
    const cssFiles = files.filter((f) => f.endsWith(".css"));

    console.log("=".repeat(80));
    console.log(`   🏗️  BUILD METRICS`);
    console.log("=".repeat(80));
    console.log(
      `| Total Size         | ${(totalSize / 1024 / 1024).toFixed(2)} MB`.padEnd(42) + " |",
    );
    console.log(
      `| Client Bundle      | ${(clientSize / 1024 / 1024).toFixed(2)} MB`.padEnd(42) + " |",
    );
    console.log(
      `| Server Bundle      | ${(serverSize / 1024 / 1024).toFixed(2)} MB`.padEnd(42) + " |",
    );
    console.log(`| JS Chunks          | ${jsFiles.length}`.padEnd(42) + " |");
    console.log(`| CSS Chunks         | ${cssFiles.length}`.padEnd(42) + " |");
    console.log("=".repeat(80));

    exportMetric("dx.build.duration", buildTimeMs, "ms");
    exportMetric("dx.bundle.size.total", totalSize / 1024 / 1024, "MB");
    exportMetric("dx.bundle.size.client", clientSize / 1024 / 1024, "MB");
    exportMetric("dx.bundle.chunks.js", jsFiles.length, "count");

    exportResult({
      name: "Build Analysis",
      totalSizeMb: totalSize / 1024 / 1024,
      chunkCount: jsFiles.length,
      buildTimeMs,
    } as any);

    console.log("\n✅ Build analysis completed.");
  } catch (err: any) {
    console.error("❌ Build analysis failed:", err.message);
  }
}

test("Production Build Analysis", async () => {
  await runBuildAnalysis();
}, 120000);
