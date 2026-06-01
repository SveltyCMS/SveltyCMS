/**
 * @file scripts/benchmark-matrix/runner.ts
 * @description Runner utility for the benchmark matrix tool.
 */

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { log } from "./logger";
import { heavyTaskLock } from "./semaphore";
import {
  startServer,
  warmupServer,
  writeTestConfig,
  isShuttingDown,
  setShuttingDown,
} from "./server";
import { persistScriptMetadataAST } from "./reporting";
import { progressTracker } from "./progress";
import {
  DB_METADATA,
  PORT_BASE,
  JWT_SECRET_KEY,
  JWT_EXPIRES_IN,
  ENCRYPTION_KEY,
  ADMIN_PASSWORD,
  TEST_API_SECRET,
  BENCHMARK_SCRIPTS,
} from "./config";
import type {
  BenchmarkScript,
  ScriptOutcome,
  RunConfig,
  DatabaseConfig,
  BenchmarkResult,
  HostInfo,
} from "./types";

import { extractMetrics, checkBudget, freePort, validateEnvironment } from "./utils";

/* ====================== CORE HELPERS ====================== */

export async function runTask(
  name: string,
  command: string,
  env: NodeJS.ProcessEnv,
  ci = false,
): Promise<boolean> {
  if (!ci) process.stdout.write(`\x1b[36mℹ ${name}...\x1b[0m\n`);

  const args = command.split(" ").slice(1);

  return new Promise((resolve) => {
    const proc = spawn("bun", args, {
      env: {
        ...process.env,
        ...env,
        BENCHMARK_DEBUG: process.env.BENCHMARK_DEBUG || "false",
        SVELTY_BENCHMARK_SUITE: "true",
      },
      stdio: ci ? ["ignore", "pipe", "pipe"] : "inherit",
      shell: process.platform === "win32",
    });

    let output = "";
    if (ci && proc.stdout) proc.stdout.on("data", (d) => (output += d.toString()));
    if (ci && proc.stderr) proc.stderr.on("data", (d) => (output += d.toString()));

    const cleanup = () => {
      proc.stdout?.removeAllListeners();
      proc.stderr?.removeAllListeners();
      proc.removeAllListeners();
    };

    proc.once("close", (code) => {
      if (ci && env.RESULTS_DIR) {
        const logPath = path.join(env.RESULTS_DIR, "setup_tasks.log");
        fs.appendFile(logPath, `--- TASK: ${name} ---\n${output}\n`, "utf8").catch(() => {});
      }
      cleanup();
      if (code !== 0 && !ci) process.stdout.write(` \x1b[31m[FAILED] ${name}\x1b[0m\n`);
      else if (!ci) process.stdout.write(` \x1b[32m[DONE]\x1b[0m\n`);
      resolve(code === 0);
    });

    proc.once("error", (err) => {
      cleanup();
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

/* ====================== BENCHMARK EXECUTION ====================== */

interface LocalScriptOutcome {
  passed: boolean;
  attempts: number;
  elapsedMs: number;
  error?: string;
  metrics?: Record<string, number>;
}

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
    if (attempt > 1) log.warn(`  Retry ${attempt - 1}/${cfg.retryCount}: ${s.label}`);

    const scriptEnv = {
      ...env,
      BENCH_FILE: s.path,
      BENCH_PROVES: s.desc,
      BENCHMARK_STABLE: "true",
      BENCHMARK_MATRIX: "1",
    };

    const outcome = await executeWithTimeout(cmd, scriptEnv, scriptTimeout, attempt, t0);

    if (outcome.passed || attempt === maxAttempts) return outcome;

    await new Promise((r) => setTimeout(r, 2000));
  }

  return {
    passed: false,
    attempts: maxAttempts,
    elapsedMs: Math.round(performance.now() - t0),
  };
}

async function executeWithTimeout(
  cmd: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
  attempt: number,
  startTime: number,
): Promise<LocalScriptOutcome> {
  return new Promise((resolve) => {
    const args = cmd.split(" ").slice(1);
    const metrics: Record<string, number> = {};
    const proc = spawn("bun", args, {
      env: {
        ...process.env,
        ...env,
        BENCHMARK_DEBUG: process.env.BENCHMARK_DEBUG || "false",
      },
      stdio: ["inherit", "pipe", "pipe"],
      shell: process.platform === "win32",
    });

    proc.stdout?.on("data", (data) => {
      const content = data.toString();
      process.stdout.write(data);

      const metricMatch = content.match(/METRIC: ([\w.]+)=([\d.]+)/gm);
      if (metricMatch) {
        for (const m of metricMatch) {
          const matchResult = m.match(/METRIC: ([\w.]+)=([\d.]+)/);
          if (matchResult) {
            const [, key, val] = matchResult;
            metrics[key] = parseFloat(val);
          }
        }
      }
    });

    proc.stderr?.on("data", (data) => process.stderr.write(data));

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

    proc.once("exit", finish);
    proc.once("close", finish);
    proc.once("error", (err) => {
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
 * Builds the environment for a worker server.
 */
export function buildWorkerEnv(
  dbConf: DatabaseConfig,
  workerPort: number,
  workerDbName: string,
  dbDir: string,
  buildDurationMs?: number,
  ci = false,
): NodeJS.ProcessEnv {
  const dbKey = dbConf.useRedis ? `${dbConf.type}-redis` : dbConf.type;
  const meta = (DB_METADATA as any)[dbKey] ?? {
    label: dbKey.toUpperCase(),
  };

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    API_BASE_URL: `http://127.0.0.1:${workerPort}`,
    TEST_MODE: "true",
    SVELTY_BENCHMARK_SUITE: "true",
    TENANT_ID: "global",
    RESULTS_DIR: dbDir,
    DB_TYPE: dbConf.type,
    DB_LABEL: meta.label,
    DB_NAME: workerDbName,
    DB_PATH: dbConf.type === "sqlite" ? `config/database/${workerDbName}.sqlite` : "",
    FORCE_DB_NAME: workerDbName,
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
    BENCHMARK_STABLE: "true",
    BENCHMARK: "true",
    USE_REDIS: dbConf.useRedis ? "true" : "false",
    REDIS_HOST: "127.0.0.1",
    REDIS_PORT: "6379",
    DX_BUILD_DURATION: buildDurationMs?.toString(),
    CI: ci ? "true" : "false",
  };

  delete env.USER;
  delete env.USERNAME;
  return env;
}

/* ====================== AUDIT EXECUTION ====================== */

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

  // Environment check
  const envCheck = validateEnvironment(dbConf.type, !!dbConf.useRedis);
  if (!envCheck.success) {
    log.error(`❌ Skipped ${dbKey}: Environment unready.`);
    results.push({
      db: dbKey,
      status: "FAILED",
      error: "Environment unready",
      metrics: {},
    });
    return;
  }

  const workerPort = PORT_BASE;
  const workerDbName = `bench_tmp_${dbKey}_${process.pid}`;

  log.db(dbKey, `Starting audit on port ${workerPort} (DB: ${workerDbName})`);

  let stopWorkerServer: (() => Promise<void>) | null = null;

  try {
    const metrics: Record<string, any> = {};
    if (dbConf.useRedis) metrics["USE_REDIS"] = "true";
    if (buildMetrics) metrics["dx-build"] = buildMetrics;

    await freePort(workerPort);
    await writeTestConfig(dbConf, workerDbName);

    const serverInfo = await startServer(dbConf, workerPort, workerDbName);
    stopWorkerServer = serverInfo.stop;
    metrics["cold-start"] = serverInfo.coldStartMs;

    const dbDir = path.join(rootResultsDir, dbKey);
    await fs.mkdir(dbDir, { recursive: true });

    // If not doing a full clean or full suite run, preserve other scripts' results
    const isFullSuite = activeScripts.length === BENCHMARK_SCRIPTS.length;
    if (isFullSuite || cfg.forceClean) {
      const files = await fs.readdir(dbDir).catch(() => []);
      for (const f of files) {
        await fs.rm(path.join(dbDir, f), { recursive: true, force: true }).catch(() => {});
      }
    } else {
      // Selective clean: delete only files belonging to activeScripts
      const files = await fs.readdir(dbDir).catch(() => []);
      for (const s of activeScripts) {
        const slug = s.shortLabel.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
        const tableSlug = s.shortLabel.toLowerCase().replace(/[^a-z0-9]/g, "_");
        for (const f of files) {
          const fLower = f.toLowerCase();
          if (
            fLower.startsWith(`${slug}-`) ||
            fLower.includes(tableSlug) ||
            fLower.startsWith(slug)
          ) {
            await fs.rm(path.join(dbDir, f), { recursive: true, force: true }).catch(() => {});
          }
        }
      }
    }

    // Export cold-start metric to disk so scanResultsDirectory() can find it
    await fs
      .writeFile(
        path.join(dbDir, "cold-start.json"),
        JSON.stringify(
          {
            _type: "numeric-metric",
            name: "cold-start",
            value: serverInfo.coldStartMs,
            unit: "ms",
            timestamp: new Date().toISOString(),
          },
          null,
          2,
        ),
        "utf8",
      )
      .catch(() => {});

    const env = buildWorkerEnv(
      dbConf,
      workerPort,
      workerDbName,
      dbDir,
      buildMetrics?.durationMs,
      cfg.ci,
    );

    // System Setup
    if (
      !(await runTask(
        "Standard System Setup",
        "bun run scripts/setup-system.ts --overwrite",
        env,
        cfg.ci,
      ))
    ) {
      throw new Error("System setup failed");
    }

    await new Promise((r) => setTimeout(r, dbConf.type === "postgresql" ? 5000 : 3000));
    await warmupServer(cfg, workerPort);

    log.db(dbKey, "Warmup complete. Starting benchmarks...");
    await ensureSeedingIfNeeded({ path: "relational", strategy: "sql" } as any, env, cfg);

    let status: "SUCCESS" | "FAILED" = "SUCCESS";
    let errorMsg: string | undefined;
    const scriptTimings: Record<string, number> = {};
    const suiteStart = performance.now();

    for (const s of activeScripts) {
      if (isShuttingDown()) break;

      if (!shouldRunScript(s, dbConf, results)) {
        progressTracker?.update();
        continue;
      }

      const useLock = s.intensity === "high" && cfg.parallelMode === "safe";
      if (useLock) {
        log.db(dbKey, `Acquiring heavy task lock for ${s.shortLabel}...`);
        await heavyTaskLock.acquire();
      }

      try {
        log.db(dbKey, `Running: ${s.label}`);
        const outcome = await runBenchmarkScript(s, env, cfg);

        scriptTimings[s.shortLabel] = outcome.elapsedMs;
        await persistBenchmarkMeta(s, outcome, dbKey, dbDir);

        if (outcome.metrics) Object.assign(metrics, outcome.metrics);
        if (outcome.passed) await persistScriptMetadataAST(s.path, new Date().toISOString());

        detectDurationAnomaly(s, outcome);

        if (!outcome.passed) {
          status = "FAILED";
          const detail = outcome.error ? ` (${outcome.error})` : "";
          errorMsg = (errorMsg ? errorMsg + "; " : "") + `${s.shortLabel} failed${detail}`;
          log.error(`Benchmark failed: ${s.shortLabel} (${dbKey})${detail}`);
          log.error(`  Debug: bun test ${s.path} -- --db=${dbKey}`);

          if (cfg.failFast) {
            log.error(
              `Fail-Fast: stopping after ${s.shortLabel} failed. Debug: bun test ${s.path}`,
            );
            setShuttingDown(true);
            throw new Error("Fail-fast");
          }
        }
      } catch (err: any) {
        status = "FAILED";
        errorMsg = (errorMsg ? errorMsg + "; " : "") + `${s.shortLabel} crashed`;
        log.error(`Benchmark crashed: ${s.shortLabel} - ${err.message}`);
        log.error(`  Debug: bun test ${s.path} -- --db=${dbKey}`);

        if (cfg.failFast) throw err;
      } finally {
        if (useLock) heavyTaskLock.release();
        progressTracker?.update();
      }
    }

    metrics["audit-duration"] = performance.now() - suiteStart;

    // Load any JSON files generated during the runs
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

    // Finalize result
    const m = extractMetrics(metrics, dbConf.type);
    const budgetViolations = checkBudget(m, serverInfo.coldStartMs);

    results.push({
      db: dbKey,
      status,
      error: errorMsg,
      coldStartMs: serverInfo.coldStartMs,
      version: serverInfo.version,
      metrics,
      scriptTimings,
      budgetViolations,
      hostInfo,
    });
  } catch (e: any) {
    log.error(`${meta.label} audit failed: ${e.message}`);
    results.push({ db: dbKey, status: "FAILED", error: e.message });
  } finally {
    if (stopWorkerServer) await stopWorkerServer().catch(() => {});
  }
}

/* ====================== INTERNAL HELPERS ====================== */

function shouldRunScript(
  s: BenchmarkScript,
  dbConf: DatabaseConfig,
  results: BenchmarkResult[],
): boolean {
  if (s.strategy === "sql" && dbConf.type === "mongodb") return false;

  if (s.strategy === "once") {
    return !results.some((r) => r.scriptTimings?.[s.shortLabel]);
  }
  return true;
}

async function ensureSeedingIfNeeded(s: BenchmarkScript, env: NodeJS.ProcessEnv, cfg: RunConfig) {
  if (
    s.strategy === "sql" ||
    s.path.includes("relational") ||
    s.path.includes("rest") ||
    s.path.includes("graphql")
  ) {
    const ok = await runTask(
      "Seeding Relational Data",
      "bun run --preload ./tests/unit/bun-preload.ts ./scripts/benchmark-matrix/setup-benchmarks.ts",
      env,
      cfg.ci,
    );
    if (!ok) throw new Error("Seeding failed");
  }
}

function detectDurationAnomaly(s: BenchmarkScript, outcome: LocalScriptOutcome) {
  const expected = s.expectedDurationMs || s.estimatedMs;
  if (expected && outcome.elapsedMs > expected * 2.2) {
    log.warn(
      `⚠️ Performance anomaly: ${s.shortLabel} took ${outcome.elapsedMs}ms (expected ~${expected}ms)`,
    );
  }
}
