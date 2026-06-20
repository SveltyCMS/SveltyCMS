/**
 * @file scripts/audit-benchmarks.ts
 * @description Runs all benchmarks one by one and logs detailed results.
 */

import { spawnSync } from "child_process";
import chalk from "chalk";

const benchmarks = [
  "tests/benchmarks/admin-ux-vitality.test.ts",
  "tests/benchmarks/ai-performance.test.ts",
  "tests/benchmarks/api-latency.test.ts",
  "tests/benchmarks/auth-performance.test.ts",
  "tests/benchmarks/cache-performance.test.ts",
  "tests/benchmarks/chaos-resilience.test.ts",
  "tests/benchmarks/circuit-breaker-failover.test.ts",
  "tests/benchmarks/cold-start-phased.test.ts",
  "tests/benchmarks/concurrency-race.test.ts",
  "tests/benchmarks/content-scan.test.ts",
  "tests/benchmarks/content-incremental-reload.test.ts",
  "tests/benchmarks/dev-dependency-load.test.ts",
  "tests/benchmarks/entry-edit-hydration.test.ts",
  "tests/benchmarks/failure-propagation.test.ts",
  "tests/benchmarks/hooks-performance.test.ts",
  "tests/benchmarks/index-pressure.test.ts",
  "tests/benchmarks/migration-scale.test.ts",
  "tests/benchmarks/mixed-workload.test.ts",
  "tests/benchmarks/openapi-performance.test.ts",
  "tests/benchmarks/relational-performance.test.ts",
  "tests/benchmarks/right-to-be-forgotten-audit.test.ts",
  "tests/benchmarks/state-machine-transition.test.ts",
  "tests/benchmarks/telemetry-performance.test.ts",
  "tests/benchmarks/temporal-integrity.test.ts",
  "tests/benchmarks/transaction-acid.test.ts",
  "tests/benchmarks/truth-latency.test.ts",
  "tests/benchmarks/widget-performance.test.ts",
];

const results: any[] = [];

console.log(
  chalk.bold.blue(
    "\n🚀 SveltyCMS Systematic Benchmark Audit (Memory Leak & Seeding Fix Verification)\n",
  ),
);

for (const b of benchmarks) {
  process.stdout.write(chalk.gray(`Running [${b}] ... `));

  const start = Date.now();
  const res = spawnSync("bun", ["test", b], {
    encoding: "utf-8",
    shell: true,
    env: {
      ...process.env,
      // 🚀 DATABASE-AGNOSTIC: Inherit DB_TYPE from environment (set by --db flag).
      // Falls back to "sqlite" only if no DB_TYPE is set.
      DB_TYPE: process.env.DB_TYPE ?? "sqlite",
      SVELTY_BENCHMARK_SUITE: "true",
      BENCHMARK_DEV: "true", // Run against source for latest fixes
      QUIET: "true",
    },
  });
  const duration = Date.now() - start;

  const success = res.status === 0;

  results.push({
    file: b,
    success,
    durationMs: duration,
    error: success ? "" : res.stderr || res.stdout,
  });

  if (success) {
    console.log(chalk.green(`PASSED (${(duration / 1000).toFixed(1)}s)`));
  } else {
    console.log(chalk.red("FAILED"));
    const errorLines = (res.stderr || res.stdout).split("\n").slice(0, 10).join("\n");
    console.log(chalk.red(errorLines));
    console.log(chalk.gray("--------------------------------------------------"));
  }
}

console.log(chalk.bold.blue("\n--- AUDIT SUMMARY ---\n"));

console.table(
  results.map((r) => ({
    Benchmark: r.file.split("/").pop(),
    Status: r.success ? "✅ PASS" : "❌ FAIL",
    Time: (r.durationMs / 1000).toFixed(1) + "s",
  })),
);

const passed = results.filter((r) => r.success).length;
const total = results.length;
console.log(
  `\nResult: ${passed === total ? chalk.green("ALL PASSED") : chalk.red(`${total - passed} FAILED`)} (${passed}/${total})\n`,
);

if (passed < total) process.exit(1);
process.exit(0);
