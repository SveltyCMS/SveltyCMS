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
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

async function runSecurityAudit() {
  console.log("🚀 Starting Enterprise Security Audit...\n");

  const { securityResponseService } = await import("@src/services/security-response-service");
  const { auditLogService, AuditEventType } = await import("@src/services/audit-log-service");
  const { hashPassword } = await import("@src/utils/password");

  await stabilize();

  const originalLogLevel = logger.level;
  logger.level = "silent";

  try {
    const RUNS = 2;
    const ITERATIONS = 1000;
    const results: any[] = [];

    // 1. WAF Analysis Overhead (Richer Mock)
    console.log("   → Measuring WAF (Web Application Firewall) analysis...");
    const wafResult = await runBenchmark({
      name: "WAF: Deep Analysis",
      iterations: ITERATIONS,
      warmupIterations: 100,
      runs: RUNS,
      concurrency: 1,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const req = new Request(
          "http://localhost/api/collections/posts?limit=10&status=published",
          {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              Accept: "application/json",
              "X-Forwarded-For": "1.2.3.4",
              Referer: "http://localhost/admin",
            },
          },
        );
        await securityResponseService.analyzeRequest(req);
      },
    });
    results.push({ ...wafResult, layer: "Security" });

    // 2. Audit Logging Latency
    console.log("   → Measuring Audit Log persistence...");
    const auditResult = await runBenchmark({
      name: "Audit: Persistent Logging",
      iterations: 500,
      warmupIterations: 50,
      runs: 1,
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
    results.push({ ...auditResult, layer: "Security" });

    // 3. Password Hashing (Argon2id) - Heavy Computation
    console.log("   → Measuring Password Hashing (Argon2id)...");
    const hashResult = await runBenchmark({
      name: "Crypto: Argon2id Hashing",
      iterations: 10, // Very slow, keep low
      warmupIterations: 2,
      runs: 1,
      concurrency: 1,
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        await hashPassword("SuperSecretPassword123!");
      },
    });
    results.push({ ...hashResult, layer: "Crypto" });

    printTruthTable({
      title: "SVELTYCMS  —  SECURITY INFRASTRUCTURE AUDIT",
      subtitle: `WAF • Auditing • Cryptography • ${getDbType().toUpperCase()}`,
      results,
    });

    printSummaryTable([
      { key: "WAF Analysis Latency", val: wafResult.avgMs, unit: "ms" },
      { key: "Audit Log Persistence", val: auditResult.avgMs, unit: "ms" },
      { key: "Password Hashing (Argon2id)", val: hashResult.avgMs, unit: "ms" },
      {
        key: "Security Overhead Rating",
        val: wafResult.avgMs < 1 ? "EXCELLENT" : "GOOD",
        unit: "",
      },
    ]);

    for (const r of results) exportResult(r);
  } finally {
    logger.level = originalLogLevel;
  }

  console.log("\n✅ Security audit completed.");
}

test("Security Infrastructure Performance", async () => {
  await runSecurityAudit();
}, 600000);
