/**
 * @file tests/unit/scripts/security-scanner.test.ts
 * @description Pure cores of the OWASP scanner (`scripts/security/scanner.ts`)
 * that decide whether an audit finding is real: per-cookie `Set-Cookie`
 * isolation and grading, production-target detection, and the bounded JSON
 * field lookups the BOLA probes use.
 *
 * Why: the A02 audit used to join every `Set-Cookie` header, so a flag carried
 * by `svelty-csrf` was credited to `auth_sessions` and a session cookie missing
 * HttpOnly/Secure/SameSite was reported as a pass. These tests pin per-cookie
 * isolation so that regression cannot come back silently.
 */

import { describe, expect, it } from "vitest";

import {
  assessSessionCookieFlags,
  findSessionCookie,
  firstCollectionId,
  isProductionTargetFor,
  parseSetCookieHeader,
  parseSetCookieHeaders,
  readStringField,
  type CookieFlagOutcome,
} from "../../../scripts/security/scanner";

function reportedTests(outcomes: readonly CookieFlagOutcome[]): string[] {
  return outcomes.flatMap((outcome) => (outcome.kind === "report" ? [outcome.test] : []));
}

function notes(outcomes: readonly CookieFlagOutcome[]): string[] {
  return outcomes.flatMap((outcome) => (outcome.kind === "note" ? [outcome.message] : []));
}

describe("Set-Cookie parsing", () => {
  it("splits name, value and attributes", () => {
    const [entry] = parseSetCookieHeader(
      "__Host-auth_sessions=abc123; Path=/; HttpOnly; Secure; SameSite=Strict",
    );

    expect(entry.name).toBe("__Host-auth_sessions");
    expect(entry.value).toBe("abc123");
    expect(entry.attributes.get("httponly")).toBe(true);
    expect(entry.attributes.get("samesite")).toBe("Strict");
  });

  it("keeps a comma inside Expires in one attribute (never a comma split)", () => {
    const [entry] = parseSetCookieHeader(
      "auth_sessions=x; Expires=Wed, 21 Oct 2026 07:28:00 GMT; HttpOnly",
    );

    expect(entry.attributes.get("expires")).toBe("Wed, 21 Oct 2026 07:28:00 GMT");
    expect(entry.attributes.has("httponly")).toBe(true);
  });

  it("returns no entry for a header without a name/value pair", () => {
    expect(parseSetCookieHeader("HttpOnly")).toEqual([]);
    expect(parseSetCookieHeader("=orphan-value")).toEqual([]);
  });
});

describe("session cookie isolation", () => {
  it("never credits a flag carried by another cookie", () => {
    const entries = parseSetCookieHeaders([
      "svelty-csrf=token; HttpOnly; Secure; SameSite=Strict; Path=/",
      "auth_sessions=session; Path=/",
    ]);
    const session = findSessionCookie(entries);
    if (!session) throw new Error("session cookie was not isolated");

    expect(session.name).toBe("auth_sessions");
    expect(session.attributes.has("httponly")).toBe(false);

    const outcomes = assessSessionCookieFlags(session, {
      requiresSecure: true,
      productionTarget: true,
      base: "https://cms.example.com",
    });
    expect(reportedTests(outcomes)).toEqual([
      "Cookie missing HttpOnly",
      "Cookie missing Secure",
      "Cookie missing SameSite",
      "Cookie missing __Host- prefix",
    ]);
  });

  it("recognises the production __Host- variant and ignores unrelated cookies", () => {
    const entries = parseSetCookieHeaders([
      "svelty-csrf=token",
      "__Host-auth_sessions=session; HttpOnly",
      "auth_sessions_backup=other",
    ]);

    expect(findSessionCookie(entries)?.name).toBe("__Host-auth_sessions");
    expect(findSessionCookie(parseSetCookieHeaders(["theme=dark"]))).toBeUndefined();
  });
});

