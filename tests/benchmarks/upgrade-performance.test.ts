/**
 * @file tests/benchmarks/upgrade-performance.test.ts
 * @description Professional benchmark for SveltyCMS Upgrade CLI and Codemods.
 * Measures real-world execution time of upgrade dry-run and schema migration codemods.
 */

import { test } from "bun:test";
import { runBenchmark, exportResult } from "./benchmark-utils";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";

async function runCliCommand(command: string, args: string[], cwd?: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const start = performance.now();

    const proc = spawn(command, args, {
      stdio: "inherit", // Show output during benchmark (helpful for debugging)
      shell: true,
      cwd,
      env: {
        ...process.env,
        NODE_ENV: "test",
        BUN_TEST_MODE: "true",
        // Disable any interactive prompts or telemetry
        UPGRADE_DRY_RUN: "true",
      },
    });

    proc.on("error", reject);

    proc.on("close", (code) => {
      const duration = performance.now() - start;
      if (code === 0 || code === 130) {
        // 130 = SIGINT (sometimes expected in dry-run)
        resolve(duration);
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });
  });
}

test("Upgrade CLI & Codemod Performance", async () => {
  console.log("📦 Starting SveltyCMS Upgrade & Codemod Performance Benchmark...\n");

  const ITERATIONS = 8; // CLI tools are heavy — fewer iterations
  const WARMUP = 2;

  // ========================
  // 1. Upgrade CLI Dry Run
  // ========================
  console.log("🔄 Benchmarking: Upgrade CLI (Dry Run)...");

  const upgradeResult = await runBenchmark({
    name: "Upgrade CLI: Dry Run (--dry-run --skip-tests --skip-db)",
    iterations: ITERATIONS,
    warmupIterations: WARMUP,
    concurrency: 1, // CLI tools must run serially
    onIteration: async () => {
      await runCliCommand("bun", [
        "run",
        "scripts/upgrade.ts",
        "--dry-run",
        "--skip-tests",
        "--skip-db",
        "--quiet", // reduce noise if your script supports it
      ]);
    },
  });

  await new Promise((r) => setTimeout(r, 500)); // small cooldown

  // ========================
  // 2. Schema Migration Codemod (TS-Morph)
  // ========================
  console.log("🔧 Benchmarking: 2026 Schema Migration Codemod (TS-Morph)...");

  const codemodResult = await runBenchmark({
    name: "Codemod: 2026 Migrate Schema (TS-Morph)",
    iterations: ITERATIONS,
    warmupIterations: WARMUP,
    concurrency: 1,
    onIteration: async () => {
      await runCliCommand("bun", [
        "run",
        "scripts/codemods/2026-migrate-schema.ts",
        "--dry-run", // safer for benchmarking
      ]);
    },
  });

  // ========================
  // Summary
  // ========================
  console.log("\n" + "=".repeat(85));
  console.log("📊 UPGRADE & CODEMOD PERFORMANCE SUMMARY");
  console.log("=".repeat(85));

  console.table([
    {
      Tool: "Upgrade CLI (Dry Run)",
      "Avg (ms)": upgradeResult.avgMs.toFixed(1),
      "p95 (ms)": upgradeResult.p95Ms.toFixed(1),
      "Total Runs": upgradeResult.iterations,
    },
    {
      Tool: "Schema Codemod (TS-Morph)",
      "Avg (ms)": codemodResult.avgMs.toFixed(1),
      "p95 (ms)": codemodResult.p95Ms.toFixed(1),
      "Total Runs": codemodResult.iterations,
    },
  ]);

  console.log(
    `\nNote: These are heavy CLI operations. Lower numbers = better DX for users upgrading.`,
  );

  // Export results
  exportResult(upgradeResult, "upgrade-cli-dry-run.json");
  exportResult(codemodResult, "codemod-2026-schema.json");

  const combinedReport = {
    name: "SveltyCMS Upgrade & Codemod Performance",
    timestamp: new Date().toISOString(),
    upgradeCli: {
      avgMs: upgradeResult.avgMs,
      p95Ms: upgradeResult.p95Ms,
      rps: upgradeResult.rps,
    },
    codemod: {
      avgMs: codemodResult.avgMs,
      p95Ms: codemodResult.p95Ms,
      rps: codemodResult.rps,
    },
  };

  const resultsDir =
    process.env.RESULTS_DIR || path.join(process.cwd(), "tests/benchmarks/results");
  await fs.mkdir(resultsDir, { recursive: true });
  await fs.writeFile(
    path.join(resultsDir, "upgrade-performance.json"),
    JSON.stringify(combinedReport, null, 2),
  );

  console.log(`\n💾 Combined results saved to upgrade-performance.json`);
}, 1200000); // 20-minute timeout because CLI tools can be slow
