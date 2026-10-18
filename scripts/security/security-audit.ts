#!/usr/bin/env bun
/**
 * @file scripts/security/security-audit.ts
 * @description Security audit runner.
 *
 * Runs the OWASP security scanner against your running server.
 * Use --auth to start a production build in TEST_MODE, seed, and scan authenticated.
 *
 * ### Usage:
 *   bun run security              # Scanner against localhost:4173
 *   bun run security --auth       # Build + start server + seed + authenticated scan
 *   bun run security --ci         # CI mode (exit 1 on findings)
 *   bun run security --base=http://localhost:3000  # Custom target
 *   bun run security --auth --ci  # Full CI authenticated audit
 *   bun run security --secret-scan  # Also run secret misuse scanner
 *   bun run security --risk        # Also run global security risk + tenant API scanners
 *   bun run security --slop        # Also run code quality slop scanner
 *   bun run security --cve          # Also run dependency CVE audit (SBOM + bun audit + OSV.dev)
 *   bun run security --fuzz        # Also run API payload fuzzer
 *   bun run security --full        # Run ALL scanners (auth + risk + secret + slop + cve + fuzz)
 */

import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
// `--full` is documented as the union of every scanner, including the
// authenticated audit. Keep the flag semantics in one place.
const RUN_AUTH = args.includes("--auth") || args.includes("--full");
const IS_CI = args.includes("--ci");
const RUN_RISK_SCAN = args.includes("--risk") || args.includes("--full");
const RUN_SECRET_SCAN = args.includes("--secret-scan") || args.includes("--full");
const RUN_SLOP_SCAN = args.includes("--slop") || args.includes("--full");
const RUN_CVE_SCAN = args.includes("--cve") || args.includes("--full");
const RUN_FUZZ_SCAN = args.includes("--fuzz") || args.includes("--full");
const ONLY_FILTER = args.find((a) => a.startsWith("--only="));

let exitCode = 0;

// ── Authenticated audit (build + start + seed + scan) ─────────────
if (RUN_AUTH) {
  console.log("\n━━━ Authenticated Security Audit ━━━\n");
  const { runAuthAudit } = await import("./auth");
  const code = await runAuthAudit({ extraFlags: IS_CI ? ["--ci"] : [] });
  if (code !== 0) {
    console.error("❌ Authenticated audit FAILED\n");
    exitCode = 1;
  } else {
    console.log("✅ Authenticated audit passed\n");
  }
}

