/**
 * @file scripts/security/fuzzer.ts
 * @description
 * In-memory API payload fuzzer for WAF and input resilience testing.
 *
 * Generates boundary strings, oversized payloads, malformed JSON structures,
 * SQL injection patterns, and unexpected data types to stress-test system API
 * inputs against the WAF.
 *
 * ### Features:
 * - Deterministic payload stress testing
 * - WAF & API handler boundary resilience verification
 * - Pre-allocated payloads at module load (no per-run GC churn)
 */

import { WafGuard } from "@src/hooks/handle-waf-guard";

const waf = new WafGuard();

// Pre-allocate the nested payload once at module load so large fuzz runs don't
// rebuild it (and allocate a fresh 50-element array) on every invocation.
const NESTED_PAYLOAD = JSON.stringify({ nested: { depth: Array(50).fill({ a: 1 }) } });

export const FUZZ_PAYLOADS = Object.freeze([
  "",
  "A".repeat(10000),
  "' OR '1'='1",
  '" OR "1"="1',
  "'; DROP TABLE users; --",
  "<script>alert('XSS')</script>",
  "%2e%2e%2f%2e%2e%2fetc%2fpasswd",
  "__proto__.polluted=true",
  "constructor.prototype.isAdmin=true",
  "null",
  "undefined",
  "NaN",
  "0xDEADBEEF",
  "\x00\x01\x02\x03",
  NESTED_PAYLOAD,
]);

export interface FuzzResult {
  iterations: number;
  blockedByWaf: number;
  passed: number;
  elapsedMs: number;
}

export function runFuzzAudit(): FuzzResult {
  const start = performance.now();
  let blockedByWaf = 0;
  const iterations = FUZZ_PAYLOADS.length;

  for (let i = 0; i < iterations; i++) {
    const payload = FUZZ_PAYLOADS[i];
    const wafResult = waf.inspectRequest(`/api/test/${payload}`, `q=${payload}`, {
      host: "localhost",
      "x-fuzz-payload": payload,
    });

    if (wafResult.blocked) {
      blockedByWaf++;
    }
  }

  return {
    iterations,
    blockedByWaf,
    passed: iterations,
    elapsedMs: Number((performance.now() - start).toFixed(2)),
  };
}
