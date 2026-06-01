/**
 * @file scripts\benchmark-matrix\index.ts
 * @description Entry point for the benchmark matrix tool.
 */

// 🚀 ENTERPRISE HARDENING: Ensure benchmark mode is detectable by all sub-modules
process.env.SVELTY_BENCHMARK_SUITE = "true";
process.env.BENCHMARK_MODE = "1";
process.env.BENCHMARK_STABLE = "true";

import chalk from "chalk";
import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

import { version as pkgVersion } from "../../package.json";
import { log } from "./logger";
import { parseArgs, printList, filterScripts, filterDatabases, collectHostInfo } from "./cli";
import { requiresRebuild } from "./utils";
import { runAuditForDatabase, runTask } from "./runner";
import {
  printSummaryTable,
  writeCISummary,
  generateFinalReport,
  scanResultsDirectory,
} from "./reporting";
import {
  startServer,
  stopServer,
  ensureDatabaseExists,
  setShuttingDown,
  isShuttingDown,
} from "./server";
import { AsyncSemaphore } from "./semaphore";
import {
  ALL_DATABASES,
  BENCHMARK_SCRIPTS,
  DB_ORDER,
  PORT_BASE,
  getConcurrencyForDb,
  ADMIN_PASSWORD,
  TEST_API_SECRET,
  JWT_SECRET_KEY,
  ENCRYPTION_KEY,
  ROOT_RESULTS_DIR,
  HEALING_PORT_OFFSET,
} from "./config";
import type { BenchmarkResult } from "./types";

import { initProgressTracker } from "./progress";

/**
 * ✨ Configuration Safeguard (Enterprise Resilience)
 * Ensures user configuration is never permanently lost or corrupted by audit suites.
 */
class ConfigSafeguard {
  private static configPath = path.join(process.cwd(), "config/private.ts");
  private static backupPath = path.join(process.cwd(), "config/private.ts.backup");

  /** Backs up the current config if it exists */
  static async backup() {
    try {
      await fs.access(this.configPath);
      await fs.copyFile(this.configPath, this.backupPath);
      log.info("🛡️ Backup: config/private.ts secured.");
    } catch {
      // No config to backup (fresh install mode)
    }
  }

  /** Restores the backup or cleans up leaked configs */
  static async restore() {
    try {
      // 1. If backup exists, restore it (overwriting any leaks)
      if (
        await fs
          .access(this.backupPath)
          .then(() => true)
          .catch(() => false)
      ) {
        await fs.rename(this.backupPath, this.configPath);
        log.info("🛡️ Restore: original config/private.ts recovered.");
      } else {
        // 2. If no backup, ensure no leaked config remains (return to Setup Mode)
        await fs.rm(this.configPath, { force: true });
        log.info("🛡️ Cleanup: Return to Setup Mode confirmed.");
      }

      // 4. Purge mock collections to prevent redirection leaks
      const compiledDir = path.join(process.cwd(), ".compiledCollections");
      const files = await fs.readdir(compiledDir).catch(() => []);
      for (const file of files) {
        if (file.includes("bench") || file.includes("mock") || file.startsWith("benchmark_")) {
          await fs.rm(path.join(compiledDir, file), {
            recursive: true,
            force: true,
          });
        }
      }
      // Also purge 'nested' benchmark directory if it exists
      await fs
        .rm(path.join(compiledDir, "nested"), { recursive: true, force: true })
        .catch(() => {});
    } catch (err: any) {
      log.error(`Safeguard failed: ${err.message}`);
    }
  }
}

/**
 * Register SIGINT / SIGTERM handlers so Ctrl-C cleanly kills any child
 * worker servers before exit.
 */
function registerShutdownHandlers() {
  const onSignal = async (sig: string) => {
    setShuttingDown(true);
    log.warn(`Received ${sig} — graceful shutdown...`);
    await stopServer();
    await ConfigSafeguard.restore(); // Ensure restoration on termination
    process.exit(130);
  };
  process.on("SIGINT", () => onSignal("SIGINT"));
  process.on("SIGTERM", () => onSignal("SIGTERM"));
}

/**
 * Smart cleanup: Only wipe when doing full or multi-test runs.
 * Preserve everything in single-test mode.
 */
