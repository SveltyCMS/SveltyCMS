/**
 * @file tests/unit/hooks/security-headers.test.ts
 * @description Unit tests for the live `applyAllSecurityHeaders()` utility
 * (`src/hooks/handle-security-headers.ts`) — the function actually invoked from
 * `handleTurboPipeline`, `handleTurboGet`, the rate-limit 429 path, and the
 * top-level error guard. The old standalone `handleSecurityHeaders` Handle was
 * removed (it was not wired into the pipeline).
 *
 * Tests:
 * - Base security headers (X-Frame-Options, nosniff, Referrer-Policy, …)
 * - Permissions-Policy lockdown values
 * - Strict-Transport-Security (HSTS) only when isHttps
 * - Cross-origin isolation (COOP/COEP/CORP) on API routes
 * - CSP variants: page (preserves SvelteKit), /api/, /api/graphql
 * - CORS: Vary: Origin on API routes
 */

import { describe, it, expect, vi } from "vitest";
import { applyAllSecurityHeaders } from "@src/hooks/handle-security-headers";

// HSTS is gated on `isHttps && !dev` — pin dev:false so the production HTTPS
// path is exercised deterministically (matches adversarial.test.ts pattern).
vi.mock("$app/environment", () => ({ dev: false, browser: false }));

function headersFor(
  pathname: string,
  opts: { isHttps?: boolean; origin?: string | null; preexisting?: [string, string][] } = {},
): Headers {
  const headers = new Headers(opts.preexisting ?? []);
  applyAllSecurityHeaders(headers, opts.isHttps ?? true, opts.origin ?? null, pathname);
  return headers;
}

describe("applyAllSecurityHeaders", () => {
  describe("Base security headers", () => {
    it("sets X-Frame-Options: DENY", () => {
      expect(headersFor("/dashboard").get("X-Frame-Options")).toBe("DENY");
    });

    it("sets X-Content-Type-Options: nosniff", () => {
      expect(headersFor("/api/data").get("X-Content-Type-Options")).toBe("nosniff");
    });

    it("sets Referrer-Policy: strict-origin-when-cross-origin", () => {
      expect(headersFor("/dashboard").get("Referrer-Policy")).toBe(
        "strict-origin-when-cross-origin",
      );
    });

    it("sets X-XSS-Protection, X-DNS-Prefetch-Control and X-Permitted-Cross-Domain-Policies", () => {
      const h = headersFor("/dashboard");
      expect(h.get("X-XSS-Protection")).toBe("1; mode=block");
      expect(h.get("X-DNS-Prefetch-Control")).toBe("off");
      expect(h.get("X-Permitted-Cross-Domain-Policies")).toBe("none");
    });
  });

  describe("Permissions-Policy", () => {
    it("disables sensitive features but allows clipboard-write/web-share for self", () => {
      const policy = headersFor("/dashboard").get("Permissions-Policy") ?? "";
      for (const feature of [
        "geolocation=()",
        "microphone=()",
        "camera=()",
        "display-capture=()",
        "clipboard-read=()",
      ]) {
        expect(policy).toContain(feature);
      }
      expect(policy).toContain("clipboard-write=(self)");
      expect(policy).toContain("web-share=(self)");
    });
  });

  describe("Strict-Transport-Security", () => {
    it("sets HSTS with 1-year + subdomains + preload when isHttps", () => {
      const hsts = headersFor("/dashboard", { isHttps: true }).get("Strict-Transport-Security");
      expect(hsts).toContain("max-age=31536000");
      expect(hsts).toContain("includeSubDomains");
      expect(hsts).toContain("preload");
    });

    it("does NOT set HSTS for insecure connections", () => {
      expect(
        headersFor("/dashboard", { isHttps: false }).get("Strict-Transport-Security"),
      ).toBeNull();
    });
  });

  describe("Cross-origin isolation (API)", () => {
    it("sets COOP/COEP/CORP on API routes", () => {
      const h = headersFor("/api/collections");
      expect(h.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
      expect(h.get("Cross-Origin-Embedder-Policy")).toBe("require-corp");
      expect(h.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
    });

    it("uses credentialless COEP for media routes (third-party asset compat)", () => {
      expect(headersFor("/api/media/123").get("Cross-Origin-Embedder-Policy")).toBe(
        "credentialless",
      );
    });

    it("does NOT set Cross-Origin-Resource-Policy on page routes (API-only)", () => {
      const h = headersFor("/dashboard");
      // COOP/COEP come from BASE_HEADERS (applied to all routes); CORP is API-only.
      expect(h.get("Cross-Origin-Resource-Policy")).toBeNull();
      expect(h.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
    });
  });

  describe("Content-Security-Policy", () => {
    it("preserves the SvelteKit page CSP when present", () => {
      const h = headersFor("/dashboard", {
        preexisting: [["Content-Security-Policy", "default-src 'self'; script-src 'self'"]],
      });
      expect(h.get("Content-Security-Policy")).toBe("default-src 'self'; script-src 'self'");
    });

    it("applies the API CSP on /api/ routes", () => {
      const csp = headersFor("/api/collections").get("Content-Security-Policy") ?? "";
      expect(csp).toContain("default-src 'self'");
      expect(csp).not.toContain("unsafe-inline");
    });

    it("applies the strict GraphQL CSP when the playground is disabled", () => {
      const prev = process.env.ALLOW_GRAPHQL_PLAYGROUND;
      process.env.ALLOW_GRAPHQL_PLAYGROUND = "false";
      try {
        const csp = headersFor("/api/graphql").get("Content-Security-Policy") ?? "";
        expect(csp).toContain("default-src 'self'");
        expect(csp).toContain("script-src 'self'");
        expect(csp).not.toContain("unsafe-eval");
      } finally {
        if (prev === undefined) delete process.env.ALLOW_GRAPHQL_PLAYGROUND;
        else process.env.ALLOW_GRAPHQL_PLAYGROUND = prev;
      }
    });
  });

  describe("CORS", () => {
    it("adds Vary: Origin on API routes", () => {
      expect(headersFor("/api/collections").get("Vary")).toContain("Origin");
    });

    it("does NOT add CORS Vary on page routes", () => {
      expect(headersFor("/dashboard").get("Vary")).toBeNull();
    });
  });
});