// ── Scanner (default) ────────────────────────────────────────────
if (!RUN_AUTH) {
  console.log("\n━━━ Security Audit ━━━\n");

  let shouldScan = true;
  // Support both documented forms: `--base=http://…` and `--base http://…`.
  const baseEquals = args.find((a) => a.startsWith("--base="));
  const baseSeparate = args.includes("--base") ? args[args.indexOf("--base") + 1] : undefined;
  const healthBase =
    baseEquals?.slice("--base=".length) ||
    baseSeparate ||
    process.env.PLAYWRIGHT_TEST_BASE_URL ||
    "http://127.0.0.1:4173";
  try {
    const health = await fetch(`${healthBase}/api/system/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!health.ok) throw new Error("unhealthy");
  } catch (err) {
    shouldScan = false;
    const detail = err instanceof Error ? err.message : String(err);
    if (IS_CI) {
      // Fail closed: a CI audit that could not reach the server is not a pass.
      console.error(`❌ No server at ${healthBase} (${detail}) — CI audit cannot run.`);
      exitCode = 1;
    } else {
      console.log(
        `⚠️  No server at ${healthBase} (${detail}). Start one with: bun run build && node build/index.js\n`,
      );
    }
  }

  if (shouldScan) {
    const { runScanner } = await import("./scanner");
    // Pass --only=backdoor or any other filter through
    const only = ONLY_FILTER?.split("=")[1] || undefined;
    const code = await runScanner({ auth: false, ci: IS_CI, base: healthBase, only });
    if (code !== 0) {
      console.error("❌ Security audit FAILED\n");
      exitCode = 1;
    } else {
      console.log("✅ Security audit passed\n");
    }
  }
}

// ── Global Security Risk + Tenant Isolation Scanners ──────────────
if (RUN_RISK_SCAN) {
  console.log("\n━━━ Global Security Risk & Tenant Isolation Scan ━━━\n");
  try {
    const riskRes = spawnSync(
      "bun",
      ["run", "scripts/security/scan-security-risk.ts", "--strict"],
      {
        stdio: "inherit",
        cwd: process.cwd(),
      },
    );
    const tenantRes = spawnSync("bun", ["run", "scripts/lint/lint-tenant-api.ts", "--full"], {
      stdio: "inherit",
      cwd: process.cwd(),
    });
    if (riskRes.status !== 0 || tenantRes.status !== 0) {
      console.error("\n❌ Security risk / tenant isolation scan found issues\n");
      exitCode = 1;
    } else {
      console.log("✅ Security risk & tenant isolation scan passed\n");
    }
  } catch (err) {
    console.error("\n❌ Security risk scan failed to run\n", err);
    exitCode = 1;
  }
}

// ── Secret Misuse Scanner ─────────────────────────────────────────
if (RUN_SECRET_SCAN) {
  console.log("\n━━━ Secret Misuse Scan ━━━\n");
  try {
    const result = spawnSync(
      "bun",
      ["run", "scripts/security/scan-secret-misuse.ts", "--strict", "--full"],
      {
        stdio: "inherit",
        cwd: process.cwd(),
      },
    );
    if (result.status !== 0) {
      console.error("\n❌ Secret scan found issues\n");
      exitCode = 1;
    } else {
      console.log("✅ Secret scan passed\n");
    }
  } catch (err) {
    console.error("\n❌ Secret scan failed to run\n", err);
    exitCode = 1;
  }
}

// ── Dependency CVE Audit (SBOM refresh + bun audit + OSV.dev) ─────
if (RUN_CVE_SCAN) {
  console.log("\n━━━ Dependency CVE Audit ━━━\n");
  try {
    // Refresh SBOM from the lockfile first so the audit covers current dependencies
    const sbom = spawnSync("bun", ["run", "scripts/security/generate-sbom.ts"], {
      stdio: "inherit",
      cwd: process.cwd(),
    });
    if (sbom.status !== 0) {
      console.warn("⚠️  SBOM regeneration failed — continuing with existing sbom.json\n");
    }
    const audit = spawnSync("bun", ["audit", "--no-color"], {
      stdio: "inherit",
      cwd: process.cwd(),
    });
    const osv = spawnSync("bun", ["run", "scripts/security/scan-osv.ts", "--strict"], {
      stdio: "inherit",
      cwd: process.cwd(),
    });
    if (audit.status !== 0 || osv.status !== 0) {
      console.error("\n❌ Dependency audit found vulnerabilities\n");
      exitCode = 1;
    } else {
      console.log("✅ Dependency audit passed\n");
    }
  } catch (err) {
    console.error("\n❌ Dependency audit failed to run\n", err);
    exitCode = 1;
  }
}

// ── Code Quality (Slop) Scanner ───────────────────────────────────
if (RUN_SLOP_SCAN) {
  console.log("\n━━━ Code Quality Scan ━━━\n");
  try {
    const result = spawnSync("bun", ["run", "scripts/security/slop-scanner.ts", "--strict"], {
      stdio: "inherit",
      cwd: process.cwd(),
    });
    if (result.status !== 0) {
      console.error("\n❌ Code quality scan found issues\n");
      exitCode = 1;
    }
  } catch (err) {
    console.error("\n❌ Code quality scan failed\n", err);
    exitCode = 1;
  }
}

// ── API Payload Fuzzer ────────────────────────────────────────────
if (RUN_FUZZ_SCAN) {
  console.log("\n━━━ API Payload Fuzzer ━━━\n");
  try {
    const { runFuzzAudit } = await import("./fuzzer");
    const res = runFuzzAudit();
    console.log(
      `✅ Fuzzing passed (${res.iterations} payloads tested, ${res.blockedByWaf} blocked by WAF, 0 crashes)\n`,
    );
  } catch (err) {
    console.error("\n❌ API payload fuzzer failed\n", err);
    exitCode = 1;
  }
}

process.exit(exitCode);
