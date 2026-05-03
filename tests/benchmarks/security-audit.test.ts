/**
 * @file tests/benchmarks/security-audit.test.ts
 * @description Enterprise security performance audit for SveltyCMS.
 * Measures overhead of WAF, audit logging, and cryptographic password hashing.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
} from "./benchmark-utils";
import { logger } from "@utils/logger";

let stopServer: (() => Promise<void>) | null = null;

async function runSecurityAudit() {
  console.log("🚀 Starting Enterprise Security Audit...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;

    await ensureStableTestData();
    await stabilize(1000);

    const { securityResponseService } = await import("@src/services/security-response-service");
    const { auditLogService, AuditEventType } = await import("@src/services/audit-log-service");
    const { hashPassword } = await import("@src/utils/security");

    const results = [];

    // 1. WAF Analysis
    console.log("   → Measuring WAF (Web Application Firewall) overhead...");
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
        const req = new Request("http://localhost/api/collections/posts?limit=10", {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "X-Forwarded-For": "1.2.3.4",
            Accept: "application/json",
          },
        });
        await securityResponseService.analyzeRequest(req);
      },
    });
    results.push({ ...wafResult, shortLabel: "WAF", layer: "Security" });

    // 2. Audit Logging
    console.log("   → Measuring Audit Log persistence...");
    const auditResult = await runBenchmark({
      name: "Audit Log Persistence",
      iterations: 600,
      warmupIterations: 80,
      runs: 2,
      concurrency: 1,
      measureMemory: true,
      silent: true,
      onIteration: async (i: number) => {
        await auditLogService.logEvent({
          action: "bench.test",
          actorId: "admin" as any,
          actorEmail: "admin@test.com",
          eventType: AuditEventType.SUSPICIOUS_ACTIVITY,
          severity: "low",
          details: { entryId: `entry-${i}` },
          result: "success",
          tenantId: "global" as any,
        });
      },
    });
    results.push({ ...auditResult, shortLabel: "Audit", layer: "Security" });

    // 3. Password Hashing
    console.log("   → Measuring Password Hashing (Argon2id)...");
    const hashResult = await runBenchmark({
      name: "Argon2id Password Hashing",
      iterations: 8, // Very CPU intensive
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

    printTruthTable({
      title: "SVELTYCMS — SECURITY INFRASTRUCTURE AUDIT",
      shortLabel: "Security",
      subtitle: `WAF • Audit • Cryptography • ${getDbType().toUpperCase()}`,
      results,
    });

    printSummaryTable([
      { key: "WAF Analysis", val: wafResult.avgMs, unit: "ms" },
      { key: "Audit Logging", val: auditResult.avgMs, unit: "ms" },
      { key: "Password Hashing", val: hashResult.avgMs, unit: "ms" },
      { key: "Security Overhead Rating", val: wafResult.avgMs < 1 ? "EXCELLENT" : "GOOD", unit: "" },
    ]);

    for (const r of results) exportResult(r);

  } catch (err: any) {
    logger.error(`Security benchmark failed: ${err.message}`);
    console.error(err);
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }

  console.log("\n✅ Security audit completed.");
}

test("Security Infrastructure Performance", async () => {
  await runSecurityAudit();
}, 600000);
