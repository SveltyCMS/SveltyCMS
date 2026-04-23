/**
 * @file tests/benchmarks/security-audit.test.ts
 * @description Enterprise security audit benchmark for SveltyCMS.
 * Measures cryptographic overhead, hashing latencies, and RBAC resolution.
 */
import { test, beforeAll, afterAll } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  exportMetric,
  stabilize,
  setupBenchmarkServer,
  printAuditTable,
  printSummaryTable,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

let stopServer: () => Promise<void>;

beforeAll(async () => {
  const { stop } = await setupBenchmarkServer();
  stopServer = stop;
});

afterAll(async () => {
  if (stopServer) await stopServer();
});

function createSecurityMockEvent(path: string, method = "GET", body: any = null): any {
  const url = `http://localhost:4000${path}`;
  const requestInit: RequestInit = { method };
  if (body) {
    requestInit.body = JSON.stringify(body);
    (requestInit.headers as any) = { "Content-Type": "application/json" };
  }

  return {
    url,
    request: new Request(url, requestInit),
    locals: { user: { _id: "admin", role: "admin" }, tenantId: "global" },
    getClientAddress: () => "127.0.0.1",
  } as any;
}

export async function runSecurityBenchmark() {
  console.log("🛡️ Starting SveltyCMS Security Performance Audit...\n");

  const { securityResponseService } = await import("@src/services/security-response-service");
  const { auditLogService } = await import("@src/services/audit/audit-log-service");
  const { hashPassword } = await import("@src/utils/password");

  await stabilize();

  const ITER = 1000;
  const WARMUP = 100;
  const RUNS = 3;
  const allResults: any[] = [];

  logger.level = "silent";

  // 1. Firewall (WAF) - Clean Path
  const cleanResult = await runBenchmark({
    name: "WAF: Clean Request",
    iterations: ITER,
    warmupIterations: WARMUP,
    runs: RUNS,
    concurrency: 1,
    measureMemory: true,
    silent: true,
    onIteration: async () => {
      const event = createSecurityMockEvent("/api/collections/posts");
      await securityResponseService.analyzeRequest(event.request, event.getClientAddress());
    },
  });
  allResults.push(cleanResult);

  // 2. Audit Logging
  const auditResult = await runBenchmark({
    name: "Audit: SHA-256 Chaining",
    iterations: ITER,
    warmupIterations: WARMUP,
    runs: RUNS,
    concurrency: 1,
    measureMemory: true,
    silent: true,
    onIteration: async () => {
      await auditLogService.log(
        "BENCHMARK",
        { id: "u1", email: "admin", ip: "127.0.0.1" },
        { type: "test", id: "1" },
        { action: "test" },
      );
    },
  });
  allResults.push(auditResult);

  // 3. Cryptography (Argon2id) - Intentionally slow
  const hashResult = await runBenchmark({
    name: "Crypto: Argon2id Hashing",
    iterations: 20,
    warmupIterations: 2,
    runs: 2,
    concurrency: 1,
    measureMemory: true,
    silent: true,
    onIteration: async () => {
      await hashPassword("BenchmarkPassword123!");
    },
  });
  allResults.push(hashResult);

  logger.level = "info";

  printAuditTable({
    title: "SVELTYCMS  —  SECURITY HARDENING",
    subtitle: "WAF Analysis • Audit Chaining • Cryptography • Argon2id",
    results: allResults,
  });

  printSummaryTable([
    { key: "WAF Analysis Latency", val: cleanResult.avgMs, unit: "ms" },
    { key: "Audit Log Commit (Chained)", val: auditResult.avgMs, unit: "ms" },
    { key: "Argon2id Hash Latency", val: hashResult.avgMs, unit: "ms" },
    { key: "Security Context RSS Δ", val: (auditResult.rssDelta || 0).toFixed(2), unit: "MB" },
  ]);

  exportMetric("security.waf.avg", cleanResult.avgMs, "ms");
  exportMetric("security.argon2.avg", hashResult.avgMs, "ms");

  for (const r of allResults) exportResult(r);

  console.log("\n✅ Security audit benchmark completed.");
}

test("Security Hardening & Audit Performance", async () => {
  await runSecurityBenchmark();
}, 450000);
