/**
 * @file tests/unit/api/testing-login-cookie-contract.test.ts
 * @description Source-level contract: /api/testing login dual-writes session cookies
 * for Playwright (Set-Cookie header + event.cookies + x-test-session-id).
 *
 * Prevents regressions that break E2E auth-setup storageState generation.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const testingHandler = readFileSync(
  join(process.cwd(), "src/routes/api/[...path]/handlers/testing.ts"),
  "utf8",
);

describe("testing API login session dual-write contract", () => {
  it("defines setTestingSessionCookie helper", () => {
    expect(testingHandler).toMatch(/function setTestingSessionCookie/);
    expect(testingHandler).toMatch(/sessionCookieHeader/);
  });

  it("login action sets cookies and exposes x-test-session-id", () => {
    // Login branch must dual-write
    expect(testingHandler).toMatch(/action === ["']login["']/);
    expect(testingHandler).toMatch(/setTestingSessionCookie/);
    expect(testingHandler).toMatch(/x-test-session-id/);
    expect(testingHandler).toMatch(/["']Set-Cookie["']\s*:/);
  });

  it("uses isSecureCookieContext for loopback-safe Secure flags", () => {
    expect(testingHandler).toMatch(/isSecureCookieContext/);
    expect(testingHandler).toMatch(/getSessionCookieName/);
  });

  it("never hardcodes __Host-auth_sessions for login (must use helper)", () => {
    // Hardcoding Secure prefixes breaks http://127.0.0.1 E2E
    const loginSection = testingHandler.slice(
      testingHandler.indexOf('action === "login"'),
      testingHandler.indexOf('action === "login"') + 1200,
    );
    expect(loginSection).not.toMatch(/__Host-auth_sessions\s*[=,]/);
  });
});
