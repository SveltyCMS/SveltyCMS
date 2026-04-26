/**
 * @file scripts\benchmark-matrix\runner.ts
 * @description Runner utility for the benchmark matrix tool.
 */

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { log } from "./logger";
import { heavyTaskLock } from "./semaphore";
import { startServer, warmupServer, writeTestConfig, isShuttingDown } from "./server";
import { extractMetrics, checkBudget, freePort } from "./utils";
import { persistScriptMetadataAST, updateIncrementalReport } from "./reporting";
import {
  DB_METADATA,
  PORT_BASE,
  JWT_SECRET_KEY,
  JWT_EXPIRES_IN,
  ENCRYPTION_KEY,
  ADMIN_PASSWORD,
  DB_NAME_BENCHMARK,
  TEST_API_SECRET,
} from "./config";
import type {
  BenchmarkScript,
  ScriptOutcome,
  RunConfig,
  DatabaseConfig,
  BenchmarkResult,
  HostInfo,
} from "./types";

/**
 * Runs a task with the given command and environment.
 */
export async function runTask(
  name: string,
  command: string,
  env: NodeJS.ProcessEnv,
  ci = false,
): Promise<boolean> {
  if (!ci) process.stdout.write(`\x1b[36mℹ ${name}...\x1b[0m\n`);

  let args = command.split(" ").slice(1);

  return new Promise((resolve) => {
    const proc = spawn("bun", args, {
      env: { ...process.env, ...env, BENCHMARK_DEBUG: "true" },
      stdio: ci ? ["ignore", "pipe", "pipe"] : "inherit",
      shell: process.platform === "win32",
    });

    if (ci && proc.stdout && proc.stderr) {
      let out = "";
      proc.stdout.on("data", (d) => (out += d.toString()));
      proc.stderr.on("data", (d) => (out += d.toString()));

      proc.on("close", async (code) => {
        if (env.RESULTS_DIR) {
          const logPath = path.join(env.RESULTS_DIR, "setup_tasks.log");
          await fs.appendFile(logPath, `--- TASK: ${name} ---\n${out}\n`, "utf8").catch(() => {});
        }
        resolve(code === 0);
      });
    } else {
      proc.on("close", (code) => {
        if (code !== 0 && !ci) process.stdout.write(` \x1b[31m[FAILED] ${name}\x1b[0m\n`);
        else if (!ci) process.stdout.write(` \x1b[32m[DONE]\x1b[0m\n`);
        resolve(code === 0);
      });
    }

    proc.on("error", (err) => {
      if (!ci) process.stdout.write(` \x1b[31m[SPAWN ERROR] ${err.message}\x1b[0m\n`);
      resolve(false);
    });
  });
}

/**
 * Persists benchmark metadata to a JSON file.
 */
export async function persistBenchmarkMeta(
  s: BenchmarkScript,
  outcome: ScriptOutcome,
  dbKey: string,
  resultsDir: string,
): Promise<void> {
  const slug = s.shortLabel.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const meta = {
    label: s.label,
    shortLabel: s.shortLabel,
    db: dbKey,
    timestamp: ts,
    durationMs: outcome.elapsedMs,
    passed: outcome.passed,
    attempts: outcome.attempts,
    error: outcome.error ?? null,
    path: s.path,
    file: s.path,
    proves: s.desc,
  };
  const out = path.join(resultsDir, `${slug}-${ts}.meta.json`);
  await fs.writeFile(out, JSON.stringify(meta, null, 2)).catch(() => {});
}

/**
 * Represents the result of a benchmark script run.
 */
interface LocalScriptOutcome {
  passed: boolean;
  attempts: number;
  elapsedMs: number;
  error?: string;
  metrics?: Record<string, number>;
}

/**
 * Executes a command with a timeout and parses metrics.
 */
export async function executeWithTimeout(
  cmd: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
  attempt: number,
  startTime: number,
): Promise<LocalScriptOutcome> {
  return new Promise<LocalScriptOutcome>((resolve) => {
    const args = cmd.split(" ").slice(1);
    const metrics: Record<string, number> = {};
    const proc = spawn("bun", args, {
      env: { ...process.env, ...env, BENCHMARK_DEBUG: "true" },
      stdio: ["inherit", "pipe", "pipe"],
      shell: process.platform === "win32",
    });

    // 🚀 ULTRA ELITE: Parse metrics from stdout in real-time
    proc.stdout.on("data", (data) => {
      const line = data.toString();
      process.stdout.write(data); // still print to terminal

      const metricMatch = line.match(/METRIC: ([\w.]+)=([\d.]+)/);
      if (metricMatch) {
        const [, key, val] = metricMatch;
        metrics[key] = parseFloat(val);
      }
    });

    proc.stderr.on("data", (data) => {
      process.stderr.write(data);
    });

    let resolved = false;
    const timer = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      proc.kill("SIGKILL");
      resolve({
        passed: false,
        attempts: attempt,
        elapsedMs: Math.round(performance.now() - startTime),
        error: `timed out after ${(timeoutMs / 1000).toFixed(0)}s`,
        metrics,
      });
    }, timeoutMs);

    const finish = (code: number | null) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      resolve({
        passed: code === 0,
        attempts: attempt,
        elapsedMs: Math.round(performance.now() - startTime),
        error: code === 0 ? undefined : `exited with code ${code}`,
        metrics,
      });
    };

    proc.on("exit", finish);
    proc.on("close", finish);
    proc.on("error", (err) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      resolve({
        passed: false,
        attempts: attempt,
        elapsedMs: Math.round(performance.now() - startTime),
        error: `spawn error: ${err.message}`,
        metrics,
      });
    });
  });
}

