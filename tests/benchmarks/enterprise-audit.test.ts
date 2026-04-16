/**
 * @file tests/benchmarks/enterprise-audit.test.ts
 * @description
 * High-fidelity Master Audit Suite for SveltyCMS.
 * Orchestrates all individual benchmarks into a single telemetry pass.
 */

import { test } from "bun:test";
import "./benchmark-utils";

// Enable Audit Mode to suppress individual test() registrations in imported files
process.env.SVELTY_AUDIT_ACTIVE = "true";

test("SveltyCMS Enterprise Performance Audit (Full Pass)", async () => {
  console.log("\n" + "=".repeat(100));
  console.log("🏆 SVELTYCMS ENTERPRISE PERFORMANCE AUDIT");
  console.log("=".repeat(100) + "\n");

  // 1. Core API Latency (Hot Path)
  const { runApiLatencyBenchmark } = await import("./api-latency.test");
  await runApiLatencyBenchmark();

  // 2. Database Adapter Efficiency
  const { runDatabaseBenchmark } = await import("./database-performance.test");
  await runDatabaseBenchmark();

  // 3. 3-Layer Cache Performance
  const { runCacheBenchmark } = await import("./cache-performance.test");
  await runCacheBenchmark();

  // 4. Hook Pipeline Overhead
  const { runHooksBenchmark } = await import("./hooks-performance.test");
  await runHooksBenchmark();

  // 5. Mixed Production Workload
  const { runMixedWorkloadBenchmark } = await import("./mixed-workload.test");
  await runMixedWorkloadBenchmark();

  // 6. Multi-Tenant Scalability
  const { runMultiTenantBenchmark } = await import("./multi-tenant-performance.test");
  await runMultiTenantBenchmark();

  // 7. OpenAPI Export Speed
  const { runOpenApiBenchmark } = await import("./openapi-performance.test");
  await runOpenApiBenchmark();

  // 8. Widget Processing Overhead
  const { runWidgetBenchmark } = await import("./widget-performance.test");
  await runWidgetBenchmark();

  console.log("\n" + "=".repeat(100));
  console.log("✅ AUDIT COMPLETE: All telemetry data exported to ./benchmarks/*.json");
  console.log("=".repeat(100) + "\n");
}, 1200000); // 20 minute timeout for full audit
