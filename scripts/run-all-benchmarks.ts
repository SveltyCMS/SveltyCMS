#!/usr/bin/env bun
/**
 * @file scripts/run-all-benchmarks.ts
 * @description Runs all benchmarks sequentially with BENCHMARK_RECORD=1 and reports results.
 */
const { spawnSync } = await import("node:child_process");
const { resolve } = await import("node:path");

process.env.BENCHMARK_RECORD = "1";

const BENCHMARKS = [
  // ✅ Clean benchmarks — use setupBenchmarkServer() + HTTP, no @src imports
  "admin-ux-vitality",
  "ai-performance",
  "api-latency",
  "auth-performance",
  "cache-hit-ratio",
  "cache-performance",
  "chaos-resilience",
  "circuit-breaker-failover",
  "concurrency-race",
  "data-residency-failover",
  "failure-propagation",
  "graphql-api-performance",
  "graphql-stress",
  "hooks-performance",
  "index-pressure",
  "media-upload-stress",
  "memory-stability",
  "migration-scale",
  "mixed-workload",
  "multi-tenant-performance",
  "openapi-performance",
  "realtime-performance",
  "relational-performance",
  "rest-api-performance",
  "revision-stress",
  "right-to-be-forgotten-audit",
  "security-audit",
  "seo-performance",
  "setup-proxy",
  "state-machine-transition",
  "telemetry-performance",
  "temporal-integrity",
  "throttling-backoff-stress",
  "websocket-broadcast",
];

const ROOT = resolve(import.meta.dirname, "..");
const results: string[] = [];

console.log(`\n🧪 Running ${BENCHMARKS.length} benchmarks with BENCHMARK_RECORD=1\n`);

for (const name of BENCHMARKS) {
  const testFile = resolve(ROOT, `tests/benchmarks/${name}.test.ts`);
  const start = performance.now();
  process.stdout.write(`\n━━━ [${name}] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  const result = spawnSync("bun", ["test", "--timeout", "900000", testFile], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, BENCHMARK_RECORD: "1" },
    shell: process.platform === "win32",
  });

  const elapsed = ((performance.now() - start) / 1000).toFixed(1);
  const status = result.status === 0 ? "✅ PASS" : "❌ FAIL";
  results.push(`  ${status}  ${name}  (${elapsed}s)`);
  console.log(`  → Exit code: ${result.status}`);
}

console.log(`\n${"═".repeat(60)}`);
console.log("  BENCHMARK RUN COMPLETE");
console.log(`${"═".repeat(60)}`);
console.log(`  ${results.filter((r) => r.includes("✅")).length}/${results.length} passed\n`);
for (const r of results) console.log(r);
console.log();
