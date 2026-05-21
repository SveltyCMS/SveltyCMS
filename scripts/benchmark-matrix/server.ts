/**
 * @file scripts/benchmark-matrix/server.ts
 * @description
 * Server utility for the benchmark matrix tool.
 *
 * Responsibilities include:
 * - Managing benchmark server lifecycle (start, stop, warmup, config writing).
 * - Enforcing robust process tree termination across operating systems.
 * - Structuring server environments dynamically based on target databases.
 * - Implementing reliable exponential backoff health check polls.
 *
 * ### Features:
 * - SveltyServerInstance process encapsulation
 * - ServerLogger clean logging pipeline
 * - Platform-specific killProcessTree process tree signaling
 */

import { spawn, execSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path, { join, relative } from "node:path";
import type { DatabaseConfig, RunConfig } from "./types";
import { log } from "./logger";

const ROOT = process.cwd();
import {
  TEST_API_SECRET,
  JWT_SECRET_KEY,
  JWT_EXPIRES_IN,
  ENCRYPTION_KEY,
  ADMIN_PASSWORD,
  DB_NAME_BENCHMARK,
} from "./config";
import { isNoisyLine } from "./utils";

let shuttingDown = false;
let activeServerInstance: SveltyServerInstance | null = null;

// eslint-disable-next-line no-control-regex
const ANSI_STRIP = /[\u001b\u009b]\[[0-9;]*[JKmsu]/g;

const HEALTH_ACCEPTABLE_STATUSES = new Set([
  "healthy",
  "ready",
  "READY",
  "WARMED",
  "DEGRADED",
  "SETUP",
  "WARMING",
]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Set the global shutting down state */
export const setShuttingDown = (val: boolean) => {
  shuttingDown = val;
};

/** Check if the system is shutting down */
export const isShuttingDown = () => shuttingDown;

/**
 * Forcefully stops a process and all its children recursively.
 */
export async function killProcessTree(proc: ChildProcess | null): Promise<void> {
  if (!proc?.pid) return;

  const pid = proc.pid;
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /T /F /PID ${pid}`, { stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGTERM");
      await sleep(1500);
      if (proc.kill("SIGKILL")) {
        await sleep(500);
      }
    }
  } catch {
    proc.kill("SIGKILL");
  }
  await sleep(2000);
}

/**
 * Compatibility wrapper to forcefully stops a process and its children.
 */
export async function killProcess(proc: ChildProcess | null) {
  await killProcessTree(proc);
}

/**
 * Stops the active server process.
 */
export async function stopServer() {
  if (!activeServerInstance) return;
  log.info("Terminating active SveltyCMS instance...");
  await activeServerInstance.stop();
  activeServerInstance = null;
}

/**
 * Builds the environment variables for the server.
 */
export function buildServerEnv(
  db: DatabaseConfig,
  port: number,
  dbName: string,
): NodeJS.ProcessEnv {
  const base = {
    PORT: port.toString(),
    NODE_ENV: "production",
    BENCHMARK: "true",
    BENCHMARK_MODE: "true",
    BENCHMARK_STABLE: "true",
    SVELTY_BENCHMARK_SUITE: "true",
    TEST_MODE: "true",
    QUIET: process.env.QUIET || "true",
    SKIP_GATEKEEPER: "true",
    SKIP_GRAPHQL_WS: process.env.SKIP_GRAPHQL_WS || "true",
    HOST: "127.0.0.1",
    ORIGIN: `http://127.0.0.1:${port}`,
    BODY_SIZE_LIMIT: "104857600", // 100MB
    LOG_LEVEL: process.env.LOG_LEVEL || "info",
    VERBOSE_STDOUT: process.env.VERBOSE_STDOUT || "false",
    PROTOCOL_HEADER: "x-forwarded-proto",
    HOST_HEADER: "host",
    BENCHMARK_DEBUG: process.env.BENCHMARK_DEBUG || "false",
    SVELTY_AUDIT_ACTIVE: process.env.SVELTY_AUDIT_ACTIVE || "false",
    DISABLE_AUDIT_LOGS: process.env.SVELTY_AUDIT_ACTIVE === "true" ? "false" : "true",
  };

  const dbEnv: Record<string, string> = {
    DB_TYPE: db.type,
    DB_HOST: db.host,
    DB_PORT: db.port.toString(),
    DB_NAME: dbName,
    DB_USER: db.user || "",
    DB_PASSWORD: db.password || "",
    USE_REDIS: db.useRedis ? "true" : "false",
    REDIS_HOST: "127.0.0.1",
    REDIS_PORT: "6379",
  };

  // Add specific environment variables for relational DB adapters
  if (db.type === "postgresql") {
    dbEnv.PGUSER = db.user || "";
    dbEnv.PGPASSWORD = db.password || "";
    dbEnv.PGDATABASE = dbName;
    dbEnv.PGHOST = db.host;
    dbEnv.PGPORT = db.port.toString();
  } else if (db.type === "mariadb") {
    dbEnv.MYSQL_USER = db.user || "";
    dbEnv.MYSQL_PWD = db.password || "";
    dbEnv.MYSQL_HOST = db.host;
    dbEnv.MYSQL_TCP_PORT = db.port.toString();
  }

  // 🚀 HARDENING: Prevent :memory: fallback in SveltyCMS configuration loading
  if (db.type === "sqlite") {
    dbEnv.FORCE_DB_NAME = dbName; // Custom flag to enforce file-based DB
  }

  const securityEnv = {
    TEST_API_SECRET,
    ADMIN_PASSWORD,
    JWT_SECRET_KEY,
    ENCRYPTION_KEY,
  };

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...base,
    ...dbEnv,
    ...securityEnv,
  };

  delete env.USER;
  delete env.USERNAME;

  if (process.env.BENCHMARK_DEBUG === "true") {
    console.log(
      `[server.ts] buildServerEnv: TEST_API_SECRET resolved to ${env.TEST_API_SECRET?.substring(0, 4)}...`,
    );
    console.log(`[server.ts] buildServerEnv: BENCHMARK_DEBUG is ${env.BENCHMARK_DEBUG}`);
  }
  return env;
}

// Cache the entry point to avoid checking the file system repeatedly
let cachedEntryPoint: string | null = null;

/**
 * Determines the server entry point.
 * 🚀 SMART DISCOVERY: Checks build folder, then fallback to .svelte-kit output.
 */
export async function getServerEntryPoint(): Promise<string> {
  if (cachedEntryPoint) return cachedEntryPoint;

  if (process.env.BENCHMARK_DEV === "true") {
    log.info("🚀 BENCHMARK_DEV mode: Forcing Vite Dev entry point.");
    cachedEntryPoint = join(ROOT, "src", "hooks.server.ts");
    return cachedEntryPoint;
  }

  function safeExistsSync(p: string): boolean {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  }

  console.log(`[getServerEntryPoint] ROOT is: "${ROOT}"`);
  const paths = [join(ROOT, "build", "index.js"), join(ROOT, "build", "server", "index.js")];
  for (const p of paths) {
    console.log(`[getServerEntryPoint] Check path: "${p}" -> exists: ${safeExistsSync(p)}`);
  }
  const entryPoint = paths.find((p) => safeExistsSync(p));

  if (!entryPoint) {
    log.info("🚀 No production build found. Falling back to Vite Dev mode.");
    cachedEntryPoint = join(ROOT, "src", "hooks.server.ts");
    return cachedEntryPoint;
  }

  console.log(`[getServerEntryPoint] Selected entry point: "${entryPoint}"`);
  log.info(`🚀 Entry Point: Found at ${relative(ROOT, entryPoint)}`);

  cachedEntryPoint = entryPoint;
  return entryPoint;
}

function buildHealthCheckUrl(port: number): string {
  return `http://127.0.0.1:${port}/api/system/health`;
}

async function tryHealthCheck(port: number): Promise<{ healthy: boolean; version: string }> {
  const url = buildHealthCheckUrl(port);
  const r = await fetch(url, {
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
    const version = data.dbVersion ?? data.version ?? "unknown";

    if (
      HEALTH_ACCEPTABLE_STATUSES.has(status) ||
      HEALTH_ACCEPTABLE_STATUSES.has(status.toUpperCase())
    ) {
      log.success(`[HealthCheck] Server is ${status.toUpperCase()} at ${url}`);
      return { healthy: true, version };
    }

    log.warn(
      `[HealthCheck] Server reached but returned unacceptable status: "${status}" at ${url}`,
    );
    if (process.env.BENCHMARK_DEBUG === "true") {
      console.log(`[HealthCheck] Full body:`, JSON.stringify(data));
    }
  } else {
    if (process.env.BENCHMARK_DEBUG === "true") {
      const body = await r.text().catch(() => "no-body");
      console.log(
        `[HealthCheck] Failed with HTTP ${r.status} from ${url}. Body: ${body.substring(0, 200)}`,
      );
    }
  }
  return { healthy: false, version: "unknown" };
}

/**
 * Waits for the server to pass health checks.
 */
export async function waitForHealthCheck(
  port: number,
  maxAttempts = 60,
): Promise<{ healthy: boolean; version: string }> {
  log.info(`Waiting for health check via Unified Dispatcher on port ${port}...`);

  for (let i = 0; i < maxAttempts; i++) {
    if (isShuttingDown()) break;

    const delay = Math.min(300 * Math.pow(1.3, i), 2000); // exponential backoff
    await sleep(delay);

    try {
      const result = await tryHealthCheck(port);
      if (result.healthy) return result;
    } catch (err: any) {
      if (process.env.BENCHMARK_DEBUG === "true") {
        console.log(`[HealthCheck] Error: ${err.message}`);
      }
    }
  }
  return { healthy: false, version: "unknown" };
}

/**
 * Clean logger pipeline to isolate debug output of the server process.
 */
class ServerLogger {
  private logStream: fs.WriteStream;

  constructor() {
    const logFile = path.join(process.cwd(), "server-debug.log");
    this.logStream = fs.createWriteStream(logFile, { flags: "a" });
  }

  write(data: Buffer | string) {
    this.logStream.write(data);
  }

  end() {
    this.logStream.end();
  }
}

/**
 * Class representing a managed server process.
 */
export class SveltyServerInstance {
  private proc: ChildProcess | null = null;
  private logger: ServerLogger | null = null;
  private resolved = false;

  constructor(
    private db: DatabaseConfig,
    private port: number,
    private dbName: string,
  ) {}

  get process() {
    return this.proc;
  }

  get pid() {
    return this.proc?.pid;
  }

  async start(): Promise<{ coldStartMs: number; version: string }> {
    log.db(this.db.type, `Launching SveltyCMS instance on port ${this.port}...`);

    const env = buildServerEnv(this.db, this.port, this.dbName);
    const serverPath = await getServerEntryPoint();
    const start = performance.now();

    const isDev = serverPath.endsWith(".ts") || !fs.existsSync(serverPath);

    // Use Node.js for production execution (Required for uWS native bindings)
    const cmd = isDev ? "bun" : "node";
    const args = isDev
      ? ["--bun", "x", "vite", "dev", "--port", this.port.toString(), "--host", "127.0.0.1"]
      : [serverPath];

    log.db(
      this.db.type,
      `Launching SveltyCMS instance (${isDev ? "DEV" : "PROD"}) on port ${this.port}...`,
    );

    const workerProcess = spawn(cmd, args, {
      cwd: process.cwd(),
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...env },
      shell: process.platform === "win32",
    });

    this.proc = workerProcess;
    this.logger = new ServerLogger();

    workerProcess.stdout?.on("data", (d: Buffer) => {
      this.logger?.write(d);
    });
    workerProcess.stderr?.on("data", (d: Buffer) => {
      this.logger?.write(d);
    });

    const cleanupListeners = () => {
      workerProcess.stdout?.removeAllListeners();
      workerProcess.stderr?.removeAllListeners();
      workerProcess.removeAllListeners();
    };

    return new Promise((resolve, reject) => {
      let buf = "";

      const timeout = setTimeout(async () => {
        if (!this.resolved) {
          cleanupListeners();
          this.resolved = true;
          await this.stop();
          reject(new Error(`Server startup timeout after 120s [${this.db.type}:${this.port}]`));
        }
      }, 120_000);

      workerProcess.stdout?.on("data", async (d: Buffer) => {
        buf += d.toString();
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim() || isNoisyLine(line)) continue;
          process.stdout.write(line + "\n");

          const clean = line.replace(ANSI_STRIP, "");
          const isBootLog =
            clean.includes("Turbo Pipeline Hook loaded") ||
            clean.includes("Cold Start:") ||
            clean.includes("Listening on") ||
            clean.includes("Local:") ||
            clean.includes("127.0.0.1:");
          const isViteLog =
            clean.includes("Local:") ||
            clean.includes("127.0.0.1:") ||
            clean.includes("Listening on");

          if (!this.resolved && (isBootLog || (isDev && isViteLog))) {
            this.resolved = true;
            clearTimeout(timeout);
            const coldStartMs = Math.round(performance.now() - start);
            log.db(this.db.type, `Cold Start: ${coldStartMs}ms (PID: ${workerProcess.pid})`);

            const { healthy, version } = await waitForHealthCheck(this.port);

            if (healthy) {
              await sleep(500);
              resolve({ coldStartMs, version });
            } else {
              await this.stop();
              reject(
                new Error(
                  `Server reached but health check timed out [${this.db.type}:${this.port}]`,
                ),
              );
            }
          }
        }
      });

      workerProcess?.stderr?.on("data", (d: Buffer) => {
        const line = d.toString();
        if (!isNoisyLine(line)) {
          log.db(this.db.type, `\x1b[91m${line.trim()}\x1b[0m`); // 91 is bright red
        }
      });

      workerProcess?.once("exit", (code) => {
        if (!this.resolved) {
          this.resolved = true;
          clearTimeout(timeout);
          cleanupListeners();
          reject(
            new Error(
              `Server process exited early with code ${code} [${this.db.type}:${this.port}]`,
            ),
          );
        } else if (!isNoisyLine("") && !isShuttingDown() && code !== 0) {
          // Log post-resolved crash
          log.db(this.db.type, `\x1b[91mServer process crashed with code ${code}\x1b[0m`);
        }
      });

      workerProcess?.once("error", async (err) => {
        if (!this.resolved) {
          this.resolved = true;
          clearTimeout(timeout);
          cleanupListeners();
          reject(err);
        }
        await this.stop();
      });
    });
  }

  async stop() {
    if (!this.proc) return;
    await killProcessTree(this.proc);
    this.logger?.end();
    this.proc = null;
    this.logger = null;
  }
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
  const instance = new SveltyServerInstance(db, port, dbName);
  activeServerInstance = instance;

  try {
    const result = await instance.start();

    const stop = async () => {
      if (activeServerInstance === instance) {
        activeServerInstance = null;
      }
      await instance.stop();
    };

    return {
      coldStartMs: result.coldStartMs,
      version: result.version,
      stop,
    };
  } catch (err) {
    if (activeServerInstance === instance) {
      activeServerInstance = null;
    }
    await instance.stop();
    throw err;
  }
}

