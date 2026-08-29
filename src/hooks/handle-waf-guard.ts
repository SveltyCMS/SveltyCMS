/**
 * @file src/hooks/handle-waf-guard.ts
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

import type { RequestEvent } from "@sveltejs/kit";
import {
  inspectRequest as inspectRequestLinear,
  type WafScanResult,
} from "@src/services/security/threat-scan";

export type WafCheckResult = WafScanResult;

export class WafGuard {
  private _headersCache = new WeakMap<object, WafCheckResult>();

  /**
   * Evaluates a full RequestEvent against WAF threat patterns with per-request memoization.
   * Ensures the scan runs at most once across the entire request lifecycle.
   */
  public inspectEvent(event: RequestEvent): WafCheckResult {
    const locals = event.locals as Record<string, any>;
    if (locals && locals.__wafCheck) {
      return locals.__wafCheck as WafCheckResult;
    }
    const result = this.inspectRequest(
      event.url.pathname,
      event.url.search,
      event.request.headers,
      locals,
    );
    if (locals) {
      locals.__wafCheck = result;
    }
    return result;
  }

  /**
   * Evaluates request components (URL, query string, headers) against WAF threat patterns.
   * If `context` (RequestEvent or event.locals) or `headers` object is provided, results are memoized.
   */
  public inspectRequest(
    url: string,
    rawQuery: string,
    headers: Headers | Record<string, string>,
    context?: RequestEvent | Record<string, any>,
  ): WafCheckResult {
    if (context) {
      const locals = "locals" in context ? (context.locals as Record<string, any>) : context;
      if (locals && locals.__wafCheck) {
        return locals.__wafCheck as WafCheckResult;
      }
    }

    if (headers && typeof headers === "object") {
      const cached = this._headersCache.get(headers);
      if (cached) return cached;
    }

    const result = inspectRequestLinear(url, rawQuery, headers);

    if (context) {
      const locals = "locals" in context ? (context.locals as Record<string, any>) : context;
      if (locals) {
        locals.__wafCheck = result;
      }
    }

    if (headers && typeof headers === "object") {
      this._headersCache.set(headers, result);
    }

    return result;
  }

  public get isWasmActive(): boolean {
    return false;
  }
}

export const wafGuard = new WafGuard();
