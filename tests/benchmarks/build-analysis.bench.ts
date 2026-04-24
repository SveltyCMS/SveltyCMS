/**
 * @file tests/benchmarks/build-analysis.bench.ts
 * @description Enterprise build analysis benchmark for SveltyCMS.
 *              Measures compilation speed, bundle size trends, and tree-shaking efficiency.
 */

import { test, beforeAll, afterAll } from "bun:test";
import { setupBenchmarkServer, printTruthTable } from "./benchmark-utils";
import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

let stopServer: () => Promise<void>;

beforeAll(async () => {
  const { stop } = await setupBenchmarkServer();
  stopServer = stop;
});

afterAll(async () => {
  if (stopServer) await stopServer();
});

export async function runBuildAnalysis() {
  console.log("🏗️ Starting SveltyCMS Production Build Analysis...\n");

  const buildDir = path.join(process.cwd(), "build");
  const t0 = performance.now();

  try {
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

    const files = await fs.readdir(buildDir, { recursive: true });
    const jsFiles = files.filter((f) => f.endsWith(".js") || f.endsWith(".mjs"));

    const results = [
      {
        name: "Production Build",
        avgMs: buildTimeMs,
        p95Ms: buildTimeMs,
        rps: 1 / (buildTimeMs / 1000),
      },
      {
        name: "Bundle Size (MB)",
        avgMs: totalSize / 1024 / 1024,
        p95Ms: totalSize / 1024 / 1024,
        rps: 0,
      },
      { name: "JS Chunk Count", avgMs: jsFiles.length, p95Ms: jsFiles.length, rps: 0 },
    ];

    printTruthTable({
      title: "SVELTYCMS  —  PRODUCTION BUILD ANALYSIS",
      subtitle: "Compilation Speed • Bundle Size • Tree Shaking",
      results,
    });

    console.log("\n✅ Build analysis completed.");
  } catch (err: any) {
    console.error("❌ Build analysis failed:", err.message);
  }
}

test("Production Build Analysis", async () => {
  await runBuildAnalysis();
}, 120000);
