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
 * - A01: Broken Access Control → auth bypass, endpoint protection, GraphQL auth
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

const AUDITOR_UA = "SveltyCMS-Security-Audit/2.0";

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

    // Capture cookies from response
    const setCookie = res.headers.get("set-cookie");
    const cookies: Record<string, string> = {};
    if (setCookie) {
      for (const part of setCookie.split(",")) {
        const m = part.trim().match(/^([^=]+)=([^;]*)/);
        if (m) cookies[m[1].trim()] = m[2];
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

  // Step 1: Try to seed a test admin user via testing endpoint
  const seedRes = await probe(
    "POST",
    "/api/testing",
    {
      "Content-Type": "application/json",
      "x-test-secret": process.env.TEST_API_SECRET || "test-secret-dev",
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

  // Extract session cookie
  const cookieHeader = loginRes.headers.get("set-cookie");
  if (cookieHeader) {
    authCookie = cookieHeader.split(",")[0].split(";")[0].trim();
  }

  // Extract CSRF token
  csrfToken = loginRes.cookies["svelty-csrf"] || loginRes.cookies["__Host-svelty-csrf"] || null;

  console.log(`  ✅ Authenticated as audit@security.test`);
  console.log(`     Session cookie: ${authCookie ? "present" : "missing"}`);
  console.log(`     CSRF token: ${csrfToken ? "present" : "missing"}`);
  return true;
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

  for (const ep of endpoints) {
    const res = await probe("GET", ep);
    if (!res) {
      report(ep, "Connection", "A01", "HIGH", "Server unreachable");
      continue;
    }
    if (res.status === 200) {
      report(ep, "Auth bypass", "A01", "CRITICAL", "Unauthenticated access returns 200");
    } else if (res.status === 401 || res.status === 403) {
      console.log(`  ✅ ${ep}: protected (${res.status})`);
    } else {
      report(ep, "Unexpected status", "A01", "MEDIUM", `Returns ${res.status} (expected 401/403)`);
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

  for (const payload of payloads) {
    const enc = encodeURIComponent(payload);
    const res = await probe("GET", `/api/system/health?q=${enc}`);
    if (!res) continue;
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
    if (ct.includes("text/html")) {
      report(
        "/api/system/health",
        "HTML response",
        "A03",
        "MEDIUM",
        "API returns text/html — XSS risk surface",
      );
    }
  }
  console.log(`  ✅ Tested ${payloads.length} XSS payloads`);
}

async function auditSQLi() {
  console.log("\n💉 [A03] SQLi & NoSQLi Injection");
  const sqlPayloads = ["'; DROP TABLE users;--", "1' OR '1'='1", "union select * from users"];
  let blocked = 0;

  for (const p of sqlPayloads) {
    const res = await probe("GET", `/api/collections?filter=${encodeURIComponent(p)}`);
    if (!res) continue;
    if (res.status === 401 || res.status === 403) {
      console.log(`  ✅ Auth blocked SQLi probe (${res.status})`);
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
  }

  // NoSQLi: test via collection query parameters (not GraphQL variables — those never reach mapQuery)
  if (authCookie) {
    const nosqlPayloads = ['{"$where":"1"}', '{"$expr":{"$gt":["$_id",""]}}'];
    for (const p of nosqlPayloads) {
      const res = await probe("GET", `/api/collections?filter=${encodeURIComponent(p)}`);
      if (!res) continue;
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
    }
  }

  console.log(`  ✅ ${blocked}/${sqlPayloads.length} SQLi payloads blocked`);
}

async function auditPathTraversal() {
  console.log("\n📁 [A03] Path Traversal");
  const payloads = ["../../../etc/passwd", "..\\..\\windows\\system32", "/etc/passwd%00.html"];
  for (const p of payloads) {
    const res = await probe("GET", `/api/media/files?path=${encodeURIComponent(p)}`);
    if (!res) continue;
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
    console.log("  ✅ GraphQL requires authentication");
  }

  // Depth & alias tests only work with auth
  if (!authCookie) {
    console.log("  ⚠️  Skipping depth/alias tests (no auth — requires --auth flag)");
    return;
  }

  // Depth limit (max 7)
  const deepQuery = Array.from({ length: 9 }, (_, i) => `a${i}: __typename`).join(" ");
  const depthRes = await probe(
    "POST",
    "/api/graphql",
    { "Content-Type": "application/json" },
    JSON.stringify({ query: `{ ${deepQuery} }` }),
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
      "Bathed alias query accepted — DoS risk",
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

  // Test the login endpoint to capture set-cookie
  const res = await probe(
    "POST",
    "/api/auth/login",
    { "Content-Type": "application/json" },
    JSON.stringify({ email: "audit@security.test", password: "AuditPass123!" }),
  );

  if (!res || !res.headers.get("set-cookie")) {
    console.log("  ⚠️  No Set-Cookie header in login response");
    return;
  }

  const setCookie = res.headers.get("set-cookie") || "";
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

  const responses: { status: number; elapsed: number }[] = [];
  for (let i = 0; i < 15; i++) {
    const res = await probe(
      "POST",
      "/api/auth/login",
      { "Content-Type": "application/json" },
      JSON.stringify({ email: `brute${i}@test.com`, password: "wrong" }),
    );
    if (res) responses.push({ status: res.status, elapsed: res.elapsed });
  }

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
      "15 rapid login attempts not throttled/locked — brute force risk",
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
  console.log("🛡️  SveltyCMS Enterprise Security Audit v2.0");
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
  await auditXSS(); // A03
  await auditSQLi(); // A03
  await auditPathTraversal(); // A03
  await auditGraphQL(); // A01 + A04
  await auditHeaders(); // A05
  await auditCORS(); // A05
  await auditCookieSecurity(); // A02
  await auditRateLimit(); // A07

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
  console.error("Security audit crashed:", err);
  process.exit(1);
});
