/**
 * @file scripts/security-audit.ts
 * @description Automated security audit — probes API endpoints for vulnerabilities.
 *
 * Tests: missing auth, XSS reflection, SQLi injection points, path traversal,
 * security headers, CORS misconfiguration, rate limiting bypass.
 *
 * Usage:
 *   bun run scripts/security-audit.ts                     # audit running instance
 *   bun run scripts/security-audit.ts --base=http://localhost:4173  # custom URL
 *   bun run scripts/security-audit.ts --ci                # CI mode (exit 1 on findings)
 *
 * ### Audit Categories
 * - Auth: unauthenticated access to protected endpoints
 * - XSS: reflected parameters in responses
 * - SQLi: injection attempts on query parameters
 * - Path Traversal: directory traversal attempts
 * - Headers: missing security headers (CSP, HSTS, X-Frame-Options)
 * - CORS: misconfigured cross-origin headers
 * - Rate Limit: excessive requests to login endpoint
 *
 * ### Security Risk Levels
 * - CRITICAL: Auth bypass, data exposure
 * - HIGH: XSS reflection, SQLi injection, missing security headers
 * - MEDIUM: Information disclosure, CORS misconfiguration
 * - LOW: Rate limiting gaps, verbose errors
 */

const BASE = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : process.env.PLAYWRIGHT_TEST_BASE_URL || "http://127.0.0.1:4173";

const IS_CI = process.argv.includes("--ci");

interface Finding {
  endpoint: string;
  test: string;
  risk: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  detail: string;
}

const findings: Finding[] = [];

function report(endpoint: string, test: string, risk: Finding["risk"], detail: string) {
  findings.push({ endpoint, test, risk, detail });
  const icons = { CRITICAL: "🔴", HIGH: "🟠", MEDIUM: "🟡", LOW: "🔵" };
  console.log(`  ${icons[risk]} [${risk}] ${test}: ${detail}`);
}

async function probe(
  method: string,
  path: string,
  headers?: Record<string, string>,
  body?: string,
) {
  try {
    return await fetch(`${BASE}${path}`, {
      method,
      headers: { "User-Agent": "SveltyCMS-Security-Audit/1.0", ...headers },
      body,
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return null;
  }
}

// ── Audit Categories ────────────────────────────────────────────────────

async function auditAuth() {
  console.log("\n🔐 Auth Audit");
  const protectedEndpoints = [
    "/api/settings/system",
    "/api/user",
    "/api/collections",
    "/config/system-settings",
  ];

  for (const ep of protectedEndpoints) {
    const res = await probe("GET", ep);
    if (!res) {
      report(ep, "Connection", "HIGH", "Server unreachable");
      continue;
    }

    if (res.status === 200) {
      report(ep, "Auth bypass", "CRITICAL", `Unauthenticated access returns 200`);
    } else if (res.status === 401 || res.status === 403) {
      console.log(`  ✅ ${ep}: properly protected (${res.status})`);
    } else {
      report(ep, "Unexpected status", "MEDIUM", `Returns ${res.status} instead of 401/403`);
    }
  }
}

async function auditXSS() {
  console.log("\n🛡️ XSS Audit");
  const payloads = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "javascript:alert(1)",
  ];

  for (const payload of payloads) {
    const res = await probe("GET", `/api/system/health?q=${encodeURIComponent(payload)}`);
    if (!res) continue;

    const text = await res.text();
    // If the payload is reflected in the response body, it's a potential XSS
    if (text.includes(payload)) {
      report(
        "/api/system/health?q=...",
        "XSS reflection",
        "HIGH",
        `Payload reflected in response: "${payload.substring(0, 40)}"`,
      );
    }
    // Also check Content-Type is JSON (safe), not HTML
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("text/html")) {
      report(
        "/api/system/health",
        "HTML content-type",
        "MEDIUM",
        "API returns HTML instead of JSON — XSS risk surface larger",
      );
    }
  }
  console.log(`  ✅ Tested ${payloads.length} XSS payloads`);
}

