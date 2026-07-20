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
 */

// Mark as ES module so top-level await is valid under tsc (TS1375).
export {};

const args = process.argv.slice(2);
const RUN_AUTH = args.includes("--auth");
const IS_CI = args.includes("--ci");
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

process.exit(exitCode);