/**
 * Runs a single benchmark script and reports the outcome.
 */
export async function runBenchmarkScript(
  s: BenchmarkScript,
  env: NodeJS.ProcessEnv,
  cfg: RunConfig,
): Promise<LocalScriptOutcome> {
  const maxAttempts = 1 + cfg.retryCount;
  const scriptTimeout = s.timeoutMs ?? cfg.timeoutMs;
  let cmd =
    s.path.endsWith(".test.ts") || s.path.endsWith(".bench.ts")
      ? `bun test --preload ./tests/unit/bun-preload.ts ./${s.path}`
      : `bun run --preload ./tests/unit/bun-preload.ts ./${s.path}`;

  if (process.env.PROF_MODE === "0x") {
    const profOutput = path.join(env.RESULTS_DIR || ".", `prof-${s.shortLabel}`);
    cmd = `0x -o ${profOutput}.html -- ${cmd}`;
  }

  const t0 = performance.now();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      log.warn(`  Retry ${attempt - 1}/${cfg.retryCount}: ${s.label}`);
    }

    const scriptEnv = {
      ...env,
      BENCH_FILE: s.path,
      BENCH_PROVES: s.desc,
      BENCHMARK_STABLE: "true",
    };

    const outcome = await executeWithTimeout(cmd, scriptEnv, scriptTimeout, attempt, t0);

    if (outcome.passed || attempt === maxAttempts) {
      return outcome;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  return {
    passed: false,
    attempts: maxAttempts,
    elapsedMs: Math.round(performance.now() - t0),
  };
}

/**
 * Builds the environment for a worker server.
 */
export function buildWorkerEnv(
  dbConf: DatabaseConfig,
  workerPort: number,
  workerDbName: string,
  dbDir: string,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    API_BASE_URL: `http://127.0.0.1:${workerPort}`,
    TEST_MODE: "true",
    RESULTS_DIR: dbDir,
    DB_TYPE: dbConf.type,
    DB_NAME: workerDbName,
    DB_HOST: dbConf.host,
    DB_PORT: dbConf.port.toString(),
    DB_USER: dbConf.user,
    DB_PASSWORD: dbConf.password,
    PGUSER: dbConf.user,
    PGPASSWORD: dbConf.password,
    PGDATABASE: workerDbName,
    PGHOST: dbConf.host,
    PGPORT: dbConf.port.toString(),
    TEST_API_SECRET: TEST_API_SECRET,
    SKIP_GRAPHQL_WS: "true",
    MYSQL_USER: dbConf.user,
    MYSQL_PWD: dbConf.password,
    MYSQL_HOST: dbConf.host,
    MYSQL_TCP_PORT: dbConf.port.toString(),
    JWT_SECRET_KEY,
    JWT_EXPIRES_IN,
    ENCRYPTION_KEY,
    PASSWORD_MIN_LENGTH: "8",
    ADMIN_PASSWORD,
    BENCHMARK_MODE: "1",
    ADMIN_EMAIL: "admin@example.com",
    BUN_TEST_MOCKS: "false",
    DISABLE_AUDIT_LOGS: "true",
    SUPPRESS_JEST_WARNINGS: "true",
  };

  delete env.USER;
  delete env.USERNAME;

  return env;
}

/**
 * Executes a full audit for a specific database configuration.
 */
