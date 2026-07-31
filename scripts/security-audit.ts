#!/usr/bin/env bun
/**
 * @file scripts/security-audit.ts
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
 *   bun run security --slop        # Also run code quality slop scanner
 *   bun run security --cve          # Also run dependency CVE audit (SBOM + bun audit)
 *   bun run security --full        # Run ALL scanners (auth + secret + slop + cve)
 */

// Mark as ES module so top-level await is valid under tsc (TS1375).
export {};

const args = process.argv.slice(2);
const RUN_AUTH = args.includes("--auth");
const IS_CI = args.includes("--ci");
const RUN_SECRET_SCAN = args.includes("--secret-scan") || args.includes("--full");
const RUN_SLOP_SCAN = args.includes("--slop") || args.includes("--full");
const RUN_CVE_SCAN = args.includes("--cve") || args.includes("--full");
const ONLY_FILTER = args.find((a) => a.startsWith("--only="));

let exitCode = 0;

// ── Authenticated audit (build + start + seed + scan) ─────────────
if (RUN_AUTH) {
  console.log("\n━━━ Authenticated Security Audit ━━━\n");
  const { runAuthAudit } = await import("./security/auth");
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
  const healthBase = args.includes("--base")
    ? args[args.indexOf("--base") + 1]
    : process.env.PLAYWRIGHT_TEST_BASE_URL || "http://127.0.0.1:4173";
  try {
    const health = await fetch(`${healthBase}/api/system/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!health.ok) throw new Error("unhealthy");
  } catch {
    console.log(
      `⚠️  No server at ${healthBase}. Start one with: bun run build && node build/index.js\n`,
    );
    shouldScan = false;
  }

  if (shouldScan) {
    const { runScanner } = await import("./security/scanner");
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

// ── Secret Misuse Scanner ─────────────────────────────────────────
if (RUN_SECRET_SCAN) {
  console.log("\n━━━ Secret Misuse Scan ━━━\n");
  try {
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync("bun", ["run", "scripts/scan-secret-misuse.ts", "--strict"], {
      stdio: "inherit",
      cwd: process.cwd(),
    });
    if (result.status !== 0) {
      console.error("\n❌ Secret scan found issues\n");
      exitCode = 1;
    } else {
      console.log("✅ Secret scan passed\n");
    }
  } catch {
    console.error("\n❌ Secret scan failed to run\n");
    exitCode = 1;
  }
}

// ── Dependency CVE Audit (SBOM refresh + bun audit) ───────────────
if (RUN_CVE_SCAN) {
  console.log("\n━━━ Dependency CVE Audit ━━━\n");
  try {
    const { spawnSync } = await import("node:child_process");
    // Refresh SBOM from the lockfile first so the audit covers current dependencies
    const sbom = spawnSync("bun", ["run", "scripts/generate-sbom.ts"], {
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
    if (audit.status !== 0) {
      console.error("\n❌ Dependency audit found vulnerabilities\n");
      exitCode = 1;
    } else {
      console.log("✅ Dependency audit passed\n");
    }
  } catch {
    console.error("\n❌ Dependency audit failed to run\n");
    exitCode = 1;
  }
}

// ── Code Quality (Slop) Scanner ───────────────────────────────────
if (RUN_SLOP_SCAN) {
  console.log("\n━━━ Code Quality Scan ━━━\n");
  try {
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync("bun", ["run", "scripts/slop-scanner.ts", "--strict"], {
      stdio: "inherit",
      cwd: process.cwd(),
    });
    if (result.status !== 0) {
      console.error("\n❌ Code quality scan found issues\n");
      exitCode = 1;
    } else {
      console.log("✅ Code quality scan passed\n");
    }
  } catch {
    console.error("\n❌ Code quality scan failed to run\n");
    exitCode = 1;
  }
}

process.exit(exitCode);
