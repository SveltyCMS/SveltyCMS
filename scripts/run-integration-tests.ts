#!/usr/bin/env bun
/**
 * @file scripts/run-integration-tests.ts
 * @description Black-box integration test runner for SveltyCMS.
 * Uses only public API endpoints + /api/testing for state control.
 */

import { spawn, execSync, type ChildProcess } from "node:child_process";
import {
  readdirSync,
  unlinkSync,
  statSync,
  existsSync,
  copyFileSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { isAbsolute, join, relative, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getDockerDefaultDbCredentials } from "../src/utils/test-db-credentials.ts";
import { isConfigSourceSafeForTesting, isIsolatedTestDbName } from "../src/utils/test-db-safety.ts";
import { isCiRunner } from "../src/utils/private-config-policy.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

const PORT = process.env.PORT ?? "4173";
const HOST = process.env.HOST ?? "127.0.0.1";
const API_BASE_URL = process.env.API_BASE_URL ?? `http://${HOST}:${PORT}`;

type IntegrationSuite = "all" | "db" | "api";

const loadHardenedConfig = async () => {
  const isCI = process.env.CI === "true";

  let testApiSecret = process.env.TEST_API_SECRET;

  if (!testApiSecret) {
    try {
      const secretPath = join(ROOT, "tests", "e2e", ".auth", "test-secret.txt");

      if (existsSync(secretPath)) {
        testApiSecret = readFileSync(secretPath, "utf8").trim();
      }
    } catch {
      // Ignore. We validate below.
    }
  }

  const jwtSecret = process.env.JWT_SECRET_KEY || "Integration-Test-JWT-Secret-Key-2026";
  const encryptionKey = process.env.ENCRYPTION_KEY || "Integration-Encryption-Key-2026-32ch";
  const adminPassword = process.env.ADMIN_PASSWORD || "Password123!";

  if (isCI && !testApiSecret) {
    throw new Error("❌ CRITICAL: TEST_API_SECRET is missing in CI environment");
  }

  return {
    JWT_SECRET_KEY: jwtSecret,
    ENCRYPTION_KEY: encryptionKey,
    TEST_API_SECRET: testApiSecret || "SVELTYCMS_TEST_SECRET_2026",
    ADMIN_PASSWORD: adminPassword,
  };
};

let CONFIG: Awaited<ReturnType<typeof loadHardenedConfig>>;
let previewProcess: ChildProcess | null = null;
let isShuttingDown = false;

function getEnvValue(name: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(process.env, name)) {
    return process.env[name];
  }
  return undefined;
}

function getDbDefaults() {
  const dbType = process.env.DB_TYPE || "sqlite";

  const defaultPort =
    dbType === "postgresql"
      ? "5432"
      : dbType === "mariadb"
        ? "3306"
        : dbType === "mongodb"
          ? "27017"
          : "";

  const dbPort = getEnvValue("DB_PORT") ?? defaultPort;

  const defaults = getDockerDefaultDbCredentials(dbType);
  const dbUser = getEnvValue("DB_USER") ?? defaults.user;
  const dbPassword = getEnvValue("DB_PASSWORD") ?? defaults.password;

  return {
    type: dbType,
    host: getEnvValue("DB_HOST") ?? "127.0.0.1",
    port: dbPort,
    name: getEnvValue("DB_NAME") ?? "sveltycms_test",
    user: dbUser,
    password: dbPassword,
  };
}

function getArgValue(argv: string[], name: string) {
  const prefix = `${name}=`;
  return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function normalizePath(file: string) {
  return file.replace(/\\/g, "/");
}

function resolveSqliteTestDbPath(db: ReturnType<typeof getDbDefaults>): string {
  const fileName =
    db.name.endsWith(".sqlite") || db.name.endsWith(".db") ? db.name : `${db.name}.sqlite`;
  const host = db.host;
  const isNetworkHost =
    !host ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    /^(\d{1,3}\.){3}\d{1,3}$/.test(host);

  if (isNetworkHost) return join(ROOT, "config", "database", fileName);

  const isPathLike =
    host.startsWith("/") ||
    host.startsWith("./") ||
    host.startsWith("../") ||
    host.includes("/") ||
    host.includes("\\") ||
    /^[a-zA-Z]:/.test(host);

  if (isPathLike) {
    const base = isAbsolute(host) ? host : resolve(ROOT, host);
    return join(base, fileName);
  }

  return join(ROOT, "config", "database", fileName);
}

function filterTestsBySuite(testFiles: string[], suite: IntegrationSuite, dbType: string) {
  let filtered = testFiles.filter((file) => {
    const path = normalizePath(file);

    if (path.endsWith("mongodb-adapter.test.ts")) return dbType === "mongodb";
    if (path.endsWith("mariadb-adapter.test.ts")) return dbType === "mariadb";
    if (path.endsWith("postgresql-adapter.test.ts")) return dbType === "postgresql";
    if (path.endsWith("sqlite-adapter.test.ts")) return dbType === "sqlite";

    return true;
  });

  if (suite === "db") {
    return filtered.filter((file) => normalizePath(file).includes("tests/integration/databases/"));
  }

  if (suite === "api") {
    return filtered.filter((file) => !normalizePath(file).includes("tests/integration/databases/"));
  }

  return filtered;
}

async function waitForPortToBeFree(port: number, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await fetch(`http://127.0.0.1:${port}/api/system/health`, {
        signal: AbortSignal.timeout(1000),
      });
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch {
      return;
    }
  }
  throw new Error(`Port ${port} still in use after ${maxAttempts} attempts`);
}

