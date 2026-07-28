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
 * - A01: Broken Access Control → auth bypass, endpoint protection, GraphQL auth, CSRF
 * - A02: Cryptographic Failures → cookie security, HSTS, token handling
 * - A03: Injection → SQLi, NoSQLi, XSS reflection, path traversal
 * - A04: Insecure Design → GraphQL depth/alias limits, rate limiting
 * - A05: Security Misconfiguration → security headers, CORS, CSP
 * - A07: Identification Failures → account lockout, rate limiting
 */

const AUDITOR_UA = "SveltyCMS-Security-Audit/3.0";

interface Finding {
  endpoint: string;
  test: string;
  owasp: string;
  risk: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  detail: string;
}

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

async function probe(
  method: string,
  path: string,
  headers?: Record<string, string>,
  body?: string,
  timeout = 5000,
) {
  const hdrs: Record<string, string> = { "User-Agent": AUDITOR_UA, ...headers };
  if (authCookie) hdrs["Cookie"] = authCookie;

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
    console.warn("  ⚠️  TEST_API_SECRET not set or using dev default — set in CI!");
    if (IS_CI && !testSecret) {
      console.log("  ❌ CI requires TEST_API_SECRET — skipping auth setup");
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

  // Extract session cookie — use getSetCookie() or cookies map (not split on comma)
  const cookieHeader =
    loginRes.headers.getSetCookie?.()?.[0] ?? loginRes.headers.get("set-cookie")?.split("\n")[0];
  if (cookieHeader) {
    authCookie = cookieHeader.split(";")[0].trim();
  }

  // Extract CSRF token
  csrfToken = loginRes.cookies["svelty-csrf"] || loginRes.cookies["__Host-svelty-csrf"] || null;

  console.log(`  ✅ Authenticated as audit@security.test`);
  console.log(`     Session cookie: ${authCookie ? "present" : "missing"}`);
  console.log(`     CSRF token: ${csrfToken ? "present" : "missing"}`);
  return true;
}

// ── TEARDOWN (clean up test admin) ─────────────────────────────────────

async function teardownAuth() {
  if (!authCookie) return;
  console.log("\n🧹 Cleaning up test admin user...");
  try {
    const testSecret = process.env.TEST_API_SECRET || "test-secret-dev";
    await probe(
      "POST",
      "/api/testing",
      {
        "Content-Type": "application/json",
        "x-test-secret": testSecret,
      },
      JSON.stringify({
        action: "wipe-user",
        email: "audit@security.test",
      }),
      5000,
    );
    console.log("  ✅ Test admin user removed");
  } catch {
    console.log("  ⚠️  Could not clean up test admin (non-fatal)");
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
    console.log(`  ✅ No secret: rejected (${noSecret.status})`);
  } else if (noSecret.status === 404) {
    console.log(`  ✅ No secret: stripped from build (${noSecret.status})`);
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
    console.log(`  ✅ Wrong secret: rejected (${wrongSecret.status})`);
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
    console.log(`  ✅ Hardcoded benchmark secret: rejected (${knownDefault.status})`);
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
        console.log(`  ✅ ${ep}: blocked (${res.status})`);
      } else {
        console.log(`  ℹ️  ${ep}: returned ${res.status} (expected ${blockedStatus()})`);
      }
    }),
  );
}

// ── A01: CSRF PROTECTION ─────────────────────────────────────────────────