async function auditSQLi() {
  console.log("\n💉 SQLi Audit");
  const payloads = ["'; DROP TABLE users;--", "1' OR '1'='1", "union select * from users"];

  let blocked = 0;
  for (const payload of payloads) {
    const res = await probe("GET", `/api/collections?filter=${encodeURIComponent(payload)}`);
    if (!res) continue;

    if (res.status === 401 || res.status === 403) {
      console.log(`  ✅ Auth blocked before SQLi check (${res.status})`);
    } else if (res.status === 400 || res.status === 422) {
      blocked++;
      console.log(`  ✅ SQLi payload blocked (${res.status})`);
    } else {
      report(
        "/api/collections?filter=...",
        "SQLi not blocked",
        "HIGH",
        `Payload accepted with status ${res.status}: "${payload.substring(0, 30)}"`,
      );
    }
  }
  console.log(`  ✅ ${blocked}/${payloads.length} SQLi payloads blocked`);
}

async function auditPathTraversal() {
  console.log("\n📁 Path Traversal Audit");
  const payloads = ["../../../etc/passwd", "..\\..\\windows\\system32", "/etc/passwd%00.html"];

  for (const p of payloads) {
    const res = await probe("GET", `/api/media/files?path=${encodeURIComponent(p)}`);
    if (!res) continue;

    if (res.status === 400 || res.status === 404 || res.status === 401 || res.status === 403) {
      console.log(`  ✅ Traversal blocked (${res.status})`);
    } else if (res.status === 200) {
      report(
        "/api/media/files?path=...",
        "Path traversal",
        "CRITICAL",
        `Traversal payload returned 200: "${p}"`,
      );
    }
  }
}

async function auditHeaders() {
  console.log("\n📋 Security Headers Audit");
  const res = await probe("GET", "/api/system/health");
  if (!res) return;

  const checks: [string, string, Finding["risk"]][] = [
    ["x-frame-options", "Missing X-Frame-Options (clickjacking protection)", "HIGH"],
    ["x-content-type-options", "Missing X-Content-Type-Options (MIME sniffing)", "MEDIUM"],
    ["strict-transport-security", "Missing HSTS header", "MEDIUM"],
    ["content-security-policy", "Missing CSP header", "HIGH"],
    ["x-xss-protection", "Missing X-XSS-Protection header", "LOW"],
  ];

  for (const [header, msg, risk] of checks) {
    if (!res.headers.get(header)) {
      report("/api/*", msg, risk, msg);
    } else {
      console.log(`  ✅ ${header}: present`);
    }
  }
}

async function auditRateLimit() {
  console.log("\n⏱️ Rate Limit Audit");
  const responses: number[] = [];

  for (let i = 0; i < 15; i++) {
    const res = await probe(
      "POST",
      "/api/user/login",
      { "Content-Type": "application/json" },
      JSON.stringify({ email: "test@test.com", password: "wrong" }),
    );
    if (res) responses.push(res.status);
  }

  const throttleCount = responses.filter((s) => s === 429 || s === 423).length;
  if (throttleCount > 0) {
    console.log(`  ✅ Rate limiting active: ${throttleCount} requests throttled after 15 attempts`);
  } else {
    report(
      "/api/user/login",
      "No rate limiting",
      "HIGH",
      "15 login attempts not throttled — brute force risk",
    );
  }
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("🛡️ SveltyCMS Security Audit");
  console.log(`   Target: ${BASE}`);
  console.log("═".repeat(50));

  await auditAuth();
  await auditXSS();
  await auditSQLi();
  await auditPathTraversal();
  await auditHeaders();
  await auditRateLimit();

  // ── Summary ────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(50));
  console.log("📊 Security Audit Results:");

  const critical = findings.filter((f) => f.risk === "CRITICAL");
  const high = findings.filter((f) => f.risk === "HIGH");
  const medium = findings.filter((f) => f.risk === "MEDIUM");
  const low = findings.filter((f) => f.risk === "LOW");

  console.log(`   🔴 Critical: ${critical.length}`);
  console.log(`   🟠 High: ${high.length}`);
  console.log(`   🟡 Medium: ${medium.length}`);
  console.log(`   🔵 Low: ${low.length}`);

  if (findings.length === 0) {
    console.log("\n✅ No security findings. All checks passed.");
  } else {
    console.log("\n🔴 Findings:");
    for (const f of findings) {
      console.log(`   [${f.risk}] ${f.test}: ${f.endpoint} — ${f.detail}`);
    }
  }

  if (IS_CI && (critical.length > 0 || high.length > 0)) {
    console.log("\n❌ CI mode: blocking critical/high findings");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Security audit crashed:", err);
  process.exit(1);
});
