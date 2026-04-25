#!/usr/bin/env bun
/**
 * @file scripts/run-integration-tests.ts
 * @description Black-box integration test runner for SveltyCMS.
 * Uses only public API endpoints + /api/testing for state control.
 */

import { spawn, execSync, type ChildProcess } from "node:child_process";
import { readdirSync, unlinkSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

const PORT = process.env.PORT ?? "4173";
const HOST = process.env.HOST ?? "127.0.0.1";
const API_BASE_URL = process.env.API_BASE_URL ?? `http://${HOST}:${PORT}`;

// ---------------------------------------------------------------------------
// Hardened Configuration (Synchronized with Benchmark Matrix)
// ---------------------------------------------------------------------------
const loadHardenedConfig = async () => {
  const { JWT_SECRET_KEY, ENCRYPTION_KEY, TEST_API_SECRET, ADMIN_PASSWORD } =
    await import("./benchmark-matrix/config");

  return {
    JWT_SECRET_KEY,
    ENCRYPTION_KEY,
    TEST_API_SECRET,
    ADMIN_PASSWORD,
  };
};

let CONFIG: any = {};
let previewProcess: ChildProcess | null = null;
let isShuttingDown = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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
    await new Promise((r) => setTimeout(r, 1000));
  } catch {}
}

