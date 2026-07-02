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
  renameSync,
} from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

  const jwtSecret =
    process.env.JWT_SECRET_KEY || "Integration-Test-JWT-Secret-Key-2026";
  const encryptionKey =
    process.env.ENCRYPTION_KEY || "Integration-Encryption-Key-2026-32ch";
  const adminPassword = process.env.ADMIN_PASSWORD || "Password123!";

  if (isCI && !testApiSecret) {
    throw new Error(
      "❌ CRITICAL: TEST_API_SECRET is missing in CI environment",
    );
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
let serverRunningMode: "normal" | "setup" | "none" = "none";

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

  const dbUser =
    getEnvValue("DB_USER") ??
    (dbType === "mariadb"
      ? "root"
      : dbType === "postgresql"
        ? "postgres"
        : dbType === "sqlite"
          ? ""
          : "testuser");
  const dbPassword =
    getEnvValue("DB_PASSWORD") ??
    (dbType === "mariadb"
      ? "mariadb"
      : dbType === "postgresql"
        ? "postgres"
        : dbType === "sqlite"
          ? ""
          : "testpass");

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

function filterTestsBySuite(
  testFiles: string[],
  suite: IntegrationSuite,
  dbType: string,
) {
  let filtered = testFiles.filter((file) => {
    const path = normalizePath(file);

    if (path.endsWith("mongodb-adapter.test.ts")) return dbType === "mongodb";
    if (path.endsWith("mariadb-adapter.test.ts")) return dbType === "mariadb";
    if (path.endsWith("postgresql-adapter.test.ts"))
      return dbType === "postgresql";
    if (path.endsWith("sqlite-adapter.test.ts")) return dbType === "sqlite";

    return true;
  });

  if (suite === "db") {
    return filtered.filter((file) =>
      normalizePath(file).includes("tests/integration/databases/"),
    );
  }

  if (suite === "api") {
    return filtered.filter(
      (file) => !normalizePath(file).includes("tests/integration/databases/"),
    );
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

  try {
    if (process.platform === "win32") {
      execSync(
        `powershell -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
        { stdio: "ignore" },
      );
    } else {
      execSync(`lsof -ti:${port} | xargs kill -9 || true`, { stdio: "ignore" });
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch {
    // Non-fatal. The port may already be free.
  }
  await waitForPortToBeFree(port);
}

async function waitForServerReady(maxAttempts = 60) {
  console.log("⏳ Waiting for server to reach READY state...");

  const targetStates = new Set(["ready", "healthy", "ok", "degraded"]);

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

      if (res.ok || res.status === 533) {
        const data = await res.json().catch(() => ({}));
        const payload =
          data?.data && typeof data.data === "object" ? data.data : data;
        const rawStatus = (
          payload.overallStatus ||
          payload.status ||
          payload.health ||
          ""
        )
          .toString()
          .toLowerCase();

        if (targetStates.has(rawStatus)) {
          console.log(`✅ Server is READY (state: ${rawStatus})`);
          return true;
        }

        console.log(
          `⏳ Server state: ${rawStatus} (${i + 1}/${maxAttempts})...`,
        );
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
  return {
    NODE_ENV: "test",
    TEST_MODE: "true",
    SKIP_GATEKEEPER: "true",
    PORT,
    API_BASE_URL,
    DB_TYPE: db.type,
    DB_HOST: db.host,
    DB_PORT: String(db.port),
    DB_NAME: db.name,
    DB_USER: db.user,
    DB_PASSWORD: db.password,
    TEST_API_SECRET: CONFIG?.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026",
    ADMIN_PASSWORD: CONFIG?.ADMIN_PASSWORD || "Password123!",
    ORIGIN: API_BASE_URL,
    PASSWORD_MIN_LENGTH: "8",
    JWT_SECRET_KEY: CONFIG?.JWT_SECRET_KEY || "",
    ENCRYPTION_KEY: CONFIG?.ENCRYPTION_KEY || "",
  };
}

async function startPreviewServer() {
  const db = getDbDefaults();

  // 🚀 HARDENING: For SQLite, delete stale database file BEFORE starting the server.
  // This ensures the server creates a fresh DB and runs Drizzle migrations on connect.
  // Without this, an empty SQLite file from a previous aborted run would have zero
  // tables, causing "no such table: roles" errors.
  if (db.type === "sqlite") {
    // Use the same path as generatePrivateTestConfig (config/database/sveltycms.db)
    // The DB_NAME env var might differ from what's in the config file.
    const dbPath = join(ROOT, "config", "database", "sveltycms.db");
    if (existsSync(dbPath)) {
      try {
        unlinkSync(dbPath);
        console.log(`Deleted stale SQLite database: ${relative(ROOT, dbPath)}`);
      } catch (err: any) {
        console.warn(
          `Could not delete SQLite database at ${dbPath}: ${err.message}`,
        );
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

  console.log(
    `🚀 Starting preview server with entry point: ${relative(ROOT, entryPoint)}`,
  );

  const runtimeCmd = "node";

  previewProcess = spawn(runtimeCmd, [entryPoint], {
    cwd: ROOT,
    env: {
      ...process.env,
      ...getTestEnv(db),
    },
    stdio: "inherit",
    shell: process.platform === "win32",
    detached: false,
  });

  await waitForServerReady();
}

let testFileRunCount = 0;

async function prepareIsolatedServerForTestFile(file: string) {
  const setupModeTest = isSetupModeTest(file);
  const targetMode = setupModeTest ? "setup" : "normal";
  const isMongoDB = process.env.DB_TYPE === "mongodb";

  // MongoDB: restart server every 5 tests to prevent connection pool degradation
  const needsMongoRestart =
    isMongoDB &&
    !setupModeTest &&
    testFileRunCount > 1 &&
    testFileRunCount % 5 === 0;

  if (needsMongoRestart) {
    console.log("🔄 MongoDB: restarting server to refresh connection pool...");
    await stopPreviewServer();
    await freePort(Number.parseInt(PORT, 10));
    testFileRunCount = 0;
  }

  if (serverRunningMode !== targetMode || testFileRunCount === 0) {
    if (previewProcess) {
      await stopPreviewServer();
      await freePort(Number.parseInt(PORT, 10));
    }

    // Always start the server — setup-mode just skips seeding
    await startPreviewServer();
    serverRunningMode = targetMode;

    if (!setupModeTest) {
      await testingAction("seed");
    } else {
      console.log("⚙️ Setup-mode test — server running without seed.");
    }
    testFileRunCount = 1;
    testFileRunCount = 1;
  } else {
    testFileRunCount++;
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
    db.type === "sqlite" || !db.port
      ? "undefined"
      : String(Number.parseInt(db.port, 10));

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
  console.log(
    "✅ Generated config/private.test.ts from integration test environment",
  );
}

function ensurePrivateTestConfig() {
  const configDir = join(ROOT, "config");
  const privateTestPath = join(configDir, "private.test.ts");
  const privatePath = join(configDir, "private.ts");
  const isCI = process.env.CI === "true";

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  if (isCI) {
    generatePrivateTestConfig(privateTestPath);
    copyFileSync(privateTestPath, privatePath);
    console.log(
      "✅ Mirrored config/private.test.ts to config/private.ts for CI build",
    );
    console.log(`✅ Test config verified: ${privateTestPath}`);
    return;
  }

  if (!existsSync(privateTestPath) && existsSync(privatePath)) {
    copyFileSync(privatePath, privateTestPath);
    console.log(
      "✅ Copied config/private.ts to config/private.test.ts for TEST_MODE",
    );
  }

  if (!existsSync(privateTestPath)) {
    generatePrivateTestConfig(privateTestPath);
  }

  if (!existsSync(privateTestPath)) {
    throw new Error(
      `System setup did not create required test config: ${privateTestPath}`,
    );
  }

  console.log(`✅ Test config verified: ${privateTestPath}`);
}

async function testingAction(
  action: "reset" | "seed",
  preset?: string,
): Promise<void> {
  let lastError: Error | null = null;
  const maxRetries = 5;
  const testApiSecret = CONFIG?.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026";

  for (let i = 0; i < maxRetries; i++) {
    try {
      const body: any = { action };
      if (action === "seed") {
        body.email = "admin@test.com";
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
        console.log(
          `/api/testing ${action} returned 503 (initializing). Retrying in 2s...`,
        );
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

  throw (
    lastError ||
    new Error(`Failed /api/testing ${action} after ${maxRetries} retries`)
  );
}

async function runCommand(cmd: string, args: string[], opts: any = {}) {
  const proc = spawn(cmd, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts,
    env: { ...process.env, ...opts.env },
  });

  return new Promise<{ code: number | null }>((resolve) => {
    proc.on("close", (code) => resolve({ code }));
    proc.on("error", () => resolve({ code: 1 }));
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

  console.log(
    "⚙️ Integration test config ready. /api/testing will reset/seed per test file.",
  );
}

function isSetupModeTest(filePath: string) {
  const normalizedPath = normalizePath(filePath);

  return (
    normalizedPath.endsWith("tests/integration/api/setup-actions.test.ts") ||
    normalizedPath.endsWith("tests/integration/setup-wizard.test.ts") ||
    normalizedPath.endsWith("tests/integration/setup-presets.test.ts")
  );
}

async function teardown() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log("\n🧹 Tearing down test environment...");

  await stopPreviewServer();

  // Clean up test collection artifacts — paths must match runSystemSetup
  try {
    const tsPath = join(
      ROOT,
      "config",
      "collections",
      "test",
      "integration_test_collection.ts",
    );
    const jsPath = join(
      ROOT,
      ".compiledCollections",
      "test",
      "integration_test_collection.js",
    );
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

  const explicitFiles = getExplicitFiles(argv);
  const hasExistingBuildOutput =
    existsSync(join(ROOT, "build")) ||
    existsSync(join(ROOT, ".svelte-kit", "output", "server"));

  const skipBuild =
    argv.includes("--no-build") ||
    (process.env.CI === "true" && hasExistingBuildOutput);
  console.log(`🧭 Suite: ${suite}`);
  console.log(`🗄️ DB: ${dbType}`);
  if (failFast) console.log("🛑 Fail-fast enabled.");

  await runSystemSetup();

  if (!skipBuild) {
    console.log("🏗️ Building project (with COMPILE_ALL_ADAPTERS)...");
    const privatePath = join(ROOT, "config", "private.ts");
    const privateTmpPath = join(ROOT, "config", "private.ts.tmp");
    const privateTestPath = join(ROOT, "config", "private.test.ts");
    const privateTestTmpPath = join(ROOT, "config", "private.test.ts.tmp");

    const hasConfig = existsSync(privatePath);
    const hasTestConfig = existsSync(privateTestPath);

    // Move real configs aside and create stub configs so the build can resolve
    // config/private.ts without leaking secrets into the build artifact
    if (hasConfig) renameSync(privatePath, privateTmpPath);
    if (hasTestConfig) renameSync(privateTestPath, privateTestTmpPath);

    // Create stub config for build resolution
    const stubConfig = `export const privateEnv = { DB_TYPE: "${dbType}", DB_HOST: "127.0.0.1", DB_NAME: "stub", DB_USER: "", DB_PASSWORD: "", JWT_SECRET_KEY: "stub", ENCRYPTION_KEY: "stub" };\nexport const privateConfig = privateEnv;\nexport default privateEnv;\n`;
    writeFileSync(privatePath, stubConfig, "utf8");
    if (!hasTestConfig) writeFileSync(privateTestPath, stubConfig, "utf8");

    try {
      const { code } = await runCommand("bun", ["run", "build"], {
        env: { COMPILE_ALL_ADAPTERS: "true" },
      });
      if (code !== 0) {
        throw new Error("Build failed");
      }
    } finally {
      // Restore real configs
      if (hasConfig && existsSync(privateTmpPath)) {
        renameSync(privateTmpPath, privatePath);
      } else if (!hasConfig && existsSync(privatePath)) {
        unlinkSync(privatePath);
      }
      if (hasTestConfig && existsSync(privateTestTmpPath)) {
        renameSync(privateTestTmpPath, privateTestPath);
      } else if (!hasTestConfig && existsSync(privateTestPath)) {
        unlinkSync(privateTestPath);
      }
    }
  } else {
    console.log("⏭️ Skipping build; using existing CI build artifact.");
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
    throw new Error(
      `No integration test files found for suite="${suite}" and db="${dbType}"`,
    );
  }

  let passed = 0;
  const results: { file: string; success: boolean; time: number }[] = [];

  for (const file of testFiles) {
    if (isShuttingDown) break; // Respect signal flag synchronously

    const relPath = relative(ROOT, file);
    const start = Date.now();

    console.log("\n" + "-".repeat(80));
    console.log(
      `🧪 Preparing isolated environment on port ${PORT} for ${relPath}`,
    );
    console.log("-".repeat(80));

    await prepareIsolatedServerForTestFile(file);

    console.log(`\n▶️ Running ${relPath}...`);

    const bunTestPath = `./${normalizePath(relPath)}`;
    const setupModeTest = isSetupModeTest(file);
    const db = getDbDefaults();

    const testCmd = "bun";
    // MongoDB and MariaDB need extra timeout for post-reset stabilize loop (up to 32s + seed + auth)
    const dbTimeout =
      db.type === "mongodb" || db.type === "mariadb" ? "180000" : "60000";
    const testArgs = ["test", "--timeout", dbTimeout, bunTestPath];

    const { code } = await runCommand(testCmd, testArgs, {
      env: {
        ...getTestEnv(db),
        SKIP_DESTRUCTIVE_TEST_CLEANUP: "true",
        SVELTYCMS_SETUP_MODE_TEST: setupModeTest ? "true" : "false",
      },
    });

    const duration = Date.now() - start;
    const success = code === 0;

    results.push({ file: relPath, success, time: duration });

    if (success) {
      passed++;
    }

    console.log(
      success ? `✅ Passed (${(duration / 1000).toFixed(1)}s)` : "❌ Failed",
    );

    if (!success && failFast) {
      console.log(
        "\n🛑 Fail-fast: Aborting integration test suite due to failure.",
      );
      break;
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("🏁 INTEGRATION TEST SUMMARY");
  console.log("=".repeat(80));
  console.log(`Passed : ${passed}/${results.length}`);
  console.log(`Failed : ${results.length - passed}`);

  for (const result of results) {
    const status = result.success ? "✅" : "❌";
    console.log(
      ` ${status} ${result.file}  (${(result.time / 1000).toFixed(1)}s)`,
    );
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
