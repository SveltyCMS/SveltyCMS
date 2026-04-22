/**
 * @file scripts\benchmark-matrix\server.ts
 * @description Server utility for the benchmark matrix tool.
 */

import { spawn, execSync, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { DatabaseConfig, RunConfig } from "./types";
import { log } from "./logger";
import {
  TEST_API_SECRET,
  JWT_SECRET_KEY,
  JWT_EXPIRES_IN,
  ENCRYPTION_KEY,
  ADMIN_PASSWORD,
  DB_NAME_BENCHMARK,
} from "./config";
import { isNoisyLine } from "./utils";

let globalServerProcess: ChildProcess | null = null;
let shuttingDown = false;

/** Set the global shutting down state */
export const setShuttingDown = (val: boolean) => {
  shuttingDown = val;
};

/** Check if the system is shutting down */
export const isShuttingDown = () => shuttingDown;

/**
 * Forcefully stops a process and its children.
 */
export async function killProcess(proc: ChildProcess | null) {
  if (!proc) return;
  const pid = proc.pid;
  if (pid) {
    try {
      if (process.platform === "win32") {
        execSync(`taskkill /T /F /PID ${pid}`, { stdio: "ignore" });
      } else {
        process.kill(-pid, "SIGKILL");
      }
    } catch {
      proc.kill("SIGKILL");
    }
  }
  await new Promise((r) => setTimeout(r, 2000));
}

/**
 * Stops the global server process.
 */
export async function stopServer() {
  if (!globalServerProcess) return;
  log.info("Terminating global SveltyCMS instance...");
  await killProcess(globalServerProcess);
  globalServerProcess = null;
}

// eslint-disable-next-line no-control-regex
const ANSI_STRIP = /[\u001b\u009b]\[[0-9;]*[JKmsu]/g;

/**
 * Builds the environment variables for the server.
 */
export function buildServerEnv(
  db: DatabaseConfig,
  port: number,
  dbName: string,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: port.toString(),
    DB_TYPE: db.type,
    DB_HOST: db.host,
    DB_PORT: db.port.toString(),
    DB_NAME: dbName,
    DB_USER: db.user,
    DB_PASSWORD: db.password,
    PGUSER: db.user,
    PGPASSWORD: db.password,
    PGDATABASE: dbName,
    PGHOST: db.host,
    PGPORT: db.port.toString(),
    MYSQL_USER: db.user,
    MYSQL_PWD: db.password,
    MYSQL_HOST: db.host,
    MYSQL_TCP_PORT: db.port.toString(),
    TEST_MODE: "true",
    TEST_API_SECRET,
    ADMIN_PASSWORD,
    USE_REDIS: db.useRedis ? "true" : "false",
    REDIS_HOST: "127.0.0.1",
    REDIS_PORT: "6379",
    HOST: "127.0.0.1",
    ORIGIN: `http://127.0.0.1:${port}`,
    NODE_ENV: "production",
    LOG_LEVEL: "debug",
    VERBOSE_STDOUT: "true",
    PROTOCOL_HEADER: "x-forwarded-proto",
    HOST_HEADER: "host",
  };

  delete env.USER;
  delete env.USERNAME;
  return env;
}

/**
 * Determines the server entry point.
 */
export async function getServerEntryPoint(): Promise<string> {
  const buildPath = path.join(process.cwd(), "build/index.js");
  try {
    await fs.stat(buildPath);
    return "build/index.js";
  } catch {
    return ".svelte-kit/output/server/index.js";
  }
}

/**
 * Waits for the server to pass health checks.
 */
export async function waitForHealthCheck(
  port: number,
): Promise<{ healthy: boolean; version: string }> {
  const ACCEPTABLE = new Set([
    "healthy",
    "ready",
    "READY",
    "WARMED",
    "DEGRADED",
    "SETUP",
    "WARMING",
  ]);
  let healthy = false;
  let version = "unknown";

  log.info(`Waiting for health check via Unified Dispatcher on port ${port}...`);

  for (let i = 0; i < 60; i++) {
    if (isShuttingDown()) break;
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/system/health`, {
        headers: {
          "x-test-mode": "true",
          "x-test-secret": TEST_API_SECRET,
        },
        signal: AbortSignal.timeout(3000),
      });
      if (r.ok) {
        const body = await r.json();
        const data = body?.data ?? body ?? {};
        const status = data?.status ?? data?.overallStatus ?? data?.health ?? "";
        version = data.dbVersion ?? data.version ?? "unknown";
        if (ACCEPTABLE.has(status) || ACCEPTABLE.has(status.toLowerCase()) || status) {
          healthy = true;
          break;
        }
      }
    } catch {
      // Ignore fetch errors during startup
    }
  }
  return { healthy, version };
}

/**
 * Starts a SveltyCMS server instance.
 */
export async function startServer(
  db: DatabaseConfig,
  port: number,
  dbName: string,
): Promise<{
  coldStartMs: number;
  version: string;
  stop: () => Promise<void>;
}> {
  log.db(db.type, `Launching SveltyCMS instance on port ${port}...`);

  const env = buildServerEnv(db, port, dbName);
  const serverPath = await getServerEntryPoint();
  const start = performance.now();

  const workerProcess = spawn("bun", [serverPath], {
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
    env,
    shell: process.platform === "win32",
  });

  const stop = async () => {
    if (globalServerProcess === workerProcess) globalServerProcess = null;
    await killProcess(workerProcess);
  };

  globalServerProcess = workerProcess;

  return new Promise((resolve, reject) => {
    let resolved = false;
    let buf = "";

    const timeout = setTimeout(() => {
      if (!resolved) reject(new Error("Server startup timeout after 120s"));
    }, 120_000);

    workerProcess.stdout?.on("data", async (d: Buffer) => {
      buf += d.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim() || isNoisyLine(line)) continue;
        process.stdout.write(line + "\n");

        const clean = line.replace(ANSI_STRIP, "");
        if (
          !resolved &&
          (clean.includes("Local:") ||
            clean.includes("127.0.0.1:") ||
            clean.includes("Listening on") ||
            clean.includes("Listening at") ||
            clean.includes("Cold Start:"))
        ) {
          resolved = true;
          clearTimeout(timeout);
          const coldStartMs = Math.round(performance.now() - start);
          log.db(db.type, `Cold Start: ${coldStartMs}ms (PID: ${workerProcess.pid})`);

          const { healthy, version } = await waitForHealthCheck(port);

          if (healthy) {
            await new Promise((r) => setTimeout(r, 2000));
            resolve({ coldStartMs, version, stop });
          } else {
            await stop();
            reject(new Error("Server reached but health check timed out"));
          }
        }
      }
    });

    workerProcess?.stderr?.on("data", (d: Buffer) => {
      const line = d.toString();
      if (!isNoisyLine(line)) {
        log.db(db.type, `\x1b[90m${line.trim()}\x1b[0m`);
      }
    });

    workerProcess?.on("error", (err) => {
      clearTimeout(timeout);
      stop();
      reject(err);
    });
  });
}

/**
 * Performs a warmup of the server to ensure JIT is ready.
 */
export async function warmupServer(cfg: RunConfig, port: number) {
  if (!cfg.warmup) return;
  const eps = ["/api/system/health", "/api/collections"];
  for (let i = 0; i < 8; i++) {
    await fetch(`http://127.0.0.1:${port}${eps[i % 2]}`, {
      headers: { "x-test-mode": "true", "x-api-secret": TEST_API_SECRET },
      signal: AbortSignal.timeout(3000),
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, 150));
  }
  await verifyOpenAPI(port);
}

/**
 * Verifies that the OpenAPI endpoint is functional.
 */
export async function verifyOpenAPI(port: number): Promise<void> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/openapi.json`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) {
      log.warn(`OpenAPI endpoint returned ${r.status}`);
      return;
    }
    const spec = await r.json();
    const count = Object.keys(spec.paths ?? {}).length;
    if (count < 10) log.warn(`OpenAPI spec looks incomplete (${count} paths)`);
    else log.success(`OpenAPI 3.1.0 spec ready (${count} paths)`);
  } catch (e: any) {
    log.warn(`OpenAPI verification skipped: ${e.message}`);
  }
}

/**
 * Writes a temporary private.test.ts config for the server.
 */
export async function writeTestConfig(db: DatabaseConfig, dbName: string): Promise<void> {
  const configDir = path.join(process.cwd(), "config");
  await fs.mkdir(configDir, { recursive: true });
  const dbHost = db.type === "sqlite" ? "." : db.host;
  const lines = [
    `// AUTO-GENERATED by enterprise-matrix.ts — do not commit`,
    `export const privateEnv = {`,
    `  DB_TYPE: ${JSON.stringify(db.type)},`,
    `  DB_NAME: ${JSON.stringify(dbName)},`,
    `  DB_HOST: ${JSON.stringify(dbHost)},`,
    `  DB_PORT: ${JSON.stringify(String(db.port || ""))},`,
    `  DB_USER: ${JSON.stringify(db.user)},`,
    `  DB_PASSWORD: ${JSON.stringify(db.password)},`,
    `  TEST_API_SECRET: ${JSON.stringify(TEST_API_SECRET)},`,
    `  JWT_SECRET_KEY: ${JSON.stringify(JWT_SECRET_KEY || "Benchmark-JWT-Secret-Key-2026-Change-Me")},`,
    `  JWT_EXPIRES_IN: ${JSON.stringify(JWT_EXPIRES_IN)},`,
    `  ENCRYPTION_KEY: ${JSON.stringify(ENCRYPTION_KEY || "Benchmark-Encryption-Key-2026-Must-Be-32-Chars!!")},`,
    `  PASSWORD_MIN_LENGTH: 8,`,
    `  MULTI_TENANT: false,`,
    `};`,
  ];
  await fs.writeFile(path.join(configDir, "private.test.ts"), lines.join("\n") + "\n");
}

