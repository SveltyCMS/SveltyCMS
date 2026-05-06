/**
 * @file scripts\benchmark-matrix\index.ts
 * @description Entry point for the benchmark matrix tool.
 */

import { plugin } from "bun";

// Mock $app/environment for standalone execution
plugin({
  name: "svelte-kit-mock",
  setup(build) {
    build.onResolve({ filter: /^\$/ }, (args) => {
      if (args.path.startsWith("$app/")) {
        return { path: args.path, external: false, namespace: "svelte-kit-mock" };
      }
    });
    build.onLoad({ filter: /.*/, namespace: "svelte-kit-mock" }, (_args) => {
      return {
        contents:
          "export const browser = false; export const dev = false; export const building = false; export const version = '1.0.0';",
        loader: "js",
      };
    });
  },
});

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
import { startServer, stopServer, ensureDatabaseExists, setShuttingDown } from "./server";
import { AsyncSemaphore } from "./semaphore";
import {
  ALL_DATABASES,
  BENCHMARK_SCRIPTS,
  DB_ORDER,
  PORT_BASE,
  MAX_CONCURRENCY,
  ADMIN_PASSWORD,
  TEST_API_SECRET,
  JWT_SECRET_KEY,
  ENCRYPTION_KEY,
  ROOT_RESULTS_DIR,
  HEALING_PORT_OFFSET,
} from "./config";
import type { BenchmarkResult } from "./types";

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
          await fs.rm(path.join(compiledDir, file), { recursive: true, force: true });
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
 * Purges the results directory before/after a run, but ONLY for the databases currently being audited.
 */
async function cleanupResults(activeDatabases: any[], activeScripts?: any[]) {
  if (activeScripts && activeScripts.length === 1) {
    log.info("Single benchmark mode — preserving all previous results");
    return; // ← Critical fix: Don't delete other results when running just one test
  }

  log.info("Cleaning up session benchmark result files...");
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
      // Preserve history and summary files
      if (file === "history.sqlite" || file === "ci-summary.json") continue;

      // Only delete if it matches an active database key
      if (activeKeys.has(file)) {
        log.warn(`Selective Purge: ${file}`);
        await fs
          .rm(path.join(ROOT_RESULTS_DIR, file), {
            recursive: true,
            force: true,
          })
          .catch((e) => log.error(`Failed to delete ${file}: ${e.message}`));
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
  await cleanupResults(activeDatabases, activeScripts);

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

  if (cfg.parallelMode === "off") {
    for (let i = 0; i < sortedDbs.length; i++) {
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
    const semaphore = new AsyncSemaphore(MAX_CONCURRENCY);
    const tasks = sortedDbs.map(async (db, _i) => {
      await semaphore.acquire();
      try {
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
