/**
 * @file tests/benchmarks/security-audit.test.ts
 * @description Professional high-resolution security performance audit for SveltyCMS.
 * Measures overhead of firewall scanning, payload analysis, audit logging, and cryptography.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import { runBenchmark, exportResult, exportMetric, stabilize } from "./benchmark-utils";
import { logger } from "@utils/logger.server";

function createSecurityMockEvent(path: string, method = "GET", body?: any) {
  const url = new URL(`http://localhost${path}`);
  const requestInit: RequestInit = { method };

  if (body) {
    requestInit.body = typeof body === "string" ? body : JSON.stringify(body);
    (requestInit.headers as any) = { "Content-Type": "application/json" };
  }

  return {
    url,
    request: new Request(url, requestInit),
    locals: { user: { _id: "admin", role: "admin" }, tenantId: "global" },
    cookies: { get: () => undefined, getAll: () => [], set: () => {}, delete: () => {} },
    getClientAddress: () => "127.0.0.1",
    platform: {},
    params: {},
    route: { id: "/api/[...path]" },
    setHeaders: () => {},
  } as any;
}

export async function runSecurityBenchmark() {
  console.log("🛡️ Starting SveltyCMS Security Performance Audit...\n");

  logger.level = "silent";

  const { securityResponseService } = await import("../../src/services/security-response-service");
  const { auditLogService } = await import("../../src/services/audit/audit-log-service");
  const { hashPassword } = await import("../../src/utils/password");

  const ITER = 2000;
  const WARMUP = 120;
  const RUNS = 3;

  await stabilize();

  const results: any[] = [];

  // 1. Firewall - Clean Path (most common case)
  const cleanFirewall = await runBenchmark({
    name: "Security: Firewall (Clean)",
    iterations: ITER,
    warmupIterations: WARMUP,
    runs: RUNS,
    concurrency: 1,
    trimOutliers: "iqr",
    measureMemory: true,
    onSetup: stabilize,
    onIteration: async () => {
      const event = createSecurityMockEvent("/api/collections/posts");
      await securityResponseService.analyzeRequest(event.request, event.getClientAddress());
    },
    silent: true,
  });
  results.push(cleanFirewall);
  exportResult(cleanFirewall);

  await stabilize();

  // 2. Firewall - Malicious Payload Detection
  const maliciousFirewall = await runBenchmark({
    name: "Security: Firewall (Malicious)",
    iterations: ITER,
    warmupIterations: WARMUP,
    runs: RUNS,
    concurrency: 1,
    trimOutliers: "iqr",
    measureMemory: true,
    onSetup: stabilize,
    onIteration: async () => {
      const event = createSecurityMockEvent(
        "/api/collections/posts?q=<script>alert(1)</script>&password=admin'--",
        "POST",
        { email: "test@evil.com'; DROP TABLE users;--" },
      );
      await securityResponseService.analyzeRequest(event.request, event.getClientAddress());
    },
    silent: true,
  });
  results.push(maliciousFirewall);
  exportResult(maliciousFirewall);

  await stabilize();

  // 3. Audit Logging with SHA-256 Chaining
  const auditResult = await runBenchmark({
    name: "Security: Audit Logging + Chaining",
    iterations: ITER,
    warmupIterations: WARMUP,
    runs: RUNS,
    concurrency: 1,
    trimOutliers: "iqr",
    measureMemory: true,
    onSetup: stabilize,
    onIteration: async () => {
      await auditLogService.log(
        "BENCHMARK_ACTION",
        { id: "u123", email: "admin@sveltycms", ip: "127.0.0.1" },
        { type: "collection", id: "posts" },
        { action: "read", details: "Performance test" },
      );
    },
    silent: true,
  });
  results.push(auditResult);
  exportResult(auditResult);

  await stabilize();

  // 4. Argon2id Hashing (Security Baseline - intentionally slower)
  const cryptoResult = await runBenchmark({
    name: "Security: Argon2id Hashing",
    iterations: 40, // still low but better than 25
    warmupIterations: 5,
    runs: 2,
    concurrency: 1,
    trimOutliers: "iqr",
    measureMemory: true,
    onSetup: stabilize,
    onIteration: async () => {
      await hashPassword("BenchmarkSuperSecret123!@#");
    },
    silent: true,
  });
  results.push(cryptoResult);
  exportResult(cryptoResult);

  logger.level = "info";

  // Professional Summary
  console.log("\n" + "=".repeat(140));
  console.log("🛡️  SVELTYCMS SECURITY HARDENING PERFORMANCE AUDIT");
  console.log("   Firewall • Payload Analysis • Audit Chaining • Cryptography");
  console.log("=".repeat(140));

  console.log(
    `| ${"Security Component".padEnd(42)} | ${"Avg ms".padEnd(18)} | ${"p95 ms".padEnd(12)} | ${"RPS".padEnd(12)} | ${"RSS Δ".padEnd(12)} |`,
  );
  console.log("|" + "-".repeat(42 + 18 + 12 + 12 + 12 + 6) + "|");

  for (const r of results) {
    const rss =
      r.rssDelta !== undefined ? `${r.rssDelta >= 0 ? "+" : ""}${r.rssDelta.toFixed(2)} MB` : "—";

    console.log(
      `| ${r.name.replace("Security: ", "").padEnd(42)} | ` +
        `${r.avgMs.toFixed(4)} (±${r.marginOfError.toFixed(3)})`.padEnd(18) +
        ` | ${r.p95Ms.toFixed(3)}`.padEnd(12) +
        ` | ${Math.round(r.rps).toLocaleString().padEnd(12)}` +
        ` | ${rss.padEnd(12)} |`,
    );
  }
  console.log("=".repeat(140));

  console.log(
    `   • Argon2id baseline: ${cryptoResult.avgMs.toFixed(2)} ms per hash (security trade-off)`,
  );
  console.log(`   • Audit logging with SHA-256 chaining adds minimal overhead`);

  // Structured Matrix Exports (Infrastructure v2)
  exportMetric("security.waf.avg", maliciousFirewall.avgMs, "ms", {
    clean: cleanFirewall.avgMs,
    p95: maliciousFirewall.p95Ms,
  });
  exportMetric("security.audit_log.avg", auditResult.avgMs, "ms", { p95: auditResult.p95Ms });

  console.log("\n✅ Security audit benchmark completed.");
}

test("Security Hardening & Audit Performance", async () => {
  await runSecurityBenchmark();
}, 450000);