describe("cookie flag grading", () => {
  it("passes every flag on a hardened production session cookie", () => {
    const [cookie] = parseSetCookieHeader("__Host-auth_sessions=s; HttpOnly; Secure; SameSite=Lax");
    const outcomes = assessSessionCookieFlags(cookie, {
      requiresSecure: true,
      productionTarget: true,
      base: "https://cms.example.com",
    });

    expect(outcomes.map((outcome) => outcome.kind)).toEqual(["pass", "pass", "pass", "pass"]);
    expect(reportedTests(outcomes)).toEqual([]);
  });

  it("reports SameSite=None instead of accepting it", () => {
    const [cookie] = parseSetCookieHeader("auth_sessions=s; HttpOnly; Secure; SameSite=None");
    const outcomes = assessSessionCookieFlags(cookie, {
      requiresSecure: true,
      productionTarget: false,
      base: "https://cms.example.com",
    });

    expect(reportedTests(outcomes)).toEqual(["Cookie missing SameSite"]);
    const finding = outcomes.find((outcome) => outcome.kind === "report");
    expect(finding).toMatchObject({
      risk: "MEDIUM",
      detail: 'Session cookie "auth_sessions" has SameSite=None (expected Strict or Lax)',
    });
  });

  it("notes the plain-HTTP dev exemptions instead of reporting them", () => {
    const [cookie] = parseSetCookieHeader("auth_sessions=s; HttpOnly; SameSite=Strict");
    const outcomes = assessSessionCookieFlags(cookie, {
      requiresSecure: false,
      productionTarget: false,
      base: "http://127.0.0.1:4173",
    });

    expect(reportedTests(outcomes)).toEqual([]);
    expect(notes(outcomes)).toEqual([
      'Secure: not set on "auth_sessions" (target http://127.0.0.1:4173 is plain HTTP)',
      "__Host- prefix: not required for http://127.0.0.1:4173 (non-production target)",
    ]);
  });
});

describe("production target detection", () => {
  it("treats HTTPS off-loopback as production", () => {
    expect(isProductionTargetFor("https://cms.example.com", "test")).toBe(true);
    expect(isProductionTargetFor("https://localhost:4173", "test")).toBe(false);
    expect(isProductionTargetFor("https://127.0.0.1", "test")).toBe(false);
    expect(isProductionTargetFor("https://[::1]:4173", "test")).toBe(false);
    expect(isProductionTargetFor("http://127.0.0.1:4173", "test")).toBe(false);
  });

  it("treats NODE_ENV=production as production even on loopback", () => {
    expect(isProductionTargetFor("http://127.0.0.1:4173", "production")).toBe(true);
  });
});

describe("bounded JSON lookups", () => {
  it("reads a nested string field", () => {
    expect(readStringField(JSON.stringify({ data: { user: { _id: "u-1" } } }), "_id")).toBe("u-1");
  });

  it("ignores non-string values and non-JSON payloads", () => {
    expect(readStringField(JSON.stringify({ _id: 42 }), "_id")).toBeNull();
    expect(readStringField(JSON.stringify({ _id: "" }), "_id")).toBeNull();
    expect(readStringField("<html>not json</html>", "_id")).toBeNull();
  });

  it("finds the first collection name or id", () => {
    expect(firstCollectionId(JSON.stringify({ data: [{ name: "posts" }] }))).toBe("posts");
    expect(firstCollectionId(JSON.stringify({ data: [{ _id: "c-1" }, { id: "c-2" }] }))).toBe(
      "c-1",
    );
    expect(firstCollectionId(JSON.stringify({ data: [{ _id: 42 }] }))).toBeNull();
    expect(firstCollectionId("not json")).toBeNull();
  });
});

describe("cookie name assertion guard", () => {
  it("does not accept an attribute map from the wrong cookie", () => {
    // Guard the exact regression: a session cookie WITHOUT HttpOnly must never
    // inherit the flag merely because another cookie in the response has it.
    const entries = parseSetCookieHeaders([
      "svelty-csrf=token; HttpOnly; Secure; SameSite=Strict",
      "auth_sessions=session",
    ]);
    const session = findSessionCookie(entries);
    if (!session) throw new Error("session cookie was not isolated");

    expect(session.attributes.size).toBe(0);
    expect(entries[0].attributes.has("httponly")).toBe(true);
  });
});