async function freePort(port: number) {
  console.log(`🧹 Freeing port ${port}...`);

  // Prefer killing only the preview process we spawned. Blind Stop-Process on
  // every PID bound to the port can race Windows shells and orphan file locks
  // around build/ during isolated restarts.
  if (previewProcess?.pid) {
    try {
      if (process.platform === "win32") {
        execSync(`taskkill /PID ${previewProcess.pid} /T /F`, { stdio: "ignore" });
      } else {
        try {
          process.kill(-previewProcess.pid, "SIGKILL");
        } catch {
          previewProcess.kill("SIGKILL");
        }
      }
    } catch {
      // already dead
    }
    previewProcess = null;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  try {
    if (process.platform === "win32") {
      // netstat is far faster/more reliable than Get-NetTCPConnection on Windows
      // (the latter often hangs 10–30s under load and leaves 4173 held).
      const netstat = execSync("netstat -ano -p tcp", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const pids = new Set<string>();
      for (const line of netstat.split(/\r?\n/)) {
        // e.g. "  TCP    0.0.0.0:4173    0.0.0.0:0    LISTENING    12345"
        if (!line.includes(`:${port}`) || !/LISTENING/i.test(line)) continue;
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid) && pid !== String(process.pid) && pid !== "0") {
          pids.add(pid);
        }
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
        } catch {
          /* already dead */
        }
      }
    } else {
      execSync(`lsof -ti:${port} | xargs -r kill -9 || true`, { stdio: "ignore" });
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch {
    // Non-fatal. The port may already be free.
  }
  await waitForPortToBeFree(port);
}

async function waitForServerReady(maxAttempts = 60, options: { allowSetup?: boolean } = {}) {
  const allowSetup = options.allowSetup === true;
  console.log(
    allowSetup
      ? "⏳ Waiting for server to listen (setup mode accepts state=setup)..."
      : "⏳ Waiting for server to reach READY state...",
  );

  // Setup-mode tests delete/recreate config and expect the app to stay in
  // "setup" until the wizard completes — treating that as healthy hang forever.
  // Regular integration also accepts "setup" under TEST_MODE: the server is
  // listening and seed will create admin users before suite body runs.
  const targetStates = new Set([
    "ready",
    "healthy",
    "ok",
    "degraded",
    "setup",
    "idle",
    // Boot after isolated restart — process is listening while migrations finish.
    "initializing",
  ]);
  const testApiSecret = CONFIG?.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026";

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/system/health`, {
        headers: {
          "x-test-mode": "true",
          "x-test-secret": testApiSecret,
        },
        signal: AbortSignal.timeout(3000),
      });

      if (res.ok || res.status === 533 || (allowSetup && res.status >= 200 && res.status < 600)) {
        const data = await res.json().catch(() => ({}));
        const payload = data?.data && typeof data.data === "object" ? data.data : data;
        const rawStatus = (payload.overallStatus || payload.status || payload.health || "")
          .toString()
          .toLowerCase();
        const dbStatus = String(payload.database || "").toLowerCase();

        if (targetStates.has(rawStatus) || (allowSetup && res.ok && !rawStatus)) {
          console.log(
            `✅ Server is up (state: ${rawStatus || res.status}, db: ${dbStatus || "n/a"})`,
          );

          // Setup-mode or pre-seed: accept setup/idle immediately (seed follows).
          if (rawStatus === "setup" || rawStatus === "idle" || allowSetup) {
            // Prefer connected DB when we can, but do not hang forever on empty DB.
            if (dbStatus === "connected" || dbStatus === "healthy" || allowSetup || i >= 5) {
              return true;
            }
          }

          // 🚀 RACE CONDITION FIX: The system state machine reports READY
          // before SQLite migrations complete (bootAll runs asynchronously).
          // Wait for migrations to finish before returning, otherwise seed
          // operations fail with "no such table: roles".
          console.log("⏳ Waiting for database migrations to settle...");
          for (let settle = 0; settle < 15; settle++) {
            await new Promise((r) => setTimeout(r, 1000));
            try {
              const settleRes = await fetch(`${API_BASE_URL}/api/system/health`, {
                headers: {
                  "x-test-mode": "true",
                  "x-test-secret": testApiSecret,
                  "x-refresh": "true",
                },
                signal: AbortSignal.timeout(3000),
              });
              if (settleRes.ok) {
                const settleData = await settleRes.json().catch(() => ({}));
                // HYPER-TURBO path: { database: true }
                // Regular handler: { success: true, data: { database: "connected" } }
                const db = settleData?.database ?? settleData?.data?.database ?? "";
                if (db === "connected" || db === true) {
                  console.log("✅ Database migrations settled.");
                  return true;
                }
              }
            } catch {
              // Server still settling
            }
          }
          console.log("⚠️ Database migrations did not settle — proceeding anyway.");
          return true;
        }

        console.log(`⏳ Server state: ${rawStatus} (${i + 1}/${maxAttempts})...`);
      }
    } catch {
      // Server may not be listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log("⚠️ Server did not reach READY state within timeout.");
  return false;
}

function getTestEnv(db: ReturnType<typeof getDbDefaults>) {
  const jwt =
    CONFIG?.JWT_SECRET_KEY || process.env.JWT_SECRET_KEY || "Integration-Test-JWT-Secret-Key-2026";
  const enc =
    CONFIG?.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || "Integration-Encryption-Key-2026-32ch";

  return {
    NODE_ENV: "test",
    TEST_MODE: "true",
    SKIP_GATEKEEPER: "true",
    LOG_LEVEL: "warn",
    QUIET: "true",
    PORT,
    API_BASE_URL,
    DB_TYPE: db.type,
    DB_HOST: db.host || "127.0.0.1",
    // Omit empty port for sqlite (Number("") is 0 and can fail validation)
    ...(db.port ? { DB_PORT: String(db.port) } : {}),
    DB_NAME: db.name,
    DB_USER: db.user || "",
    DB_PASSWORD: db.password || "",
    TEST_API_SECRET: CONFIG?.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026",
    ADMIN_PASSWORD: CONFIG?.ADMIN_PASSWORD || "Password123!",
    ORIGIN: API_BASE_URL,
    PASSWORD_MIN_LENGTH: "8",
    JWT_SECRET_KEY: jwt,
    ENCRYPTION_KEY: enc,
  };
}

async function startPreviewServer(options: { allowSetup?: boolean } = {}) {
  const db = getDbDefaults();

  // 🚀 HARDENING: For SQLite, delete stale database file BEFORE starting the server.
  // This ensures the server creates a fresh DB and runs Drizzle migrations on connect.
  // Without this, an empty SQLite file from a previous aborted run would have zero
  // tables, causing "no such table: roles" errors.
  if (db.type === "sqlite") {
    if (!isIsolatedTestDbName(db.name)) {
      throw new Error(
        `Refusing to delete SQLite database '${db.name}' because it is not an isolated test DB name.`,
      );
    }

    const dbPath = resolveSqliteTestDbPath(db);
    if (existsSync(dbPath)) {
      try {
        unlinkSync(dbPath);
        console.log(`Deleted stale SQLite database: ${relative(ROOT, dbPath)}`);
      } catch (err: any) {
        console.warn(`Could not delete SQLite database at ${dbPath}: ${err.message}`);
      }
    }
    // Also clean up WAL and SHM files
    for (const suffix of ["-wal", "-shm"]) {
      const walPath = dbPath + suffix;
      if (existsSync(walPath)) {
        try {
          unlinkSync(walPath);
        } catch {
          /* ignore */
        }
      }
    }
  }

  const entryPoint = join(ROOT, "build", "index.js");
  if (!existsSync(entryPoint)) {
    throw new Error("Could not find server entry point (build/index.js)");
  }

  console.log(`🚀 Starting preview server with entry point: ${relative(ROOT, entryPoint)}`);

  // Always prefer Node for the production adapter-node bundle.
  // Bun cannot load the MongoDB driver (node:v8.isBuildingSnapshot is unimplemented),
  // which crashes DB init under mongodb and cascades into failed seeds / exit 1.
  // Core benchmarks already spawn with `node` for the same reason.
  // Override with INTEGRATION_SERVER_RUNTIME=bun only for local experiments.
  const runtimeCmd = process.env.INTEGRATION_SERVER_RUNTIME?.trim() || "node";
  console.log(`⚙️ Preview server runtime: ${runtimeCmd}`);

  // Windows/CI: default Node heap (~1.5–4GB) OOM's on multi-file black-box suites
  // (contract + media). Raise unless the caller already set a higher limit.
  const existingNodeOpts = process.env.NODE_OPTIONS || "";
  const nodeOpts = existingNodeOpts.includes("max-old-space-size")
    ? existingNodeOpts
    : `${existingNodeOpts} --max-old-space-size=8192`.trim();

  previewProcess = spawn(runtimeCmd, [entryPoint], {
    cwd: ROOT,
    env: {
      ...process.env,
      ...getTestEnv(db),
      NODE_OPTIONS: nodeOpts,
      // Ensure secrets are never empty strings (schema minLength 32)
      JWT_SECRET_KEY:
        process.env.JWT_SECRET_KEY ||
        CONFIG?.JWT_SECRET_KEY ||
        "Integration-Test-JWT-Secret-Key-2026",
      ENCRYPTION_KEY:
        process.env.ENCRYPTION_KEY ||
        CONFIG?.ENCRYPTION_KEY ||
        "Integration-Encryption-Key-2026-32ch",
    },
    stdio: "inherit",
    shell: process.platform === "win32",
    detached: false,
  });

  const ready = await waitForServerReady(60, { allowSetup: options.allowSetup === true });
  if (!ready) {
    throw new Error(
      options.allowSetup
        ? "Preview server never became reachable (setup mode)."
        : "Preview server never reached READY — aborting before seed.",
    );
  }
}

async function prepareIsolatedServerForTestFile(file: string) {
  const setupModeTest = isSetupModeTest(file);

  // Force restart server before EVERY test file to prevent database clobbering/session leaks
  console.log(`🔄 Restarting server for isolated test run of ${file}...`);
  await stopPreviewServer();
  await freePort(Number.parseInt(PORT, 10));

  await startPreviewServer({ allowSetup: setupModeTest });

  if (!setupModeTest) {
    await testingAction("seed");
  } else {
    console.log("⚙️ Setup-mode test — server running without seed.");
  }
}

async function stopPreviewServer() {
  if (!previewProcess) return;

  try {
    if (process.platform === "win32") {
      try {
        const pid = previewProcess.pid;
        if (pid) execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
      } catch {
        previewProcess.kill("SIGKILL");
      }
    } else {
      previewProcess.kill("SIGTERM");
    }
  } catch {
    // Process already dead
  }

  await new Promise((resolve) => setTimeout(resolve, 500));
  previewProcess = null;
}

function generatePrivateTestConfig(privateTestPath: string) {
  const db = getDbDefaults();

  const dbPortValue =
    db.type === "sqlite" || !db.port ? "undefined" : String(Number.parseInt(db.port, 10));

  const content = `/**
 * Auto-generated test config for integration tests.
 * This is generated by scripts/run-integration-tests.ts
 */
export const privateEnv = {
  DB_TYPE: "${db.type}",
  DB_HOST: "${db.host}",
  DB_PORT: ${dbPortValue},
  DB_NAME: "${db.name}",
  DB_USER: "${db.user}",
  DB_PASSWORD: "${db.password}",
  JWT_SECRET_KEY: "${CONFIG?.JWT_SECRET_KEY || "Integration-Test-JWT-Secret-Key-2026"}",
  ENCRYPTION_KEY: "${CONFIG?.ENCRYPTION_KEY || "Integration-Encryption-Key-2026-32ch"}",
  TEST_API_SECRET: "${CONFIG?.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026"}",
  PASSWORD_MIN_LENGTH: 8,
  USE_REDIS: false,
  REDIS_HOST: "127.0.0.1",
  REDIS_PORT: 6379,
  MULTI_TENANT: false,
  DEMO: false,
  HOST_PROD: "${API_BASE_URL}"
};
export const privateConfig = privateEnv;
export default privateEnv;
`;

  writeFileSync(privateTestPath, content, "utf8");
  console.log("✅ Generated config/private.test.ts from integration test environment");
}

function ensurePrivateTestConfig() {
  const configDir = join(ROOT, "config");
  const privateTestPath = join(configDir, "private.test.ts");
  const privatePath = join(configDir, "private.ts");
  // Only GitHub CI may mirror into private.ts (ephemeral, never pushed).
  // Local precheck / integration / e2e: private.test.ts ONLY.
  const isCI = isCiRunner();

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  if (isCI) {
    generatePrivateTestConfig(privateTestPath);
    copyFileSync(privateTestPath, privatePath);
    console.log("✅ [CI] Mirrored config/private.test.ts → config/private.ts (ephemeral)");
    console.log(`✅ Test config verified: ${privateTestPath}`);
    return;
  }

  // LOCAL: never create, overwrite, rename, or delete config/private.ts.
  // SAFETY: private.ts may point at a real deployment — do not seed from it.
  if (existsSync(privateTestPath)) {
    const { dbName, safe } = isConfigSourceSafeForTesting(readFileSync(privateTestPath, "utf8"));
    if (!safe) {
      console.warn(
        `⚠️ config/private.test.ts has an unsafe DB_NAME ('${dbName || "unknown"}'). ` +
          "Regenerating a safe test config instead of trusting the existing file.",
      );
      generatePrivateTestConfig(privateTestPath);
    }
  }

  if (!existsSync(privateTestPath)) {
    generatePrivateTestConfig(privateTestPath);
  }

  if (!existsSync(privateTestPath)) {
    throw new Error(`System setup did not create required test config: ${privateTestPath}`);
  }

  console.log(`✅ LOCAL test config: ${privateTestPath} (config/private.ts left untouched)`);
}

async function testingAction(action: "reset" | "seed", preset?: string): Promise<void> {
  let lastError: Error | null = null;
  const maxRetries = 5;
  const testApiSecret = CONFIG?.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026";

  for (let i = 0; i < maxRetries; i++) {
    try {
      const body: any = { action };
      if (action === "seed") {
        // Must match @tests/harness ADMIN_CREDENTIALS / testFixtures.adminUser
        body.email = process.env.ADMIN_EMAIL || "admin@example.com";
        body.password = CONFIG?.ADMIN_PASSWORD || "Password123!";
      }
      if (preset) body.preset = preset;

      const response = await fetch(`${API_BASE_URL}/api/testing`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-mode": "true",
          "x-test-secret": testApiSecret,
          Origin: API_BASE_URL,
        },
        body: JSON.stringify(body),
      });

      if (response.ok) return;

      const text = await response.text().catch(() => "");
      if (response.status === 503 && i < maxRetries - 1) {
        console.log(`/api/testing ${action} returned 503 (initializing). Retrying in 2s...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }

      // Enhanced diagnostics for test failures
      console.error(
        `/api/testing ${action} FAILED (HTTP ${response.status}): ${text.slice(0, 500)}`,
      );
      throw new Error(
        `/api/testing ${action} failed with HTTP ${response.status}: ${text.slice(0, 300)}`,
      );
    } catch (err: any) {
      lastError = err;
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  throw lastError || new Error(`Failed /api/testing ${action} after ${maxRetries} retries`);
}

