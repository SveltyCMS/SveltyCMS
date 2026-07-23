#!/usr/bin/env bun
/**
 * @file scripts/run-all-db-matrix.ts
 * @description Local DB Matrix runner with rich UX progress updates, timing,
 *              and clean diagnostic failure reporting across all 4 databases.
 */

import { spawnSync } from "node:child_process";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const DB_TYPES = ["sqlite", "mongodb", "mariadb", "postgresql"] as const;

interface DbResult {
  db: string;
  status: "PASS" | "FAIL" | "SKIP";
  durationMs: number;
  passedCount?: number;
  failedCount?: number;
  skippedCount?: number;
  failures: Array<{ suite: string; name: string; durationMs?: number }>;
}

console.log("\n=================================================================");
console.log("🏁 SveltyCMS — 4-Database Matrix Test Suite");
console.log("   Target Adapters: SQLite | MongoDB | MariaDB | PostgreSQL");
console.log("=================================================================\n");

const startTimeOverall = Date.now();

// ── Step 1: Production Bundle ────────────────────────────────────────────────
console.log("📦 [Phase 1/2] Compiling production build (COMPILE_ALL_ADAPTERS=true)...");
const buildStart = Date.now();
const buildProc = spawnSync("bun", ["run", "build"], {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...process.env, COMPILE_ALL_ADAPTERS: "true" },
});

if (buildProc.status !== 0) {
  console.error("\n❌ Production build failed! Cannot proceed with matrix testing.");
  process.exit(1);
}
console.log(`✅ Build completed in ${((Date.now() - buildStart) / 1000).toFixed(1)}s\n`);

// ── Step 2: Sequential Database Runs ─────────────────────────────────────────
console.log("🧪 [Phase 2/2] Running Integration Suite across 4 Database Engines...");
const results: DbResult[] = [];

for (let i = 0; i < DB_TYPES.length; i++) {
  const db = DB_TYPES[i];
  const stepLabel = `[${i + 1}/${DB_TYPES.length}]`;
  console.log("\n-----------------------------------------------------------------");
  console.log(`🔄 ${stepLabel} Executing DB Integration Suite: ${db.toUpperCase()}`);
  console.log("-----------------------------------------------------------------");

  const dbStart = Date.now();
  const runProc = spawnSync("bun", ["run", "scripts/run-integration.ts", "--no-build"], {
    cwd: ROOT,
    stdio: "pipe",
    encoding: "utf8",
    env: { ...process.env, DB_TYPE: db },
  });

  const durationMs = Date.now() - dbStart;
  const stdout = runProc.stdout || "";
  const stderr = runProc.stderr || "";
  const combined = stdout + "\n" + stderr;

  // Parse pass/fail/skip summary numbers from bun test output
  const passMatch = combined.match(/(\d+)\s+pass/);
  const failMatch = combined.match(/(\d+)\s+fail/);
  const skipMatch = combined.match(/(\d+)\s+skip/);

  const passedCount = passMatch ? parseInt(passMatch[1], 10) : 0;
  const failedCount = failMatch ? parseInt(failMatch[1], 10) : 0;
  const skippedCount = skipMatch ? parseInt(skipMatch[1], 10) : 0;

  // Parse specific failure lines
  const failures: Array<{ suite: string; name: string; durationMs?: number }> = [];
  for (const line of combined.split(/\r?\n/)) {
    const m = line.match(/^\s*\((fail)\)\s+(.+?)\s*\[([\d.]+)ms\]/);
    if (m) {
      const fullName = m[2].trim();
      const parts = fullName.split(" > ");
      failures.push({
        suite: parts[0] || fullName,
        name: parts.slice(1).join(" > ") || fullName,
        durationMs: parseFloat(m[3]),
      });
    }
  }

  const isSuccess = runProc.status === 0 && failedCount === 0;
  const status: "PASS" | "FAIL" = isSuccess ? "PASS" : "FAIL";

  results.push({
    db,
    status,
    durationMs,
    passedCount,
    failedCount,
    skippedCount,
    failures,
  });

  const durationSec = (durationMs / 1000).toFixed(1);
  if (isSuccess) {
    console.log(
      `✅ ${stepLabel} ${db.toUpperCase()} PASSED (${passedCount} passed, ${skippedCount} skipped in ${durationSec}s)`,
    );
  } else {
    console.error(
      `❌ ${stepLabel} ${db.toUpperCase()} FAILED (${failedCount} failed, ${passedCount} passed in ${durationSec}s)`,
    );
    if (failures.length > 0) {
      console.error(`   Failed tests in ${db.toUpperCase()}:`);
      for (const f of failures.slice(0, 8)) {
        console.error(`     • [${f.suite}] ${f.name} (${f.durationMs ?? 0}ms)`);
      }
      if (failures.length > 8) {
        console.error(`     ... and ${failures.length - 8} more failure(s)`);
      }
    }
  }
}

// ── Step 3: Final Dashboard & Clean Summary ──────────────────────────────────
const totalSec = ((Date.now() - startTimeOverall) / 1000).toFixed(1);
let allPassed = true;

console.log("\n=================================================================");
console.log("📊 4-DATABASE MATRIX RESULT DASHBOARD");
console.log("=================================================================");
console.log(` Total Time: ${totalSec}s\n`);

for (const r of results) {
  const icon = r.status === "PASS" ? "✅" : "❌";
  const label = r.db.padEnd(10);
  const time = `${(r.durationMs / 1000).toFixed(1)}s`.padStart(6);
  const counts =
    r.passedCount !== undefined ? `(${r.passedCount} pass, ${r.failedCount} fail)` : "";
  console.log(`  ${icon} ${label} : ${r.status}  [${time}]  ${counts}`);
  if (r.status !== "PASS") allPassed = false;
}

console.log("=================================================================");

if (allPassed) {
  console.log("🎉 ALL 4 DATABASE ADAPTERS PASSED INTEGRATION TESTING CLEANLY!");
  console.log("=================================================================\n");
  process.exit(0);
} else {
  console.error("⚠️ MATRIX SUITE DETECTED FAILURES. CHECK DIAGNOSTICS ABOVE.");
  console.log("=================================================================\n");
  process.exit(1);
}