async function startPreviewServer() {
  await freePort(Number(PORT));

  console.log(`🚀 Starting preview server on ${HOST}:${PORT}...`);

  previewProcess = spawn(
    "bun",
    ["run", "preview", "--port", PORT, "--host", HOST, "--strictPort"],
    {
      cwd: ROOT,
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_ENV: "production",
        TEST_MODE: "true",
        DB_TYPE: process.env.DB_TYPE || "sqlite",
        DB_HOST: process.env.DB_HOST || "127.0.0.1",
        DB_NAME: process.env.DB_NAME || "sveltycms_test",
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

async function waitForServerReady(maxAttempts = 60) {
  console.log("⏳ Waiting for server to reach READY state...");

  // Strict readiness check: We want READY, not warming/initializing
  const TARGET_STATES = ["ready", "healthy"];

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
        const rawStatus = (data.overallStatus || data.status || data.health || "").toLowerCase();

        if (TARGET_STATES.includes(rawStatus)) {
          console.log(`✅ Server is READY (state: ${rawStatus})`);
          await new Promise((r) => setTimeout(r, 2000)); // extra settle time for DB stability
          return;
        } else {
          console.log(`⏳ Server up, but state is: "${rawStatus}" (waiting for READY)...`);
        }
      } else {
        console.log(`⏳ Server responded with HTTP ${res.status}...`);
      }
    } catch {
      // Quietly wait for connection
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  throw new Error("Server failed to reach READY state within timeout");
}

async function teardown() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log("\n🧹 Tearing down test environment...");

  if (previewProcess) {
    const pid = previewProcess.pid;
    if (pid) {
      try {
        if (process.platform === "win32") {
          execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
        } else {
          process.kill(-pid, "SIGKILL");
        }
      } catch {
        previewProcess.kill("SIGKILL");
      }
    }
    previewProcess = null;
  }

  // Cleanup test database files
  try {
    const files = readdirSync(ROOT);
    for (const file of files) {
      if (file.startsWith("sveltycms_test") && statSync(join(ROOT, file)).isFile()) {
        unlinkSync(join(ROOT, file));
      }
    }
  } catch (e) {
    console.warn("⚠️ Non-fatal error during DB cleanup:", e);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("🚀 Starting SveltyCMS Black-Box Integration Test Suite...\n");

  // Load secrets once
  CONFIG = await loadHardenedConfig();

  const argv = process.argv.slice(2);
  const explicitFiles = argv.filter((f) => !f.startsWith("--")).flatMap((f) => f.split(","));
  const skipBuild = argv.includes("--no-build");

  if (!skipBuild) {
    console.log("🏗️  Building project...");
    const { code } = await runCommand("bun", ["run", "build"]);
    if (code !== 0) throw new Error("Build failed");
  }

  await startPreviewServer();

  // Run setup (ONLY if config missing)
  const privateTestPath = join(ROOT, "config/private.test.ts");
  const { existsSync } = await import("node:fs");

  if (!existsSync(privateTestPath)) {
    console.log("⚙️  Running system setup...");
    await runCommand("bun", ["run", "scripts/setup-system.ts"], {
      env: {
        ...process.env,
        TEST_MODE: "true",
        TEST_API_SECRET: CONFIG.TEST_API_SECRET,
        ADMIN_PASSWORD: CONFIG.ADMIN_PASSWORD,
        DB_TYPE: process.env.DB_TYPE || "sqlite",
        DB_HOST: process.env.DB_HOST || "127.0.0.1",
        DB_NAME: process.env.DB_NAME || "sveltycms_test",
        PASSWORD_MIN_LENGTH: "8",
        JWT_SECRET_KEY: CONFIG.JWT_SECRET_KEY,
        ENCRYPTION_KEY: CONFIG.ENCRYPTION_KEY,
      },
    });
  } else {
    console.log("⚙️  System already setup (private.test.ts found). Skipping setup task.");
  }

  // Reset & seed test data
  console.log("🧹 Resetting and seeding test data...");
  await fetch(`${API_BASE_URL}/api/testing`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-test-secret": CONFIG.TEST_API_SECRET },
    body: JSON.stringify({
      action: "reset",
      email: "admin@example.com",
      password: CONFIG.ADMIN_PASSWORD,
    }),
  });

  await fetch(`${API_BASE_URL}/api/testing`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-test-secret": CONFIG.TEST_API_SECRET },
    body: JSON.stringify({
      action: "seed",
      email: "admin@example.com",
      password: CONFIG.ADMIN_PASSWORD,
    }),
  });

  // Discover test files (recursive)
  const integrationDir = join(ROOT, "tests/integration");
  let testFiles: string[] = [];

  function findTests(dir: string) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip helpers and mocks
        if (entry.name === "helpers" || entry.name === "mocks") continue;
        findTests(fullPath);
      } else if (entry.name.endsWith(".test.ts")) {
        testFiles.push(fullPath);
      }
    }
  }

  findTests(integrationDir);

  if (explicitFiles.length > 0) {
    testFiles = testFiles.filter((f) =>
      explicitFiles.some((ex) => f.replace(/\\/g, "/").includes(ex.replace(/\\/g, "/"))),
    );
  }

  console.log(`🧪 Found ${testFiles.length} integration test files`);

  let passed = 0;
  const results: { file: string; success: boolean; time?: number }[] = [];

  for (const file of testFiles) {
    const relPath = relative(ROOT, file);
    const start = Date.now();

    console.log(`\n▶️  Running ${relPath}...`);

    const { code } = await runCommand("bun", ["test", "--timeout", "60000", file], {
      env: {
        ...process.env,
        TEST_API_SECRET: CONFIG.TEST_API_SECRET,
        API_BASE_URL,
        TEST_MODE: "true",
        DB_TYPE: process.env.DB_TYPE || "sqlite",
        DB_NAME: process.env.DB_NAME || "sveltycms_test",
        JWT_SECRET_KEY: CONFIG.JWT_SECRET_KEY,
        ENCRYPTION_KEY: CONFIG.ENCRYPTION_KEY,
      },
    });

    const duration = Date.now() - start;
    const success = code === 0;

    results.push({ file: relPath, success, time: duration });
    if (success) passed++;

    console.log(success ? `✅ Passed (${(duration / 1000).toFixed(1)}s)` : `❌ Failed`);
  }

  // Summary
  console.log("\n" + "=".repeat(80));
  console.log("🏁 INTEGRATION TEST SUMMARY");
  console.log("=".repeat(80));
  console.log(`Passed : ${passed}/${results.length}`);
  console.log(`Failed : ${results.length - passed}`);

  for (const r of results) {
    const status = r.success ? "✅" : "❌";
    console.log(` ${status} ${r.file}  (${(r.time! / 1000).toFixed(1)}s)`);
  }

  await teardown();
  process.exit(passed === results.length ? 0 : 1);
}

// Simple command runner
async function runCommand(cmd: string, args: string[], opts: any = {}) {
  return new Promise<{ code: number }>((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: ROOT,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: { ...process.env, ...opts.env },
    });

    proc.on("error", reject);
    proc.on("close", (code) => resolve({ code: code ?? 1 }));
  });
}

// Graceful shutdown
process.on("SIGINT", async () => {
  await teardown();
  process.exit(130);
});
process.on("SIGTERM", async () => {
  await teardown();
  process.exit(143);
});

main().catch(async (err) => {
  console.error("💥 Fatal error:", err);
  await teardown();
  process.exit(1);
});