type RunResult = { code: number | null; stderr: string; stdout: string };

async function runCommand(cmd: string, args: string[], opts: any = {}): Promise<RunResult> {
  const capture = opts.capture === true;
  const proc = spawn(cmd, args, {
    cwd: ROOT,
    stdio: capture ? "pipe" : "inherit",
    shell: process.platform === "win32",
    ...opts,
    env: { ...process.env, ...opts.env },
    capture: undefined,
  });

  let stdout = "";
  let stderr = "";
  if (capture) {
    proc.stdout?.on("data", (d) => {
      const s = d.toString();
      stdout += s;
      process.stdout.write(s);
    });
    proc.stderr?.on("data", (d) => {
      const s = d.toString();
      stderr += s;
      process.stderr.write(s);
    });
  }

  return new Promise<RunResult>((resolve) => {
    proc.on("close", (code) => resolve({ code, stdout, stderr }));
    proc.on("error", () => resolve({ code: 1, stdout, stderr }));
  });
}

async function runSystemSetup() {
  ensurePrivateTestConfig();

  const collectionsDir = join(ROOT, "config", "collections", "test");
  if (!existsSync(collectionsDir)) {
    mkdirSync(collectionsDir, { recursive: true });
  }
  const tsPath = join(collectionsDir, "integration_test_collection.ts");
  const tsContent = `
import type { Schema } from '@src/content/types';
export const schema: Schema = {
	name: 'test_collection',
	slug: 'test_collection',
	fields: [
		{ name: 'title', label: 'Title', widget: 'text' },
		{ name: 'content', label: 'Content', widget: 'richtext' }
	]
};
`;
  writeFileSync(tsPath, tsContent, "utf8");
  console.log(
    "✅ Created config/collections/test/integration_test_collection.ts for build-time compilation",
  );

  const compiledDir = join(ROOT, ".compiledCollections", "test");
  if (!existsSync(compiledDir)) {
    mkdirSync(compiledDir, { recursive: true });
  }
  const jsPath = join(compiledDir, "integration_test_collection.js");
  const jsContent = `
export const schema = {
	name: 'test_collection',
	slug: 'test_collection',
	fields: [
		{ name: 'title', label: 'Title', widget: 'text' },
		{ name: 'content', label: 'Content', widget: 'richtext' }
	]
};
`;
  writeFileSync(jsPath, jsContent, "utf8");
  console.log(
    "✅ Created .compiledCollections/test/integration_test_collection.js for runtime loading",
  );

  console.log("⚙️ Integration test config ready. /api/testing will reset/seed per test file.");
}

