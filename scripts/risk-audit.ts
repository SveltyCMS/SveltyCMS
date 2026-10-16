#!/usr/bin/env bun
/**
 * @file scripts/risk-audit.ts
 * @description
 * Full risk audit for commits — runs every fast, stateless security check in
 * one gate. Covers the layers no single tool can:
 *
 *   1. scan-security-risk — OUR code: SQL/NoSQL injection classes across all
 *                        4 adapters (SQLite, MariaDB, PostgreSQL, MongoDB),
 *                        command injection, dynamic code execution, path
 *                        traversal, SSRF (incl. unguarded remote URL fetch),
 *                        privilege-field writes, SVG stream bypass, XSS sinks +
 *                        SvelteKit CSRF/cookie
 *                        config — over the ENTIRE src tree
 *   2. scan-secret-misuse — hardcoded credentials / comparison backdoors
 *   3. slop-scanner      — XSS, RTL, security architecture rules
 *   4. lint-tenant-api   — AST tenant-isolation hygiene & bypass allowlist
 *   5. bun audit         — GitHub Advisory DB for the npm dependency tree
 *   6. scan-osv          — OSV.dev global database (GHSA + NVD + 20+ feeds)
 *
 * ### Features:
 * - Parallel execution across all independent scanners with deterministic output ordering
 * - Supports `--full` to force full-repo scanning on incremental gates (`scan-secret-misuse`, `lint-tenant-api`)
 *
 * ### Usage
 *   bun run risk:audit         # full risk audit (exit 1 on findings)
 *   bun run risk:audit --full  # force full non-incremental scans on all gates
 */

const fullFlag = process.argv.includes("--full") || process.argv.includes("--all");

const STEPS: { name: string; args: string[] }[] = [
  {
    name: "🛡️  Global security risk scan (all src)",
    args: ["run", "scripts/scan-security-risk.ts", "--strict"],
  },
  {
    name: "🔑  Secret misuse scan",
    args: ["run", "scripts/scan-secret-misuse.ts", "--strict", ...(fullFlag ? ["--full"] : [])],
  },
  {
    name: "🧹  Slop scanner (XSS/RTL/security)",
    args: ["run", "scripts/slop-scanner.ts", "--strict"],
  },
  {
    name: "🏢  Tenant isolation API hygiene",
    args: ["run", "scripts/lint-tenant-api.ts", ...(fullFlag ? ["--full"] : [])],
  },
  { name: "📦  Dependency audit (GitHub Advisory DB)", args: ["audit", "--no-color"] },
  {
    name: "🌐  Global vulnerability check (OSV.dev)",
    args: ["run", "scripts/scan-osv.ts", "--strict"],
  },
];

interface StepResult {
  name: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  elapsedMs: number;
}

async function runStep(step: { name: string; args: string[] }): Promise<StepResult> {
  const start = performance.now();
  const proc = Bun.spawn(["bun", ...step.args], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return {
    name: step.name,
    exitCode,
    stdout,
    stderr,
    elapsedMs: Math.round(performance.now() - start),
  };
}

const totalStart = performance.now();
const results = await Promise.all(STEPS.map(runStep));
const totalElapsedMs = Math.round(performance.now() - totalStart);

let ok = 0;
for (const res of results) {
  process.stdout.write(`\n━━━ ${res.name} (${res.elapsedMs}ms) ━━━\n\n`);
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  if (res.exitCode === 0) {
    ok += 1;
  } else {
    console.error(`\n❌ ${res.name} failed (exit ${res.exitCode})`);
  }
}

console.log(`\nRisk audit: ${ok}/${STEPS.length} checks passed in ${totalElapsedMs}ms`);
process.exit(ok === STEPS.length ? 0 : 1);
