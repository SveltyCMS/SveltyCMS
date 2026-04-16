/**
 * @file tests/benchmarks/enterprise-audit.test.ts
 * @description Master Orchestrator for SveltyCMS Full Performance Audit Suite.
 *              Runs all high-fidelity benchmarks in sequence with proper isolation and reporting.
 */

import { test } from "bun:test";

const BENCHMARKS = [
  {
    name: "API Latency (SDK vs Dispatcher)",
    path: "./api-latency.test",
    fn: "runApiLatencyBenchmark",
  },
  {
    name: "Database Adapter CRUD",
    path: "./database-performance.test",
    fn: "runDatabaseBenchmark",
  },
  { name: "3-Layer Cache Performance", path: "./cache-performance.test", fn: "runCacheBenchmark" },
  {
    name: "Hooks & Middleware Pipeline",
    path: "./hooks-performance.test",
    fn: "runHooksBenchmark",
  },
  {
    name: "GraphQL API Performance",
    path: "./graphql-api-performance.test",
    fn: "runGraphQLBenchmark",
  },
  { name: "Media Engine (Sharp)", path: "./media-performance.test", fn: "runMediaBenchmark" },
  {
    name: "Mixed Production Workload",
    path: "./mixed-workload.test",
    fn: "runMixedWorkloadBenchmark",
  },
  {
    name: "Multi-Tenant Scalability",
    path: "./multi-tenant-performance.test",
    fn: "runMultiTenantBenchmark",
  },
  {
    name: "OpenAPI Generation Speed",
    path: "./openapi-performance.test",
    fn: "runOpenApiBenchmark",
  },
  {
    name: "Widget & Field Processing",
    path: "./widget-performance.test",
    fn: "runWidgetBenchmark",
  },
  {
    name: "Relational GraphQL Performance",
    path: "./relational-performance.test",
    fn: "runRelationalBenchmark",
  },
  {
    name: "REST API Performance",
    path: "./rest-api-performance.test",
    fn: "runRestApiBenchmark",
  },
  {
    name: "Memory Stability & Leak Detection",
    path: "./memory-stability.test",
    fn: "runMemoryStabilityTest",
  },
] as const;

async function runBenchmarkSafely(benchmark: (typeof BENCHMARKS)[number]) {
  console.log(`\n🔄 Running: ${benchmark.name}`);
  console.log("-".repeat(benchmark.name.length + 13));

  try {
    const startTime = performance.now();

    // Set flag to prevent benchmarks from registering their own test() blocks
    process.env.SVELTY_AUDIT_ACTIVE = "true";

    const module = await import(benchmark.path);
    const runFn = module[benchmark.fn];

    if (typeof runFn !== "function") {
      throw new Error(`Export ${benchmark.fn} not found in ${benchmark.path}`);
    }

    await runFn();

    const duration = ((performance.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ ${benchmark.name} completed in ${duration}s`);
    return { name: benchmark.name, status: "Passed", duration };
  } catch (error) {
    console.error(`❌ ${benchmark.name} failed:`, error instanceof Error ? error.message : error);
    return { name: benchmark.name, status: "Failed", error };
  }
}

test("SveltyCMS Enterprise Performance Audit (Full Suite)", async () => {
  console.log("\n" + "=".repeat(115));
  console.log("🏆 SVELTYCMS ENTERPRISE PERFORMANCE AUDIT — FULL SUITE");
  console.log("   High-Fidelity Benchmarks • Statistical Rigor • Memory & Latency Analysis");
  console.log("=".repeat(115));

  const results = [];

  for (const benchmark of BENCHMARKS) {
    const result = await runBenchmarkSafely(benchmark);
    results.push(result);
  }

  console.log("\n" + "=".repeat(115));
  console.log("📊 FINAL AUDIT SUMMARY");
  console.log("=".repeat(115));
  console.log(
    `| ${"Benchmark Suite".padEnd(45)} | ${"Status".padEnd(12)} | ${"Duration".padEnd(10)} |`,
  );
  console.log("|" + "-".repeat(45 + 12 + 10 + 6) + "|");

  for (const r of results) {
    const status = r.status === "Passed" ? "✅ Passed" : "❌ Failed";
    console.log(
      `| ${r.name.padEnd(45)} | ${status.padEnd(12)} | ${String(r.duration).padEnd(10)} |`,
    );
  }
  console.log("=".repeat(115));

  const failureCount = results.filter((r) => r.status === "Failed").length;
  if (failureCount > 0) {
    throw new Error(`Audit failed with ${failureCount} errors.`);
  }

  console.log("\n✨ All benchmarks passed. Enterprise Audit Complete.");
}, 900000); // 15 minute timeout for full suite
