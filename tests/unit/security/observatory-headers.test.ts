/**
 * @file tests/unit/security/observatory-headers.test.ts
 * @description Unit tests verifying Mozilla HTTP Observatory A+ and SecurityHeaders.com compliance.
 */

import { describe, it, expect } from "vitest";
import { applyAllSecurityHeaders } from "@src/hooks/handle-security-headers";
import { applySecurityHeaders } from "@src/utils/hook-utils";

describe("Mozilla Observatory & SecurityHeaders.com Standards", () => {
  it("applies strict baseline security headers and HSTS via applySecurityHeaders", () => {
    const headers = new Headers();
    applySecurityHeaders(headers, true);

    expect(headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains; preload",
    );
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("applies Content-Security-Policy, Permissions-Policy, and COOP/COEP isolation headers on API responses", () => {
    const headers = new Headers({
      "content-type": "application/json",
    });

    applyAllSecurityHeaders(headers, true, "https://sveltycms.example.com", "/api/content");

    // Content Security Policy
    const csp = headers.get("Content-Security-Policy");
    expect(csp).toBeDefined();
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("unsafe-eval");

    // Isolation headers
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(headers.get("Cross-Origin-Embedder-Policy")).toBe("require-corp");
    expect(headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
  });

  it("applies credentialless COEP for media gallery endpoints to support remote asset previews", () => {
    const headers = new Headers();
    applyAllSecurityHeaders(headers, true, null, "/api/media/files");

    expect(headers.get("Cross-Origin-Embedder-Policy")).toBe("credentialless");
  });
});
