/**
 * @file tests/unit/auth/session-cookies.test.ts
 * @description Ultra-smart session cookie contracts for agnostic / loopback / HTTPS deploys.
 *
 * Guards the class of bugs where Secure/__Host- cookies over http://127.0.0.1
 * are dropped by browsers → empty storageState → mass E2E "missing page-title".
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  SESSION_COOKIE_NAME,
  isSecureCookieContext,
  getSessionCookieName,
  readSessionCookie,
} from "@src/databases/auth/constants";

describe("isSecureCookieContext", () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.TEST_MODE;
    process.env.NODE_ENV = "development";
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("treats https as secure regardless of host", () => {
    expect(isSecureCookieContext("https:", "example.com")).toBe(true);
    expect(isSecureCookieContext("https:", "127.0.0.1")).toBe(true);
  });

  it("never forces Secure cookies on loopback over http (CI / E2E)", () => {
    process.env.NODE_ENV = "production";
    for (const host of ["localhost", "127.0.0.1", "::1", "[::1]", "app.localhost"]) {
      expect(isSecureCookieContext("http:", host), host).toBe(false);
    }
  });

  it("respects forceInsecure even on https", () => {
    expect(isSecureCookieContext("https:", "example.com", { forceInsecure: true })).toBe(false);
  });

  it("is insecure on http + TEST_MODE for non-loopback", () => {
    process.env.TEST_MODE = "true";
    process.env.NODE_ENV = "production";
    expect(isSecureCookieContext("http:", "cms.internal")).toBe(false);
  });

  it("is secure on http production non-loopback without TEST_MODE", () => {
    process.env.NODE_ENV = "production";
    delete process.env.TEST_MODE;
    expect(isSecureCookieContext("http:", "cms.example.com")).toBe(true);
  });

  it("is insecure in non-production on plain http", () => {
    process.env.NODE_ENV = "development";
    expect(isSecureCookieContext("http:", "cms.example.com")).toBe(false);
  });
});

describe("getSessionCookieName", () => {
  it("uses raw name for insecure contexts", () => {
    expect(getSessionCookieName(false)).toBe(SESSION_COOKIE_NAME);
    expect(getSessionCookieName(false)).toBe("auth_sessions");
  });

  it("uses __Host- prefix for secure contexts (RFC 6265bis)", () => {
    expect(getSessionCookieName(true)).toBe(`__Host-${SESSION_COOKIE_NAME}`);
  });
});

describe("readSessionCookie", () => {
  it("on insecure: prefers plain name, accepts secure leftovers", () => {
    const cookies = {
      get: (name: string) =>
        (
          ({
            auth_sessions: "plain",
            "__Host-auth_sessions": "host",
            "__Secure-auth_sessions": "secure",
          }) as Record<string, string>
        )[name],
    };
    expect(readSessionCookie(cookies, false)).toBe("plain");
  });

  it("on insecure: falls back to host/secure leftovers when plain missing", () => {
    const cookies = {
      get: (name: string) =>
        (
          ({
            "__Host-auth_sessions": "host-only",
          }) as Record<string, string>
        )[name],
    };
    expect(readSessionCookie(cookies, false)).toBe("host-only");
  });

  it("on secure: prefers __Host- then plain then __Secure-", () => {
    const cookies = {
      get: (name: string) =>
        (
          ({
            auth_sessions: "plain",
            "__Host-auth_sessions": "host",
            "__Secure-auth_sessions": "secure",
          }) as Record<string, string>
        )[name],
    };
    expect(readSessionCookie(cookies, true)).toBe("host");
  });

  it("returns undefined when no session cookie present", () => {
    expect(readSessionCookie({ get: () => undefined }, false)).toBeUndefined();
    expect(readSessionCookie({ get: () => undefined }, true)).toBeUndefined();
  });
});

describe("cookie origin binding (Playwright / E2E contract)", () => {
  /**
   * Playwright url-cookies without :port bind to :80 and never reach 4173/5173.
   * This pure contract documents the required origin form for helpers.
   */
  function cookieOrigin(protocol: "http" | "https", hostWithPort: string): string {
    return `${protocol}://${hostWithPort}`;
  }

  it("includes port for CI preview and local dev", () => {
    expect(cookieOrigin("http", "127.0.0.1:4173")).toBe("http://127.0.0.1:4173");
    expect(cookieOrigin("http", "127.0.0.1:5173")).toBe("http://127.0.0.1:5173");
  });

  it("rejects hostname-only origins as insufficient for non-default ports", () => {
    const bad = "http://127.0.0.1";
    const good = cookieOrigin("http", "127.0.0.1:4173");
    expect(new URL(bad).port).toBe("");
    expect(new URL(good).port).toBe("4173");
  });
});