/**
 * Performs a warmup of the server to ensure JIT is ready.
 */
export async function warmupServer(cfg: RunConfig, port: number) {
  if (!cfg.warmup) return;
  const eps = ["/api/system/health", "/api/collections"];
  for (let i = 0; i < 8; i++) {
    await fetch(`http://127.0.0.1:${port}${eps[i % 2]}`, {
      headers: { "x-test-mode": "true", "x-test-secret": TEST_API_SECRET },
      signal: AbortSignal.timeout(3000),
    }).catch(() => {});
    await sleep(150);
  }

  // Final confirmation: Try login to warm up auth pipeline
  try {
    const loginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-mode": "true",
        "x-test-secret": TEST_API_SECRET,
      },
      body: JSON.stringify({
        email: "admin@example.com",
        password: ADMIN_PASSWORD,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (loginRes.ok) log.success("Auth pipeline warmed up (Admin login successful)");
    else {
      const body = await loginRes.text();
      log.warn(`Auth warmup failed (Status ${loginRes.status}): ${body.substring(0, 100)}`);
    }
  } catch (err: any) {
    log.warn(`Auth warmup skipped: ${err.message}`);
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
  await fs.promises.mkdir(configDir, { recursive: true });
  const dbHost = db.type === "sqlite" ? "config/database" : db.host;

  // 🚀 Standardize on single quotes to match src/routes/setup/write-private-config.ts
  const q = (val: string) => `'${val.replace(/'/g, "\\'")}'`;

  const lines = [
    `// AUTO-GENERATED by enterprise-matrix.ts — do not commit`,
    `export const privateEnv = {`,
    `  DB_TYPE: ${q(db.type)},`,
    `  DB_NAME: ${q(dbName)},`,
    `  DB_PATH: ${q(db.type === "sqlite" ? "config/database/" + dbName + ".sqlite" : "")},`,
    `  DB_HOST: ${q(dbHost)},`,
    `  DB_PORT: ${db.port || 0},`,
    `  DB_USER: ${q(db.user || "")},`,
    `  DB_PASSWORD: ${q(db.password || "")},`,
    `  TEST_API_SECRET: ${q(TEST_API_SECRET)},`,
    `  JWT_SECRET_KEY: ${q(JWT_SECRET_KEY || "Benchmark-JWT-Secret-Key-2026-Change-Me")},`,
    `  JWT_EXPIRES_IN: ${q(JWT_EXPIRES_IN)},`,
    `  ENCRYPTION_KEY: ${q(ENCRYPTION_KEY || "Benchmark-Encryption-Key-2026-Must-Be-32-Chars!!")},`,
    `  PASSWORD_MIN_LENGTH: 8,`,
    `  MULTI_TENANT: false,`,
    `};`,
  ];
  await fs.promises.writeFile(path.join(configDir, "private.test.ts"), lines.join("\n") + "\n");
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
    SKIP_GRAPHQL_WS: "true",
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
