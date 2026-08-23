/**
 * @file src/hooks/wasm-waf-guard.ts
 * @description
 * Layer 0 WAF middleware guard. Threat matching is the ReDoS-safe linear
 * scanner in `@src/services/security/threat-scan` (the previous WASM stub never
 * performed matching — it only probed runtime instantiate).
 *
 * ### Features:
 * - O(n) path / query / header inspection
 * - XSS, SQLi, path traversal, prototype pollution, header splitting
 * - Shared scanner with AuthGuard payload analysis
 */

import {
  inspectRequest as inspectRequestLinear,
  type WafScanResult,
} from "@src/services/security/threat-scan";

export type WafCheckResult = WafScanResult;

export class WafGuard {
  /**
   * Evaluates request components (URL, query string, headers) against WAF threat patterns.
   */
  public inspectRequest(
    url: string,
    rawQuery: string,
    headers: Headers | Record<string, string>,
  ): WafCheckResult {
    return inspectRequestLinear(url, rawQuery, headers);
  }

  public get isWasmActive(): boolean {
    return false;
  }
}

export const wafGuard = new WafGuard();