async function cleanupResults(activeDatabases: any[], cfg: any, activeScripts?: any[]) {
  const isSingleTest = activeScripts && activeScripts.length === 1;
  const isSingleDb = activeDatabases.length === 1;

  if (cfg.forceClean) {
    log.warn("Force clean mode — wiping all results for active databases");
    // do full cleanup regardless of single test
  } else if (isSingleTest) {
    log.info(
      `Single test mode (${activeScripts![0].shortLabel}) — preserving ALL previous results`,
    );
    return;
  }

  if (isSingleDb && activeDatabases[0]) {
    const dbKey = (activeDatabases[0].label || activeDatabases[0].type)
      .toLowerCase()
      .replace("+", "-");

    log.info(`Single database mode (${dbKey}) — preserving existing results`);

    const dbDir = path.join(ROOT_RESULTS_DIR, dbKey);
    // Preserve results — individual tests overwrite their own files
    await fs.mkdir(dbDir, { recursive: true });
    return;
  }

  log.info("Full suite — performing selective result cleanup...");
  try {
    const activeKeys = new Set(
      activeDatabases.flatMap((db) => {
        const key = (db.label || db.type).toLowerCase().replace("+", "-");
        return [key, `${key}-redis`];
      }),
    );

    log.info(`Active cleanup keys: ${Array.from(activeKeys).join(", ")}`);

    const files = await fs.readdir(ROOT_RESULTS_DIR);
    for (const file of files) {
      if (file === "history.sqlite" || file === "ci-summary.json" || file === "history.jsonl")
        continue;

      if (activeKeys.has(file)) {
        log.info(`Preserving: ${file}`);
      } else {
        log.info(`Preserving data: ${file}`);
      }
    }
  } catch (err) {
    log.warn(`Cleanup failed: ${err}`);
  }
}

/**
 * Main orchestration entry point for the SveltyCMS Enterprise Audit.
 */
