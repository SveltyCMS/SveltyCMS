/**
 * @file tests/benchmarks/security-audit.test.ts
 * @description
 * High-resolution security performance audit for SveltyCMS.
 * Measures the overhead of the Fail-Closed Dispatcher, Payload Scanning, and Audit Chaining.
 */

import "../unit/setup.ts";
import { test } from "bun:test";
import { runBenchmark, exportResult } from "./benchmark-utils";
import type { RequestEvent } from "@sveltejs/kit";

const ITERATIONS = 5000;

// Mock Request Event for Dispatcher tests
function createMockEvent(path: string, method = "GET"): RequestEvent {
  const url = new URL(`http://localhost${path}`);
  return {
    url,
    request: new Request(url, { method }),
    locals: {
      user: { _id: "test-user", role: "admin", isAdmin: true },
      tenantId: "test-tenant",
    },
    cookies: {
      get: () => "mock-csrf-token",
      getAll: () => [],
    },
    getClientAddress: () => "127.0.0.1",
  } as unknown as RequestEvent;
}

test("Security Hardening & Audit Benchmark", async () => {
  const { securityResponseService } = await import("../../src/services/security-response-service");
  const { auditLogService } = await import("../../src/services/audit/audit-log-service");

  console.log("🛡️  Starting Security Performance Audit...");

  // --- 1. Fail-Closed Dispatcher (Authorization Check) ---
  // We measure the overhead of the 'checkAuthorization' logic
  // Since we can't easily import the internal 'checkAuthorization' from +server.ts without refactoring,
  // we'll measure the SecurityResponseService which is the core of the firewall.

  const firewallResult = await runBenchmark({
    name: "Firewall Scanning (Clean)",
    iterations: ITERATIONS,
    onIteration: async () => {
      const event = createMockEvent("/api/collections/posts");
      await securityResponseService.analyzeRequest(event.request, event.getClientAddress());
    },
  });
  exportResult(firewallResult, "security-firewall-clean.json");

  // --- 2. Payload Scanning (Malicious Pattern) ---
  const maliciousResult = await runBenchmark({
    name: "Firewall Scanning (Malicious)",
    iterations: ITERATIONS,
    onIteration: async () => {
      // Simulate an SQLi attempt in the URL
      const event = createMockEvent("/api/collections/posts?q=SELECT+*+FROM+users");
      await securityResponseService.analyzeRequest(event.request, event.getClientAddress());
    },
  });
  exportResult(maliciousResult, "security-firewall-malicious.json");

  // --- 3. Audit Logging (SHA-256 Chaining) ---
  const auditResult = await runBenchmark({
    name: "Audit Logging (Chained)",
    iterations: ITERATIONS,
    onIteration: async () => {
      await auditLogService.log(
        "TEST_ACTION",
        { id: "user-1", email: "test@test.com", ip: "127.0.0.1" },
        { type: "collection", id: "posts" },
        { details: "Benchmarking security logs" },
      );
    },
  });
  exportResult(auditResult, "security-audit-logging.json");

  // --- 4. Cryptographic Baseline (Argon2id Verification) ---
  // Note: Only running a few iterations as Argon2 is intentionally slow
  const { hashPassword } = await import("../../src/utils/password");
  const argonResult = await runBenchmark({
    name: "Argon2id Hashing Baseline",
    iterations: 10,
    warmupIterations: 2,
    onIteration: async () => {
      await hashPassword("SuperSecret123!");
    },
  });
  exportResult(argonResult, "security-crypto-argon2.json");

  console.log("\n✅ Security Audit Benchmarks Completed.");
}, 600000);
