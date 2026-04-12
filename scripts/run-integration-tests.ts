#!/usr/bin/env bun
/**
 * @file scripts/run-integration-tests.ts
 * @description Black-Box Integration Test Runner.
 * Uses /api/testing for state management. No internal imports.
 */

import { spawn, execSync, type ChildProcess } from "node:child_process";
import { closeSync, existsSync, openSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const HOST = process.env.HOST ?? "127.0.0.1";
const PORT = process.env.PORT ?? "4173";
const API_BASE_URL = process.env.API_BASE_URL ?? `http://${HOST}:${PORT}`;

const TEST_API_SECRET = process.env.TEST_API_SECRET;
if (!TEST_API_SECRET) {
  const secretPath = join(rootDir, "tests/e2e/.auth/test-secret.txt");
  if (existsSync(secretPath)) {
    process.env.TEST_API_SECRET = Bun.file(secretPath).toString().trim();
  } else {
    process.env.TEST_API_SECRET = "SVELTYCMS_TEST_SECRET_2026";
  }
}

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Password123!";
process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;

const pkgManager = process.env.npm_execpath ?? "bun";

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseCli() {
  const argv = process.argv.slice(2);
  const flags = argv.filter((a) => a.startsWith("--"));
  const files = argv.filter((a) => !a.startsWith("--")).flatMap((f) => f.split(","));

  const filterFlag = flags.find((f) => f.startsWith("--filter="));
  const dbFilter = filterFlag ? filterFlag.slice(filterFlag.indexOf("=") + 1) : null;

  const timeoutFlag = flags.find((f) => f.startsWith("--timeout="));
  const globalTimeoutMs = timeoutFlag
    ? Number(timeoutFlag.slice(timeoutFlag.indexOf("=") + 1))
    : Number(process.env.GLOBAL_TIMEOUT_MS ?? 600_000);

  return {
    skipBuild: flags.includes("--no-build"),
    dbFilter,
    globalTimeoutMs,
    explicitFiles: [...new Set(files.filter(Boolean))],
  };
}

const cli = parseCli();

// ---------------------------------------------------------------------------
// Global timeout
// ---------------------------------------------------------------------------

const globalTimeout = setTimeout(() => {
  console.error(`\n❌ Global timeout of ${cli.globalTimeoutMs}ms exceeded. Aborting CI run.`);
  teardown().finally(() => process.exit(1));
}, cli.globalTimeoutMs);
globalTimeout.unref();

// ---------------------------------------------------------------------------
// Process lifecycle
// ---------------------------------------------------------------------------

let previewProcess: ChildProcess | null = null;
let previewLogFd: number | null = null;
let isShuttingDown = false;

async function freePort(port: number) {
  try {
    if (process.platform === "win32") {
      execSync(
        `powershell -Command "Get-NetTCPConnection -LocalPort ${port},3001 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
        { stdio: "ignore" },
      );
      await new Promise((r) => setTimeout(r, 1000));
    } else {
      execSync(`lsof -ti:${port},3001 | xargs kill -9 || true`, { stdio: "ignore" });
    }
  } catch {}
}

async function teardown(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log("\n🧹 Tearing down test environment…");
  await killPreviewProcess();

  if (previewLogFd !== null) {
    try {
      closeSync(previewLogFd);
    } catch {}
    previewLogFd = null;
  }

  const dbName = process.env.DB_NAME ?? "sveltycms_test";
  try {
    for (const file of readdirSync(rootDir)) {
      if (file.startsWith(dbName)) {
        const fullPath = join(rootDir, file);
        try {
          if (statSync(fullPath).isFile()) unlinkSync(fullPath);
        } catch {}
      }
    }
  } catch (e) {
    console.warn("⚠️  Non-fatal error during SQLite cleanup:", e);
  }
}

async function killPreviewProcess(): Promise<void> {
  const proc = previewProcess;
  if (!proc || proc.killed) return;
  previewProcess = null;

  if (proc.pid) {
    try {
      if (process.platform === "win32") {
        execSync(`taskkill /F /T /PID ${proc.pid}`, { stdio: "ignore" });
      } else {
        process.kill(-proc.pid, "SIGKILL");
      }
    } catch {
      proc.kill("SIGKILL");
    }
  }
  await new Promise((r) => setTimeout(r, 1000));
}

// Signal handlers
process.on("SIGINT", async () => {
  await teardown();
  process.exit(130);
});
process.on("SIGTERM", async () => {
  await teardown();
  process.exit(143);
});

// ---------------------------------------------------------------------------
// runCommand
// ---------------------------------------------------------------------------

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}
function runCommand(command: string, args: string[], opts: any = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: opts.cwd ?? rootDir,
      shell: process.platform === "win32",
      stdio: opts.capture || opts.silent ? "pipe" : "inherit",
      env: { ...process.env, ...opts.env },
    });
    let stdout = "",
      stderr = "";
    if (proc.stdout)
      proc.stdout.on("data", (d) => {
        stdout += d.toString();
      });
    if (proc.stderr)
      proc.stderr.on("data", (d) => {
        stderr += d.toString();
      });
    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

// ---------------------------------------------------------------------------
// Server management
// ---------------------------------------------------------------------------

async function startPreviewServer(dbHost?: string): Promise<void> {
  await freePort(Number(PORT));

  const buildExists = existsSync(join(rootDir, "build"));
  const usePreview =
    buildExists && (process.env.CI === "true" || process.env.USE_PREVIEW === "true");
  const cmd = usePreview ? "preview" : "dev";

  console.log(`📦 Spawning ${cmd} server (${HOST}:${PORT})…`);
  previewLogFd = openSync(join(rootDir, "preview.log"), "a");

  previewProcess = spawn("bun", ["run", cmd, "--port", PORT, "--host", HOST, "--strictPort"], {
    cwd: rootDir,
    stdio: ["ignore", previewLogFd, previewLogFd],
    env: {
      ...process.env,
      NODE_ENV: usePreview ? "production" : "development",
      DB_TYPE: process.env.DB_TYPE ?? "sqlite",
      DB_HOST: dbHost ?? process.env.DB_HOST ?? HOST,
      DB_NAME: process.env.DB_NAME ?? "sveltycms_test",
      TEST_MODE: "true",
      TEST_API_SECRET: process.env.TEST_API_SECRET || "",
      ORIGIN: API_BASE_URL,
    },
  });

  await waitForServer();
}

async function waitForServer(targetState?: string): Promise<void> {
  const maxAttempts = 80;
  const readyStatuses = new Set(["READY", "WARMED", "healthy", "ready"]);
  const acceptableStatuses = targetState
    ? readyStatuses.has(targetState)
      ? readyStatuses
      : new Set([targetState])
    : new Set(["healthy", "ready", "READY", "WARMED", "DEGRADED", "SETUP", "WARMING"]);

  console.log(`⏳ Waiting for server at ${API_BASE_URL}/api/system/health…`);

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/system/health`, {
        signal: AbortSignal.timeout(5000),
        headers: { "x-test-mode": "true" },
      });

      if (!res.ok) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      const data = await res.json().catch(() => ({}));
      const status = data?.status || data?.overallStatus || data?.health || "";

      if (
        acceptableStatuses.has(status) ||
        acceptableStatuses.has(status.toLowerCase()) ||
        (status && !targetState)
      ) {
        console.log(`✅ Server ready (status: ${status || "OK"}).`);
        return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Server did not become ready within ${maxAttempts}s.`);
}

async function invokeTestApi(action: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/testing`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-secret": process.env.TEST_API_SECRET || "",
      },
      body: JSON.stringify({
        action,
        email: "admin@example.com",
        password: ADMIN_PASSWORD,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("🚀 Starting Black-Box Integration Suite…");

  if (!cli.skipBuild) {
    console.log("🏗️  Building project…");
    const { code } = await runCommand(pkgManager, ["run", "build"]);
    if (code !== 0) throw new Error("Build failed");
  }

  await startPreviewServer();

  const dbType = process.env.DB_TYPE ?? "sqlite";
  const dbHost = dbType === "sqlite" ? "." : (process.env.DB_HOST ?? HOST);

  console.log(`⚙️  Running system setup…`);
  const { code: setupCode } = await runCommand(pkgManager, ["run", "scripts/setup-system.ts"], {
    env: {
      DB_TYPE: dbType,
      DB_HOST: dbHost,
      TEST_MODE: "true",
      TEST_API_SECRET: process.env.TEST_API_SECRET,
    },
  });
  if (setupCode !== 0) throw new Error("Setup failed");

  await invokeTestApi("reinitialize");
  await waitForServer("READY");

  const filesToRun =
    cli.explicitFiles.length > 0
      ? cli.explicitFiles
      : readdirSync(join(rootDir, "tests/integration/api"))
          .map((f) => join(rootDir, "tests/integration/api", f))
          .filter((f) => f.endsWith(".test.ts"));

  const results = [];
  for (const file of filesToRun) {
    const relPath = relative(rootDir, file);
    console.log(`\n▶️  ${relPath}`);
    await invokeTestApi("reset");
    await invokeTestApi("seed");
    const { code } = await runCommand(pkgManager, ["test", file], {
      env: {
        ...process.env,
        TEST_API_SECRET: process.env.TEST_API_SECRET,
        DB_TYPE: process.env.DB_TYPE ?? "sqlite",
        API_BASE_URL: API_BASE_URL,
      },
    });
    results.push({ file: relPath, success: code === 0 });
  }

  const passed = results.filter((r) => r.success).length;
  console.log(`\n🏁 Results: ${passed} passed, ${results.length - passed} failed`);
  await teardown();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(async (err) => {
  console.error("\n❌ Error:", err);
  await teardown();
  process.exit(1);
});