export async function runAuditForDatabase(
  dbConf: DatabaseConfig,
  hostInfo: HostInfo,
  buildMetrics: { durationMs: number } | null,
  cfg: RunConfig,
  activeScripts: BenchmarkScript[],
  results: BenchmarkResult[],
  rootResultsDir: string,
) {
  const dbKey = dbConf.useRedis ? `${dbConf.type}-redis` : dbConf.type;
  const meta = (DB_METADATA as any)[dbKey] ?? {
    icon: "❓",
    label: dbKey.toUpperCase(),
  };
  const workerPort = PORT_BASE;
  const workerDbName = DB_NAME_BENCHMARK;

  log.db(dbKey, `Worker starting on port ${workerPort}...`);

  try {
    const metrics: Record<string, any> = {};
    if (dbConf.useRedis) metrics["USE_REDIS"] = "true";
    if (buildMetrics) metrics["dx-build"] = buildMetrics;

    await freePort(workerPort);

    await writeTestConfig(dbConf, workerDbName);

    const {
      coldStartMs,
      version,
      stop: stopWorkerServer,
    } = await startServer(dbConf, workerPort, workerDbName);

    const dbDir = path.join(rootResultsDir, dbKey);
    await fs.rm(dbDir, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(dbDir, { recursive: true });

    const env = buildWorkerEnv(dbConf, workerPort, workerDbName, dbDir);

    if (process.env.BENCHMARK_DEBUG === "true") {
      log.db(
        dbKey,
        `Worker Env: DB_TYPE=${env.DB_TYPE}, DB_NAME=${env.DB_NAME}, DB_USER=${env.DB_USER}`,
      );
    }

    if (
      !(await runTask(
        "Standard System Setup",
        "bun run scripts/setup-system.ts --clean",
        env,
        cfg.ci,
      ))
    ) {
      log.error(`Setup failed for ${meta.label}. Skipping.`);
      results.push({
        db: dbKey,
        status: "FAILED",
        error: "Setup failed",
        metrics,
      });
      await stopWorkerServer();
      return;
    }

    log.db(dbKey, "Allowing server to settle after seeding (1s)...");
    await new Promise((r) => setTimeout(r, 1000));

    await warmupServer(cfg, workerPort);

    log.db(dbKey, "Warmup complete. Starting benchmark suite...");
    await new Promise((r) => setTimeout(r, 500));

    let status: "SUCCESS" | "FAILED" = "SUCCESS";
    let error: string | undefined;
    const scriptTimings: Record<string, number> = {};
    const suiteStart = performance.now();

    for (const s of activeScripts) {
      if (isShuttingDown()) break;

      // 🚀 SMART STATE STRATEGY:
      // We no longer blindly drop tables before every script.
      // setup-benchmarks.ts now implements "Smart Seeding" to reuse data if possible.

      // Re-seed relational data if the script requires it (SQL strategies or API tests)
      if (
        s.strategy === "sql" ||
        s.path.includes("relational") ||
        s.path.includes("rest") ||
        s.path.includes("graphql")
      ) {
        await runTask(
          "Seeding Relational Data",
          "bun run --preload ./tests/unit/setup.ts scripts/benchmark-matrix/setup-benchmarks.ts",
          env,
          cfg.ci,
        );
      }

      const isHigh = s.intensity === "high";
      const useLock = isHigh && cfg.parallelMode === "safe";

      if (useLock) {
        log.db(dbKey, `\x1b[90mWaiting for global HeavyTaskLock (${s.shortLabel})...\x1b[0m`);
        await heavyTaskLock.acquire();
      }

      try {
        log.db(dbKey, `Running benchmark: ${s.label}...`);
        const outcome = await runBenchmarkScript(s, env, cfg);
        log.db(
          dbKey,
          `Finished ${s.shortLabel} in ${(outcome.elapsedMs / 1000).toFixed(1)}s (Passed: ${outcome.passed})`,
        );

        scriptTimings[s.shortLabel] = outcome.elapsedMs;
        await persistBenchmarkMeta(s, outcome, dbKey, dbDir);

        if (outcome.metrics) {
          Object.assign(metrics, outcome.metrics);
        }

        if (outcome.passed) {
          await persistScriptMetadataAST(s.path, new Date().toISOString());
        }

        // Deep copy results to avoid mutation issues during doc writing
        await updateIncrementalReport([
          ...results,
          {
            db: dbKey,
            status: "RUNNING",
            metrics: { ...metrics },
            scriptTimings: { ...scriptTimings },
            extra: {
              API_BASE_URL: env.API_BASE_URL,
              TEST_API_SECRET: env.TEST_API_SECRET,
            },
          },
        ]);

        if (!outcome.passed) {
          status = "FAILED";
          error = (error ? error + "; " : "") + s.label + " failed";
        }
      } catch (err: any) {
        log.error(`Benchmark ${s.shortLabel} crashed: ${err.message}`);
        status = "FAILED";
        error = (error ? error + "; " : "") + s.shortLabel + " crashed";
      } finally {
        if (useLock) heavyTaskLock.release();
      }
    }

    const durationMs = performance.now() - suiteStart;
    metrics["audit-duration"] = durationMs;

    try {
      const files = await fs.readdir(dbDir);
      for (const f of files) {
        if (f.endsWith(".json")) {
          metrics[path.basename(f, ".json")] = JSON.parse(
            await fs.readFile(path.join(dbDir, f), "utf8"),
          );
        }
      }
    } catch {}

    const m = extractMetrics(metrics, dbConf.type);
    const budgetViolations = checkBudget(m, coldStartMs);
    results.push({
      db: dbKey,
      status,
      error,
      coldStartMs,
      version,
      metrics,
      scriptTimings,
      budgetViolations,
      hostInfo,
    });

    await stopWorkerServer();
  } catch (e: any) {
    log.error(`${meta.label} worker failed: ${e.message}`);
    results.push({ db: dbKey, status: "FAILED", error: e.message });
  }
}
