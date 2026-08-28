/**
 * @file tests/benchmarks/security-audit.test.ts
 * @description Enterprise Security Defense Benchmark (Optimized)
 * @summary Measures overhead of WAF request analysis (clean & malicious), audit log persistence, Argon2id password hashing, and RBAC permission checks.
 */

import {
  test,
  runBenchmark,
  exportResult,
  exportMetric,
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

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

async function runSecurityAudit() {
  const dbType = getDbType().toUpperCase();
  console.log(`🚀 Starting Enterprise Security Infrastructure Audit (${dbType})...\n`);

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
    const { inspectRequest } = await import("@src/services/security/threat-scan");
    const { hasPermissionWithRoles } = await import("@src/databases/auth/permissions");

    const auditEnabled = process.env.BENCHMARK_AUDIT_MODE === "compliance";
    const results = [];

    // ── 1. WAF DEEP ANALYSIS PIPELINE (REQUEST CLONE + FULL PIPELINE) ────────
    forceGarbageCollection();
    await stabilize(100);

    console.log(
      "   → 1. Measuring Full WAF Pipeline Overhead (Request.clone + Rule Evaluation)...",
    );
    const targetWafRequest = new Request("http://localhost/api/collections/posts?limit=10", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "X-Forwarded-For": "1.2.3.4",
        Accept: "application/json",
      },
    });

    const wafResult = await runBenchmark({
      name: "WAF Deep Analysis (Clean)",
      iterations: 800,
      warmupIterations: 100,
      runs: 2,
      concurrency: 4,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        await securityResponseService.analyzeRequest(targetWafRequest.clone());
      },
    });
    results.push({ ...wafResult, shortLabel: "WAF Pipeline", layer: "Security" });

    // ── 2. WAF SCANNER: CLEAN VS MALICIOUS PATTERNS ─────────────────────────
    forceGarbageCollection();
    await stabilize(100);

    console.log("   → 2. Measuring Raw WAF Inspection Engine (Clean vs Malicious Probes)...");
    const wafCleanResult = await runBenchmark({
      name: "WAF Inspect (Clean Query)",
      iterations: 4000,
      warmupIterations: 400,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      silent: true,
      onIteration: () => {
        inspectRequest("/api/collections/posts", "limit=10&sort=createdAt", {});
      },
    });
    results.push({ ...wafCleanResult, shortLabel: "WAF (Clean)", layer: "Threat Scan" });

    const wafThreatResult = await runBenchmark({
      name: "WAF Inspect (Malicious Probe)",
      iterations: 4000,
      warmupIterations: 400,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      silent: true,
      onIteration: () => {
        // High-entropy attack vector testing regex backtracking (SQLi + XSS + Path Traversal)
        inspectRequest(
          "/api/collections/posts/..%2F..%2Fetc%2Fpasswd",
          "query=1%27%20OR%20%271%27=%271&xss=%3Cscript%3Ealert(1)%3C/script%3E",
          { "x-custom-payload": "UNION SELECT null, username, password FROM users--" },
        );
      },
    });
    results.push({ ...wafThreatResult, shortLabel: "WAF (Threat)", layer: "Threat Scan" });

    // ── 3. AUDIT LOGGING PERSISTENCE / DISPATCH ─────────────────────────────
    const AUDIT_ITERATIONS = 600;
    const AUDIT_WARMUP = 80;
    const TOTAL_AUDIT_CAPACITY = (AUDIT_ITERATIONS + AUDIT_WARMUP) * 2;

    const preallocatedActor = Object.freeze({
      id: "admin" as any,
      email: "admin@test.com",
      role: "admin",
    });

    const pregeneratedLogs = Array.from({ length: TOTAL_AUDIT_CAPACITY }, (_, i) =>
      Object.freeze({
        target: { id: `entry-${i}` as any, type: "benchmark" },
        context: { entryId: `entry-${i}` },
      }),
    );
    let auditCursor = 0;

    forceGarbageCollection();
    await stabilize(100);

    console.log(
      `   → 3. Measuring Audit Log Pipeline (${auditEnabled ? "Compliance Persistence" : "Disabled Fast-Path"})...`,
    );
    const auditResult = await runBenchmark({
      name: auditEnabled ? "Audit Log Persistence" : "Audit Log Dispatch (Disabled Fast-Path)",
      iterations: AUDIT_ITERATIONS,
      warmupIterations: AUDIT_WARMUP,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const logData = pregeneratedLogs[auditCursor++ % pregeneratedLogs.length]!;
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
    results.push({ ...auditResult, shortLabel: "Audit Log", layer: "Audit" });

    // ── 4. ARGON2ID PASSWORD HASHING (CRYPTO ENGINE PROFILE) ─────────────────
    forceGarbageCollection();
    await stabilize(200);

    console.log("   → 4. Measuring Argon2id Key Derivation & Memory Hardness...");
    const hashResult = await runBenchmark({
      name: "Argon2id Password Hashing",
      iterations: 8,
      warmupIterations: 2,
      runs: 1,
      concurrency: 1,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        await hashPassword("SuperSecretPassword123!@#");
      },
    });
    results.push({ ...hashResult, shortLabel: "Argon2id", layer: "Crypto" });

    // ── 5. DEFENSE-IN-DEPTH PERMISSION & RBAC OVERHEAD ───────────────────────
    const staticTime = "2026-08-28T12:00:00.000Z";
    const mockAdminUser = Object.freeze({
      _id: "test-admin",
      email: "admin@test.com",
      role: "admin",
      isAdmin: true,
      permissions: [],
      createdAt: staticTime as any,
      updatedAt: staticTime as any,
    });

    const mockPermissions = Object.freeze([
      "collections:read",
      "collections:write",
      "media:read",
      "media:write",
      "media:delete",
      "system:settings",
      "config:collectionbuilder",
    ]);

    const mockRoles: any[] = Object.freeze([
      {
        _id: "admin",
        name: "Administrator",
        isAdmin: true,
        permissions: [],
      },
      {
        _id: "editor",
        name: "Editor",
        isAdmin: false,
        permissions: mockPermissions,
      },
    ]);

    const mockNonAdminUser = Object.freeze({
      _id: "test-editor",
      email: "editor@test.com",
      role: "editor",
      isAdmin: false,
      permissions: mockPermissions,
      createdAt: staticTime as any,
      updatedAt: staticTime as any,
    });

    forceGarbageCollection();
    await stabilize(100);

    console.log("   → 5. Measuring Endpoint Dispatcher & RBAC Authorization Checks...");
    const dispatcherOnlyResult = await runBenchmark({
      name: "Dispatcher Permission Check",
      iterations: 8000,
      warmupIterations: 500,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      silent: true,
      onIteration: () => {
        const permitted = _checkEndpointPermission(
          mockNonAdminUser as any,
          mockRoles,
          "POST",
          "media",
          ["media"],
        );
        if (!permitted) throw new Error("Expected permission pass");
      },
    });
    results.push({ ...dispatcherOnlyResult, shortLabel: "Dispatcher RBAC", layer: "Auth Gate" });

    forceGarbageCollection();
    await stabilize(100);

    const defenseInDepthResult = await runBenchmark({
      name: "Full Defense-in-Depth (Gate + Handler)",
      iterations: 8000,
      warmupIterations: 500,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      silent: true,
      onIteration: () => {
        const dispatcherPassed = _checkEndpointPermission(
          mockNonAdminUser as any,
          mockRoles,
          "POST",
          "media",
          ["media"],
        );
        if (!dispatcherPassed) throw new Error("Dispatcher rejection");

        const handlerPassed = hasPermissionWithRoles(
          mockNonAdminUser as any,
          "media:write",
          mockRoles,
        );
        if (!handlerPassed) throw new Error("Handler RBAC rejection");
      },
    });
    results.push({ ...defenseInDepthResult, shortLabel: "Full DID", layer: "Auth Gate" });

    forceGarbageCollection();
    await stabilize(100);

    const adminCheckResult = await runBenchmark({
      name: "Admin Fast-Path Verification",
      iterations: 8000,
      warmupIterations: 500,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      silent: true,
      onIteration: () => {
        const isAdmin = _checkEndpointPermission(mockAdminUser as any, mockRoles, "GET", "system", [
          "system",
        ]);
        if (!isAdmin) {
          hasPermissionWithRoles(mockAdminUser as any, "system:settings", mockRoles);
        }
      },
    });
    results.push({ ...adminCheckResult, shortLabel: "Admin Fast-Path", layer: "Auth Gate" });

    // ── 6. REPORTING & TELEMETRY ────────────────────────────────────────────
    const didOverheadUs = Math.max(
      0,
      (defenseInDepthResult.avgMs - dispatcherOnlyResult.avgMs) * 1000,
    );
    const wafThreatDeltaUs = Math.max(0, (wafThreatResult.avgMs - wafCleanResult.avgMs) * 1000);

    printTruthTable({
      title: "SVELTYCMS — SECURITY INFRASTRUCTURE AUDIT",
      shortLabel: "Security",
      subtitle: `WAF • Cryptography • Audit • RBAC Defense • ${dbType}`,
      results,
    });

    printSummaryTable(
      [
        { key: "Database Engine", val: dbType, unit: "" },
        { key: "WAF Pipeline Latency (Avg)", val: wafResult.avgMs.toFixed(3), unit: "ms" },
        {
          key: "WAF Scanner (Clean Query)",
          val: (wafCleanResult.avgMs * 1000).toFixed(2),
          unit: "µs",
        },
        {
          key: "WAF Scanner (Threat Vector)",
          val: (wafThreatResult.avgMs * 1000).toFixed(2),
          unit: "µs",
        },
        { key: "WAF Complex Pattern Tax", val: `+${wafThreatDeltaUs.toFixed(2)}`, unit: "µs" },
        {
          key: auditEnabled ? "Audit Log Persistence" : "Audit Dispatch (No-Op)",
          val: auditResult.avgMs.toFixed(3),
          unit: "ms",
        },
        { key: "Argon2id Hashing Latency", val: hashResult.avgMs.toFixed(1), unit: "ms" },
        {
          key: "Argon2id Memory Allocation",
          val: (hashResult.rssDelta || 0).toFixed(1),
          unit: "MB",
        },
        {
          key: "Dispatcher Permission Check",
          val: (dispatcherOnlyResult.avgMs * 1000).toFixed(2),
          unit: "µs",
        },
        {
          key: "Full Defense-in-Depth Check",
          val: (defenseInDepthResult.avgMs * 1000).toFixed(2),
          unit: "µs",
        },
        {
          key: "Admin Fast-Path Verification",
          val: (adminCheckResult.avgMs * 1000).toFixed(2),
          unit: "µs",
        },
        { key: "Defense-in-Depth Tax", val: `+${didOverheadUs.toFixed(2)}`, unit: "µs" },
        {
          key: "Security SLA Compliance",
          val: wafResult.avgMs < 0.2 && dispatcherOnlyResult.avgMs < 0.01 ? "EXCELLENT" : "PASSED",
          unit: "",
        },
      ],
      "Security Infrastructure Summary",
    );

    exportMetric("security.waf_pipeline_avg_ms", wafResult.avgMs, "ms");
    exportMetric(
      "security.waf_clean_us",
      parseFloat((wafCleanResult.avgMs * 1000).toFixed(2)),
      "µs",
    );
    exportMetric(
      "security.waf_threat_us",
      parseFloat((wafThreatResult.avgMs * 1000).toFixed(2)),
      "µs",
    );
    exportMetric("security.audit_log_avg_ms", auditResult.avgMs, "ms");
    exportMetric("security.argon2id_hash_ms", hashResult.avgMs, "ms");
    exportMetric(
      "security.rbac_dispatcher_us",
      parseFloat((dispatcherOnlyResult.avgMs * 1000).toFixed(2)),
      "µs",
    );
    exportMetric("security.rbac_did_overhead_us", parseFloat(didOverheadUs.toFixed(2)), "µs");

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
}, 600_000);