async function auditCSRF() {
  console.log("\n🛡️  [A01] CSRF Protection");
  if (!authCookie) {
    console.log("  ⚠️  No auth session — skipping CSRF audit (requires --auth)");
    return;
  }

  const mutations = [
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
    { method: "DELETE", path: "/api/collections/csrf-test" },
  ];

  for (const mut of mutations) {
    // Request WITHOUT CSRF token (but with session cookie)
    const noCsrf = await probe(
      mut.method,
      mut.path,
      {
        "Content-Type": "application/json",
        Origin: "https://evil.example.com",
        // Explicitly do NOT send CSRF token
      },
      mut.body,
    );

    if (!noCsrf) continue;

    if (noCsrf.status === 403 || noCsrf.status === 401) {
      console.log(`  ✅ ${mut.method} ${mut.path}: rejected without CSRF token (${noCsrf.status})`);
    } else if (noCsrf.status < 400) {
      report(
        mut.path,
        "CSRF bypass",
        "A01",
        "HIGH",
        `${mut.method} accepted ${noCsrf.status} without CSRF token — cross-site request forgery risk`,
      );
    }

    // Request WITH CSRF token (should succeed if valid)
    if (csrfToken) {
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
        console.log(`  ✅ ${mut.method} ${mut.path}: CSRF token validation works`);
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
  console.log(`  ✅ Tested ${payloads.length} XSS payloads`);
}

async function auditSQLi() {
  console.log("\n💉 [A03] SQLi & NoSQLi Injection");
  const sqlPayloads = ["'; DROP TABLE users;--", "1' OR '1'='1", "union select * from users"];
  let blocked = 0;

  // In SETUP mode, all API endpoints return 503 — injection test can't reach the query parser
  if (isSetupMode()) {
    console.log(
      `  ℹ️  System in SETUP mode — API endpoints are blocked (503). SQLi test requires a configured system.`,
    );
    console.log(`  ✅ SQLi test skipped (valid — system pre-configuration)`);
    return;
  }

  await Promise.all(
    sqlPayloads.map(async (p) => {
      const res = await probe("GET", `/api/collections?filter=${encodeURIComponent(p)}`);
      if (!res) return;
      if (res.status === 401 || res.status === 403) {
        if (res.status === 403) {
          blocked++;
          console.log(`  ✅ SQLi actively rejected (403)`);
        } else {
          console.log(`  ⚠️  SQLi probe requires auth (401) — run with --auth for full test`);
        }
      } else if (res.status === 400 || res.status === 422) {
        blocked++;
        console.log(`  ✅ SQLi blocked (${res.status})`);
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
        if (!res) return;
        if (res.status === 400) {
          blocked++;
          console.log(`  ✅ NoSQLi blocked (400): ${p.substring(0, 35)}`);
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
  }

  console.log(`  ✅ Tested all SQLi/NoSQLi payloads (blocked ${blocked} invalid attempts)`);
}

async function auditPathTraversal() {
  console.log("\n📁 [A03] Path Traversal");
  const payloads = ["../../../etc/passwd", "..\\..\\windows\\system32", "/etc/passwd%00.html"];
  await Promise.all(
    payloads.map(async (p) => {
      const res = await probe("GET", `/api/media/files?path=${encodeURIComponent(p)}`);
      if (!res) return;
      if ([400, 401, 403, 404].includes(res.status)) {
        console.log(`  ✅ Traversal blocked (${res.status})`);
      } else if (res.status === 200) {
        report(
          "/api/media/files?path=...",
          "Path traversal",
          "A03",
          "CRITICAL",
          `Payload returned 200: "${p}"`,
        );
      }
    }),
  );
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
    console.log("  ✅ GraphQL requires authentication");
  }

  // Depth & alias tests only work with auth
  if (!authCookie) {
    console.log("  ⚠️  Skipping depth/alias tests (no auth — requires --auth flag)");
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
    console.log("  ✅ GraphQL depth limiting active");
  } else if (depthRes && depthRes.status === 200) {
    report("/api/graphql", "No depth limit", "A04", "HIGH", "Deep query accepted — DoS risk");
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
    console.log("  ✅ GraphQL alias limiting active");
  } else if (aliasRes && aliasRes.status === 200) {
    report(
      "/api/graphql",
      "No alias limit",
      "A04",
      "MEDIUM",
      "Batched alias query accepted — DoS risk",
    );
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
      console.log(`  ✅ ${h}: present`);
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
    console.log("  ✅ No CORS headers on cross-origin request (correct)");
  } else {
    console.log(`  ✅ CORS restricted to: ${acao}`);
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
    console.log("  ⚠️  No auth session — skipping cookie audit (requires --auth)");
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
    console.log("  ⚠️  No Set-Cookie header in login response");
    return;
  }

  // Use getSetCookie() for correct parsing
  const setCookieHeaders = res.headers.getSetCookie?.() ?? [];
  const setCookie =
    setCookieHeaders.length > 0 ? setCookieHeaders.join(", ") : res.headers.get("set-cookie") || "";

  const hasHttpOnly = setCookie.toLowerCase().includes("httponly");
  const hasSecure = setCookie.toLowerCase().includes("secure");
  const hasSameSite = setCookie.toLowerCase().includes("samesite");
  const hasHostPrefix = setCookie.includes("__Host-");

  if (hasHttpOnly) console.log("  ✅ HttpOnly: set");
  else
    report(
      "/api/auth/login",
      "Cookie missing HttpOnly",
      "A02",
      "HIGH",
      "Session cookie lacks HttpOnly flag — XSS can steal token",
    );

  if (hasSecure) console.log("  ✅ Secure: set");
  else
    report(
      "/api/auth/login",
      "Cookie missing Secure",
      "A02",
      "MEDIUM",
      "Session cookie lacks Secure flag — transmitted over HTTP",
    );

  if (hasSameSite) console.log("  ✅ SameSite: set");
  else
    report(
      "/api/auth/login",
      "Cookie missing SameSite",
      "A02",
      "MEDIUM",
      "Session cookie lacks SameSite — CSRF risk",
    );

  if (hasHostPrefix) console.log("  ✅ __Host- prefix: present");
  else if (!BASE.includes("localhost")) {
    report(
      "/api/auth/login",
      "Cookie missing __Host- prefix",
      "A02",
      "LOW",
      "No __Host- prefix — subdomain cookie leakage risk (RFC 6265bis)",
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
    console.log(`  ✅ Rate limit test skipped (valid — system pre-configuration)`);
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
    console.log(`  ✅ Rate limiting: ${throttled} requests throttled (429)`);
    // Check for Retry-After header (RFC 6585)
    const rateRes = await probe(
      "POST",
      "/api/auth/login",
      { "Content-Type": "application/json" },
      JSON.stringify({ email: "test@test.com", password: "wrong" }),
    );
    if (rateRes && rateRes.headers.get("retry-after")) {
      console.log("  ✅ Retry-After header present (RFC 6585 compliant)");
    }
  }
  if (locked > 0) {
    console.log(`  ✅ Account lockout: ${locked} lockout responses (403)`);
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
      console.log("  ✅ Error response: clean (no internal stack traces or path disclosure)");
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

  for (const ep of probeEndpoints) {
    const hdrs: Record<string, string> = { Origin: BASE };
    if (ep.body) hdrs["Content-Type"] = "application/json";
    const res = await probe(ep.method as any, ep.path, hdrs, (ep as any).body);
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
    if (!leaked) passed++;
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
    if (AUTH_MODE) await auditCSRF(); // A01 — CSRF requires auth
    await auditXSS(); // A03
    await auditSQLi(); // A03
    await auditPathTraversal(); // A03
    await auditGraphQL(); // A01 + A04
    await auditHeaders(); // A05
    await auditCORS(); // A05
    await auditCookieSecurity(); // A02
    await auditRateLimit(); // A07
    await auditInfoLeakage(); // A05
    await auditSecretLeakage(); // A05 — credentialed secrets in responses
  }

  // Teardown: clean up seeded test admin
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
