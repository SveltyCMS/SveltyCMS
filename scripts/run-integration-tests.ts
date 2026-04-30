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

let CONFIG: any = {};
let previewProcess: ChildProcess | null = null;
let isShuttingDown = false;

function getEnvValue(name: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(process.env, name)) {
    return process.env[name] ?? "";
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

  return {
    type: dbType,
    host: getEnvValue("DB_HOST") ?? "127.0.0.1",
    port: dbPort,
    name: getEnvValue("DB_NAME") ?? "sveltycms_test",
    user: getEnvValue("DB_USER") ?? (dbType === "sqlite" ? "" : "testuser"),
    password: getEnvValue("DB_PASSWORD") ?? (dbType === "sqlite" ? "" : "testpass"),
  };
}

function getArgValue(argv: string[], name: string) {
  const prefix = `${name}=`;
  return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function normalizePath(file: string) {
  return file.replace(/\\/g, "/");
}

function filterTestsBySuite(testFiles: string[], suite: IntegrationSuite, dbType: string) {
  if (suite === "db") {
    return testFiles.filter((file) => {
      const path = normalizePath(file);

      if (!path.includes("tests/integration/databases/")) {
        return false;
      }

      if (path.endsWith("mongodb-adapter.test.ts")) {
        return dbType === "mongodb";
      }

      if (path.endsWith("mariadb-adapter.test.ts")) {
        return dbType === "mariadb";
      }

      if (path.endsWith("postgresql-adapter.test.ts")) {
        return dbType === "postgresql";
      }

      if (path.endsWith("sqlite-adapter.test.ts")) {
        return dbType === "sqlite";
      }

      return true;
    });
  }

  if (suite === "api") {
    return testFiles.filter((file) => {
      const path = normalizePath(file);

      return (
        path.includes("tests/integration/api/") ||
        path.includes("tests/integration/routes/") ||
        path.includes("tests/integration/sdk/")
      );
    });
  }

  return testFiles;
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
}

async function waitForServerReady(maxAttempts = 60) {
  console.log("⏳ Waiting for server to reach READY state...");

  const targetStates = ["ready", "healthy"];

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/system/health`, {
        headers: {
          "x-test-mode": "true",
          "x-test-secret": CONFIG.TEST_API_SECRET,
        },
        signal: AbortSignal.timeout(3000),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const rawStatus = (data.overallStatus || data.status || data.health || "")
          .toString()
          .toLowerCase();

        if (targetStates.includes(rawStatus)) {
          console.log(`✅ Server is READY (state: ${rawStatus})`);
          await new Promise((resolve) => setTimeout(resolve, 1500));
          return;
        }

        console.log(`⏳ Server up, but state is: "${rawStatus}"...`);
      } else {
        console.log(`⏳ Server responded with HTTP ${res.status}...`);
      }
    } catch {
      // Quietly wait for connection.
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error("Server failed to reach READY state within timeout");
}

async function startPreviewServer() {
  await freePort(Number(PORT));

  const db = getDbDefaults();

  console.log(`🚀 Starting preview server on ${HOST}:${PORT}...`);

  previewProcess = spawn(
    "bun",
    ["run", "preview", "--port", PORT, "--host", HOST, "--strictPort"],
    {
      cwd: ROOT,
      stdio: "inherit",
      shell: process.platform === "win32",
      detached: process.platform !== "win32",
      env: {
        ...process.env,
        NODE_ENV: "production",
        TEST_MODE: "true",
        DB_TYPE: db.type,
        DB_HOST: db.host,
        DB_PORT: db.port,
        DB_NAME: db.name,
        DB_USER: db.user,
        DB_PASSWORD: db.password,
        TEST_API_SECRET: CONFIG.TEST_API_SECRET,
        ADMIN_PASSWORD: CONFIG.ADMIN_PASSWORD,
        ORIGIN: API_BASE_URL,
        PASSWORD_MIN_LENGTH: "8",
        JWT_SECRET_KEY: CONFIG.JWT_SECRET_KEY,
        ENCRYPTION_KEY: CONFIG.ENCRYPTION_KEY,
      },
    },
  );

  await waitForServerReady();
}

async function stopPreviewServer() {
  if (!previewProcess) {
    await freePort(Number(PORT));
    return;
  }

  const pid = previewProcess.pid;

  if (pid) {
    try {
      if (process.platform === "win32") {
        execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
      } else {
        process.kill(-pid, "SIGKILL");
      }
    } catch {
      try {
        previewProcess.kill("SIGKILL");
      } catch {
        // Ignore.
      }
    }
  }

  previewProcess = null;
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await freePort(Number(PORT));
}

function generatePrivateTestConfig(privateTestPath: string) {
  const db = getDbDefaults();

  const dbPortValue =
    db.type === "sqlite" || !db.port ? "undefined" : String(Number.parseInt(db.port, 10));

  const content = `/**
 * Auto-generated test config for integration tests.
 * Created by scripts/run-integration-tests.ts.
 */

export const database = {
  type: ${JSON.stringify(db.type)},
  host: ${JSON.stringify(db.host)},
  port: ${dbPortValue},
  name: ${JSON.stringify(db.name)},
  user: ${JSON.stringify(db.user)},
  password: ${JSON.stringify(db.password)},
};

export const db = database;

export const security = {
  jwtSecret: ${JSON.stringify(CONFIG.JWT_SECRET_KEY)},
  encryptionKey: ${JSON.stringify(CONFIG.ENCRYPTION_KEY)},
  testApiSecret: ${JSON.stringify(CONFIG.TEST_API_SECRET)},
  adminPassword: ${JSON.stringify(CONFIG.ADMIN_PASSWORD)},
};

export const secrets = security;

export const system = {
  multiTenant: false,
  demoMode: false,
  useRedis: false,
  redisHost: "localhost",
  redisPort: "6379",
  redisPassword: "",
};

export const privateConfig = {
  database,
  db,
  security,
  secrets,
  system,
  multiTenant: false,
  demoMode: false,
  useRedis: false,
  jwtSecret: security.jwtSecret,
  encryptionKey: security.encryptionKey,
  testApiSecret: security.testApiSecret,
  adminPassword: security.adminPassword,
};

export default privateConfig;
`;

  writeFileSync(privateTestPath, content, "utf8");
  console.log("✅ Generated config/private.test.ts from integration test environment");
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
    console.log("✅ Mirrored config/private.test.ts to config/private.ts for CI build");
    console.log(`✅ Test config verified: ${privateTestPath}`);
    return;
  }

  if (!existsSync(privateTestPath) && existsSync(privatePath)) {
    copyFileSync(privatePath, privateTestPath);
    console.log("✅ Copied config/private.ts to config/private.test.ts for TEST_MODE");
  }

  if (!existsSync(privateTestPath)) {
    generatePrivateTestConfig(privateTestPath);
  }

  if (!existsSync(privateTestPath)) {
    throw new Error(`System setup did not create required test config: ${privateTestPath}`);
  }

  console.log(`✅ Test config verified: ${privateTestPath}`);
}

async function testingAction(action: "reset" | "seed") {
  const response = await fetch(`${API_BASE_URL}/api/testing`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-test-mode": "true",
      "x-test-secret": CONFIG.TEST_API_SECRET,
      Origin: API_BASE_URL,
    },
    body: JSON.stringify({
      action,
      email: "admin@example.com",
      password: CONFIG.ADMIN_PASSWORD,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`/api/testing ${action} failed with HTTP ${response.status}: ${text}`);
  }
}

async function runCommand(cmd: string, args: string[], opts: any = {}) {
  return new Promise<{ code: number }>((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: ROOT,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: {
        ...process.env,
        ...opts.env,
      },
    });

    proc.on("error", reject);
    proc.on("close", (code) => resolve({ code: code ?? 1 }));
  });
}

async function runSystemSetup() {
  ensurePrivateTestConfig();

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

async function prepareIsolatedServerForTestFile(filePath: string) {
  const setupModeTest = isSetupModeTest(filePath);

  process.env.SVELTYCMS_SETUP_MODE_TEST = setupModeTest ? "true" : "false";

  await stopPreviewServer();
  await startPreviewServer();

  console.log("🧹 Resetting test data for isolated test file...");
  await testingAction("reset");

  console.log("🔁 Restarting preview server after isolated reset...");
  await stopPreviewServer();
  await startPreviewServer();

  if (setupModeTest) {
    console.log("⚙️ Setup-mode test detected. Skipping seed so the app stays in setup mode.");
    return;
  }

  console.log("🌱 Seeding test data for isolated test file...");
  await testingAction("seed");

  console.log("🔁 Restarting preview server after isolated seed...");
  await stopPreviewServer();
  await startPreviewServer();
}

async function teardown() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log("\n🧹 Tearing down test environment...");

  await stopPreviewServer();

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

async function main() {
  console.log("🚀 Starting SveltyCMS Black-Box Integration Test Suite...\n");

  const argv = process.argv.slice(2);

  const legacyFilter = getArgValue(argv, "--filter");
  const suiteArg = getArgValue(argv, "--suite") as IntegrationSuite | undefined;
  const dbArg = getArgValue(argv, "--db");

  const suite: IntegrationSuite = suiteArg || (legacyFilter ? "db" : "all");
  const dbType = dbArg || legacyFilter || process.env.DB_TYPE || "sqlite";

  process.env.DB_TYPE = dbType;

  CONFIG = await loadHardenedConfig();

  const explicitFiles = getExplicitFiles(argv);
  const hasExistingBuildOutput =
    existsSync(join(ROOT, "build")) || existsSync(join(ROOT, ".svelte-kit", "output", "server"));

  const skipBuild =
    argv.includes("--no-build") || (process.env.CI === "true" && hasExistingBuildOutput);
  console.log(`🧭 Suite: ${suite}`);
  console.log(`🗄️ DB: ${dbType}`);

  await runSystemSetup();

  if (!skipBuild) {
    console.log("🏗️ Building project...");
    const { code } = await runCommand("bun", ["run", "build"]);

    if (code !== 0) {
      throw new Error("Build failed");
    }
  } else {
    console.log("⏭️ Skipping build; using existing CI build artifact.");
  }

  const integrationDir = join(ROOT, "tests", "integration");
  let testFiles: string[] = [];

  function findTests(dir: string) {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === "helpers" || entry.name === "mocks") continue;
        findTests(fullPath);
      } else if (entry.name.endsWith(".test.ts")) {
        testFiles.push(fullPath);
      }
    }
  }

  findTests(integrationDir);

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

  let passed = 0;
  const results: { file: string; success: boolean; time: number }[] = [];

  for (const file of testFiles) {
    const relPath = relative(ROOT, file);
    const start = Date.now();

    console.log("\n" + "-".repeat(80));
    console.log(`🧪 Preparing isolated environment for ${relPath}`);
    console.log("-".repeat(80));

    await prepareIsolatedServerForTestFile(file);

    console.log(`\n▶️ Running ${relPath}...`);

    const bunTestPath = `./${normalizePath(relPath)}`;
    const setupModeTest = isSetupModeTest(file);
    const db = getDbDefaults();

    const { code } = await runCommand("bun", ["test", "--timeout", "60000", bunTestPath], {
      env: {
        ...process.env,
        TEST_API_SECRET: CONFIG.TEST_API_SECRET,
        API_BASE_URL,
        TEST_MODE: "true",
        SKIP_DESTRUCTIVE_TEST_CLEANUP: "true",
        SVELTYCMS_SETUP_MODE_TEST: setupModeTest ? "true" : "false",
        DB_TYPE: db.type,
        DB_HOST: db.host,
        DB_PORT: db.port,
        DB_NAME: db.name,
        DB_USER: db.user,
        DB_PASSWORD: db.password,
        JWT_SECRET_KEY: CONFIG.JWT_SECRET_KEY,
        ENCRYPTION_KEY: CONFIG.ENCRYPTION_KEY,
      },
    });

    const duration = Date.now() - start;
    const success = code === 0;

    results.push({ file: relPath, success, time: duration });

    if (success) {
      passed++;
    }

    console.log(success ? `✅ Passed (${(duration / 1000).toFixed(1)}s)` : "❌ Failed");

    await stopPreviewServer();
  }

  console.log("\n" + "=".repeat(80));
  console.log("🏁 INTEGRATION TEST SUMMARY");
  console.log("=".repeat(80));
  console.log(`Passed : ${passed}/${results.length}`);
  console.log(`Failed : ${results.length - passed}`);

  for (const result of results) {
    const status = result.success ? "✅" : "❌";
    console.log(` ${status} ${result.file}  (${(result.time / 1000).toFixed(1)}s)`);
  }

  await teardown();

  process.exit(passed === results.length ? 0 : 1);
}

process.on("SIGINT", async () => {
  await teardown();
  process.exit(130);
});

process.on("SIGTERM", async () => {
  await teardown();
  process.exit(143);
});

main().catch(async (error) => {
  console.error("💥 Fatal error:", error);
  await teardown();
  process.exit(1);
});