async function main() {
  registerShutdownHandlers();

  const cfg = parseArgs();

  // 🚀 WINDOWS RESILIENCE: Set local TMP/TEMP to avoid AppData\Local\Temp locking issues
  if (process.platform === "win32") {
    const localTmp = path.join(process.cwd(), "tmp");
    await fs.mkdir(localTmp, { recursive: true });
    process.env.TMP = localTmp;
    process.env.TEMP = localTmp;
  }

  // 🚀 HARDENING: Purge stale SQLite files to avoid boot-time state contamination
  const dbDir = path.join(process.cwd(), "config/database");
  try {
    const dbFiles = await fs.readdir(dbDir);
    for (const f of dbFiles) {
      if (
        f.startsWith("bench_tmp_") &&
        (f.endsWith(".sqlite") || f.endsWith(".sqlite-shm") || f.endsWith(".sqlite-wal"))
      ) {
        await fs.unlink(path.join(dbDir, f)).catch(() => {});
      }
    }
    log.info("🛡️ Isolation: Stale SQLite files purged.");
  } catch {
    // Ignore if directory missing
  }

  // Initialize Safeguard before any logic
  await ConfigSafeguard.backup();

  if (cfg.list) {
    await printList();
    process.exit(0);
  }

  const hostInfo = await collectHostInfo();
  const activeScripts = filterScripts(cfg);
  const activeDatabases = filterDatabases(cfg);

  // Clean up existing results only for the databases we are about to audit
  await cleanupResults(activeDatabases, cfg, activeScripts);

  if (cfg.sectionFilter) log.info(`Section filter: ${cfg.sectionFilter.join(", ")}`);
  if (cfg.levelFilter !== null) log.info(`Level filter: ≤ ${cfg.levelFilter}`);
  if (cfg.onlyFilter) log.info(`Only: ${cfg.onlyFilter.join(", ")}`);
  if (cfg.dbFilter) log.info(`DB filter: ${cfg.dbFilter.join(", ")}`);
  if (cfg.skipRedis) log.info("Redis variants: SKIPPED");
  if (cfg.ci) log.info("CI mode: enabled");

  log.header(`SveltyCMS Enterprise Audit v${pkgVersion}`);
  log.info(`Scripts to run: ${activeScripts.length} / ${BENCHMARK_SCRIPTS.length}`);
  log.info(`Databases to test: ${activeDatabases.length} / ${ALL_DATABASES.length}`);
  log.info(`Retry attempts per script: ${cfg.retryCount}`);

  // 🚀 Initialize Progress Tracker
  const totalTasks = activeDatabases.length * activeScripts.length;
  initProgressTracker(totalTasks);

  const privateTestPath = path.join(process.cwd(), "config/private.test.ts");
  try {
    await fs.access(privateTestPath);
    log.success("Isolation Guard: private.test.ts detected.");
  } catch {
    log.warn("Isolation Guard: private.test.ts missing. Attempting self-healing...");
    const sqliteConf = ALL_DATABASES.find((d) => d.type === "sqlite" && !d.useRedis);
    if (!sqliteConf) {
      log.error("CRITICAL: No SQLite config found for self-healing.");
      process.exit(1);
    }
    try {
      const workerDbName_healing = "SveltyCMS_healing_test";
      const healingPort = PORT_BASE + HEALING_PORT_OFFSET;
      const server = await startServer(sqliteConf, healingPort, workerDbName_healing);
      const ok = await runTask(
        "Baseline Setup",
        "bun run scripts/setup-system.ts",
        {
          DB_TYPE: "sqlite",
          DB_NAME: workerDbName_healing,
          TEST_MODE: "true",
          ADMIN_PASSWORD,
          TEST_API_SECRET,
          JWT_SECRET_KEY,
          ENCRYPTION_KEY,
          SUPPRESS_JEST_WARNINGS: "true",
          API_BASE_URL: `http://127.0.0.1:${healingPort}`,
        },
        cfg.ci,
      );
      await server.stop();
      if (!ok) {
        log.error("CRITICAL: Self-healing failed. Run scripts/setup-system.ts manually.");
        process.exit(1);
      }
      log.success("Self-healing complete. private.test.ts generated.");
    } catch (e: any) {
      log.error(`Self-healing interrupted: ${e.message}`);
      await stopServer();
      process.exit(1);
    }
  }

  let buildMetrics: { durationMs: number } | null = null;
  if (!cfg.skipBuild) {
    if (!requiresRebuild()) {
      log.success("Build is current — skipping rebuild.");
    } else {
      log.info("Phase 1: Production build (DX tracking)...");
      const t0 = performance.now();
      try {
        const buildEnv: Record<string, string | undefined> = {
          ...process.env,
          COMPILE_ALL_ADAPTERS: "true",
        };
        delete buildEnv.SVELTY_BENCHMARK_SUITE;
        delete buildEnv.BENCHMARK_MODE;
        delete buildEnv.BENCHMARK;
        delete buildEnv.BENCHMARK_STABLE;
        execSync("bun run build", {
          stdio: cfg.ci ? "pipe" : "inherit",
          env: buildEnv,
        });
        const buildTimeMs = Math.round(performance.now() - t0);
        log.success(`Build complete in ${(buildTimeMs / 1000).toFixed(3)}s.`);
        buildMetrics = { durationMs: buildTimeMs };
      } catch {
        log.error("Build failed. Aborting.");
        process.exit(1);
      }
    }
  }

  log.info("Phase 1.5: Infrastructure pre-check...");
  for (const db of activeDatabases) {
    try {
      await ensureDatabaseExists(db);
    } catch (e: any) {
      log.warn(`Infrastructure check failed for ${db.type}: ${e.message}`);
    }
  }
  log.success("Infrastructure readiness documented.");

  log.info(`Phase 2: Database Audits (Mode: ${cfg.parallelMode.toUpperCase()})`);
  const results: BenchmarkResult[] = [];
  await fs.mkdir(ROOT_RESULTS_DIR, { recursive: true });

  const sortedDbs = [...activeDatabases].sort((a, b) => {
    const aKey = (a.label ?? a.type).toLowerCase().replace("+", "-");
    const bKey = (b.label ?? b.type).toLowerCase().replace("+", "-");
    const aIdx = (DB_ORDER as readonly string[]).indexOf(aKey);
    const bIdx = (DB_ORDER as readonly string[]).indexOf(bKey);
    return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
  });

  if (cfg.parallelMode === "off") {
    for (let i = 0; i < sortedDbs.length; i++) {
      if (isShuttingDown()) break;
      const db = sortedDbs[i];
      const dbKey = (db.label || db.type).toLowerCase().replace("+", "-");
      log.info(`[${i + 1}/${sortedDbs.length}] Starting audit for ${dbKey.toUpperCase()}...`);
      await runAuditForDatabase(
        db,
        hostInfo,
        buildMetrics,
        cfg,
        activeScripts,
        results,
        ROOT_RESULTS_DIR,
      );
    }
  } else {
    // 🚀 ENGINE-AWARE CONCURRENCY: Limit parallel runs based on database capabilities
    const semaphores = new Map<string, AsyncSemaphore>();
    const tasks = sortedDbs.map(async (db, _i) => {
      if (isShuttingDown()) return;

      const engine = db.type.toLowerCase().split("-")[0];
      if (!semaphores.has(engine)) {
        semaphores.set(engine, new AsyncSemaphore(getConcurrencyForDb(engine)));
      }

      const semaphore = semaphores.get(engine)!;
      await semaphore.acquire();
      try {
        if (isShuttingDown()) return;
        await runAuditForDatabase(
          db,
          hostInfo,
          buildMetrics,
          cfg,
          activeScripts,
          results,
          ROOT_RESULTS_DIR,
        );
      } finally {
        semaphore.release();
      }
    });
    await Promise.all(tasks);
  }

  const perfRegressions = await generateFinalReport(results, cfg);
  const allRegressions = perfRegressions.map(
    (r) =>
      `${r.db} → ${r.metric}: ${r.current.toFixed(2)}ms (${r.changePct > 0 ? "+" : ""}${r.changePct.toFixed(1)}%)`,
  );

  printSummaryTable(results);

  const failedTests = results.filter((r) => r.status === "FAILED");

  if (cfg.ci) {
    const summary = await writeCISummary(results, allRegressions);
    if (summary.overall !== "PASS") {
      log.error(
        `CI check FAILED — ${summary.failed} DB(s) failed, ${allRegressions.length} regression(s), ${summary.budgetViolations.length} budget violation(s).`,
      );
      await stopServer();
      await ConfigSafeguard.restore();
      process.exit(1);
    }
  } else if (failedTests.length > 0 || allRegressions.length > 0) {
    log.warn(
      `\nSuite completed with ${failedTests.length} failures and ${allRegressions.length} regressions.`,
    );

    if (failedTests.length > 0) {
      log.error(`❌ ${failedTests.length} benchmark(s) failed. Check logs above.`);
      for (const failure of failedTests) {
        log.error(`   ✗ ${failure.db}: ${failure.error || "Unknown error"}`);
      }
    }

    if (perfRegressions.length > 0) {
      const bannerWidth = 85;
      const border = "═".repeat(bannerWidth);
      const title = "⚠️  PERFORMANCE REGRESSION WARNING (DEVIATION > 15%)  ⚠️";
      const padSize = Math.max(0, Math.floor((bannerWidth - title.length) / 2));
      const paddedTitle =
        " ".repeat(padSize) + title + " ".repeat(bannerWidth - title.length - padSize);

      console.log(chalk.red.bold(`\n╔${border}╗`));
      console.log(chalk.red.bold(`║${paddedTitle}║`));
      console.log(chalk.red.bold(`╠${border}╣`));

      for (const r of perfRegressions) {
        const changeStr =
          r.changePct > 0 ? `+${r.changePct.toFixed(1)}%` : `${r.changePct.toFixed(1)}%`;
        const line = ` ${r.db} → ${r.metric}: ${r.current.toFixed(2)}ms (was ${r.previousAvg.toFixed(2)}ms, delta: ${changeStr})`;
        const padRight = Math.max(0, bannerWidth - line.length - 2);
        console.log(chalk.yellow(`║${line}${" ".repeat(padRight)}  ║`));
      }
      console.log(chalk.red.bold(`╚${border}╝\n`));
    }

    // Exit with 1 if there are actual hard failures (crashes), or if in CI with regressions/violations
    if (failedTests.length > 0 || (cfg.ci && allRegressions.length > 0)) {
      await stopServer();
      await ConfigSafeguard.restore();
      process.exit(1);
    }
  }

  try {
    await stopServer();
    await ConfigSafeguard.restore();
    log.success("Audit complete.");
  } catch (err: any) {
    log.error(`Final cleanup failed: ${err.message}`);
  }
}

if (process.argv.includes("--generate")) {
  log.info("🔍 Crawling results directory for standalone report generation...");
  scanResultsDirectory()
    .then(async (results) => {
      const regressions = await generateFinalReport(results);
      await writeCISummary(results, regressions);
      log.success("✅ Standalone report generated (MDX + JSON).");
      process.exit(0);
    })
    .catch((err) => {
      log.error(`❌ Standalone report failed: ${err.message}`);
      process.exit(1);
    });
} else {
  main().catch(async (err) => {
    console.error(chalk.red("\n💥 FATAL ERROR:"), err);
    await stopServer();
    await ConfigSafeguard.restore(); // Ensure restoral on fatal error
    process.exit(1);
  });
}