function isSetupModeTest(filePath: string) {
  const normalizedPath = normalizePath(filePath);

  return (
    normalizedPath.endsWith("tests/integration/api/setup-actions.test.ts") ||
    normalizedPath.endsWith("tests/integration/setup-wizard.test.ts") ||
    normalizedPath.endsWith("tests/integration/setup-presets.test.ts")
  );
}

async function isServerAlive(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/system/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function teardown() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log("\n🧹 Tearing down test environment...");

  await stopPreviewServer();

  // Clean up test collection artifacts — paths must match runSystemSetup
  try {
    const tsPath = join(ROOT, "config", "collections", "test", "integration_test_collection.ts");
    const jsPath = join(ROOT, ".compiledCollections", "test", "integration_test_collection.js");
    if (existsSync(tsPath)) unlinkSync(tsPath);
    if (existsSync(jsPath)) unlinkSync(jsPath);
  } catch {
    // Non-fatal
  }

  try {
    const files = readdirSync(ROOT);

    for (const file of files) {
      const fullPath = join(ROOT, file);

      if (file.startsWith("sveltycms_test") && statSync(fullPath).isFile()) {
        unlinkSync(fullPath);
      }
    }
  } catch (error) {
    console.warn("⚠️ Non-fatal error during DB cleanup:", error);
  }
}

