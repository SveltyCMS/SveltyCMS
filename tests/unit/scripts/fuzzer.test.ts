/**
 * @file tests/unit/scripts/fuzzer.test.ts
 * @description
 * Pins the fuzz audit's must-block contract against the shipped WAF, so a
 * regression that silently allows SQLi/XSS/traversal/prototype-pollution
 * payloads fails the audit instead of reporting success.
 *
 * ### Features:
 * - Asserts every `MUST_BLOCK_PAYLOADS` entry is rejected by `WafGuard`
 * - Asserts `runFuzzAudit()` reports no unblocked payloads for the shipped set
 * - Asserts one iteration per payload and a frozen payload list
 */

import { describe, expect, it } from "vitest";
import { WafGuard } from "../../../src/hooks/handle-waf-guard";
import { FUZZ_PAYLOADS, MUST_BLOCK_PAYLOADS, runFuzzAudit } from "../../../scripts/security/fuzzer";

describe("security payload fuzzer", () => {
  it("freezes the payload list", () => {
    expect(Object.isFrozen(FUZZ_PAYLOADS)).toBe(true);
  });

  it("fuzzes every must-block payload", () => {
    for (const payload of MUST_BLOCK_PAYLOADS) {
      expect(FUZZ_PAYLOADS).toContain(payload);
    }
  });

  it("blocks every must-block payload with the shipped WAF", () => {
    const waf = new WafGuard();
    const allowed: string[] = [];

    for (const payload of MUST_BLOCK_PAYLOADS) {
      const result = waf.inspectRequest(`/api/test/${payload}`, `q=${payload}`, {
        host: "localhost",
        "x-fuzz-payload": payload,
      });
      if (result.blocked !== true) {
        allowed.push(JSON.stringify(payload));
      }
    }

    expect(allowed).toEqual([]);
  });

  it("reports no unblocked payloads and one iteration per payload", () => {
    const result = runFuzzAudit();

    expect(result.unblocked).toEqual([]);
    expect(result.iterations).toBe(FUZZ_PAYLOADS.length);
    expect(result.blockedByWaf + result.unblocked.length).toBeLessThanOrEqual(result.iterations);
  });
});