/**
 * Ensures that the single required benchmark database exists for relational adapters.
 */
export async function ensureDatabaseExists(db: DatabaseConfig) {
  const dbName = DB_NAME_BENCHMARK;

  if (db.type === "postgresql") {
    try {
      const postgres = (await import("postgres")).default;
      const sql = postgres({
        host: db.host,
        port: db.port,
        user: db.user,
        password: db.password,
        database: "postgres",
        connect_timeout: 5,
      });
      await sql.unsafe(`CREATE DATABASE "${dbName}"`).catch((e: any) => {
        if (e.code !== "42P04") throw e;
      });
      await sql.end();
      log.info(`PostgreSQL: pre-created benchmark database "${dbName}".`);
    } catch (e: any) {
      log.warn(`PostgreSQL pre-check failed: ${e.message}`);
    }
  } else if (db.type === "mariadb") {
    try {
      const mysql = (await import("mysql2/promise")).default;
      let conn: any;
      try {
        conn = await (mysql as any).createConnection({
          host: db.host === "localhost" || db.host === "127.0.0.1" ? "127.0.0.1" : db.host,
          port: db.port,
          user: db.user || "root",
          password: db.password || "mariadb",
        });
      } catch (e: any) {
        if (e.code === "ER_ACCESS_DENIED_ERROR") {
          log.warn(`MariaDB access denied for ${db.user}. Trying no-password fallback...`);
          conn = await (mysql as any).createConnection({
            host: db.host === "localhost" ? "127.0.0.1" : db.host,
            port: db.port,
            user: db.user,
            password: "",
          });
        } else throw e;
      }
      await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
      await conn.end();
      log.info(`MariaDB: pre-created benchmark database "${dbName}".`);
    } catch (e: any) {
      log.warn(`MariaDB pre-check failed: ${e.message}`);
    }
  }
}

/**
 * Runs the global system setup for a fresh database.
 */
export async function runSystemSetup(
  dbConf: DatabaseConfig,
  workerPort: number,
  workerDbName: string,
  overrides: NodeJS.ProcessEnv = {},
): Promise<boolean> {
  log.info(`Running system setup for ${dbConf.type}...`);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    API_BASE_URL: `http://127.0.0.1:${workerPort}`,
    DB_TYPE: dbConf.type,
    DB_HOST: dbConf.host,
    DB_PORT: String(dbConf.port),
    DB_NAME: workerDbName,
    DB_USER: dbConf.user,
    DB_PASSWORD: dbConf.password,
    ADMIN_PASSWORD,
    TEST_API_SECRET,
    JWT_SECRET_KEY,
    ENCRYPTION_KEY,
    PASSWORD_MIN_LENGTH: "8",
    TEST_MODE: "true",
    ...overrides,
  };

  return new Promise((resolve) => {
    const proc = spawn("bun", ["run", "scripts/setup-system.ts"], {
      env,
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    proc.on("close", (code) => {
      resolve(code === 0);
    });
  });
}
