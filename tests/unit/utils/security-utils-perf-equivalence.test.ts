/**
 * @file tests/unit/utils/security-utils-perf-equivalence.test.ts
 * @description Regression tests pinning the mechanical per-request optimizations
 * of the security utility modules: triage gates, module-scope regex/constant
 * hoisting, and shared memoized result objects. Every case here locks an
 * output that MUST stay identical to the pre-optimization implementation
 * (including Unicode case-folding edges that constrain the fast paths).
 */

import { describe, expect, it, afterEach } from "vitest";
import { containsXssVector, sanitizeString } from "../../../src/utils/security/input-sanitizer";
import { stripPrivilegedUserFields } from "../../../src/utils/security/user-attribute-policy";
import { getCorsHeaders } from "../../../src/utils/security/cors-utils";
import {
  CSRF_TOKEN_COOKIE_NAME,
  ensureCsrfToken,
  generateCsrfToken,
  validateCsrfForRequest,
  validateCsrfToken,
} from "../../../src/utils/security/csrf-utils";
import { readSessionIdFromCookieHeader } from "../../../src/utils/security/session-cookie";
import {
  HOST_SESSION_COOKIE_NAME,
  SECURE_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "../../../src/databases/auth/constants";
import { getAuditFlagsSync } from "../../../src/utils/security/audit-flags";
import { parseSessionDuration } from "../../../src/utils/security/auth-utils";
import { safeRedirect } from "../../../src/utils/security/safe-redirect";

describe("input-sanitizer — triage-gate fast paths", () => {
  it("returns the same string reference for clean text (gate fast path)", () => {
    const clean = "This is a plain admin note about the release schedule.";
    expect(sanitizeString(clean)).toBe(clean);
  });

  it("returns the same reference when no strip pattern can match despite gate chars", () => {
    const odd = "a=b and 1:2";
    expect(sanitizeString(odd)).toBe(odd);
  });

  it("returns false for clean text without a lowercase copy (gate fast path)", () => {
    expect(containsXssVector("Content for item… plain")).toBe(false);
    expect(containsXssVector("")).toBe(false);
  });

  it("still detects mixed-case vectors", () => {
    expect(containsXssVector("<ScRiPt>alert(1)</ScRiPt>")).toBe(true);
    expect(containsXssVector("<IFRAME SRC=X></IFRAME>")).toBe(true);
    expect(containsXssVector('href="JaVaScRiPt:alert(1)"')).toBe(true);
    expect(containsXssVector('SRC="DATA:TEXT/HTML,x"')).toBe(true);
    expect(containsXssVector("ONCLICK=alert(1)")).toBe(true);
  });

  it("preserves Unicode case-folding semantics (Kelvin sign / long s)", () => {
    // U+212A (KELVIN SIGN) lowercases to ASCII "k" — the handler pre-check on
    // the original string cannot see it, but the lowercase fallback must
    // (K → k completes the `\w+` between 'onclick' and '=').
    expect(containsXssVector("onclick\u212A1=alert(1)")).toBe(true);
    // In a URL scheme position K sits where the pattern expects 's', so the
    // lowercase copy is "javakript:" — no match (pre-existing behavior).
    expect(containsXssVector("java\u212Aript:alert(1)")).toBe(false);
    // U+017F (LATIN SMALL LETTER LONG S) is already lowercase — toLowerCase
    // leaves it as 'ſ', so the URL-scheme regex does not match it either.
    expect(containsXssVector("JAVA\u017FCRIPT:alert(1)")).toBe(false);
    expect(containsXssVector("JAVASCRIPT:alert(1)")).toBe(true);
  });

  it("reports false for HTML without vectors (gate passes, no vector found)", () => {
    expect(containsXssVector("<p>Hello world</p>")).toBe(false);
    expect(containsXssVector('data-id="123"')).toBe(false);
  });
});

describe("user-attribute-policy — for…in strip loop", () => {
  it("strips privileged own keys and ignores inherited enumerable keys", () => {
    const proto = { role: "admin" };
    const patch = Object.assign(Object.create(proto), { username: "guest", isAdmin: true });
    stripPrivilegedUserFields(patch);
    expect(patch.username).toBe("guest");
    expect(Object.hasOwn(patch, "isAdmin")).toBe(false);
    // Inherited keys are untouched (same as Object.keys-based iteration).
    expect(patch.role).toBe("admin");
  });

  it("strips every privileged key even when several are present", () => {
    const patch = { role: "admin", isAdmin: true, permissions: ["*"], name: "x" };
    stripPrivilegedUserFields(patch);
    expect(patch).toEqual({ name: "x" });
  });
});

describe("cors-utils — shared constants and single-slot memo", () => {
  it("returns allowed headers for localhost origins (dev mode)", () => {
    const headers = getCorsHeaders("http://localhost:5173", true);
    expect(headers?.["Access-Control-Allow-Origin"]).toBe("http://localhost:5173");
    expect(headers?.["Access-Control-Allow-Credentials"]).toBe("true");
  });

  it("returns restrictive headers for disallowed origins and stays consistent across repeats", () => {
    const a = getCorsHeaders("https://evil.example.com", true);
    const b = getCorsHeaders("https://evil.example.com", true);
    expect(a?.["Access-Control-Allow-Origin"]).toBe("null");
    expect(a?.["Access-Control-Allow-Methods"]).toBe("");
    expect(b).toEqual(a);
  });

  it("does not leak a cached allowed origin to a disallowed one", () => {
    const allowed = getCorsHeaders("http://localhost:5173", true);
    expect(allowed?.["Access-Control-Allow-Origin"]).toBe("http://localhost:5173");
    const disallowed = getCorsHeaders("https://evil.example.com", true);
    expect(disallowed?.["Access-Control-Allow-Origin"]).toBe("null");
    const again = getCorsHeaders("http://localhost:5173", true);
    expect(again?.["Access-Control-Allow-Origin"]).toBe("http://localhost:5173");
  });

  it("returns null for a missing origin", () => {
    expect(getCorsHeaders(null, true)).toBeNull();
  });
});

describe("csrf-utils — precomputed cookie shapes and result objects", () => {
  type CsrfCookies = Parameters<typeof generateCsrfToken>[0];

  it("generates a 64-char hex token and sets the unprefixed cookie when insecure", () => {
    const setCalls: Array<{ name: string; value: string; opts: Record<string, unknown> }> = [];
    const cookies = {
      get: () => undefined,
      set: (name: string, value: string, opts: Record<string, unknown>) => {
        setCalls.push({ name, value, opts });
      },
    } as unknown as CsrfCookies;
    const token = generateCsrfToken(cookies, false);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(setCalls).toHaveLength(1);
    expect(setCalls[0]?.name).toBe(CSRF_TOKEN_COOKIE_NAME);
    expect(setCalls[0]?.opts).toMatchObject({
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "strict",
      maxAge: 86400,
    });
    expect(setCalls[0]?.opts).toHaveProperty("domain", undefined);
  });

  it("sets the __Host- prefixed cookie when secure", () => {
    const setCalls: Array<{ name: string; opts: Record<string, unknown> }> = [];
    const cookies = {
      get: () => undefined,
      set: (name: string, _value: string, opts: Record<string, unknown>) => {
        setCalls.push({ name, opts });
      },
    } as unknown as CsrfCookies;
    generateCsrfToken(cookies, true);
    expect(setCalls[0]?.name).toBe(`__Host-${CSRF_TOKEN_COOKIE_NAME}`);
    expect(setCalls[0]?.opts).toMatchObject({ secure: true, sameSite: "strict" });
  });

  it("ensureCsrfToken reuses the existing cookie without regenerating", () => {
    let setCount = 0;
    const cookies = {
      get: () => "existing-token",
      set: () => {
        setCount++;
      },
    } as unknown as CsrfCookies;
    expect(ensureCsrfToken(cookies, false)).toBe("existing-token");
    expect(setCount).toBe(0);
  });

  it("validateCsrfForRequest fast-paths safe methods and rejects missing tokens", () => {
    const cookies = { get: () => undefined, set: () => {} } as unknown as CsrfCookies;
    const getRequest = new Request("http://localhost/api/x", { method: "GET" });
    expect(validateCsrfForRequest(cookies, getRequest, false)).toEqual({ isValid: true });

    const postRequest = new Request("http://localhost/api/x", {
      method: "POST",
      headers: { host: "localhost" },
    });
    expect(validateCsrfForRequest(cookies, postRequest, false)).toEqual({
      isValid: false,
      error: "CSRF token required",
    });
  });

  it("validateCsrfToken rejects length mismatches before the comparison loop", () => {
    const cookies = {
      get: () => "0123456789abcdef".repeat(4),
      set: () => {},
    } as unknown as CsrfCookies;
    expect(validateCsrfToken(cookies, "short", false)).toBe(false);
    expect(validateCsrfToken(cookies, undefined, false)).toBe(false);
  });
});

describe("session-cookie — precomputed header needles", () => {
  const SESSION_VALUE = "bench-session-token-123";

  it("prefers __Host- on secure connections and plain on insecure connections", () => {
    const header = `theme=dark; my_auth_sessions_extra=zzz; __Host-auth_sessions=${SESSION_VALUE}; csrf_token=abc; auth_sessions=fallback`;
    expect(readSessionIdFromCookieHeader(header, true)).toBe(SESSION_VALUE);
    expect(readSessionIdFromCookieHeader(header, false)).toBe("fallback");
  });

  it("never matches a cookie name that is only a suffix of another", () => {
    expect(
      readSessionIdFromCookieHeader("my_auth_sessions_extra=zzz; theme=dark", true),
    ).toBeUndefined();
  });

  it("returns undefined for empty or missing headers", () => {
    expect(readSessionIdFromCookieHeader("", true)).toBeUndefined();
    expect(readSessionIdFromCookieHeader(null, true)).toBeUndefined();
    expect(readSessionIdFromCookieHeader(undefined, false)).toBeUndefined();
  });

  it("handles all three variants in one header", () => {
    const header = `${SESSION_COOKIE_NAME}=plain; ${SECURE_SESSION_COOKIE_NAME}=securev; ${HOST_SESSION_COOKIE_NAME}=hostv`;
    expect(readSessionIdFromCookieHeader(header, true)).toBe("hostv");
    expect(readSessionIdFromCookieHeader(header, false)).toBe("plain");
  });
});

describe("audit-flags — env fast path memo", () => {
  const OLD_DISABLE = process.env.DISABLE_AUDIT_LOGS;
  const OLD_SYNC = process.env.AUDIT_CHAIN_SYNC;

  afterEach(() => {
    if (OLD_DISABLE === undefined) delete process.env.DISABLE_AUDIT_LOGS;
    else process.env.DISABLE_AUDIT_LOGS = OLD_DISABLE;
    if (OLD_SYNC === undefined) delete process.env.AUDIT_CHAIN_SYNC;
    else process.env.AUDIT_CHAIN_SYNC = OLD_SYNC;
  });

  it("reflects env values and updates when they change", () => {
    process.env.DISABLE_AUDIT_LOGS = "true";
    process.env.AUDIT_CHAIN_SYNC = "true";
    expect(getAuditFlagsSync()).toEqual({ disabled: true, chainSync: true });
    // Memo must refresh on env change.
    process.env.DISABLE_AUDIT_LOGS = "false";
    expect(getAuditFlagsSync()).toEqual({ disabled: false, chainSync: true });
  });

  it("falls back to the safe default when no env vars are set", () => {
    delete process.env.DISABLE_AUDIT_LOGS;
    delete process.env.AUDIT_CHAIN_SYNC;
    expect(getAuditFlagsSync()).toEqual({ disabled: false, chainSync: false });
  });
});

describe("auth-utils — hoisted duration regex", () => {
  it("parses valid durations", () => {
    expect(parseSessionDuration("1h")).toBe(3_600_000);
    expect(parseSessionDuration("007d")).toBe(604_800_000);
    expect(parseSessionDuration("90ms")).toBe(90);
  });

  it("is case-sensitive (no /i flag was introduced)", () => {
    expect(parseSessionDuration("1H")).toBe(86_400_000);
    expect(parseSessionDuration("2W")).toBe(86_400_000);
  });
});

describe("safe-redirect — hoisted scheme regex", () => {
  it("allows relative paths containing a colon after the leading slash", () => {
    expect(safeRedirect("/A:weird", "/fallback")).toBe("/A:weird");
    expect(safeRedirect("/path/with:colon", "/fallback")).toBe("/path/with:colon");
  });

  it("still blocks scheme-like and protocol-relative payloads", () => {
    expect(safeRedirect("javascript:alert(1)", "/fallback")).toBe("/fallback");
    expect(safeRedirect("//evil.example.com", "/fallback")).toBe("/fallback");
  });
});
