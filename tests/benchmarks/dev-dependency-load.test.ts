/**
 * @file tests/benchmarks/dev-dependency-load.test.ts
 * @description Developer Experience (DX) Toolchain Benchmark (Optimized)
 * @summary Measures type-check, format, and lint toolchain overhead for peak developer velocity
 *
 * ### Features:
 * - Type check (svelte-check) latency
 * - Fast format (oxfmt) overhead
 * - Fast lint (oxlint) cold-start timing
 */

import { spawnSync } from "node:child_process";
import { test, expect } from "vitest";
import path from "node:path";

test("DX Toolchain Performance (Sync + Format + Lint)", async () => {
  console.log("🚀 Starting Developer Experience (DX) Audit...\n");

  // Pre-resolve absolute bin targets to eliminate dynamic resolution overhead
  const binDir = path.resolve(process.cwd(), "node_modules", ".bin");
  const oxlintExec = path.join(binDir, "oxlint");

  const t0 = performance.now();

  // 1. Format auto-fix — ensures generated doc drift is corrected before check
  const fmtStart = performance.now();
  const fmtProc = spawnSync("bun", ["run", "format"], { shell: false });
  const fmtDuration = performance.now() - fmtStart;

  if (fmtProc.status !== 0) {
    throw new Error(`Formatter failed with code ${fmtProc.status}.`);
  }

  const syncStart = performance.now();
  const checkProc = spawnSync("bun", ["run", "check"], { shell: false });
  const syncDuration = performance.now() - syncStart;

  if (checkProc.status !== 0) {
    throw new Error(
      `Type Check failed with code ${checkProc.status}. Stderr: ${checkProc.stderr?.toString()}`,
    );
  }

  // 3. Ultra-fast rust-based linting execution trace
  const lintStart = performance.now();
  const lintProc = spawnSync(oxlintExec, ["src"], { shell: false });
  const lintDuration = performance.now() - lintStart;

  if (lintProc.status !== 0) {
    throw new Error(`Linter compilation check failed with code ${lintProc.status}.`);
  }

  const totalDuration = performance.now() - t0;

  console.table([
    { Task: "Fast Format (oxfmt)", Latency: `${fmtDuration.toFixed(2)}ms` },
    {
      Task: "Type Check (svelte-check)",
      Latency: `${syncDuration.toFixed(2)}ms`,
    },
    { Task: "Fast Lint (oxlint)", Latency: `${lintDuration.toFixed(2)}ms` },
    {
      Task: "Total Toolchain Overhead",
      Latency: `${totalDuration.toFixed(2)}ms`,
    },
  ]);

  // Ensure total toolchain runtime complies with performance requirements
  expect(totalDuration).toBeLessThan(60000); // 60s limit for DX gate
}, 60000);
