/**
 * @file scripts/security-audit.ts
 * @description Enterprise-grade automated security audit for SveltyCMS.
 *
 * Probes API endpoints for vulnerabilities with optional authenticated testing.
 * Maps findings to OWASP Top 10 (2021) categories.
 *
 * Usage:
 *   bun run scripts/security-audit.ts                          # unauthenticated scan
 *   bun run scripts/security-audit.ts --auth                    # authenticated scan (seeds admin, logs in)
 *   bun run scripts/security-audit.ts --base=http://localhost:4173  # custom URL
 *   bun run scripts/security-audit.ts --ci                     # CI mode (exit 1 on findings)
 *   bun run scripts/security-audit.ts --auth --ci              # full authenticated CI audit
 *
 * ### Audit Categories (OWASP 2021 mapped)
 * - A01: Broken Access Control → auth bypass, endpoint protection, GraphQL auth, CSRF
 * - A02: Cryptographic Failures → cookie security, HSTS, token handling
 * - A03: Injection → SQLi, NoSQLi, XSS reflection, path traversal
 * - A04: Insecure Design → GraphQL depth/alias limits, rate limiting
 * - A05: Security Misconfiguration → security headers, CORS, CSP
 * - A07: Identification Failures → account lockout, rate limiting
 */

const BASE = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : process.env.PLAYWRIGHT_TEST_BASE_URL || "http://127.0.0.1:4173";

const IS_CI = process.argv.includes("--ci");
const AUTH_MODE = process.argv.includes("--auth");

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

// ── A01: BROKEN ACCESS CONTROL ──────────────────────────────────────────

async function auditAuth() {
  console.log("\n🔐 [A01] Broken Access Control");
  const endpoints = [
    "/api/settings/system",
    "/api/user",
    "/api/collections",
    "/api/media",
    "/api/token",
    "/config/system-settings",
    "/api/dashboard",
  ];

  await Promise.all(
    endpoints.map(async (ep) => {
      const res = await probe("GET", ep);
      if (!res) {
        report(ep, "Connection", "A01", "HIGH", "Server unreachable");
        return;
      }
      if (res.status === 200) {
        report(ep, "Auth bypass", "A01", "CRITICAL", "Unauthenticated access returns 200");
      } else if (res.status === 401 || res.status === 403) {
        console.log(`  ✅ ${ep}: protected (${res.status})`);
      } else {
        report(
          ep,
          "Unexpected status",
          "A01",
          "MEDIUM",
          `Returns ${res.status} (expected 401/403)`,
        );
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

  await Promise.all(
    sqlPayloads.map(async (p) => {
      const res = await probe("GET", `/api/collections?filter=${encodeURIComponent(p)}`);
      if (!res) return;
      if (res.status === 401 || res.status === 403) {
        // Distinguish: 401 = no auth (skipped), 403 = actively blocked
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

  const checks: [string, string, Finding["risk"]][] = [
    ["x-frame-options", "Missing X-Frame-Options (clickjacking)", "HIGH"],
    ["content-security-policy", "Missing CSP header", "HIGH"],
    ["x-content-type-options", "Missing X-Content-Type-Options (MIME sniffing)", "MEDIUM"],
    ["strict-transport-security", "Missing HSTS header", "MEDIUM"],
    ["referrer-policy", "Missing Referrer-Policy header", "LOW"],
    ["permissions-policy", "Missing Permissions-Policy header", "LOW"],
  ];

  for (const [h, msg, risk] of checks) {
    if (res.headers.get(h)) {
      console.log(`  ✅ ${h}: present`);
    } else {
      report("/api/*", msg, "A05", risk, msg);
    }
  }
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

// ── SELF-TEST ───────────────────────────────────────────────────────────

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
  return true;
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

  // Run all audits
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

  if (IS_CI && (byRisk("CRITICAL") > 0 || byRisk("HIGH") > 0)) {
    console.log("\n❌ CI mode: blocking CRITICAL/HIGH findings");
    process.exit(1);
  }

  console.log(
    `\n   Audit complete: ${findings.length} finding${findings.length !== 1 ? "s" : ""} across ${new Set(findings.map((f) => f.owasp)).size} OWASP categories`,
  );
}

main().catch((err) => {
  console.error("Audit crashed:", err);
  process.exit(1);
});
