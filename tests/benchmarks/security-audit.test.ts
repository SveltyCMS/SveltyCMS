/**
 * @file tests/benchmarks/security-audit.test.ts
 * @description Professional high-resolution security performance audit for SveltyCMS.
 * Measures overhead of firewall scanning, payload analysis, audit logging, and cryptography.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import { runBenchmark, exportResult } from "./benchmark-utils";
import type { RequestEvent } from "@sveltejs/kit";

async function stabilize() {
  if (typeof Bun !== "undefined") Bun.gc(true);
  await new Promise((r) => setTimeout(r, 20));
}

function createMockEvent(path: string, method = "GET", body?: any): RequestEvent {
  const url = new URL(`http://localhost${path}`);
  const requestInit: RequestInit = { method };

  if (body) {
    requestInit.body = typeof body === "string" ? body : JSON.stringify(body);
    requestInit.headers = { "Content-Type": "application/json" };
  }

  return {
    url,
    request: new Request(url, requestInit),
    locals: {
      user: { _id: "test-user", role: "admin", isAdmin: true },
      tenantId: "test-tenant",
    },
    cookies: {
      get: (name?: string) => (name === "csrf" ? "mock-csrf-token" : undefined),
      getAll: () => [],
      set: () => {},
      delete: () => {},
    },
    getClientAddress: () => "127.0.0.1",
    platform: {},
    isDataRequest: false,
    route: { id: path },
    params: {},
    setHeaders: () => {},
    fetch: async () => new Response("OK"),
  } as unknown as RequestEvent;
}

test("Security Hardening & Audit Performance Audit", async () => {
  console.log("🛡️ Starting SveltyCMS Security Performance Audit...\n");

  // Clear audit logs to ensure a clean baseline for chained logging
  try {
    const { unlink, mkdir } = await import("node:fs/promises");
    const path = await import("node:path");
    const logPath = path.join(process.cwd(), "logs", "audit.log");
    await unlink(logPath).catch(() => {});
    await mkdir(path.join(process.cwd(), "logs"), { recursive: true }).catch(() => {});
  } catch {}

  const { securityResponseService } = await import("../../src/services/security-response-service");
  const { auditLogService } = await import("../../src/services/audit/audit-log-service");
  const { hashPassword } = await import("../../src/utils/password");

  const ITERATIONS = 2500; // Balanced for security components
  const WARMUP = 150;

  await stabilize();

  // 1. Firewall Scanning - Clean Request (Fast Path)
  console.log("🔥 Benchmarking Firewall: Clean Request...");
  const cleanFirewallResult = await runBenchmark({
    name: "Security: Firewall Scanning (Clean)",
    iterations: ITERATIONS,
    warmupIterations: WARMUP,
    onIteration: async () => {
      const event = createMockEvent("/api/collections/posts");
      await securityResponseService.analyzeRequest(event.request, event.getClientAddress());
    },
  });
  exportResult(cleanFirewallResult, "security-firewall-clean.json");

  await stabilize();

  // 2. Firewall Scanning - Malicious Payload Detection
  console.log("🔥 Benchmarking Firewall: Malicious Payload Detection...");
  const maliciousFirewallResult = await runBenchmark({
    name: "Security: Firewall Scanning (Malicious)",
    iterations: ITERATIONS,
    warmupIterations: WARMUP,
    onIteration: async () => {
      const event = createMockEvent(
        "/api/collections/posts?q=SELECT+*+FROM+users;DROP+TABLE+users",
        "GET",
      );
      await securityResponseService.analyzeRequest(event.request, event.getClientAddress());
    },
  });
  exportResult(maliciousFirewallResult, "security-firewall-malicious.json");

  await stabilize();

  // 3. Audit Logging (Chained SHA-256 + Storage)
  console.log("📝 Benchmarking Audit Logging (Chained)...");
  const auditResult = await runBenchmark({
    name: "Security: Audit Logging",
    iterations: ITERATIONS,
    warmupIterations: WARMUP,
    onIteration: async () => {
      await auditLogService.log(
        "BENCHMARK_TEST_ACTION",
        { userId: "user-123", email: "test@example.com", ip: "127.0.0.1" },
        { entityType: "collection", entityId: "posts" },
        { details: "Performance benchmark test entry" },
      );
    },
  });
  exportResult(auditResult, "security-audit-logging.json");

  await stabilize();

  // 4. Argon2id Hashing (Intentionally Slow - Security Baseline)
  console.log("🔐 Benchmarking Argon2id Password Hashing (Security Baseline)...");
  const cryptoResult = await runBenchmark({
    name: "Security: Argon2id Hashing",
    iterations: 25, // Much fewer because it's deliberately expensive
    warmupIterations: 3,
    onIteration: async () => {
      await hashPassword("BenchmarkSuperSecret123!@#");
    },
  });
  exportResult(cryptoResult, "security-crypto-argon2.json");

  // ========================
  // Final Summary
  // ========================
  console.log("\n" + "=".repeat(90));
  console.log("🛡️ SECURITY PERFORMANCE AUDIT SUMMARY");
  console.log("=".repeat(90));

  const allResults = [cleanFirewallResult, maliciousFirewallResult, auditResult, cryptoResult];

  console.log(
    `| ${"Component".padEnd(34)} | ${"Avg (ms)".padEnd(10)} | ${"p95 (ms)".padEnd(10)} | ${"RPS".padEnd(12)} |`,
  );
  console.log("|" + "-".repeat(34 + 10 + 10 + 12 + 6) + "|");

  for (const r of allResults) {
    const cleanName = r.name.replace("Security: ", "");
    console.log(
      `| ${cleanName.padEnd(34)} | ${r.avgMs.toFixed(4).padEnd(10)} | ${r.p95Ms.toFixed(4).padEnd(10)} | ${Math.round(r.rps).toLocaleString().padEnd(12)} |`,
    );
  }
  console.log("=".repeat(90));

  console.log(
    `\nNote: Argon2id is intentionally slow for security reasons (~${cryptoResult.avgMs.toFixed(2)} ms per hash).`,
  );
  console.log("      Firewall clean path should stay under 0.2 ms for good performance.");
}, 600000);
