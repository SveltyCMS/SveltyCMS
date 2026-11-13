/**
 * @file scripts/security/scanner.ts
 * @description Enterprise-grade automated security scanner for SveltyCMS.
 *
 * Probes API endpoints for vulnerabilities with optional authenticated testing.
 * Maps findings to OWASP Top 10 (2021) categories.
 *
 * ### Standalone Usage:
 *   bun run scripts/security/scanner.ts                       # unauthenticated scan
 *   bun run scripts/security/scanner.ts --auth                # authenticated scan
 *   bun run scripts/security/scanner.ts --ci                  # CI mode
 *
 * ### Import (used by master scripts/security-audit.ts):
 *   import { runScanner } from "./security/scanner";
 *   await runScanner({ auth: true, ci: true });
 *
 * ### Audit Categories (OWASP 2021 mapped)
 * - A01: Broken Access Control → auth bypass, endpoint protection, GraphQL auth,
 *   CSRF (token/Content-Type matrix + X-Forwarded-Host), BOLA / privilege
 *   escalation, X-HTTP-Method-Override
 * - A02: Cryptographic Failures → per-cookie session flags (HttpOnly / Secure /
 *   SameSite / __Host-), HSTS, token handling
 * - A03: Injection → SQLi, NoSQLi, XSS reflection, path traversal, plus the
 *   public (unauthenticated) login surface
 * - A04: Insecure Design → GraphQL depth/alias limits, rate limiting
 * - A05: Security Misconfiguration → security headers, CORS, CSP, GraphQL
 *   introspection on production targets
 * - A07: Identification Failures → account lockout, rate limiting
 *
 * Every probe reports whether it actually asserted something: a request that
 * only got `401` (needs `--auth`) is counted and printed as SKIPPED, never as a
 * pass. The summary prints tested vs skipped totals.
 */

const AUDITOR_UA = "SveltyCMS-Security-Audit/3.0";

interface Finding {
  endpoint: string;
  test: string;
  owasp: string;
  risk: FindingRisk;
  detail: string;
}

/** Severity band a finding is reported under. */
export type FindingRisk = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

const findings: Finding[] = [];
let authCookie: string | null = null;
let csrfToken: string | null = null;

// CLI-mode globals (only used when run standalone)
let BASE = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://127.0.0.1:4173";
let IS_CI = false;
let AUTH_MODE = false;
let ONLY_FILTER: string | null = null;

/** TEST_MODE with SKIP_GATEKEEPER disables auth intentionally — don't report auth bypasses. */
const IS_TEST_MODE = process.env.TEST_MODE === "true" || process.env.SKIP_GATEKEEPER === "true";

function resolveCliArgs() {
  BASE = process.argv.includes("--base")
    ? process.argv[process.argv.indexOf("--base") + 1]
    : process.env.PLAYWRIGHT_TEST_BASE_URL ||
      (process.env.TEST_MODE === "true" ? "http://127.0.0.1:5173" : "http://127.0.0.1:4173");
  IS_CI = process.argv.includes("--ci");
  AUTH_MODE = process.argv.includes("--auth");
  const arg = process.argv.find((a) => a.startsWith("--only="));
  ONLY_FILTER = arg?.split("=")[1] ?? null;
}

/** Run the scanner programmatically. Returns exit code (0 = clean). */
export async function runScanner(
  options: { auth?: boolean; ci?: boolean; base?: string; only?: string } = {},
): Promise<number> {
  if (options.base) BASE = options.base;
  if (options.ci !== undefined) IS_CI = options.ci;
  if (options.auth !== undefined) AUTH_MODE = options.auth;
  if (options.only !== undefined) ONLY_FILTER = options.only;

  await main();

  const byRisk = (r: string) => findings.filter((f) => f.risk === r).length;
  if (IS_CI && (byRisk("CRITICAL") > 0 || byRisk("HIGH") > 0)) return 1;
  return findings.length > 0 ? 1 : 0;
}

function report(
  endpoint: string,
  test: string,
  owasp: string,
  risk: Finding["risk"],
  detail: string,
) {
  findings.push({ endpoint, test, owasp, risk, detail });
  const icons = { CRITICAL: "🔴", HIGH: "🟠", MEDIUM: "🟡", LOW: "🔵" };
  console.log(`  ${icons[risk]} [${risk}] [${owasp}] ${test}: ${detail}`);
}

/** Probes that actually reached a parser/guard and produced a verdict. */
let testsRun = 0;
/** Probes that could not assert anything (auth required, endpoint absent, …). */
let testsSkipped = 0;

function pass(message: string) {
  testsRun++;
  console.log(`  ✅ ${message}`);
}

