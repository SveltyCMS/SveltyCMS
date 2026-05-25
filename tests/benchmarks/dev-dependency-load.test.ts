/**
 * @file tests/benchmarks/dev-dependency-load.test.ts
 * @description Enterprise Developer Experience (DX) toolchain benchmark.
 * Measures the overhead of the build, sync, and lint toolchain to ensure peak developer velocity.
 */

import { spawnSync } from "node:child_process";

test("DX Toolchain Performance (Sync + Format + Lint)", async () => {
  console.log("🚀 Starting Developer Experience (DX) Audit...\n");

  const t0 = performance.now();

  // 1. Sync (Type Gen)
  const syncStart = performance.now();
  spawnSync("bun", ["run", "check"], { shell: true });
  const syncDuration = performance.now() - syncStart;

  // 2. Format check (vp fmt is used)
  const fmtStart = performance.now();
  spawnSync("bunx", ["vp", "fmt", "--check"], { shell: true });
  const fmtDuration = performance.now() - fmtStart;

  // 3. Lint check (oxlint is extremely fast)
  const lintStart = performance.now();
  spawnSync("bunx", ["oxlint", "src"], { shell: true });
  const lintDuration = performance.now() - lintStart;

  const totalDuration = performance.now() - t0;

  console.table([
    { Task: "Type Check (svelte-check)", Latency: `${syncDuration.toFixed(2)}ms` },
    { Task: "Fast Format (oxfmt)", Latency: `${fmtDuration.toFixed(2)}ms` },
    { Task: "Fast Lint (oxlint)", Latency: `${lintDuration.toFixed(2)}ms` },
    { Task: "Total Toolchain Overhead", Latency: `${totalDuration.toFixed(2)}ms` },
  ]);

  expect(totalDuration).toBeLessThan(60000); // 60s limit for DX gate

  console.log("\n✅ DX toolchain audit completed.");
}, 60000);
