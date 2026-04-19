/**
 * @file scripts\benchmark-matrix\index.ts
 * @description Entry point for the benchmark matrix tool.
 */

import chalk from "chalk";
import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

import { version as pkgVersion } from "../../package.json";
import { log } from "./logger";
import { parseArgs, printList, filterScripts, filterDatabases, collectHostInfo } from "./cli";
import { requiresRebuild } from "./utils";
import { runAuditForDatabase, runTask } from "./runner";
import { printSummaryTable, writeCISummary, generateFinalReport } from "./reporting";
import {
  startServer,
  stopServer,
  ensureDatabaseExists,
  runSystemSetup,
  setShuttingDown,
} from "./server";
import { AsyncSemaphore } from "./semaphore";
import {
  ALL_DATABASES,
  BENCHMARK_SCRIPTS,
  DB_ORDER,
  PORT_BASE,
  DB_NAME_BASE,
  MAX_CONCURRENCY,
  ADMIN_PASSWORD,
  TEST_API_SECRET,
  ROOT_RESULTS_DIR,
  SETUP_PORT_OFFSET,
  HEALING_PORT_OFFSET,
} from "./config";
import type { BenchmarkResult } from "./types";

/**
 * Register SIGINT / SIGTERM handlers so Ctrl-C cleanly kills any child
 * worker servers before exit.
 */
function registerShutdownHandlers() {
  const onSignal = async (sig: string) => {
    setShuttingDown(true);
    log.warn(`Received ${sig} — graceful shutdown...`);
    await stopServer();
    process.exit(130);
  };
  process.on("SIGINT", () => onSignal("SIGINT"));
  process.on("SIGTERM", () => onSignal("SIGTERM"));
}

/**
 * Purges the results directory before a fresh run, preserving only the summary and history.
 */
async function cleanupResults() {
  log.info("Cleaning up temporary benchmark result files...");
  try {
    const files = await fs.readdir(ROOT_RESULTS_DIR);
    for (const file of files) {
      // Preserve history and summary files for CI/UI consumption
      if (file !== "history.sqlite" && file !== "ci-summary.json") {
        await fs
          .rm(path.join(ROOT_RESULTS_DIR, file), {
            recursive: true,
            force: true,
          })
          .catch(() => {});
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

  if (cfg.list) {
    await printList();
    process.exit(0);
  }

  const hostInfo = await collectHostInfo();
  const activeScripts = filterScripts(cfg);
  const activeDatabases = filterDatabases(cfg);

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
      const workerDbName_healing = "SveltyCMS_healing";
      const healingPort = PORT_BASE + HEALING_PORT_OFFSET;
      await startServer(sqliteConf, healingPort, workerDbName_healing);
      const ok = await runTask(
        "Baseline Setup",
        "bun run scripts/setup-system.ts",
        {
          DB_TYPE: "sqlite",
          DB_NAME: workerDbName_healing,
          TEST_MODE: "true",
          ADMIN_PASSWORD,
          TEST_API_SECRET,
        },
        cfg.ci,
      );
      await stopServer();
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
        execSync("bun run build:high-memory", {
          stdio: cfg.ci ? "pipe" : "inherit",
        });
        const buildTimeMs = Math.round(performance.now() - t0);
        log.success(`Build complete in ${(buildTimeMs / 1000).toFixed(1)}s.`);
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

  if (sortedDbs.length > 0) {
    log.info("Preparing shared system setup...");
    const firstDb = sortedDbs[0];
    const setupDbName = `${DB_NAME_BASE}_setup`;
    const setupPort = PORT_BASE + SETUP_PORT_OFFSET;

    const { stop: stopSetupServer } = await startServer(firstDb, setupPort, setupDbName);
    if (!(await runSystemSetup(firstDb, setupPort, setupDbName))) {
      log.error("Global system setup failed. Proceeding with caution (expect failures).");
      // Don't exit; allow runAuditForDatabase to handle failures and reporting
    }
    await stopSetupServer();
    log.info("Shared system setup phase concluded.");
  }

  if (cfg.parallelMode === "off") {
    for (let i = 0; i < sortedDbs.length; i++) {
      const db = sortedDbs[i];
      const dbKey = (db.label || db.type).toLowerCase().replace("+", "-");
      log.info(`[${i + 1}/${sortedDbs.length}] Starting audit for ${dbKey.toUpperCase()}...`);
      await runAuditForDatabase(
        db,
        i,
        hostInfo,
        buildMetrics,
        cfg,
        activeScripts,
        results,
        ROOT_RESULTS_DIR,
      );
    }
  } else {
    const semaphore = new AsyncSemaphore(MAX_CONCURRENCY);
    const tasks = sortedDbs.map(async (db, i) => {
      await semaphore.acquire();
      try {
        await runAuditForDatabase(
          db,
          i,
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

  const regressions = await generateFinalReport(results, cfg);

  printSummaryTable(results);

  if (cfg.ci) {
    const summary = await writeCISummary(results, regressions);
    if (summary.overall !== "PASS") {
      log.error(
        `CI check FAILED — ${summary.failed} DB(s) failed, ${regressions.length} regression(s), ${summary.budgetViolations.length} budget violation(s).`,
      );
      await stopServer();
      process.exit(1);
    }
  }

  await cleanupResults();
  await stopServer();
  log.success("Audit complete.");
}

main().catch((err) => {
  console.error(chalk.red("\n💥 FATAL ERROR:"), err);
  process.exit(1);
});