function skip(message: string, reason = "auth required") {
  testsSkipped++;
  console.log(`  ⏭️  SKIPPED (${reason}) — ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A production target is HTTPS off-loopback, or NODE_ENV=production. */
function isProductionTarget(): boolean {
  return isProductionTargetFor(BASE);
}

/** Pure form of `isProductionTarget()` — the audit never treats loopback as production. */
export function isProductionTargetFor(
  base: string,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  if (nodeEnv === "production") return true;
  if (!/^https:\/\//i.test(base)) return false;
  return !/^https:\/\/(localhost|127\.0\.0\.1|\[::1\])(?:[:/]|$)/i.test(base);
}

/** Session cookies: `auth_sessions` and its `__Host-` production variant. */
const SESSION_COOKIE_RE = /(^|-)auth_sessions$/i;

/** One parsed `Set-Cookie` header — attributes belong to THIS cookie only. */
export interface SetCookieEntry {
  name: string;
  value: string;
  /** Lower-cased `flag` / `attribute=value` map for THIS header only. */
  attributes: Map<string, string | true>;
  raw: string;
}

/** Parse ONE `Set-Cookie` header line into a single per-cookie entry. */
export function parseSetCookieHeader(raw: string): SetCookieEntry[] {
  const [pair, ...attrParts] = raw.split(";");
  const separator = pair.indexOf("=");
  if (separator <= 0) return [];
  const name = pair.slice(0, separator).trim();
  const value = pair.slice(separator + 1).trim();
  const attributes = new Map<string, string | true>();
  for (const part of attrParts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) attributes.set(trimmed.toLowerCase(), true);
    else attributes.set(trimmed.slice(0, eq).trim().toLowerCase(), trimmed.slice(eq + 1).trim());
  }
  return [{ name, value, attributes, raw }];
}

/**
 * Parse one `Set-Cookie` header per entry, never joined.
 * A flag carried by one cookie (`svelty-csrf`) must not be credited to another
 * (`auth_sessions`) — the bug the old joined-header implementation shipped.
 */
export function parseSetCookieHeaders(rawValues: readonly string[]): SetCookieEntry[] {
  return rawValues.flatMap(parseSetCookieHeader);
}

/** The session cookie an audit must grade, or `undefined` when the response has none. */
export function findSessionCookie(entries: readonly SetCookieEntry[]): SetCookieEntry | undefined {
  return entries.find((cookie) => SESSION_COOKIE_RE.test(cookie.name));
}

/**
 * Split a response's `set-cookie` headers into per-cookie entries.
 *
 * NEVER joins the headers: a flag carried by one cookie (e.g. `svelty-csrf`)
 * must not be credited to another (`auth_sessions`). Splits on newlines only —
 * a comma split mangles `Expires` dates.
 */
function setCookieEntries(headers: Headers): SetCookieEntry[] {
  const split = headers.getSetCookie?.();
  if (split && split.length > 0) return parseSetCookieHeaders(split);
  const combined = headers.get("set-cookie");
  if (!combined) return [];
  return parseSetCookieHeaders(combined.split("\n"));
}

/** One graded cookie flag: a pass, an environment note, or a finding to report. */
export type CookieFlagOutcome =
  | { kind: "pass"; message: string }
  | { kind: "note"; message: string }
  | { kind: "report"; test: string; risk: FindingRisk; detail: string };

/**
 * Pure core for the A02 cookie audit: grade HttpOnly / Secure / SameSite /
 * `__Host-` on the isolated session cookie.
 *
 * `productionTarget` only escalates; a plain-HTTP dev target reports a note
 * instead of a finding, which is exactly what the CLI printed before.
 */
export function assessSessionCookieFlags(
  cookie: SetCookieEntry,
  options: { requiresSecure: boolean; productionTarget: boolean; base: string },
): CookieFlagOutcome[] {
  const outcomes: CookieFlagOutcome[] = [];
  const name = cookie.name;

  if (cookie.attributes.has("httponly")) {
    outcomes.push({ kind: "pass", message: `HttpOnly: set on "${name}"` });
  } else {
    outcomes.push({
      kind: "report",
      test: "Cookie missing HttpOnly",
      risk: "HIGH",
      detail: `Session cookie "${name}" lacks HttpOnly — XSS can steal the token`,
    });
  }

  if (cookie.attributes.has("secure")) {
    outcomes.push({ kind: "pass", message: `Secure: set on "${name}"` });
  } else if (options.requiresSecure) {
    outcomes.push({
      kind: "report",
      test: "Cookie missing Secure",
      risk: "MEDIUM",
      detail: `Session cookie "${name}" lacks Secure on an HTTPS/production target`,
    });
  } else {
    outcomes.push({
      kind: "note",
      message: `Secure: not set on "${name}" (target ${options.base} is plain HTTP)`,
    });
  }

  const sameSite = cookie.attributes.get("samesite");
  if (typeof sameSite === "string" && /^(strict|lax)$/i.test(sameSite)) {
    outcomes.push({ kind: "pass", message: `SameSite=${sameSite}: set on "${name}"` });
  } else {
    outcomes.push({
      kind: "report",
      test: "Cookie missing SameSite",
      risk: "MEDIUM",
      detail:
        typeof sameSite === "string"
          ? `Session cookie "${name}" has SameSite=${sameSite} (expected Strict or Lax)`
          : `Session cookie "${name}" lacks SameSite — CSRF risk`,
    });
  }

  if (name.startsWith("__Host-")) {
    outcomes.push({ kind: "pass", message: `__Host- prefix: present on "${name}"` });
  } else if (options.productionTarget) {
    outcomes.push({
      kind: "report",
      test: "Cookie missing __Host- prefix",
      risk: "LOW",
      detail: `Session cookie "${name}" has no __Host- prefix — subdomain cookie leakage risk (RFC 6265bis)`,
    });
  } else {
    outcomes.push({
      kind: "note",
      message: `__Host- prefix: not required for ${options.base} (non-production target)`,
    });
  }

  return outcomes;
}

/** First string value stored under `key` in a JSON response (BFS, bounded). */
export function readStringField(payload: string, key: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  const queue: unknown[] = [parsed];
  let inspected = 0;
  while (queue.length > 0 && inspected < 50) {
    inspected++;
    const node = queue.shift();
    if (Array.isArray(node)) {
      queue.push(...node);
      continue;
    }
    if (!isRecord(node)) continue;
    const value = node[key];
    if (typeof value === "string" && value.length > 0) return value;
    queue.push(...Object.values(node));
  }
  return null;
}

/** First collection id/name present in a `/api/collections` payload (bounded). */
export function firstCollectionId(payload: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  const queue: unknown[] = [parsed];
  let inspected = 0;
  while (queue.length > 0 && inspected < 200) {
    inspected++;
    const node = queue.shift();
    if (Array.isArray(node)) {
      queue.push(...node);
      continue;
    }
    if (!isRecord(node)) continue;
    const candidate = node._id ?? node.id ?? node.name;
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
    queue.push(...Object.values(node));
  }
  return null;
}

async function probe(
  method: string,
  path: string,
  headers?: Record<string, string>,
  body?: string,
  timeout = 5000,
) {
  const hdrs: Record<string, string> = { "User-Agent": AUDITOR_UA, ...headers };
  // An explicit Cookie header (even empty) always wins — audits that need a
  // second identity or a cookie-less request must not inherit the session.
  if (authCookie && headers?.Cookie === undefined) hdrs["Cookie"] = authCookie;

  const start = performance.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: hdrs,
      body,
      signal: AbortSignal.timeout(timeout),
    });
    const elapsed = performance.now() - start;

    // Use getSetCookie() for correct parsing — split(",") mangles date commas
    const cookies: Record<string, string> = {};
    try {
      const setCookieHeaders = res.headers.getSetCookie?.() ?? [];
      for (const sc of setCookieHeaders) {
        const m = sc.trim().match(/^([^=]+)=([^;]*)/);
        if (m) cookies[m[1].trim()] = m[2];
      }
    } catch {
      // Fallback for environments without getSetCookie()
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) {
        // Split on \n (not comma) — set-cookie values contain date commas
        for (const part of setCookie.split("\n")) {
          const m = part.trim().match(/^([^=]+)=([^;]*)/);
          if (m) cookies[m[1].trim()] = m[2];
        }
      }
    }

    return {
      status: res.status,
      headers: res.headers,
      body: await res.text().catch(() => ""),
      cookies,
      elapsed,
    };
  } catch {
    return null;
  }
}

// ── AUTH SETUP (seed admin + login) ──────────────────────────────────────

async function setupAuth(): Promise<boolean> {
  console.log("\n🔑 Setting up authenticated audit session...");

  const testSecret = process.env.TEST_API_SECRET;
  if (!testSecret || testSecret === "test-secret-dev") {
    console.warn("  ⚠️  Test API secret not set or using dev default — set in CI!");
    if (IS_CI && !testSecret) {
      console.log("  ❌ CI requires a test API secret — skipping auth setup");
      return false;
    }
  }

  // Step 1: Try to seed a test admin user via testing endpoint
  const seedRes = await probe(
    "POST",
    "/api/testing",
    {
      "Content-Type": "application/json",
      "x-test-secret": testSecret || "test-secret-dev",
    },
    JSON.stringify({
      action: "seed",
      email: "audit@security.test",
      password: "AuditPass123!",
      username: "security-auditor",
    }),
    10000,
  );

  if (!seedRes || seedRes.status !== 200) {
    console.log("  ⚠️  Testing endpoint unavailable — running unauthenticated audit only");
    return false;
  }
  console.log("  ✅ Test admin user seeded");

  // Step 2: Login with real credentials (tests lockout + rate limiting)
  const loginRes = await probe(
    "POST",
    "/api/auth/login",
    { "Content-Type": "application/json" },
    JSON.stringify({ email: "audit@security.test", password: "AuditPass123!" }),
  );

  if (!loginRes || loginRes.status !== 200) {
    console.log(`  ⚠️  Login failed (${loginRes?.status}) — continuing unauthenticated`);
    return false;
  }

  // Extract session cookie — pick the auth_sessions entry, never the first
  // header (a `svelty-csrf` cookie may be emitted first).
  const loginEntries = setCookieEntries(loginRes.headers);
  const sessionEntry = findSessionCookie(loginEntries);
  const firstEntry = loginEntries[0];
  authCookie = sessionEntry
    ? `${sessionEntry.name}=${sessionEntry.value}`
    : firstEntry
      ? `${firstEntry.name}=${firstEntry.value}`
      : null;

  // Extract CSRF token
  csrfToken =
    loginRes.cookies["svelty-csrf"] ||
    loginRes.cookies["__Host-svelty-csrf"] ||
    loginEntries.find((cookie) => /csrf/i.test(cookie.name))?.value ||
    null;

  console.log(`  ✅ Authenticated as audit@security.test`);
  console.log(`     Session cookie: ${authCookie ? "present" : "missing"}`);
  console.log(`     CSRF token: ${csrfToken ? "present" : "missing"}`);
  return true;
}

// ── TEARDOWN (clean up test admin) ─────────────────────────────────────

async function teardownAuth() {
  if (!authCookie) return;
  console.log("\n🧹 Cleaning up test users...");
  const testSecret = process.env.TEST_API_SECRET || "test-secret-dev";
  for (const email of ["audit@security.test", LOW_PRIV_USER.email]) {
    try {
      await probe(
        "POST",
        "/api/testing",
        {
          "Content-Type": "application/json",
          "x-test-secret": testSecret,
        },
        JSON.stringify({ action: "wipe-user", email }),
        5000,
      );
      console.log(`  ✅ Test user removed: ${email}`);
    } catch {
      console.log(`  ⚠️  Could not clean up ${email} (non-fatal)`);
    }
  }
}

// ── A01: TESTING API BACKDOOR CLOSURE ───────────────────────────────────

async function auditTestingBackdoor() {
  console.log("\n🚪 [A01] Testing API Backdoor Closure");

  const noSecret = await probe(
    "POST",
    "/api/testing",
    { "Content-Type": "application/json" },
    JSON.stringify({ action: "seed", email: "probe@test.com", password: "Probe123!" }),
  );

  if (!noSecret) {
    report("/api/testing", "Unreachable", "A01", "MEDIUM", "Could not probe testing endpoint");
    return;
  }

  if (noSecret.status === 200) {
    report(
      "/api/testing",
      "Backdoor open",
      "A01",
      "CRITICAL",
      "POST without x-test-secret returned 200 — unauthenticated testing API",
    );
  } else if (noSecret.status === 401 || noSecret.status === 403) {
    pass(`No secret: rejected (${noSecret.status})`);
  } else if (noSecret.status === 404) {
    pass(`No secret: stripped from build (${noSecret.status})`);
  } else {
    report(
      "/api/testing",
      "Unexpected status",
      "A01",
      "HIGH",
      `No secret returned ${noSecret.status} (expected 401/403/404)`,
    );
  }

  const wrongSecret = await probe(
    "POST",
    "/api/testing",
    {
      "Content-Type": "application/json",
      "x-test-secret": "definitely-wrong-secret-value",
    },
    JSON.stringify({ action: "seed", email: "probe@test.com", password: "Probe123!" }),
  );

  if (!wrongSecret) return;

  if (wrongSecret.status === 200) {
    report(
      "/api/testing",
      "Weak secret",
      "A01",
      "CRITICAL",
      "POST with invalid x-test-secret returned 200",
    );
  } else if (
    wrongSecret.status === 401 ||
    wrongSecret.status === 403 ||
    wrongSecret.status === 404
  ) {
    pass(`Wrong secret: rejected (${wrongSecret.status})`);
  } else {
    report(
      "/api/testing",
      "Wrong secret",
      "A01",
      "HIGH",
      `Invalid secret returned ${wrongSecret.status}`,
    );
  }

  // Known matrix default must not work without TEST_MODE/BENCHMARK on the server
  const knownDefault = await probe(
    "POST",
    "/api/testing",
    {
      "Content-Type": "application/json",
      "x-test-secret": "SVELTYCMS_TEST_SECRET_2026",
    },
    JSON.stringify({ action: "seed", email: "probe@test.com", password: "Probe123!" }),
  );

  if (!knownDefault) return;

  if (knownDefault.status === 200) {
    report(
      "/api/testing",
      "Hardcoded secret",
      "A01",
      "CRITICAL",
      "Default benchmark secret accepted without server TEST_MODE/BENCHMARK — production backdoor risk",
    );
  } else if (
    knownDefault.status === 401 ||
    knownDefault.status === 403 ||
    knownDefault.status === 404
  ) {
    pass(`Hardcoded benchmark secret: rejected (${knownDefault.status})`);
  }
}

// ── A01: BROKEN ACCESS CONTROL ──────────────────────────────────────────

async function auditAuth() {
  console.log("\n🔐 [A01] Broken Access Control");
  const endpoints = [
    "/api/settings/system",
    "/api/user",
    "/api/collections",
    "/api/media",
    "/api/token",
    "/api/dashboard",
  ];

  // /config/* routes return 200 during SETUP (they redirect to /setup), not an auth bypass
  if (!isSetupMode()) {
    endpoints.push("/config/system-settings");
  }

  await Promise.all(
    endpoints.map(async (ep) => {
      const res = await probe("GET", ep);
      if (!res) {
        report(ep, "Connection", "A01", "HIGH", "Server unreachable");
        return;
      }
      if (res.status === 200) {
        if (IS_TEST_MODE) {
          console.log(
            `  ℹ️  ${ep}: returned 200 (expected — SKIP_GATEKEEPER bypasses auth in TEST_MODE)`,
          );
        } else if (isSetupMode()) {
          console.log(`  ℹ️  ${ep}: returned 200 (expected — setup mode redirects to /setup)`);
        } else {
          report(ep, "Auth bypass", "A01", "CRITICAL", "Unauthenticated access returns 200");
        }
      } else if (res.status === 401 || res.status === 403 || res.status === blockedStatus()) {
        pass(`${ep}: blocked (${res.status})`);
      } else {
        console.log(`  ℹ️  ${ep}: returned ${res.status} (expected ${blockedStatus()})`);
      }
    }),
  );
}

// ── A01: CSRF & HOST-HEADER INJECTION ────────────────────────────────────

/** Payloads that inject a foreign hostname through reverse-proxy headers. */
const HOST_INJECTION_VALUE = "evil.example.com";

/**
 * Password-reset routes differ per build; probe the known candidates and let a
 * 404 mean "not present" rather than a pass.
 */
const PASSWORD_RESET_PATHS = [
  "/api/auth/request-password-reset",
  "/api/user/request-password-reset",
];

async function auditHostHeaderInjection() {
  const attempts = [
    {
      label: "login",
      path: "/api/auth/login",
      body: JSON.stringify({ email: "audit@security.test", password: "wrong-password" }),
      optional: false,
    },
    ...PASSWORD_RESET_PATHS.map((path) => ({
      label: "password reset",
      path,
      body: JSON.stringify({ email: "audit@security.test" }),
      optional: true,
    })),
  ];

  let resetEndpointFound = false;

  for (const attempt of attempts) {
    const res = await probe(
      "POST",
      attempt.path,
      {
        "Content-Type": "application/json",
        "X-Forwarded-Host": HOST_INJECTION_VALUE,
        "X-Forwarded-Proto": "https",
      },
      attempt.body,
    );

    // A password-reset route that does not exist in this build proves nothing.
    if (attempt.optional && (!res || res.status === 404)) continue;
    if (attempt.optional) resetEndpointFound = true;

    const label = `host injection on ${attempt.label} (${attempt.path})`;
    if (!res) {
      skip(label, "no response");
      continue;
    }

    const echoesHost = res.body.toLowerCase().includes(HOST_INJECTION_VALUE);
    if (res.status >= 200 && res.status < 300) {
      report(
        attempt.path,
        "X-Forwarded-Host accepted",
        "A01",
        "HIGH",
        `${label}: returned ${res.status} with an attacker-controlled forwarded host`,
      );
    } else if (echoesHost) {
      report(
        attempt.path,
        "X-Forwarded-Host reflected",
        "A01",
        "HIGH",
        `${label}: response echoes the injected host — password-reset poisoning risk`,
      );
    } else {
      pass(`${label}: injected host ignored (${res.status})`);
    }
  }

  if (!resetEndpointFound) {
    skip("host injection on password reset", "no password-reset endpoint in this build");
  }
}

async function auditCSRF() {
  console.log("\n🛡️  [A01] CSRF Protection");

  // Host-header injection is public-reachable — probe it even without --auth.
  await auditHostHeaderInjection();

  if (!authCookie) {
    skip("CSRF token matrix", "requires --auth");
    return;
  }

  const mutations: { method: string; path: string; body: string | undefined }[] = [
    {
      method: "POST",
      path: "/api/collections",
      body: JSON.stringify({ name: "csrf-test" }),
    },
    {
      method: "PUT",
      path: "/api/collections/csrf-test",
      body: JSON.stringify({ data: {} }),
    },
    { method: "DELETE", path: "/api/collections/csrf-test", body: undefined },
  ];

  // Matrix: each state-changing request is replayed with every token/content-type
  // variation. Pass = 400/401/403/422; anything 2xx is a finding.
  const tokenCases: { label: string; headers: Record<string, string> }[] = [
    { label: "missing token", headers: {} },
    { label: "empty token", headers: { "x-csrf-token": "" } },
    { label: "forged token", headers: { "x-csrf-token": "invalid-token" } },
    {
      label: "text/plain body, no token",
      headers: { "Content-Type": "text/plain" },
    },
    {
      label: "form-urlencoded body, no token",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    },
  ];

  const REJECTED = new Set([400, 401, 403, 422]);

  for (const mut of mutations) {
    for (const tokenCase of tokenCases) {
      const label = `${mut.method} ${mut.path} (${tokenCase.label})`;
      const res = await probe(
        mut.method,
        mut.path,
        {
          "Content-Type": "application/json",
          Origin: "https://evil.example.com",
          ...tokenCase.headers,
        },
        mut.body,
      );

      if (!res) {
        skip(label, "no response");
      } else if (REJECTED.has(res.status)) {
        pass(`${label}: rejected (${res.status})`);
      } else if (res.status >= 200 && res.status < 300) {
        report(
          mut.path,
          "CSRF bypass",
          "A01",
          "HIGH",
          `${label}: accepted ${res.status} without a valid CSRF token — cross-site request forgery risk`,
        );
      } else {
        // 404/405/500 — neither a bypass nor a proven CSRF rejection.
        pass(`${label}: no bypass (${res.status})`);
      }
    }
  }

  // "with CSRF" probes stay sequential: the POST creates the `csrf-test`
  // collection that the subsequent PUT/DELETE target.
  if (csrfToken) {
    for (const mut of mutations) {
      const withCsrf = await probe(
        mut.method,
        mut.path,
        {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        mut.body,
      );
      if (withCsrf && withCsrf.status < 400) {
        pass(`${mut.method} ${mut.path}: CSRF token validation works`);
      }
    }
  }
}

// ── A03: INJECTION ──────────────────────────────────────────────────────

async function auditXSS() {
  console.log("\n🛡️  [A03] XSS Reflection");
  const payloads = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "javascript:alert(1)",
  ];

  let htmlReported = false; // Only report HTML content-type once

  await Promise.all(
    payloads.map(async (payload) => {
      const enc = encodeURIComponent(payload);
      const res = await probe("GET", `/api/system/health?q=${enc}`);
      if (!res) return;
      if (res.body.includes(payload)) {
        report(
          "/api/system/health?q=...",
          "XSS reflection",
          "A03",
          "HIGH",
          `Payload reflected: "${payload.substring(0, 40)}"`,
        );
      } else {
        pass(`XSS payload not reflected: "${payload.substring(0, 24)}"`);
      }
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("text/html") && !htmlReported) {
        htmlReported = true;
        report(
          "/api/system/health",
          "HTML response",
          "A03",
          "MEDIUM",
          "API returns text/html — XSS risk surface",
        );
      }
    }),
  );
  console.log(`  ℹ️  Tested ${payloads.length} XSS payloads`);
}

async function auditSQLi() {
  console.log("\n💉 [A03] SQLi & NoSQLi Injection");
  const sqlPayloads = ["'; DROP TABLE users;--", "1' OR '1'='1", "union select * from users"];

  // In SETUP mode, all API endpoints return 503 — injection test can't reach the query parser
  if (isSetupMode()) {
    console.log(
      `  ℹ️  System in SETUP mode — API endpoints are blocked (503). SQLi test requires a configured system.`,
    );
    skip(`${sqlPayloads.length} SQLi payloads`, "system in SETUP mode");
    return;
  }

  let blocked = 0;
  let skippedProbes = 0;

  await Promise.all(
    sqlPayloads.map(async (p) => {
      const label = `SQLi payload "${p.substring(0, 28)}"`;
      const res = await probe("GET", `/api/collections?filter=${encodeURIComponent(p)}`);
      if (!res) {
        skippedProbes++;
        skip(label, "no response");
      } else if (res.status === 401) {
        skippedProbes++;
        skip(label, "401, run with --auth");
      } else if (res.status === 403) {
        blocked++;
        pass(`${label}: actively rejected (403)`);
      } else if (res.status === 400 || res.status === 422) {
        blocked++;
        pass(`${label}: blocked (${res.status})`);
      } else {
        report(
          "/api/collections?filter=...",
          "SQLi not blocked",
          "A03",
          "HIGH",
          `Accepted with ${res.status}: "${p.substring(0, 30)}"`,
        );
      }
    }),
  );

  // NoSQLi: test via collection query parameters (not GraphQL variables)
  if (authCookie) {
    const nosqlPayloads = ['{"$where":"1"}', '{"$expr":{"$gt":["$_id",""]}}'];
    await Promise.all(
      nosqlPayloads.map(async (p) => {
        const res = await probe("GET", `/api/collections?filter=${encodeURIComponent(p)}`);
        if (!res) {
          skippedProbes++;
          skip(`NoSQLi payload ${p.substring(0, 30)}`, "no response");
        } else if (res.status === 400) {
          blocked++;
          pass(`NoSQLi blocked (400): ${p.substring(0, 35)}`);
        } else if (res.status === 200) {
          report(
            "/api/collections?filter=...",
            "NoSQLi not blocked",
            "A03",
            "HIGH",
            `NoSQL payload accepted: ${p.substring(0, 40)}`,
          );
        }
      }),
    );
  } else {
    skip("2 NoSQLi payloads", "requires --auth");
    skippedProbes++;
  }

  console.log(
    `  ℹ️  SQLi/NoSQLi: ${sqlPayloads.length} SQLi + 2 NoSQLi payloads, ${blocked} rejected, ${skippedProbes} skipped`,
  );
}

async function auditPathTraversal() {
  console.log("\n📁 [A03] Path Traversal");
  const payloads = ["../../../etc/passwd", "..\\..\\windows\\system32", "/etc/passwd%00.html"];
  await Promise.all(
    payloads.map(async (p) => {
      const label = `traversal payload "${p.substring(0, 28)}"`;
      const res = await probe("GET", `/api/media/files?path=${encodeURIComponent(p)}`);
      if (!res) {
        skip(label, "no response");
        return;
      }
      if (res.status === 401) {
        // The route is auth-gated: the payload never reached a path resolver.
        skip(label, "401, run with --auth");
      } else if ([400, 403, 404, 422].includes(res.status)) {
        pass(`${label}: blocked (${res.status})`);
      } else if (res.status === 200) {
        report(
          "/api/media/files?path=...",
          "Path traversal",
          "A03",
          "CRITICAL",
          `Payload returned 200: "${p}"`,
        );
      } else {
        pass(`${label}: not accepted (${res.status})`);
      }
    }),
  );
}

/**
 * Unauthenticated injection surface: `/api/auth/login` is public, so a run
 * without `--auth` still parses an attacker-supplied value server-side.
 */
async function auditPublicInjection() {
  console.log("\n💉 [A03] Unauthenticated Injection (public login)");
  const payloads = [
    "'; DROP TABLE users;--",
    "1' OR '1'='1",
    "union select * from users",
    "../../../etc/passwd",
    "..\\..\\windows\\system32",
    "/etc/passwd%00.html",
  ];
  const errorLeak = /SQLITE_ERROR|syntax error|unhandled|drizzle-orm|node_modules/i;

  for (const payload of payloads) {
    const label = `login payload "${payload.substring(0, 28)}"`;
    const res = await probe(
      "POST",
      "/api/auth/login",
      { "Content-Type": "application/json", Origin: BASE },
      JSON.stringify({ email: payload, password: payload }),
    );

    if (!res) {
      skip(label, "no response");
    } else if (res.status >= 200 && res.status < 300) {
      report(
        "/api/auth/login",
        "Injection payload authenticated",
        "A03",
        "CRITICAL",
        `${label}: returned ${res.status} — login bypass via injection`,
      );
    } else if (res.status === 429) {
      skip(label, "rate limited (429)");
    } else if (res.status >= 500 || errorLeak.test(res.body)) {
      report(
        "/api/auth/login",
        "Injection error disclosure",
        "A03",
        "HIGH",
        `${label}: returned ${res.status} with parser/framework internals`,
      );
    } else {
      pass(`${label}: rejected cleanly (${res.status})`);
    }
  }
}

// ── A04: INSECURE DESIGN (GraphQL) ────────────────────────────────────

async function auditGraphQL() {
  console.log("\n🔗 [A04] GraphQL Security");

  // Auth check
  const noAuth = await probe(
    "POST",
    "/api/graphql",
    { "Content-Type": "application/json" },
    JSON.stringify({ query: "{ __typename }" }),
  );
  if (noAuth && noAuth.status === 200) {
    report(
      "/api/graphql",
      "GraphQL auth bypass",
      "A01",
      "CRITICAL",
      "Unauthenticated GraphQL returns 200",
    );
  } else if (noAuth && (noAuth.status === 401 || noAuth.status === 403)) {
    pass("GraphQL requires authentication");
  }

  // Introspection must be blocked unconditionally in production.
  const introspection = await probe(
    "POST",
    "/api/graphql",
    { "Content-Type": "application/json" },
    JSON.stringify({ query: "{ __schema { types { name } } }" }),
  );
  if (!introspection) {
    skip("GraphQL introspection", "no response");
  } else if (!isProductionTarget()) {
    console.log("  ℹ️  GraphQL introspection not gated on a non-production target (dev/CI parity)");
  } else if (introspection.status >= 200 && introspection.status < 300) {
    report(
      "/api/graphql",
      "GraphQL introspection enabled",
      "A05",
      "MEDIUM",
      `Production target served __schema introspection (${introspection.status})`,
    );
  } else {
    pass(`GraphQL introspection blocked in production (${introspection.status})`);
  }

  // Depth & alias tests only work with auth
  if (!authCookie) {
    skip("GraphQL depth/alias limits", "requires --auth");
    return;
  }

  // Depth limit test — sends actually nested query, not flat aliases
  const buildDeepQuery = (depth: number): string =>
    depth === 0 ? "name" : `child { ${buildDeepQuery(depth - 1)} }`;
  const depthQuery = `{ ${buildDeepQuery(9)} }`;
  const depthRes = await probe(
    "POST",
    "/api/graphql",
    { "Content-Type": "application/json" },
    JSON.stringify({ query: depthQuery }),
  );
  if (depthRes && depthRes.status === 400) {
    pass("GraphQL depth limiting active");
  } else if (depthRes && depthRes.status === 200) {
    report("/api/graphql", "No depth limit", "A04", "HIGH", "Deep query accepted — DoS risk");
  } else if (depthRes) {
    skip(`GraphQL depth limit probe (${depthRes.status})`, "no verdict status");
  }

  // Alias limit (max 15)
  const aliasQuery = Array.from({ length: 20 }, (_, i) => `a${i}: __typename`).join(" ");
  const aliasRes = await probe(
    "POST",
    "/api/graphql",
    { "Content-Type": "application/json" },
    JSON.stringify({ query: `{ ${aliasQuery} }` }),
  );
  if (aliasRes && aliasRes.status === 400) {
    pass("GraphQL alias limiting active");
  } else if (aliasRes && aliasRes.status === 200) {
    report(
      "/api/graphql",
      "No alias limit",
      "A04",
      "MEDIUM",
      "Batched alias query accepted — DoS risk",
    );
  } else if (aliasRes) {
    skip(`GraphQL alias limit probe (${aliasRes.status})`, "no verdict status");
  }
}

// ── A05: SECURITY MISCONFIGURATION ─────────────────────────────────────

async function auditHeaders() {
  console.log("\n📋 [A05] Security Headers");
  const res = await probe("GET", "/api/system/health");
  if (!res) return;

  // API responses don't need browser security headers (X-Frame-Options, CSP, etc.)
  // These are for HTML pages — SvelteKit handles them via svelte.config.js.
  const apiChecks: [string, string][] = [
    ["x-frame-options", "X-Frame-Options (API — not applicable, SvelteKit pages)"],
    ["content-security-policy", "CSP (API — not applicable, SvelteKit pages)"],
    ["x-content-type-options", "X-Content-Type-Options"],
    ["strict-transport-security", "HSTS (API — set by SvelteKit pages)"],
    ["referrer-policy", "Referrer-Policy (API — not applicable)"],
    ["permissions-policy", "Permissions-Policy (API — not applicable)"],
  ];

  let present = 0;
  for (const [h, msg] of apiChecks) {
    if (res.headers.get(h)) {
      present++;
      pass(`${h}: present`);
    } else {
      console.log(`  ℹ️  ${msg}: not set on API response (expected for headless API)`);
    }
  }
  console.log(`  ℹ️  ${present}/${apiChecks.length} security headers present on API responses`);
}

async function auditCORS() {
  console.log("\n🌐 [A05] CORS Configuration");
  const res = await probe("OPTIONS", "/api/system/health", {
    Origin: "https://evil.example.com",
    "Access-Control-Request-Method": "GET",
  });
  if (!res) return;

  const acao = res.headers.get("access-control-allow-origin");
  const acac = res.headers.get("access-control-allow-credentials");

  if (acao === "*" || (acao && acao !== BASE && acao !== "null")) {
    report(
      "/api/*",
      "CORS misconfiguration",
      "A05",
      "HIGH",
      `ACAO: ${acao} — allows arbitrary origins`,
    );
  } else if (!acao) {
    pass("No CORS headers on cross-origin request (correct)");
  } else {
    pass(`CORS restricted to: ${acao}`);
  }

  if (acac === "true") {
    report(
      "/api/*",
      "CORS credentials exposed",
      "A05",
      "MEDIUM",
      "Access-Control-Allow-Credentials: true with permissive origin",
    );
  }
}

async function auditCookieSecurity() {
  console.log("\n🍪 [A02] Cookie Security");
  if (!authCookie) {
    skip("cookie security", "requires --auth");
    return;
  }

  // Login WITHOUT the existing authCookie to get a fresh Set-Cookie response.
  // If we re-use authCookie, the server may return 200 without a new Set-Cookie
  // because the session is already authenticated — causing a false negative.
  const res = await probe(
    "POST",
    "/api/auth/login",
    {
      "Content-Type": "application/json",
      // Explicitly clear auth cookie for this probe
      Cookie: "",
    },
    JSON.stringify({ email: "audit@security.test", password: "AuditPass123!" }),
  );

  if (!res || !res.headers.get("set-cookie")) {
    skip("cookie security", "login returned no Set-Cookie header");
    return;
  }

  // Per-cookie, per-header evaluation. Joining the headers (the old behaviour)
  // credited `svelty-csrf`'s flags to `auth_sessions` and masked real gaps.
  const entries = setCookieEntries(res.headers);
  const session = findSessionCookie(entries);

  if (!session) {
    const observed = entries.map((cookie) => cookie.name).join(", ") || "(unparseable)";
    console.log(`  ℹ️  Set-Cookie entries observed: ${observed}`);
    skip("session cookie flags", "session cookie header could not be isolated");
    return;
  }

  const requiresSecure = /^https:/i.test(BASE) || isProductionTarget();

  for (const outcome of assessSessionCookieFlags(session, {
    requiresSecure,
    productionTarget: isProductionTarget(),
    base: BASE,
  })) {
    if (outcome.kind === "pass") pass(outcome.message);
    else if (outcome.kind === "note") console.log(`  ℹ️  ${outcome.message}`);
    else report("/api/auth/login", outcome.test, "A02", outcome.risk, outcome.detail);
  }
}

// ── A01: BOLA / PRIVILEGE ESCALATION ─────────────────────────────────

/**
 * A deliberately unprivileged identity for the BOLA probes.
 *
 * The audit's own session is seeded as `admin`, so re-using it would make any
 * successful `{role:"admin"}` write look legitimate and hide a real bug.
 */
const LOW_PRIV_USER = {
  email: "audit-lowpriv@security.test",
  password: "AuditPass123!",
  username: "audit-lowpriv",
  role: "guest",
};

interface LowPrivilegeSession {
  cookie: string;
  csrfToken: string | null;
  userId: string | null;
}

async function seedLowPrivilegeSession(): Promise<LowPrivilegeSession | null> {
  const testSecret = process.env.TEST_API_SECRET || "test-secret-dev";
  const seed = await probe(
    "POST",
    "/api/testing",
    { "Content-Type": "application/json", "x-test-secret": testSecret, Cookie: "" },
    JSON.stringify({ action: "seed", ...LOW_PRIV_USER }),
    10000,
  );
  if (!seed || seed.status !== 200) return null;

  const login = await probe(
    "POST",
    "/api/auth/login",
    { "Content-Type": "application/json", Cookie: "" },
    JSON.stringify({ email: LOW_PRIV_USER.email, password: LOW_PRIV_USER.password }),
  );
  if (!login || login.status !== 200) return null;

  const entries = setCookieEntries(login.headers);
  const session = findSessionCookie(entries);
  if (!session) return null;
  const csrf = entries.find((cookie) => /csrf/i.test(cookie.name));
  const cookie = csrf
    ? `${session.name}=${session.value}; ${csrf.name}=${csrf.value}`
    : `${session.name}=${session.value}`;

  const me = await probe("GET", "/api/user/me", { Cookie: cookie });
  return {
    cookie,
    csrfToken: csrf ? csrf.value : null,
    userId: me ? readStringField(me.body, "_id") : null,
  };
}

async function auditBOLA() {
  console.log("\n🕵️  [A01] BOLA / Privilege Escalation");
  if (!authCookie) {
    skip("BOLA / privilege escalation", "requires --auth");
    return;
  }

  const lowPriv = await seedLowPrivilegeSession();
  if (!lowPriv) {
    skip("BOLA / privilege escalation", "no low-privilege session (testing API unavailable)");
    return;
  }

  const escalationBody = JSON.stringify({
    role: "admin",
    isAdmin: true,
    tenantId: "other-tenant",
  });
  const escalationMarkers: { pattern: RegExp; field: string }[] = [
    { pattern: /"isAdmin"\s*:\s*true/i, field: "isAdmin" },
    { pattern: /"role"\s*:\s*"admin"/i, field: "role" },
    { pattern: /"tenantId"\s*:\s*"other-tenant"/i, field: "tenantId" },
  ];

  const targets = [
    "/api/user",
    ...(lowPriv.userId ? [`/api/user/${encodeURIComponent(lowPriv.userId)}`] : []),
    "/api/user/audit-foreign-user-id",
  ];

  for (const method of ["PATCH", "PUT"]) {
    for (const path of targets) {
      const label = `${method} ${path} as role "${LOW_PRIV_USER.role}"`;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Origin: BASE,
        Cookie: lowPriv.cookie,
      };
      if (lowPriv.csrfToken) headers["x-csrf-token"] = lowPriv.csrfToken;

      const res = await probe(method, path, headers, escalationBody);
      if (!res) {
        skip(label, "no response");
      } else if (res.status === 401) {
        skip(label, "auth required (401)");
      } else if (res.status >= 200 && res.status < 300) {
        const escalation = escalationMarkers.find((marker) => marker.pattern.test(res.body));
        if (escalation) {
          report(
            path,
            "Privilege escalation",
            "A01",
            "CRITICAL",
            `${label}: accepted ${res.status} and returned escalated field "${escalation.field}"`,
          );
        } else {
          pass(`${label}: privileged fields stripped (${res.status})`);
        }
      } else {
        pass(`${label}: rejected (${res.status})`);
      }
    }
  }

  // Cross-tenant read: the header is a TEST_MODE-only override, so a 2xx with
  // foreign records on a normal target is the finding.
  if (IS_TEST_MODE || process.env.PLAYWRIGHT_TEST === "true") {
    skip("cross-tenant read (X-Tenant-Id)", "TEST_MODE honours x-test-tenant-id by design");
    return;
  }

  const crossTenant = await probe("GET", "/api/user", {
    Origin: BASE,
    "X-Tenant-Id": "other-tenant",
    Cookie: lowPriv.cookie,
  });
  if (!crossTenant) {
    skip("cross-tenant read (X-Tenant-Id)", "no response");
  } else if (
    crossTenant.status >= 200 &&
    crossTenant.status < 300 &&
    /"tenantId"\s*:\s*"other-tenant"/i.test(crossTenant.body)
  ) {
    report(
      "/api/user",
      "Cross-tenant data exposure",
      "A01",
      "CRITICAL",
      "GET /api/user with X-Tenant-Id: other-tenant returned foreign-tenant records",
    );
  } else {
    pass(
      `cross-tenant read with X-Tenant-Id: other-tenant returned no foreign records (${crossTenant.status})`,
    );
  }
}

// ── A01: HTTP METHOD OVERRIDE ────────────────────────────────────────

async function auditMethodOverride() {
  console.log("\n🔀 [A01] HTTP Method Override");
  if (!authCookie) {
    skip("X-HTTP-Method-Override", "requires --auth");
    return;
  }

  const list = await probe("GET", "/api/collections");
  if (!list) {
    skip("X-HTTP-Method-Override", "collections unreachable");
    return;
  }
  if (list.status === 401 || list.status === 403) {
    skip("X-HTTP-Method-Override", "auth required");
    return;
  }

  const collectionId = list.status === 200 ? firstCollectionId(list.body) : null;
  if (!collectionId) {
    skip("X-HTTP-Method-Override", "no collection available to target");
    return;
  }

  const targetPath = `/api/collections/${encodeURIComponent(collectionId)}`;
  const before = await probe("GET", targetPath);
  if (!before || before.status !== 200) {
    skip(`X-HTTP-Method-Override on ${targetPath}`, "target collection not readable");
    return;
  }

  const override = await probe("GET", targetPath, { "X-HTTP-Method-Override": "DELETE" });
  const after = await probe("GET", targetPath);
  if (!after) {
    skip(`X-HTTP-Method-Override on ${targetPath}`, "no response");
    return;
  }

  if (after.status === 200) {
    pass(`GET ${targetPath} + X-HTTP-Method-Override: DELETE did not delete the collection`);
  } else {
    report(
      targetPath,
      "Method override honoured",
      "A01",
      "HIGH",
      `GET with X-HTTP-Method-Override: DELETE left the resource at ${after.status} (override response: ${override?.status ?? "none"})`,
    );
  }
}

// ── A07: IDENTIFICATION FAILURES (Rate Limit + Lockout) ──────────────

async function auditRateLimit() {
  console.log("\n⏱️  [A07] Rate Limiting & Account Lockout");

  // In SETUP mode, login returns 503 — rate limiter isn't reachable
  if (isSetupMode()) {
    console.log(
      `  ℹ️  System in SETUP mode — login is blocked (503). Rate limit test requires a configured system.`,
    );
    skip("rate limiting & account lockout", "system in SETUP mode");
    return;
  }

  // Use Promise.all for concurrent requests — rate limiters use sliding windows
  // that won't trigger on slow sequential await-in-a-loop requests
  const probeFns = Array.from({ length: 15 }, (_, i) =>
    probe(
      "POST",
      "/api/auth/login",
      { "Content-Type": "application/json" },
      JSON.stringify({ email: `brute${i}@test.com`, password: "wrong" }),
    ),
  );
  const results = await Promise.all(probeFns);
  const responses = results
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .map((r) => ({ status: r.status, elapsed: r.elapsed }));

  const throttled = responses.filter((r) => r.status === 429).length;
  const locked = responses.filter((r) => r.status === 403).length;

  if (throttled > 0) {
    pass(`Rate limiting: ${throttled} requests throttled (429)`);
    // Check for Retry-After header (RFC 6585)
    const rateRes = await probe(
      "POST",
      "/api/auth/login",
      { "Content-Type": "application/json" },
      JSON.stringify({ email: "test@test.com", password: "wrong" }),
    );
    if (rateRes && rateRes.headers.get("retry-after")) {
      pass("Retry-After header present (RFC 6585 compliant)");
    }
  }
  if (locked > 0) {
    pass(`Account lockout: ${locked} lockout responses (403)`);
  }
  if (throttled === 0 && locked === 0) {
    report(
      "/api/auth/login",
      "No rate limit or lockout",
      "A07",
      "HIGH",
      "15 concurrent login attempts not throttled/locked — brute force risk",
    );
  }

  // Timing side-channel check: verify response times are similar for valid vs invalid
  if (responses.length >= 5) {
    const times = responses.map((r) => r.elapsed);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const max = Math.max(...times);
    if (max > avg * 10 && max > 1000) {
      report(
        "/api/auth/login",
        "Timing side-channel",
        "A02",
        "LOW",
        `Response time varies ${(max / avg).toFixed(1)}x — potential enumeration vector`,
      );
    }
  }
}

async function auditInfoLeakage() {
  console.log("\n⚠️  [A05] Information Leakage");

  const res = await probe("GET", "/api/collections/nonexistent_collection_name_94812");
  if (res) {
    const bodyLower = res.body.toLowerCase();
    const leaksStack =
      bodyLower.includes("stack trace") ||
      bodyLower.includes("stack:") ||
      bodyLower.includes("node_modules") ||
      bodyLower.includes("drizzle-orm");
    if (leaksStack) {
      report(
        "/api/collections/nonexistent_collection_name_94812",
        "Stack trace disclosure",
        "A05",
        "HIGH",
        "API error responses disclose framework internals or filesystem stack trace details",
      );
    } else {
      pass("Error response: clean (no internal stack traces or path disclosure)");
    }
  }
}

async function auditSecretLeakage() {
  console.log("\n🔐 [A05] Secret & Credential Leakage");

  const forbiddenPatterns = [
    { pattern: /DB_PASSWORD/i, name: "DB_PASSWORD" },
    { pattern: /DB_USER/i, name: "DB_USER" },
    { pattern: /JWT_SECRET_KEY/i, name: "JWT_SECRET_KEY" },
    { pattern: /ENCRYPTION_KEY/i, name: "ENCRYPTION_KEY" },
    { pattern: /SAML_CLIENT_SECRET/i, name: "SAML_CLIENT_SECRET" },
    { pattern: /SAML_ENCRYPTION_KEY/i, name: "SAML_ENCRYPTION_KEY" },
    { pattern: /-----BEGIN (RSA )?PRIVATE KEY-----/i, name: "Private key header" },
    { pattern: /Bearer\s+[A-Za-z0-9+/=]{32,}/i, name: "Bearer token in body" },
  ];

  const probeEndpoints = [
    { method: "GET", path: "/api/collections" },
    { method: "GET", path: "/api/settings/system" },
    { method: "GET", path: "/api/user" },
    { method: "GET", path: "/api/system/health" },
    { method: "GET", path: "/api/theme/public" },
    { method: "GET", path: "/api/collections/nonexistent_404_test" },
    {
      method: "POST",
      path: "/api/user/login",
      body: JSON.stringify({ email: "x", password: "x" }),
    },
  ];

  let passed = 0;
  let blocked = 0;

  // 🔀 PARALLEL: every endpoint is an independent read/404 probe (no shared
  // state, no ordering dependency) — fire them concurrently to cut the
  // network-bound wall-clock time of this audit.
  const results = await Promise.all(
    probeEndpoints.map(async (ep) => {
      const hdrs: Record<string, string> = { Origin: BASE };
      if (ep.body) hdrs["Content-Type"] = "application/json";
      const res = await probe(ep.method as any, ep.path, hdrs, (ep as any).body);
      return { ep, res };
    }),
  );

  for (const { ep, res } of results) {
    if (!res) {
      blocked++;
      continue;
    }

    const combined = res.body + JSON.stringify(res.headers || {});
    let leaked = false;
    for (const { pattern, name } of forbiddenPatterns) {
      if (pattern.test(combined)) {
        leaked = true;
        report(
          ep.path,
          `Secret "${name}" leaked in response`,
          "A05",
          "CRITICAL",
          `${ep.method} ${ep.path} response contains "${name}"`,
        );
      }
    }
    if (!leaked) {
      passed++;
      testsRun++;
    }
  }

  const errRes = await probe("GET", "/api/this/does/not/exist/anywhere");
  if (errRes) {
    const b = errRes.body.toLowerCase();
    if (
      b.includes("password") ||
      b.includes("secret_key") ||
      b.includes("private.ts") ||
      b.includes("\\src\\") ||
      b.includes("/src/")
    ) {
      report(
        "/api/this/does/not/exist/anywhere",
        "Error response leaks internal paths",
        "A05",
        "HIGH",
        "404 body contains filesystem paths or sensitive keywords",
      );
    }
  }

  if (passed === probeEndpoints.length) {
    console.log(`  ✅ All ${passed} endpoints: no secrets leaked`);
  } else {
    console.log(`  ✅ ${passed}/${probeEndpoints.length} clean, ${blocked} unreachable`);
  }
}

// ── SELF-TEST + SYSTEM STATE ──────────────────────────────────────────

let SYSTEM_STATE: string | null = null;

async function auditSelfTest() {
  console.log("\n🔬 Self-Test: API Health");
  const res = await probe("GET", "/api/system/health", {}, undefined, 3000);
  if (!res) {
    console.log("  ❌ Server unreachable — is it running?");
    console.log(`     Try: bun run dev  (then re-run audit)`);
    if (IS_CI) process.exit(1);
    return false;
  }
  console.log(`  ✅ Server reachable (${res.status}) — ${res.elapsed.toFixed(0)}ms`);

  // Detect system state — affects how we interpret responses
  try {
    const body = JSON.parse(res.body);
    const data = body?.data && typeof body.data === "object" ? body.data : body;
    SYSTEM_STATE = (data.overallStatus || data.status || data.state || "").toUpperCase();
    console.log(`  ℹ️  System state: ${SYSTEM_STATE}`);
    if (SYSTEM_STATE === "SETUP") {
      console.log(
        `  ⚠️  System is in SETUP mode — API endpoints return 503 (blocked by setup middleware).`,
      );
      console.log(`     These are not vulnerabilities. Run after setup/seed for a real audit.`);
    }
    if (IS_TEST_MODE) {
      console.log(
        `  ⚠️  TEST_MODE active — auth gates are bypassed (SKIP_GATEKEEPER). Auth bypass findings below are expected.`,
      );
    }
  } catch {
    SYSTEM_STATE = "UNKNOWN";
  }
  return true;
}

/** Returns true if the system is in SETUP mode (all APIs blocked). */
function isSetupMode(): boolean {
  return SYSTEM_STATE === "SETUP" || SYSTEM_STATE === "SETTING_UP";
}

/** Returns the blocking status code for the current system state. */
function blockedStatus(): number {
  return isSetupMode() ? 503 : 403;
}

// ── MAIN ───────────────────────────────────────────────────────────────

async function main() {
  console.log("🛡️  SveltyCMS Enterprise Security Audit v3.0");
  console.log(`   Target: ${BASE}`);
  console.log(`   Mode: ${AUTH_MODE ? "Authenticated (--auth)" : "Unauthenticated"}`);
  console.log(`   CI: ${IS_CI ? "Yes (exit on findings)" : "No"}`);
  console.log("═".repeat(55));

  // Self-test first
  if (!(await auditSelfTest())) return;

  // Auth setup (if requested)
  if (AUTH_MODE) {
    await setupAuth();
  }

  const runBackdoor = !ONLY_FILTER || ONLY_FILTER === "backdoor";
  const runFull = !ONLY_FILTER;

  if (runBackdoor) {
    await auditTestingBackdoor(); // A01 — /api/testing must be 401/403/404 without valid harness env
  }
  if (runFull) {
    await auditAuth(); // A01
    await auditCSRF(); // A01 — host injection (public) + CSRF matrix (--auth)
    await auditXSS(); // A03
    await auditSQLi(); // A03
    await auditPathTraversal(); // A03
    await auditPublicInjection(); // A03 — works without --auth
    await auditBOLA(); // A01 — BOLA / privilege escalation
    await auditMethodOverride(); // A01 — X-HTTP-Method-Override
    await auditGraphQL(); // A01 + A04 + introspection
    await auditHeaders(); // A05
    await auditCORS(); // A05
    await auditCookieSecurity(); // A02
    await auditRateLimit(); // A07
    await auditInfoLeakage(); // A05
    await auditSecretLeakage(); // A05 — credentialed secrets in responses
  }

  // Teardown: clean up seeded test users
  if (AUTH_MODE) {
    await teardownAuth();
  }

  // ── SUMMARY ──────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(55));
  console.log("📊 Security Audit Results:");

  const byRisk = (r: Finding["risk"]) => findings.filter((f) => f.risk === r).length;
  const byOwasp = (o: string) => findings.filter((f) => f.owasp === o).length;

  console.log("\n   By Severity:");
  console.log(`   🔴 CRITICAL: ${byRisk("CRITICAL")}`);
  console.log(`   🟠 HIGH:     ${byRisk("HIGH")}`);
  console.log(`   🟡 MEDIUM:   ${byRisk("MEDIUM")}`);
  console.log(`   🔵 LOW:      ${byRisk("LOW")}`);

  console.log("\n   Coverage:");
  console.log(`   ✅ tested:  ${testsRun}`);
  console.log(`   ⏭️  skipped: ${testsSkipped} (could not assert — not counted as passing)`);

  console.log("\n   OWASP Top 10 Coverage:");
  for (const cat of ["A01", "A02", "A03", "A04", "A05", "A07"]) {
    const c = byOwasp(cat);
    const names: Record<string, string> = {
      A01: "Broken Access Control",
      A02: "Cryptographic Failures",
      A03: "Injection",
      A04: "Insecure Design",
      A05: "Security Misconfiguration",
      A07: "Identification Failures",
    };
    console.log(
      `   ${c > 0 ? "✅" : "—"}  ${cat}: ${names[cat]} (${c} finding${c !== 1 ? "s" : ""})`,
    );
  }

  if (findings.length === 0) {
    console.log("\n✅ No security findings. All checks passed.");
  } else {
    console.log("\n🔴 Findings:");
    for (const f of findings) {
      console.log(`   [${f.risk}] [${f.owasp}] ${f.test}: ${f.endpoint}`);
      console.log(`          ${f.detail}`);
    }
  }

  console.log(
    `\n   Audit complete: ${findings.length} finding${findings.length !== 1 ? "s" : ""} across ${new Set(findings.map((f) => f.owasp)).size} OWASP categories`,
  );
}

// CLI entry (only when run directly, not imported)
if (import.meta.main) {
  resolveCliArgs();
  main().catch((err) => {
    console.error("Audit crashed:", err);
    process.exit(1);
  });
}
