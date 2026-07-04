#!/usr/bin/env bun
/**
 * @file scripts/precheck.ts
 * @description
 * Unified local precheck runner — single manifest for push and full CI parity.
 *
 * Tiers:
 *   push  → pre-push hook: static analysis, unit, build, 4-DB integration, benchmarks
 *   full  → ci:local core (same as push + always-on scans; E2E stays in ci-local.ts)
 *
 * Usage:
 *   bun run verify:push                 # push tier (default)
 *   bun run verify:full                 # full tier
 *   bun run scripts/precheck.ts --tier=push --skip-benchmarks
 *   bun run scripts/precheck.ts --tier=full --db=postgresql
 *
 * ### Features:
 * - mirrors ci.yml db-tests and bench-core before code reaches GitHub
 * - change-aware skipping on push tier
 * - Docker reachability checks for network adapters
 */

import { INTEGRATION_DB_MATRIX, type IntegrationDbType } from "../src/utils/test-db-credentials.ts";
import {
  analyzeChanges,
  buildPrecheckTasks,
  ensureTestSecret,
  getChangedPaths,
  resolveActiveTasks,
  type PrecheckOptions,
  type PrecheckTier,
} from "./precheck-shared.ts";

const VALID_DBS = INTEGRATION_DB_MATRIX;

function parseArgs(): PrecheckOptions {
  const argv = process.argv.slice(2);

  const tierArg = argv.find((a) => a.startsWith("--tier="))?.slice("--tier=".length);
  const tier: PrecheckTier = tierArg === "full" ? "full" : "push";

  const singleDb = argv.find((a) => a.startsWith("--db="))?.slice("--db=".length) as
    | IntegrationDbType
    | undefined;

  if (singleDb && !VALID_DBS.includes(singleDb)) {
    console.error(`❌ Invalid --db="${singleDb}". Valid: ${VALID_DBS.join(", ")}`);
    process.exit(1);
  }

  return {
    tier,
    skipBenchmarks: argv.includes("--skip-benchmarks"),
    singleDb,
  };
}

export interface PrecheckResult {
  passed: boolean;
  failedTasks: string[];
  elapsedMs: number;
}

export async function runPrecheck(options: PrecheckOptions): Promise<PrecheckResult> {
  const start = performance.now();
  const changedPaths = options.changedPaths ?? (options.tier === "push" ? getChangedPaths() : []);
  const profile = analyzeChanges(changedPaths);
  const testSecret = ensureTestSecret();

  const tasks = buildPrecheckTasks(options.tier, profile, testSecret, {
    skipBenchmarks: options.skipBenchmarks,
    singleDb: options.singleDb,
  });
  const activeTasks = resolveActiveTasks(tasks);
  const failedTasks: string[] = [];

  for (const task of activeTasks) {
    console.log(`▶️  ${task.name}${task.ciJob ? ` [CI: ${task.ciJob}]` : ""}`);
    const taskStart = performance.now();

    let success = false;
    try {
      const result = task.run();
      success = await result;
    } catch (err) {
      console.error(`\n❌ ${task.name} crashed:`, err);
      success = false;
    }

    const elapsed = (performance.now() - taskStart).toFixed(0);
    if (!success) {
      console.error(`\n❌ ${task.name} failed (${elapsed}ms). Fix above before pushing.`);
      failedTasks.push(task.name);
    } else {
      console.log(`✅ ${task.name} passed (${elapsed}ms)\n`);
    }
  }

  return {
    passed: failedTasks.length === 0,
    failedTasks,
    elapsedMs: performance.now() - start,
  };
}

function printHeader(options: PrecheckOptions, profile: ReturnType<typeof analyzeChanges>) {
  const tierLabel = options.tier === "full" ? "Full CI Precheck" : "Pre-Push Precheck";

  console.log(`⚡ Running ${tierLabel}...\n`);

  if (options.tier === "push") {
    console.log("🔎 Push change profile:");
    console.log(`   Source/tests code:  ${profile.hasSourceCode ? "yes" : "no"}`);
    console.log(`   CI/infra scripts:   ${profile.hasInfra ? "yes" : "no"}`);
    console.log(`   Database layer:     ${profile.hasDbInfra ? "yes" : "no"}`);
    console.log(`   Admin theme routes: ${profile.hasAdminTheme ? "yes" : "no"}`);
    console.log(`   Documentation:      ${profile.hasDocs ? "yes" : "no"}`);
    console.log(`   CI smoke (build+4-DB+benchmarks): ${profile.needsCiSmoke ? "yes" : "no"}`);
    if (profile.paths.length <= 12) {
      console.log(`   Files: ${profile.paths.join(", ") || "(none — running full gate)"}`);
    } else {
      console.log(`   Files: ${profile.paths.length} changed`);
    }
  } else {
    console.log("🔎 Full tier: running complete static + DB matrix checks");
    if (options.singleDb) console.log(`   Single DB: ${options.singleDb}`);
    if (options.skipBenchmarks) console.log("   Benchmarks: skipped");
  }
}

function printSuccess(options: PrecheckOptions) {
  if (options.tier === "full") {
    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║  ✅ Full precheck passed — CI core parity cleared.          ║");
    console.log("╠══════════════════════════════════════════════════════════════╣");
    console.log("║  Optional: bun run ci:local  (adds Playwright E2E)          ║");
    console.log("╚══════════════════════════════════════════════════════════════╝\n");
    return;
  }

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  ✅ Pre-push precheck passed — 4-DB + benchmarks cleared.   ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log("║  Still runs on GitHub (Linux runners):                      ║");
  console.log("║    🎭 Playwright E2E (sharded)                              ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log("║  Optional full precheck: bun run verify:full                ║");
  console.log("║  With E2E: bun run ci:local                                 ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
}

function printFailure(options: PrecheckOptions, failedTasks: string[]) {
  console.error(`\n❌ ${failedTasks.length} task(s) failed:`);
  for (const name of failedTasks) console.error(`   - ${name}`);
  console.error("\n   Fix the issues above, commit, and push again.");
  console.error(
    "   Ensure Docker DBs are up: docker compose -f tests/docker-compose.yml --profile postgresql up -d",
  );
  if (options.tier === "push") {
    console.error("   Full CI precheck (+ E2E): bun run ci:local");
  }
  console.error("   DO NOT bypass the gate — CI will reject the same issues.\n");
}

export async function runPrecheckCli(options: PrecheckOptions): Promise<number> {
  const changedPaths = options.changedPaths ?? (options.tier === "push" ? getChangedPaths() : []);
  const profile = analyzeChanges(changedPaths);

  printHeader(options, profile);

  const tasks = buildPrecheckTasks(options.tier, profile, ensureTestSecret(), {
    skipBenchmarks: options.skipBenchmarks,
    singleDb: options.singleDb,
  });
  const activeCount = resolveActiveTasks(tasks).length;
  console.log(`\n🚦 Running ${activeCount} checks...\n`);

  const result = await runPrecheck({ ...options, changedPaths });

  if (!result.passed) {
    printFailure(options, result.failedTasks);
    return 1;
  }

  printSuccess(options);
  return 0;
}

async function main() {
  const exitCode = await runPrecheckCli(parseArgs());
  process.exit(exitCode);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Precheck crashed:", err);
    process.exit(1);
  });
}
