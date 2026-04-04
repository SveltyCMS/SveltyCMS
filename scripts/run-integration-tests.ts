#!/usr/bin/env bun
/**
 * @file scripts/run-integration-tests.ts
 * @description Truly Black-Box Integration Test Runner
 * Uses /api/testing for state management. No internal imports allowed.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

// ✨ Configuration Constants
const HOST = process.env.HOST || (process.env.CI ? "127.0.0.1" : "localhost");
const PORT = "4173";
const API_BASE_URL = process.env.API_BASE_URL || `http://${HOST}:${PORT}`;
const pkgManager = process.env.npm_execpath || "bun";
const TEST_API_SECRET = process.env.TEST_API_SECRET || "test-secret-123456789";

// Export to environment for spawned processes
process.env.TEST_API_SECRET = TEST_API_SECRET;

let previewProcess: ChildProcess | null = null;

async function cleanup(exitCode = 0) {
  console.log("\n🧹 Cleaning up test environment...");
  if (previewProcess && previewProcess.pid) {
    if (process.platform === "win32") {
      spawn("taskkill", ["/F", "/T", "/PID", previewProcess.pid.toString()], {
        stdio: "ignore",
      });
    } else {
      // Using negative PID kills the entire process group (prevents orphaned children)
      try {
        process.kill(-previewProcess.pid, "SIGTERM");
      } catch {
        previewProcess.kill("SIGTERM");
      }
    }
  }

  // Clean up SQLite files explicitly created by the test
  try {
    const fs = require("node:fs");
    const path = require("node:path");
    const dbName = process.env.DB_NAME || "sveltycms_test";

    // Clean up dynamically created test workers
    for (const file of fs.readdirSync(rootDir)) {
      // Catch sveltycms_test, sveltycms_test-wal, sveltycms_test_worker1, etc.
      // Making sure it's a file, not a directory.
      if (file.startsWith(dbName)) {
        const fullPath = path.join(rootDir, file);
        try {
          if (fs.statSync(fullPath).isFile()) {
            fs.unlinkSync(fullPath);
          }
        } catch {
          // Ignore
        }
      }
    }

    // Also clean up any legacy 127.0.0.1 directory if it exists
    const badDir = path.join(rootDir, "127.0.0.1");
    if (fs.existsSync(badDir)) {
      fs.rmSync(badDir, { recursive: true, force: true });
    }
  } catch (e) {
    console.warn("Non-fatal error cleaning up sqlite directories:", e);
  }

  process.exit(exitCode);
}

process.on("SIGINT", () => cleanup(130));
process.on("SIGTERM", () => cleanup(143));

async function main() {
  try {
    console.log("🚀 Starting Black-Box Integration Suite...");

    const args = process.argv.slice(2);
    const skipBuild = args.includes("--no-build");
    const filterArg = args.find((arg) => arg.startsWith("--filter="));
    const dbFilter = filterArg ? filterArg.split("=")[1] : null;

    // Fix: Properly filter out all flags (starting with --)
    const testFiles = args.filter((arg) => !arg.startsWith("--"));

    // 0. Build check
    if (!skipBuild) {
      if (requiresRebuild()) {
        console.log("🏗️ Detected changes in src/ or missing build. Rebuilding...");
        const buildCode = await runCommand(pkgManager, ["run", "build"]);
        if (buildCode !== 0) throw new Error("Build failed. Aborting benchmarks.");
      } else {
        console.log("✅ Build is up to date. Skipping rebuild.");
      }
    }

    // 0.5 Clean up stale config
    const privateTestPath = join(rootDir, "config", "private.test.ts");
    if (existsSync(privateTestPath)) {
      console.log("🧹 Removing stale private.test.ts...");
      unlinkSync(privateTestPath);
    }

    // 1. Build & Start Server (Initial startup in setup mode)
    console.log("📦 Starting preview server for initial setup...");
    await startPreviewServer();

    // 1.5. Run Fast System Setup
    console.log("⚙️ Running Fast System Setup to configure system...");
    const dbType = process.env.DB_TYPE || "sqlite";
    console.log(`📡 DB_TYPE: ${dbType}`);

    // For SQLite, redirect the host to the current directory to avoid creating a '127.0.0.1' folder
    const originalHost = process.env.DB_HOST || HOST;
    const dbHost = dbType === "sqlite" ? "." : originalHost;

    const setupResult = await runCommand(pkgManager, ["run", "scripts/setup-system.ts"], {
      DB_TYPE: dbType,
      DB_HOST: dbHost,
      DB_NAME: process.env.DB_NAME || "sveltycms_test",
      DB_USER: process.env.DB_USER || "",
      DB_PASSWORD: process.env.DB_PASSWORD || "",
      DB_PORT: process.env.DB_PORT || "",
      TEST_MODE: "true",
      API_BASE_URL,
      TEST_API_SECRET,
    });

    if (setupResult !== 0) throw new Error("Fast setup failed. Cannot proceed.");
    console.log("✅ System configured successfully via API.");

    // 1.6. RESTART SERVER to pick up new config/private.test.ts
    console.log("🔄 Restarting preview server to apply new configuration...");
    await startPreviewServer(dbHost);
    console.log("✅ Server restarted and ready.");

    // 2. Discover tests
    let filesToRun =
      testFiles.length > 0 ? testFiles : findTestFiles(join(rootDir, "tests/integration"));

    // 2.1. Filter files based on DB_TYPE
    if (dbFilter) {
      console.log(`🔍 Applying filter: ${dbFilter}`);
      const otherDbs = ["mongodb", "mariadb", "postgresql", "sqlite"].filter(
        (db) => db !== dbFilter,
      );
      filesToRun = filesToRun.filter((file) => {
        const lowerFile = file.toLowerCase();
        return !otherDbs.some(
          (other) => lowerFile.includes(`${other}-adapter`) || lowerFile.includes(`${other}.test`),
        );
      });
    }

    console.log(`🧪 Running ${filesToRun.length} test files sequentially...`);
    const results: Array<{ file: string; success: boolean; code: number }> = [];

    for (const file of filesToRun) {
      const relPath = relative(rootDir, file);
      console.log(`\n▶️  [TEST] ${relPath}`);

      // Reset & Seed via God-Mode API
      if (!(await invokeTestApi("reset")) || !(await invokeTestApi("seed"))) {
        console.error("❌ Failed to reset/seed via API. Aborting current test.");
        results.push({ file: relPath, success: false, code: -1 });
        break;
      }

      // Run Bun test
      const code = await runTest(file);
      results.push({ file: relPath, success: code === 0, code });

      if (code !== 0) console.error(`❌ Failed: ${relPath}`);
      else console.log(`✅ Passed: ${relPath}`);
    }

    // 3. Output Summary
    const failedCount = results.filter((r) => !r.success).length;
    console.log(
      `\n🏁 Total: ${results.length}, Success: ${results.length - failedCount}, Errors: ${failedCount}`,
    );

    if (failedCount > 0) {
      console.log("\n❌ FAILED TESTS SUMMARY:");
      results
        .filter((r) => !r.success)
        .forEach((r) => console.log(`  - ${r.file} (Code: ${r.code})`));
    } else if (results.length > 0) {
      console.log("\n✅ ALL INTEGRATION TESTS PASSED!");
    }

    cleanup(failedCount > 0 ? 1 : 0);
  } catch (error) {
    console.error("❌ Runner Error:", error instanceof Error ? error.message : error);
    cleanup(1);
  }
}

// --- Helper Functions ---

function requiresRebuild(): boolean {
  const buildPath = join(rootDir, "build");
  const srcPath = join(rootDir, "src");
  if (!existsSync(buildPath)) return true;

  const buildTime = statSync(buildPath).mtimeMs;
  const checkNewer = (dir: string): boolean => {
    for (const item of readdirSync(dir)) {
      const fullPath = join(dir, item);
      if (statSync(fullPath).isDirectory()) {
        if (checkNewer(fullPath)) return true;
      } else if (statSync(fullPath).mtimeMs > buildTime) {
        return true;
      }
    }
    return false;
  };
  return checkNewer(srcPath);
}

function runCommand(
  command: string,
  args: string[],
  extraEnv: Record<string, string> = {},
): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd: rootDir,
      stdio: "inherit",
      shell: process.platform === "win32", // Only use shell on Windows where necessary
      env: { ...process.env, ...extraEnv },
    });
    proc.on("close", (code) => resolve(code || 0));
  });
}

async function startPreviewServer(dbHost?: string) {
  if (previewProcess) {
    console.log("🛑 Killing existing preview process...");
    if (process.platform === "win32") {
      spawn("taskkill", ["/F", "/T", "/PID", previewProcess.pid?.toString() || ""], {
        stdio: "ignore",
      });
    } else if (previewProcess.pid) {
      try {
        process.kill(-previewProcess.pid, "SIGTERM");
      } catch {
        previewProcess.kill("SIGTERM");
      }
    }
    await new Promise((r) => setTimeout(r, 2000)); // Wait for OS to release port
  }

  return new Promise<void>((resolve, reject) => {
    // 💡 CI OPTIMIZATION: Use 'preview' if 'build/' exists (much faster than 'dev')
    const buildExists = existsSync(join(rootDir, "build"));
    const usePreview =
      buildExists && (process.env.CI === "true" || process.env.USE_PREVIEW === "true");
    const cmd = usePreview ? "preview" : "dev";

    console.log(`📦 Spawning ${cmd} server (${HOST}:${PORT})...`);
    const logFd = require("node:fs").openSync(join(rootDir, "preview.log"), "a");

    const spawnArgs = ["run", cmd, "--port", PORT, "--host", HOST, "--strictPort"];

    previewProcess = spawn("bun", spawnArgs, {
      cwd: rootDir,
      stdio: ["ignore", logFd, logFd],
      detached: process.platform !== "win32", // Detach to create a new process group for clean killing
      shell: process.platform === "win32",
      env: {
        ...process.env,
        NODE_ENV: usePreview ? "production" : "development",
        DB_TYPE: process.env.DB_TYPE || "sqlite",
        DB_HOST: dbHost || process.env.DB_HOST || HOST,
        DB_NAME: process.env.DB_NAME || "sveltycms_test",
        DB_USER: process.env.DB_USER || "",
        DB_PASSWORD: process.env.DB_PASSWORD || "",
        DB_PORT: process.env.DB_PORT || "",
        TEST_MODE: "true",
        TEST_API_SECRET,
        ORIGIN: API_BASE_URL,
        SUPPRESS_JEST_WARNINGS: "true",
      },
    });

    let resolved = false;
    const timeoutMs = 120000;
    const timeout = setTimeout(() => {
      if (!resolved)
        reject(new Error(`Timeout waiting for ${cmd} server health check (${timeoutMs}ms)`));
    }, timeoutMs);

    waitForServer()
      .then(() => {
        clearTimeout(timeout);
        resolved = true;
        resolve();
      })
      .catch((err) => {
        if (!resolved) reject(err);
      });

    previewProcess.on("close", (code) => {
      if (!resolved && code !== null) reject(new Error(`Preview process exited with code ${code}`));
    });
  });
}

async function waitForServer() {
  console.log(`⏳ Waiting for server health check at ${API_BASE_URL}/api/system/health...`);
  const maxRetries = process.env.CI === "true" ? 120 : 60;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/system/health`);
      if (res.ok || res.status === 503) {
        console.log("✅ Server reached.");
        return;
      }
    } catch (err: any) {
      if (i % 10 === 0) {
        console.log(`   Attempt ${i}: Server not yet available (${err.message})...`);
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Server health check timeout");
}

async function invokeTestApi(action: "reset" | "seed"): Promise<boolean> {
  const maxRetries = 5;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/testing`, {
        method: "POST",
        body: JSON.stringify({ action }),
        headers: {
          "Content-Type": "application/json",
          "x-test-secret": TEST_API_SECRET,
          Origin: API_BASE_URL,
        },
      });
      if (res.ok) return true;

      console.warn(
        `⚠️ ${action.toUpperCase()} attempt ${attempt} failed: ${res.status} ${res.statusText}`,
      );
      if (attempt === maxRetries) {
        console.error(`Body: ${await res.text()}`);
      }
    } catch (e: any) {
      console.warn(`[Runner] ${action} API error attempt ${attempt}:`, e.message);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

function runTest(file: string): Promise<number> {
  const args = ["test"];
  // Black-box integration tests should not preload unit test shims
  // args.push("--preload", "./tests/unit/setup.ts");
  args.push(file);

  return runCommand(pkgManager, args, {
    TEST_MODE: "true",
    API_BASE_URL,
    TEST_API_SECRET,
    SUPPRESS_JEST_WARNINGS: "true",
  });
}

function findTestFiles(dir: string, list: string[] = []) {
  if (!existsSync(dir)) return list;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      findTestFiles(p, list);
    } else if (
      f.endsWith(".test.ts") &&
      !f.includes("setup-actions") &&
      !f.includes("setup-wizard") &&
      !f.includes("setup-presets") &&
      !f.includes("setup-utils")
    ) {
      list.push(p);
    }
  }
  return list;
}

main();
