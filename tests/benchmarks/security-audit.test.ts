/**
 * @file tests/benchmarks/security-audit.test.ts
 * @description Enterprise Security Defense Benchmark (Optimized)
 * @summary Measures overhead of WAF request analysis, audit log persistence, Argon2id password hashing, and RBAC permission checks.
 *
 * ### Features:
 * - Web Application Firewall (WAF) deep analysis overhead
 * - Crypto-chained audit log persistence throughput
 * - Argon2id password hashing latency and memory cost
 * - Defense-in-depth RBAC permission check micro-benchmark
 */

import {
  test,
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

let stopServer: (() => Promise<void>) | null = null;

async function runSecurityAudit() {
  console.log("🚀 Starting Enterprise Security Audit...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;

    await ensureStableTestData();
    await stabilize(1000);

    const { securityResponseService } = await import("@src/services/security/response-service");
    const { auditLogService, AuditEventType } =
      await import("@src/services/security/audit-service");
    const { hashPassword } = await import("@src/utils/security");
    const { _checkEndpointPermission } = await import("@src/routes/api/[...path]/+server");

    // 🛡️ HONESTY: the crypto-chained audit pipeline only persists when the
    // server runs with audit ENABLED (BENCHMARK_AUDIT_MODE=compliance →
    // DISABLE_AUDIT_LOGS=false). Default production benchmark servers disable
    // it — auditLogService.log() then early-returns (a no-op, ~0ms).
    const auditEnabled = process.env.BENCHMARK_AUDIT_MODE === "compliance";

    const results = [];

    // 1. WAF Analysis
    console.log("   → Measuring WAF (Web Application Firewall) overhead...");

    // Instantiate template request out of hot execution path
    const targetWafRequest = new Request("http://localhost/api/collections/posts?limit=10", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "X-Forwarded-For": "1.2.3.4",
        Accept: "application/json",
      },
    });

    const wafResult = await runBenchmark({
      name: "WAF Deep Analysis",
      iterations: 800,
      warmupIterations: 100,
      runs: 2,
      concurrency: 4,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        // Clone static object pattern to isolate evaluation performance
        await securityResponseService.analyzeRequest(targetWafRequest.clone());
      },
    });
    results.push({ ...wafResult, shortLabel: "WAF", layer: "Security" });

    // Isolate scanner cost from Request.clone() + async analyzeRequest.
    // Those two frames dominate "WAF Deep Analysis" (~0.002 ms) and hide
    // whether the matcher got faster. This row is the actual inspect() work.
    const { inspectRequest } = await import("@src/services/security/threat-scan");
    const inspectResult = await runBenchmark({
      name: "WAF Inspect (clean URL)",
      iterations: 2000,
      warmupIterations: 400,
      runs: 3,
      concurrency: 1,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: () => {
        inspectRequest("/api/collections/posts", "limit=10", {});
      },
    });
    results.push({ ...inspectResult, shortLabel: "WAFInspect", layer: "Security" });

    // 2. Audit Logging
    console.log("   → Measuring Audit Log persistence...");

    // Pre-allocated collection records array to decouple string construction from database performance metrics
    const AUDIT_ITERATIONS = 600;
    const preallocatedActor = {
      id: "admin" as any,
      email: "admin@test.com",
      role: "admin",
    };
    const pregeneratedLogs = Array.from({ length: AUDIT_ITERATIONS }, (_, i) => ({
      target: { id: `entry-${i}` as any, type: "benchmark" },
      context: { entryId: `entry-${i}` },
    }));

    const auditResult = await runBenchmark({
      name: auditEnabled ? "Audit Log Persistence" : "Audit Log Dispatch (disabled no-op)",
      iterations: AUDIT_ITERATIONS,
      warmupIterations: 80,
      runs: 2,
      concurrency: 1,
      measureMemory: true,
      silent: true,
      onIteration: async (i: number) => {
        const logData = pregeneratedLogs[i] ?? pregeneratedLogs[0]!;
        await auditLogService.log(
          "bench.test",
          preallocatedActor,
          logData.target,
          AuditEventType.SUSPICIOUS_ACTIVITY,
          "low",
          logData.context,
          "global" as any,
          "success",
        );
      },
    });
    results.push({ ...auditResult, shortLabel: "Audit", layer: "Security" });

    // 3. Password Hashing
    console.log("   → Measuring Password Hashing (Argon2id)...");
    const hashResult = await runBenchmark({
      name: "Argon2id Password Hashing",
      iterations: 8, // Computationally / CPU intensive payload execution bounds
      warmupIterations: 2,
      runs: 1,
      concurrency: 1,
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        await hashPassword("SuperSecretPassword123!@#");
      },
    });
    results.push({ ...hashResult, shortLabel: "Hashing", layer: "Crypto" });

    // 4. Defense-in-Depth Permission Overhead
    console.log("   → Measuring Defense-in-Depth Permission Check Overhead...");
    const { hasPermissionWithRoles } = await import("@src/databases/auth/permissions");

    const staticTime = "2026-06-27T20:00:00.000Z";
    const mockUser = {
      _id: "test-admin",
      email: "admin@test.com",
      role: "admin",
      isAdmin: true,
      permissions: [],
      createdAt: staticTime as any,
      updatedAt: staticTime as any,
    } as any;

    const mockRoles: any[] = ["admin", "editor"];
    const mockPermissions = [
      "collections:read",
      "collections:write",
      "media:write",
      "media:delete",
      "system:settings",
      "config:collectionbuilder",
    ];
    // Non-admin user exercising the REAL dispatcher gate (ENDPOINT_PERMISSIONS
    // mapping + RBAC). The previous version measured `array.includes()` — a
    // hand-rolled stand-in, not the dispatcher.
    const mockNonAdminUser = {
      _id: "test-editor",
      email: "editor@test.com",
      role: "editor",
      isAdmin: false,
      permissions: mockPermissions,
      createdAt: staticTime as any,
      updatedAt: staticTime as any,
    } as any;

    // Measure dispatcher-only check (real ENDPOINT_PERMISSIONS mapping + RBAC)
    const dispatcherOnlyResult = await runBenchmark({
      name: "Dispatcher-Only Permission Check",
      iterations: 5000,
      warmupIterations: 500,
      runs: 2,
      concurrency: 1,
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const permitted = _checkEndpointPermission(mockNonAdminUser, mockRoles, "POST", "media", [
          "media",
        ]);
        void permitted;
      },
    });
    results.push({
      ...dispatcherOnlyResult,
      shortLabel: "DispOnly",
      layer: "Defense",
    });

    // Measure defense-in-depth check (dispatcher + handler-level RBAC)
    const defenseInDepthResult = await runBenchmark({
      name: "Full Defense-in-Depth Check",
      iterations: 5000,
      warmupIterations: 500,
      runs: 2,
      concurrency: 1,
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const dispatcherPassed = _checkEndpointPermission(
          mockNonAdminUser,
          mockRoles,
          "POST",
          "media",
          ["media"],
        );
        if (!dispatcherPassed) return;

        const handlerPassed = hasPermissionWithRoles(mockNonAdminUser, "media:write", mockRoles);
        void handlerPassed;
      },
    });
    results.push({
      ...defenseInDepthResult,
      shortLabel: "FullDID",
      layer: "Defense",
    });

    // Measure worst-case: admin fast-path + permission check pattern
    const adminCheckResult = await runBenchmark({
      name: "Admin Verification + Permission Check",
      iterations: 5000,
      warmupIterations: 500,
      runs: 2,
      concurrency: 1,
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        // REAL dispatcher admin fast-path (isAdmin/role check) + RBAC fallback
        const isAdmin = _checkEndpointPermission(mockUser, mockRoles, "GET", "system", ["system"]);
        if (!isAdmin) {
          hasPermissionWithRoles(mockUser, "system:settings", mockRoles);
        }
      },
    });
    results.push({
      ...adminCheckResult,
      shortLabel: "AdminChk",
      layer: "Defense",
    });

    // Output formatting logic
    printTruthTable({
      title: "SVELTYCMS — SECURITY INFRASTRUCTURE AUDIT",
      shortLabel: "Security",
      subtitle: `WAF • Audit • Cryptography • ${getDbType().toUpperCase()}`,
      results,
    });

    printSummaryTable([
      { key: "WAF Analysis", val: wafResult.avgMs, unit: "ms" },
      { key: "WAF Inspect (clean URL)", val: inspectResult.avgMs, unit: "ms" },
      {
        key: auditEnabled ? "Audit Logging" : "Audit Dispatch (no-op)",
        val: auditResult.avgMs,
        unit: "ms",
      },
      { key: "Password Hashing", val: hashResult.avgMs, unit: "ms" },
      { key: "Dispatcher Check", val: dispatcherOnlyResult.avgMs, unit: "ms" },
      {
        key: "Full Defense-in-Depth",
        val: defenseInDepthResult.avgMs,
        unit: "ms",
      },
      { key: "Admin Verification", val: adminCheckResult.avgMs, unit: "ms" },
      {
        key: "DID Overhead",
        val: (defenseInDepthResult.avgMs - dispatcherOnlyResult.avgMs).toFixed(4),
        unit: "ms",
      },
      {
        key: "Security Overhead Rating",
        val: wafResult.avgMs < 1 ? "EXCELLENT" : "GOOD",
        unit: "",
      },
    ]);

    for (const r of results) exportResult(r);
  } catch (err: any) {
    logger.error(`Security benchmark failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("Security Infrastructure Performance", async () => {
  await runSecurityAudit();
}, 600000);
