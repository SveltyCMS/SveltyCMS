/**
 * @file tests/unit/hooks/csp-headers.test.ts
 * @description Tests for Content-Security-Policy header enforcement.
 *
 * Features tested:
 * - API CSP policy is strict (no inline scripts)
 * - BASE_HEADERS must not clobber SvelteKit nonce CSP on page routes
 * - applyAllSecurityHeaders only sets CSP on API routes
 */

import { describe, it, expect } from "vitest";
import {
  API_CONTENT_SECURITY_POLICY,
  BASE_HEADERS,
} from "@src/utils/security/constants";
import { applyAllSecurityHeaders } from "@src/hooks/handle-security-headers";
import { applySecurityHeaders } from "@src/utils/hook-utils";

describe("Content-Security-Policy Headers", () => {
  it("should NOT include CSP in BASE_HEADERS (SvelteKit nonce CSP owns page routes)", () => {
    expect(BASE_HEADERS["Content-Security-Policy"]).toBeUndefined();
  });

  it("should define strict API_CONTENT_SECURITY_POLICY", () => {
    expect(API_CONTENT_SECURITY_POLICY).toContain("default-src 'self'");
    expect(API_CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(API_CONTENT_SECURITY_POLICY).toContain("ws: wss:");
    expect(API_CONTENT_SECURITY_POLICY).toContain("frame-src 'none'");
    expect(API_CONTENT_SECURITY_POLICY).toContain("base-uri 'self'");
    expect(API_CONTENT_SECURITY_POLICY).toContain("form-action 'self'");
    expect(API_CONTENT_SECURITY_POLICY).toContain("img-src 'self' data: blob:");
  });

  it("should NOT contain unsafe-inline or unsafe-eval in API script-src", () => {
    const scriptSrcMatch = API_CONTENT_SECURITY_POLICY.match(/script-src[^;]+/);
    expect(scriptSrcMatch).toBeDefined();
    if (scriptSrcMatch) {
      expect(scriptSrcMatch[0]).not.toContain("'unsafe-inline'");
      expect(scriptSrcMatch[0]).not.toContain("'unsafe-eval'");
      expect(scriptSrcMatch[0]).not.toContain("iconify.design");
    }
  });

  it("should include all required security headers in BASE_HEADERS", () => {
    expect(BASE_HEADERS["X-Frame-Options"]).toBe("DENY");
    expect(BASE_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
    expect(BASE_HEADERS["Referrer-Policy"]).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  it("applySecurityHeaders must preserve existing SvelteKit nonce CSP on page responses", () => {
    const headers = new Headers({
      "Content-Security-Policy":
        "script-src 'self' blob: 'nonce-abc123'; style-src 'self' 'unsafe-inline'",
    });

    applySecurityHeaders(headers, false);

    expect(headers.get("Content-Security-Policy")).toContain("'nonce-abc123'");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("applyAllSecurityHeaders should set API CSP only for API routes", () => {
    const apiHeaders = new Headers();
    applyAllSecurityHeaders(apiHeaders, false, null, "/api/collections/posts");
    expect(apiHeaders.get("Content-Security-Policy")).toBe(
      API_CONTENT_SECURITY_POLICY,
    );

    const pageHeaders = new Headers({
      "Content-Security-Policy":
        "script-src 'self' blob: 'nonce-page-nonce'; style-src 'self' 'unsafe-inline'",
    });
    applyAllSecurityHeaders(
      pageHeaders,
      false,
      null,
      "/config/collectionbuilder",
    );
    expect(pageHeaders.get("Content-Security-Policy")).toContain(
      "'nonce-page-nonce'",
    );
    expect(pageHeaders.get("Content-Security-Policy")).not.toBe(
      API_CONTENT_SECURITY_POLICY,
    );
  });

  it("applyAllSecurityHeaders restores SvelteKit CSP even if BASE_HEADERS regresses", () => {
    const headers = new Headers({
      "Content-Security-Policy":
        "script-src 'self' blob: 'nonce-restore-test'; style-src 'self' 'unsafe-inline'",
    });
    applyAllSecurityHeaders(headers, false, null, "/config/collectionbuilder");
    expect(headers.get("Content-Security-Policy")).toContain(
      "'nonce-restore-test'",
    );
  });
});