function getExplicitFiles(argv: string[]) {
  const files: string[] = [];

  for (const arg of argv) {
    if (arg.startsWith("--")) continue;
    files.push(...arg.split(","));
  }

  return files.filter(Boolean);
}

/** Returns test files found recursively — pure function, no side effects. */
function findTests(dir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "helpers" || entry.name === "mocks") continue;
      results.push(...findTests(fullPath));
    } else if (entry.name.endsWith(".test.ts")) {
      results.push(fullPath);
    }
  }

  return results;
}

async function main() {
  console.log("🚀 Starting SveltyCMS Black-Box Integration Test Suite...\n");

  const argv = process.argv.slice(2);

  const legacyFilter = getArgValue(argv, "--filter");
  const suiteArg = getArgValue(argv, "--suite") as IntegrationSuite | undefined;
  const dbArg = getArgValue(argv, "--db");
  const failFast = argv.includes("--fail-fast") || process.env.CI === "true";

  const suite: IntegrationSuite = suiteArg || (legacyFilter ? "db" : "all");
  const dbType = dbArg || legacyFilter || process.env.DB_TYPE || "sqlite";

  process.env.DB_TYPE = dbType;

  CONFIG = await loadHardenedConfig();

  // SAFETY: setup-check.ts resolves TEST_API_SECRET independently on the server
  // side (env var -> test-secret.txt file -> random fallback). If the two
  // resolutions ever diverge, every /api/testing call 401s. Writing the secret
  // we're about to send in headers to the same file setup-check.ts reads makes
  // them structurally impossible to disagree, regardless of env propagation.
  const testSecretDir = join(ROOT, "tests", "e2e", ".auth");
  const testSecretPath = join(testSecretDir, "test-secret.txt");
  if (!existsSync(testSecretDir)) mkdirSync(testSecretDir, { recursive: true });
  writeFileSync(testSecretPath, CONFIG.TEST_API_SECRET, "utf8");

  const explicitFiles = getExplicitFiles(argv);
  const hasExistingBuildOutput =
    existsSync(join(ROOT, "build")) || existsSync(join(ROOT, ".svelte-kit", "output", "server"));

  const skipBuild =
    argv.includes("--no-build") || (process.env.CI === "true" && hasExistingBuildOutput);
  console.log(`🧭 Suite: ${suite}`);
  console.log(`🗄️ DB: ${dbType}`);
  if (failFast) console.log("🛑 Fail-fast enabled.");

  await runSystemSetup();

  if (!skipBuild) {
    console.log("🏗️ Building project (with COMPILE_ALL_ADAPTERS)...");
    const db = getDbDefaults();
    const { code } = await runCommand("bun", ["run", "build"], {
      env: {
        TEST_MODE: "true",
        DB_TYPE: db.type,
        DB_HOST: db.host,
        DB_PORT: String(db.port),
        DB_NAME: db.name,
        DB_USER: db.user,
        DB_PASSWORD: db.password,
        TEST_API_SECRET: CONFIG.TEST_API_SECRET,
        JWT_SECRET_KEY: CONFIG.JWT_SECRET_KEY,
        ENCRYPTION_KEY: CONFIG.ENCRYPTION_KEY,
        COMPILE_ALL_ADAPTERS: "true",
        SKIP_COLLECTION_COMPILE: "true",
      },
    });
    if (code !== 0) {
      throw new Error("Build failed");
    }
  } else {
    console.log("⏭️ Skipping build; using existing CI build artifact.");
  }

  // Fail closed: mixed deploy/bench chunk trees cause "Cannot find module …chunks/…"
  // and look like random socket closes mid-suite.
  const entryJs = join(ROOT, "build", "index.js");
  if (!existsSync(entryJs)) {
    throw new Error(
      "build/index.js missing. Run: COMPILE_ALL_ADAPTERS=true bun run build\n" +
        "Also remove leftover build-saved/ or .svelte-kit/output-saved/ from a failed deploy probe.",
    );
  }
  for (const leftover of ["build-saved", join(".svelte-kit", "output-saved")]) {
    const p = join(ROOT, leftover);
    if (existsSync(p)) {
      console.warn(
        `⚠️ Found leftover ${leftover}/ — removing (corrupt hybrid builds break integration)`,
      );
      try {
        rmSync(p, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    }
  }

  const integrationDir = join(ROOT, "tests", "integration");
  let testFiles = findTests(integrationDir);

  testFiles = filterTestsBySuite(testFiles, suite, dbType);

  if (explicitFiles.length > 0) {
    testFiles = testFiles.filter((file) =>
      explicitFiles.some((explicitFile) =>
        normalizePath(file).includes(normalizePath(explicitFile)),
      ),
    );
  }

  console.log(`🧪 Found ${testFiles.length} integration test files`);

  if (testFiles.length === 0) {
    throw new Error(`No integration test files found for suite="${suite}" and db="${dbType}"`);
  }

  // Split: regular tests share one server (reset/seed between files);
  // setup-mode tests need a fresh server per file.
  const regularTests = testFiles.filter((f) => !isSetupModeTest(f));
  const setupTests = testFiles.filter((f) => isSetupModeTest(f));

  type TestResult = {
    file: string;
    success: boolean;
    time: number;
    stderr?: string;
    serverCrashed?: boolean;
  };

  let passed = 0;
  const results: TestResult[] = [];
  const db = getDbDefaults();
  const dbTimeout = db.type === "mongodb" || db.type === "mariadb" ? "180000" : "60000";

  /** Detect process-level server death from client/server error text. */
  function looksLikeServerCrash(...parts: Array<string | undefined | null>): boolean {
    // Process-level crash markers only — NOT client fetch flake strings.
    // (safeFetch "socket connection closed" previously forced full restarts while
    // the preview was still healthy → suite thrash and false CI reds.)
    for (const part of parts) {
      if (!part) continue;
      const t = part.toLowerCase();
      if (
        t.includes("uncaught exception") ||
        t.includes("fatal:") ||
        t.includes("cannot find module") ||
        t.includes("err_module_not_found") ||
        t.includes("javascript heap out of memory") ||
        t.includes("segmentation fault") ||
        t.includes("critical boot failure")
      ) {
        return true;
      }
    }
    return false;
  }

  async function runOneTest(
    file: string,
    setupMode: boolean,
    opts?: { retry?: boolean; progress?: string },
  ): Promise<TestResult> {
    const relPath = relative(ROOT, file);
    const start = Date.now();
    const prefix = opts?.progress ? `${opts.progress} ` : "";
    const label = opts?.retry ? `${prefix}↻ Retry: ${relPath}` : `${prefix}${relPath}`;
    console.log(label);

    const bunTestPath = `./${normalizePath(relPath)}`;
    const result = await runCommand("bun", ["test", "--timeout", dbTimeout, bunTestPath], {
      capture: true,
      env: {
        ...getTestEnv(db),
        SKIP_DESTRUCTIVE_TEST_CLEANUP: "true",
        SVELTYCMS_SETUP_MODE_TEST: setupMode ? "true" : "false",
      },
    });

    const duration = Date.now() - start;
    const success = result.code === 0;
    const entry: TestResult = { file: relPath, success, time: duration };

    // On failure, extract the assertion error lines for diagnostics
    if (!success && result.stderr) {
      const lines = result.stderr.split("\n");
      const errorLines = lines.filter(
        (l) =>
          l.includes("error:") ||
          l.includes("AssertionError") ||
          l.includes("Expected") ||
          l.includes("Received") ||
          l.includes("FAIL") ||
          l.includes("socket connection") ||
          l.includes("Failed to reach server"),
      );
      entry.stderr = errorLines.slice(0, 8).join("\n") || result.stderr.slice(0, 600);
    }

    // A++: always detect server death so retry path restarts the process
    if (!success) {
      const textCrash = looksLikeServerCrash(result.stdout, result.stderr, entry.stderr);
      const alive = await isServerAlive();
      entry.serverCrashed = textCrash || !alive;
      if (entry.serverCrashed) {
        console.log(
          `  ⚠️ Server crash/connection loss detected (alive=${alive}, textCrash=${textCrash})`,
        );
      }
    }

    const status = success ? `Passed (${(duration / 1000).toFixed(1)}s)` : "Failed";
    console.log(status);

    if (!success && entry.stderr) {
      console.log(`  ${entry.stderr.replace(/\n/g, "\n  ")}`);
    }

    return entry;
  }

  // Phase 1: Regular tests — sequential with reset/seed isolation between tests
  const totalCount = testFiles.length;
  let testIndex = 0;

  if (regularTests.length > 0) {
    console.log(`\n📦 Phase 1: ${regularTests.length} regular test(s) — sequential isolation`);

    await startPreviewServer();
    await testingAction("seed");

    for (let i = 0; i < regularTests.length; i++) {
      if (isShuttingDown) break;
      const file = regularTests[i]!;
      testIndex++;
      const progress = `[${testIndex}/${totalCount}]`;

      const entry = await runOneTest(file, false, { progress });

      if (!entry.success && !isShuttingDown) {
        // A++: always restart process when crash detected or health check fails
        if (entry.serverCrashed || !(await isServerAlive())) {
          console.log("  ⚠️ Server crashed or unreachable — full restart before retry...");
          await stopPreviewServer();
          await freePort(Number.parseInt(PORT, 10));
          await startPreviewServer();
        }
        await testingAction("reset");
        await testingAction("seed");
        const retry = await runOneTest(file, false, { retry: true, progress: `${progress} ↻` });
        results.push(retry);
        if (retry.success) passed++;
      } else {
        results.push(entry);
        if (entry.success) passed++;
      }

      // Live progress: cumulative pass/fail after each test
      const failCount = results.filter((r) => !r.success).length;
      const passCount = results.filter((r) => r.success).length;
      console.log(`  📊 ${passCount} passed, ${failCount} failed, ${testIndex}/${totalCount} done`);

      // Reset/seed for next test (skip after last)
      if (i < regularTests.length - 1 && !isShuttingDown) {
        if (!(await isServerAlive())) {
          console.log("  ⚠️ Server died between tests — full restart...");
          await stopPreviewServer();
          await freePort(Number.parseInt(PORT, 10));
          await startPreviewServer();
        }
        await testingAction("reset");
        await testingAction("seed");
      }

      if (failFast && results.filter((r) => !r.success).length > 0) break;
    }

    await stopPreviewServer();
    await freePort(Number.parseInt(PORT, 10));
  }

  // Phase 2: Setup-mode tests - fresh server per file, retry once on failure
  for (let i = 0; i < setupTests.length; i++) {
    if (isShuttingDown) break;
    const file = setupTests[i]!;
    const relPath = relative(ROOT, file);
    testIndex++;
    const progress = `[${testIndex}/${totalCount}]`;
    console.log(`Preparing isolated environment on port ${PORT} for ${relPath}`);
    await prepareIsolatedServerForTestFile(file);
    const entry = await runOneTest(file, true, { progress });
    if (!entry.success && !isShuttingDown) {
      // Retry with fresh isolated server
      console.log(`Retrying ${relPath} with fresh isolated environment...`);
      await prepareIsolatedServerForTestFile(file);
      const retry = await runOneTest(file, true, { retry: true, progress: `${progress} ↻` });
      results.push(retry);
      if (retry.success) passed++;
    } else {
      results.push(entry);
      if (entry.success) passed++;
    }
    // Live progress: cumulative pass/fail after each test
    const failCount = results.filter((r) => !r.success).length;
    const passCount = results.filter((r) => r.success).length;
    console.log(`  📊 ${passCount} passed, ${failCount} failed, ${testIndex}/${totalCount} done`);
    if (failFast && !entry.success) break;
  }

  const failedCount = results.length - passed;
  const failedResults = results.filter((r) => !r.success);

  console.log("\n" + "=".repeat(80));
  console.log("🏁 INTEGRATION TEST SUMMARY");
  console.log("=".repeat(80));

  if (failedResults.length === 0) {
    console.log(`✅ All ${results.length} tests passed`);
  } else {
    console.log(`Passed : ${passed}/${results.length}`);
    console.log(`Failed : ${failedCount}`);
    for (const result of failedResults) {
      console.log(` ❌ ${result.file}  (${(result.time / 1000).toFixed(1)}s)`);
    }
  }

  // CI summary: only emit ::error annotations and JSON for db-summary aggregation.
  // Per-adapter markdown is suppressed — the combined db-summary job renders the dashboard.
  const shouldWriteCiSummary =
    process.env.CI === "true" || process.env.GITHUB_STEP_SUMMARY !== undefined;

  if (shouldWriteCiSummary) {
    // ::error annotations so failures show inline on the PR Files tab
    for (const result of failedResults) {
      const err = (result.stderr || "")
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.length > 0)
        ?.replace(/\|/g, "\\|")
        .slice(0, 140);
      console.log(
        `::error file=${result.file},title=Integration failed (${dbType})::${err || result.file}`,
      );
    }

    // Per-adapter results JSON for cross-DB summary aggregation
    const resultsDir = join(ROOT, "tests", "test-results");
    if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true });
    const summaryJson = JSON.stringify({
      passed,
      failed: failedCount,
      total: results.length,
      db: dbType,
      failures: failedResults.map((r) => ({ file: r.file, time: r.time, stderr: r.stderr })),
    });
    writeFileSync(join(resultsDir, `integration-${dbType}.json`), summaryJson, "utf8");

    const outputPath = process.env.GITHUB_OUTPUT;
    if (outputPath) {
      const json = JSON.stringify({
        passed,
        failed: failedCount,
        total: results.length,
        db: dbType,
      });
      appendFileSync(outputPath, `integration_results=${json}\n`, "utf8");
    }
  }

  await teardown();

  process.exit(passed === results.length ? 0 : 1);
}

// Reliable signal handling: set flag synchronously, let main loop check it.
// Node doesn't await async signal handlers — cleanup would be abandoned.
process.on("SIGINT", () => {
  isShuttingDown = true;
  console.log("\n⚠️ SIGINT received — shutting down gracefully...");
});

process.on("SIGTERM", () => {
  isShuttingDown = true;
  console.log("\n⚠️ SIGTERM received — shutting down gracefully...");
});

main().catch((err) => {
  console.error("\n❌ Fatal:", err);
  process.exit(1);
});
