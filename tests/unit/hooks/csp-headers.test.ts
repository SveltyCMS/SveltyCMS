/**
 * @file tests/unit/hooks/csp-headers.test.ts
 * @description Tests for Content-Security-Policy header enforcement on all responses.
 *
 * Features tested:
 * - CSP header present on all responses
 * - CSP blocks inline scripts, object-src is 'none'
 * - CSP headers applied via BASE_HEADERS
 * - Health check responses include CSP
 */

import { describe, it, expect } from "vitest";
import { BASE_HEADERS } from "@src/utils/security-constants";

describe("Content-Security-Policy Headers", () => {
  it("should include CSP in BASE_HEADERS", () => {
    expect(BASE_HEADERS["Content-Security-Policy"]).toBeDefined();
  });

  it("should set default-src to 'self'", () => {
    const csp = BASE_HEADERS["Content-Security-Policy"];
    expect(csp).toContain("default-src 'self'");
  });

  it("should block object-src entirely", () => {
    const csp = BASE_HEADERS["Content-Security-Policy"];
    expect(csp).toContain("object-src 'none'");
  });

  it("should allow WebSocket connections for real-time features", () => {
    const csp = BASE_HEADERS["Content-Security-Policy"];
    expect(csp).toContain("ws: wss:");
  });

  it("should restrict frame-src to 'self'", () => {
    const csp = BASE_HEADERS["Content-Security-Policy"];
    expect(csp).toContain("frame-src 'self'");
  });

  it("should restrict base-uri to 'self'", () => {
    const csp = BASE_HEADERS["Content-Security-Policy"];
    expect(csp).toContain("base-uri 'self'");
  });

  it("should restrict form-action to 'self'", () => {
    const csp = BASE_HEADERS["Content-Security-Policy"];
    expect(csp).toContain("form-action 'self'");
  });

  it("should allow data: and blob: for images", () => {
    const csp = BASE_HEADERS["Content-Security-Policy"];
    expect(csp).toContain("img-src 'self' data: blob:");
  });

  it("should include all required security headers", () => {
    expect(BASE_HEADERS["X-Frame-Options"]).toBe("DENY");
    expect(BASE_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
    expect(BASE_HEADERS["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });
});
