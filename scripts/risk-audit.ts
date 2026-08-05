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
 *                        traversal, SSRF, XSS sinks + SvelteKit CSRF/cookie
 *                        config — over the ENTIRE src tree
 *   2. scan-secret-misuse — hardcoded credentials / comparison backdoors
 *   3. slop-scanner     — XSS, RTL, security architecture rules
 *   4. bun audit        — GitHub Advisory DB for the npm dependency tree
 *   5. scan-osv         — OSV.dev global database (GHSA + NVD + 20+ feeds)
 *
 * ### Usage
 *   bun run risk:audit         # full risk audit (exit 1 on findings)
 */

import { spawnSync } from "node:child_process";

const STEPS: { name: string; args: string[] }[] = [
  {
    name: "🛡️  Global security risk scan (all src)",
    args: ["run", "scripts/scan-security-risk.ts", "--strict"],
  },
  { name: "🔑  Secret misuse scan", args: ["run", "scripts/scan-secret-misuse.ts", "--strict"] },
  {
    name: "🧹  Slop scanner (XSS/RTL/security)",
    args: ["run", "scripts/slop-scanner.ts", "--strict"],
  },
  { name: "📦  Dependency audit (GitHub Advisory DB)", args: ["audit", "--no-color"] },
  {
    name: "🌐  Global vulnerability check (OSV.dev)",
    args: ["run", "scripts/scan-osv.ts", "--strict"],
  },
];

let ok = 0;
for (const step of STEPS) {
  process.stdout.write(`\n━━━ ${step.name} ━━━\n\n`);
  const res = spawnSync("bun", step.args, { stdio: "inherit", cwd: process.cwd() });
  if (res.status === 0) {
    ok += 1;
  } else {
    console.error(`\n❌ ${step.name} failed`);
  }
}

console.log(`\nRisk audit: ${ok}/${STEPS.length} checks passed`);
process.exit(ok === STEPS.length ? 0 : 1);
