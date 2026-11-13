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
 * - Explicit must-block contract (`MUST_BLOCK_PAYLOADS`) so a WAF regression fails the audit
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
  // Bypass payloads: single-pass decoders, comment obfuscation, and alternate
  // encodings that a naive pattern match would miss.
  "%252e%252e%252f%252e%252e%252fetc%252fpasswd",
  "\\u003cscript\\u003ealert(1)\\u003c/script\\u003e",
  "1' UNION/**/SELECT password FROM users--",
  "%00../../etc/passwd",
  "value\r\nSet-Cookie: evil=1",
  '{"__proto__":{"isAdmin":true}}',
  "1' OR 1=1 --",
]);

/**
 * Payloads a correct WAF must reject. Every entry is an injection, XSS,
 * traversal, prototype-pollution, or CRLF payload — benign boundary strings
 * (`""`, `"null"`, `"undefined"`, `"NaN"`, `"0xDEADBEEF"`, oversized filler)
 * are deliberately excluded so an allow does not count as a regression.
 */
export const MUST_BLOCK_PAYLOADS: ReadonlySet<string> = new Set([
  "' OR '1'='1",
  '" OR "1"="1',
  "'; DROP TABLE users; --",
  "<script>alert('XSS')</script>",
  "%2e%2e%2f%2e%2e%2fetc%2fpasswd",
  "__proto__.polluted=true",
  "constructor.prototype.isAdmin=true",
  "%252e%252e%252f%252e%252e%252fetc%252fpasswd",
  "\\u003cscript\\u003ealert(1)\\u003c/script\\u003e",
  "1' UNION/**/SELECT password FROM users--",
  "%00../../etc/passwd",
  "value\r\nSet-Cookie: evil=1",
  '{"__proto__":{"isAdmin":true}}',
  "1' OR 1=1 --",
]);

export interface FuzzResult {
  iterations: number;
  blockedByWaf: number;
  passed: number;
  /** MUST_BLOCK payloads the WAF allowed through — non-empty means a real gap. */
  unblocked: string[];
  elapsedMs: number;
}

export function runFuzzAudit(): FuzzResult {
  const start = performance.now();
  let blockedByWaf = 0;
  const unblocked: string[] = [];
  const iterations = FUZZ_PAYLOADS.length;

  for (let i = 0; i < iterations; i++) {
    const payload = FUZZ_PAYLOADS[i];
    // `WafGuard.inspectRequest` inspects path, query string, and headers only —
    // it takes no body, so JSON bodies are not scanned at this layer. JSON-shaped
    // payloads are therefore exercised through the path, query, and header
    // surfaces; request-body scanning is a handler-level concern (`scanPayload`).
    const wafResult = waf.inspectRequest(`/api/test/${payload}`, `q=${payload}`, {
      host: "localhost",
      "x-fuzz-payload": payload,
    });

    if (wafResult.blocked) {
      blockedByWaf++;
    } else if (MUST_BLOCK_PAYLOADS.has(payload)) {
      unblocked.push(payload);
    }
  }

  return {
    iterations,
    blockedByWaf,
    passed: iterations,
    unblocked,
    elapsedMs: Number((performance.now() - start).toFixed(2)),
  };
}

if (import.meta.main) {
  console.log("⚡ Starting SveltyCMS Security API Payload Fuzzer...");
  const result = runFuzzAudit();
  console.log(`\nAPI fuzzing finished in ${result.elapsedMs}ms:`);
  console.log(`   - Total payloads: ${result.iterations}`);
  console.log(`   - WAF blocked threats: ${result.blockedByWaf}`);
  console.log(`   - Must-block payloads allowed: ${result.unblocked.length}`);

  if (result.unblocked.length > 0) {
    console.log("\n❌ WAF gaps — these payloads must be blocked but were allowed:");
    for (const payload of result.unblocked) {
      console.log(`   - ${JSON.stringify(payload)}`);
    }
    process.exit(1);
  }

  console.log("\n✅ Verdict: every must-block payload was rejected by the WAF.");
  process.exit(0);
}
