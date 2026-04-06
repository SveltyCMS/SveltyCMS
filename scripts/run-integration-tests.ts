#!/usr/bin/env bun
/**
 * @file scripts/run-integration-tests.ts
 * @description Black-Box Integration Test Runner.
 * Uses /api/testing for state management. No internal imports.
 *
 * ### Flags
 * | Flag              | Description                                           |
 * |-------------------|-------------------------------------------------------|
 * | --no-build        | Skip build step even if src/ is newer than build/     |
 * | --filter=<db>     | Only run tests matching this DB adapter name          |
 * | --timeout=<ms>    | Global script timeout in ms (default: 600000)         |
 * | [files...]        | Explicit test files to run (skips auto-discovery)     |
 *
 * ### Environment
 * | Variable          | Default           | Notes                          |
 * |-------------------|-------------------|--------------------------------|
 * | HOST              | 127.0.0.1 (CI)    |                                |
 * | PORT              | 4173              |                                |
 * | API_BASE_URL      | http://HOST:PORT  |                                |
 * | TEST_API_SECRET   | (required)        | No hardcoded default           |
 * | DB_TYPE           | sqlite            |                                |
 * | GLOBAL_TIMEOUT_MS | 600000            | 10 min                         |
 */

import { spawn, type ChildProcess } from "node:child_process";
import {
  closeSync,
  existsSync,
  openSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
} from "node:fs";
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

const HOST = process.env.HOST ?? (process.env.CI ? "127.0.0.1" : "localhost");
const PORT = process.env.PORT ?? "4173";
const API_BASE_URL = process.env.API_BASE_URL ?? `http://${HOST}:${PORT}`;

/**
 * TEST_API_SECRET has no hardcoded default.
 *
 * A predictable default in source is effectively no secret — any attacker
 * who reads this file can call /api/testing on a misconfigured staging server.
 * CI must supply the secret via an environment variable or secrets manager.
 */
const TEST_API_SECRET = process.env.TEST_API_SECRET;
if (!TEST_API_SECRET) {
  console.error(
    "❌ TEST_API_SECRET is not set. " +
      "Provide it via environment variable. " +
      "A hardcoded default is a security risk.",
  );
  process.exit(1);
}
// Propagate to child processes.
process.env.TEST_API_SECRET = TEST_API_SECRET;

const pkgManager = process.env.npm_execpath ?? "bun";

// Test files that should never be run as standalone integration tests.
// These are setup helpers, not test suites.
const EXCLUDED_TEST_PATTERNS: ReadonlyArray<string> = [
  "setup-actions",
  "setup-wizard",
  "setup-presets",
  "setup-utils",
];

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseCli() {
  const argv = process.argv.slice(2);
  const flags = argv.filter((a) => a.startsWith("--"));
  const files = argv.filter((a) => !a.startsWith("--"));

  const filterFlag = flags.find((f) => f.startsWith("--filter="));
  // Use indexOf to handle values that themselves contain "="
  const dbFilter = filterFlag ? filterFlag.slice(filterFlag.indexOf("=") + 1) : null;

  const timeoutFlag = flags.find((f) => f.startsWith("--timeout="));
  const globalTimeoutMs = timeoutFlag
    ? Number(timeoutFlag.slice(timeoutFlag.indexOf("=") + 1))
    : Number(process.env.GLOBAL_TIMEOUT_MS ?? 600_000);

  return {
    skipBuild: flags.includes("--no-build"),
    dbFilter,
    globalTimeoutMs,
    explicitFiles: files,
  };
}

const cli = parseCli();

// ---------------------------------------------------------------------------
// Global timeout
// ---------------------------------------------------------------------------

const globalTimeout = setTimeout(() => {
  console.error(`\n❌ Global timeout of ${cli.globalTimeoutMs}ms exceeded. Aborting CI run.`);
  // teardown() is best-effort here — the process is already overdue.
  teardown().finally(() => process.exit(1));
}, cli.globalTimeoutMs);
globalTimeout.unref();

// ---------------------------------------------------------------------------
// Process lifecycle — single teardown path
// ---------------------------------------------------------------------------

let previewProcess: ChildProcess | null = null;
let previewLogFd: number | null = null;
let isShuttingDown = false;

/**
 * Tears down the preview server and cleans up test artefacts.
 * Safe to call multiple times (idempotent).
 * Does NOT call process.exit() — callers decide the exit code.
 */
async function teardown(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log("\n🧹 Tearing down test environment…");

  // Kill preview server.
  await killPreviewProcess();

  // Close log file descriptor before removing files.
  if (previewLogFd !== null) {
    try {
      closeSync(previewLogFd);
    } catch {
      // Already closed — ignore.
    }
    previewLogFd = null;
  }

  // Remove SQLite test database files from the project root.
  const dbName = process.env.DB_NAME ?? "sveltycms_test";
  try {
    for (const file of readdirSync(rootDir)) {
      if (file.startsWith(dbName)) {
        const fullPath = join(rootDir, file);
        try {
          if (statSync(fullPath).isFile()) unlinkSync(fullPath);
        } catch {
          // Ignore — another process may have already removed it.
        }
      }
    }

    // Remove any legacy "127.0.0.1" directory created by old SQLite path handling.
    const legacyDir = join(rootDir, "127.0.0.1");
    if (existsSync(legacyDir)) {
      rmSync(legacyDir, { recursive: true, force: true });
    }
  } catch (e) {
    console.warn("⚠️  Non-fatal error during SQLite cleanup:", e);
  }
}

async function killPreviewProcess(): Promise<void> {
  const proc = previewProcess;
  if (!proc || proc.killed || proc.exitCode !== null) return;
  previewProcess = null;

  return new Promise((resolve) => {
    if (!proc.pid) {
      resolve();
      return;
    }

    const onExit = () => resolve();
    proc.once("close", onExit);
    proc.once("exit", onExit);

    // Give the process 5s to exit gracefully before force-killing.
    const forceKill = setTimeout(() => {
      try {
        if (process.platform === "win32") {
          spawn("taskkill", ["/F", "/T", "/PID", proc.pid!.toString()], {
            stdio: "ignore",
          });
        } else {
          process.kill(-proc.pid!, "SIGKILL");
        }
      } catch {
        // Already dead.
      }
    }, 5_000);
    forceKill.unref();

    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/F", "/T", "/PID", proc.pid.toString()], {
          stdio: "ignore",
        });
      } else {
        // Negative PID sends signal to the entire process group.
        process.kill(-proc.pid, "SIGTERM");
      }
    } catch {
      proc.kill("SIGTERM");
    }
  });
}

// Signal handlers — await teardown before exiting so the OS releases ports
// and files before the next CI step runs.
async function handleSignal(signal: NodeJS.Signals, code: number): Promise<never> {
  console.log(`\nReceived ${signal}.`);
  await teardown();
  process.exit(code);
}
process.on("SIGINT", () => handleSignal("SIGINT", 130));
process.on("SIGTERM", () => handleSignal("SIGTERM", 143));

// ---------------------------------------------------------------------------
// runCommand — no shell on non-Windows, error handler present
// ---------------------------------------------------------------------------

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface RunOpts {
  capture?: boolean;
  silent?: boolean;
  env?: Record<string, string>;
  cwd?: string;
}

function runCommand(command: string, args: string[], opts: RunOpts = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: opts.cwd ?? rootDir,
      // shell:true only on Windows where it is actually necessary to resolve
      // .cmd/.bat script wrappers. Avoid it on POSIX to eliminate injection risk.
      shell: process.platform === "win32",
      stdio: opts.capture || opts.silent ? "pipe" : "inherit",
      env: { ...process.env, ...opts.env },
    });

    let stdout = "";
    let stderr = "";

    if (proc.stdout)
      proc.stdout.on("data", (d: Buffer) => {
        stdout += d.toString();
      });
    if (proc.stderr)
      proc.stderr.on("data", (d: Buffer) => {
        stderr += d.toString();
      });

    // Without this handler, ENOENT hangs the promise indefinitely.
    proc.on("error", (err) => reject(new Error(`Failed to spawn "${command}": ${err.message}`)));

    proc.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

// ---------------------------------------------------------------------------
// Build check
// ---------------------------------------------------------------------------

/**
 * Returns true if the build directory is missing or any file directly under
 * src/ (non-recursive, capped at depth 1) is newer than the build directory.
 *
 * A full recursive mtime walk is fragile (symlinks, .svelte-kit cache churn,
 * node_modules inside src/).  The shallow check catches the common case;
 * use --no-build to override when you know the build is current.
 */
function requiresRebuild(): boolean {
  const buildPath = join(rootDir, "build");
  if (!existsSync(buildPath)) return true;

  const buildTime = statSync(buildPath).mtimeMs;
  const srcPath = join(rootDir, "src");

  try {
    for (const entry of readdirSync(srcPath, { withFileTypes: true })) {
      const fullPath = join(srcPath, entry.name);
      if (statSync(fullPath).mtimeMs > buildTime) return true;
    }
  } catch {
    // src/ doesn't exist or isn't readable — treat as no rebuild needed.
    return false;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Server management
// ---------------------------------------------------------------------------

/**
 * Starts (or restarts) the preview/dev server.
 * Properly closes the previous log file descriptor before opening a new one.
 */
async function startPreviewServer(dbHost?: string): Promise<void> {
  if (previewProcess) {
    console.log("🛑 Stopping existing preview process…");
    await killPreviewProcess();

    // Close old log fd before opening a new one.
    if (previewLogFd !== null) {
      try {
        closeSync(previewLogFd);
      } catch {
        /* ignore */
      }
      previewLogFd = null;
    }

    // Poll until the port is free rather than sleeping a fixed amount.
    await waitForPortFree(Number(PORT), 10_000);
  }

  const buildExists = existsSync(join(rootDir, "build"));
  const usePreview =
    buildExists && (process.env.CI === "true" || process.env.USE_PREVIEW === "true");
  const cmd = usePreview ? "preview" : "dev";

  console.log(`📦 Spawning ${cmd} server (${HOST}:${PORT})…`);

  // Open log file once; store the fd so we can close it in teardown.
  previewLogFd = openSync(join(rootDir, "preview.log"), "a");

  previewProcess = spawn("bun", ["run", cmd, "--port", PORT, "--host", HOST, "--strictPort"], {
    cwd: rootDir,
    stdio: ["ignore", previewLogFd, previewLogFd],
    detached: process.platform !== "win32",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      NODE_ENV: usePreview ? "production" : "development",
      DB_TYPE: process.env.DB_TYPE ?? "sqlite",
      DB_HOST: dbHost ?? process.env.DB_HOST ?? HOST,
      DB_NAME: process.env.DB_NAME ?? "sveltycms_test",
      DB_USER: process.env.DB_USER ?? "",
      DB_PASSWORD: process.env.DB_PASSWORD ?? "",
      DB_PORT: process.env.DB_PORT ?? "",
      TEST_MODE: "true",
      TEST_API_SECRET,
      ORIGIN: API_BASE_URL,
    },
  });

  return new Promise((resolve, reject) => {
    let settled = false;

    const settle = (fn: () => void) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };

    previewProcess!.on("error", (err) =>
      settle(() => reject(new Error(`Preview server spawn failed: ${err.message}`))),
    );

    previewProcess!.on("close", (code) => {
      settle(() => reject(new Error(`Preview server exited unexpectedly with code ${code}`)));
    });

    waitForServer()
      .then(() => settle(resolve))
      .catch((err) => settle(() => reject(err)));
  });
}

/**
 * Polls until the given TCP port stops accepting connections (i.e. is free).
 * Used after killing the old server to avoid EADDRINUSE on restart.
 */
async function waitForPortFree(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      // A successful fetch means the port is still occupied.
      await fetch(`http://${HOST}:${port}/`, { signal: AbortSignal.timeout(500) });
      await sleep(200);
    } catch {
      // Fetch failed — port is free.
      return;
    }
  }
  // Timed out but proceed anyway — the new server will fail with EADDRINUSE
  // if the port truly isn't free, which is a clearer error than a timeout here.
  console.warn(`⚠️  Port ${port} did not free within ${timeoutMs}ms. Proceeding anyway.`);
}

/**
 * Polls the health endpoint until the server reports an actionable state.
 *
 * We require an explicit application-level status, not just HTTP reachability,
 * because a 503 during INITIALIZING is not ready for test setup actions.
 */
async function waitForServer(): Promise<void> {
  const maxAttempts = process.env.CI === "true" ? 120 : 60;
  const ACCEPTABLE = new Set(["READY", "SETUP", "DEGRADED", "WARMING", "WARMED"]);

  console.log(`⏳ Waiting for server at ${API_BASE_URL}/api/system/health…`);

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/system/health`, {
        signal: AbortSignal.timeout(5_000),
      });
      const data = await res.json().catch(() => null);
      const status: string = data?.overallStatus ?? "";

      if (ACCEPTABLE.has(status)) {
        console.log(`✅ Server ready (state: ${status}).`);
        return;
      }

      if (i % 10 === 0) {
        console.log(`   Attempt ${i}: status="${status || `HTTP ${res.status}`}"…`);
      }
    } catch (err) {
      if (i % 10 === 0) {
        console.log(`   Attempt ${i}: not yet reachable (${(err as Error).message})…`);
      }
    }
    await sleep(1_000);
  }

  throw new Error(`Server did not reach a ready state within ${maxAttempts}s.`);
}

// ---------------------------------------------------------------------------
// Test API (reset / seed)
// ---------------------------------------------------------------------------

/**
 * Invokes /api/testing with exponential backoff.
 * Returns false only after all retries are exhausted — never throws.
 */
async function invokeTestApi(action: "reset" | "seed"): Promise<boolean> {
  const maxAttempts = 5;
  const baseMs = 500;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/testing`, {
        method: "POST",
        body: JSON.stringify({ action }),
        headers: {
          "Content-Type": "application/json",
          "x-test-secret": TEST_API_SECRET || "",
          Origin: API_BASE_URL || "",
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (res.ok) return true;

      const body = await res.text().catch(() => "(unreadable)");
      console.warn(
        `⚠️  ${action} attempt ${attempt}/${maxAttempts}: ` +
          `HTTP ${res.status} — ${body.slice(0, 200)}`,
      );
    } catch (err) {
      console.warn(`⚠️  ${action} attempt ${attempt}/${maxAttempts}: ${(err as Error).message}`);
    }

    if (attempt < maxAttempts) {
      // Exponential backoff capped at 10s, with jitter.
      const delay = Math.min(baseMs * 2 ** (attempt - 1), 10_000) * (0.5 + Math.random() * 0.5);
      await sleep(delay);
    }
  }

  console.error(`❌ ${action} failed after ${maxAttempts} attempts.`);
  return false;
}

// ---------------------------------------------------------------------------
// Test discovery and execution
// ---------------------------------------------------------------------------

function findTestFiles(dir: string, list: string[] = []): string[] {
  if (!existsSync(dir)) return list;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      findTestFiles(fullPath, list);
    } else if (
      entry.name.endsWith(".test.ts") &&
      !EXCLUDED_TEST_PATTERNS.some((pat) => entry.name.includes(pat))
    ) {
      list.push(fullPath);
    }
  }

  return list;
}

function filterByDb(files: string[], dbFilter: string): string[] {
  const ALL_DB_ADAPTERS = ["mongodb", "mariadb", "postgresql", "sqlite"];
  const others = ALL_DB_ADAPTERS.filter((db) => db !== dbFilter.toLowerCase());

  return files.filter((file) => {
    const lower = file.toLowerCase();
    return !others.some(
      (other) => lower.includes(`${other}-adapter`) || lower.includes(`${other}.test`),
    );
  });
}

async function runTestFile(file: string): Promise<number> {
  const { code } = await runCommand(pkgManager, ["test", file], {
    env: {
      ...process.env,
      API_BASE_URL: API_BASE_URL || "http://localhost:4173",
      TEST_API_SECRET: TEST_API_SECRET || "",
    },
  });
  return code;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface TestResult {
  file: string;
  success: boolean;
  code: number;
}

async function main(): Promise<void> {
  console.log("🚀 Starting Black-Box Integration Suite…");

  // 1. Build check.
  if (!cli.skipBuild) {
    if (requiresRebuild()) {
      console.log("🏗️  src/ has changes — rebuilding…");
      const { code } = await runCommand(pkgManager, ["run", "build"]);
      if (code !== 0) throw new Error("Build failed. Aborting.");
    } else {
      console.log("✅ Build is current — skipping rebuild.");
    }
  }

  // 2. Clean stale test config.
  const privateTestPath = join(rootDir, "config", "private.test.ts");
  if (existsSync(privateTestPath)) {
    console.log("🧹 Removing stale private.test.ts…");
    unlinkSync(privateTestPath);
  }

  // 3. Start server in setup mode.
  console.log("📦 Starting preview server for initial setup…");
  await startPreviewServer();

  // 4. Run system setup.
  const dbType = process.env.DB_TYPE ?? "sqlite";
  // SQLite is file-based: using "." as host avoids creating a "127.0.0.1/"
  // directory in the project root.
  const dbHost = dbType === "sqlite" ? "." : (process.env.DB_HOST ?? HOST);

  console.log(`⚙️  Running system setup (DB: ${dbType})…`);
  const { code: setupCode } = await runCommand(pkgManager, ["run", "scripts/setup-system.ts"], {
    env: {
      DB_TYPE: dbType,
      DB_HOST: dbHost,
      DB_NAME: process.env.DB_NAME ?? "sveltycms_test",
      DB_USER: process.env.DB_USER ?? "",
      DB_PASSWORD: process.env.DB_PASSWORD ?? "",
      DB_PORT: process.env.DB_PORT ?? "",
      TEST_MODE: "true",
      API_BASE_URL: API_BASE_URL || "",
      TEST_API_SECRET: TEST_API_SECRET || "",
    },
  });
  if (setupCode !== 0) throw new Error("System setup failed — cannot proceed.");
  console.log("✅ System configured.");

  // 5. Restart server to pick up new config.
  console.log("🔄 Restarting server to apply new configuration…");
  await startPreviewServer(dbHost);
  console.log("✅ Server restarted.");

  // 6. Discover test files.
  let filesToRun =
    cli.explicitFiles.length > 0
      ? cli.explicitFiles
      : findTestFiles(join(rootDir, "tests/integration"));

  if (cli.dbFilter) {
    console.log(`🔍 Filtering to DB adapter: ${cli.dbFilter}`);
    filesToRun = filterByDb(filesToRun, cli.dbFilter);
  }

  if (filesToRun.length === 0) {
    console.warn("⚠️  No test files matched. Check your --filter or test directory.");
    return;
  }

  console.log(`🧪 Running ${filesToRun.length} test file(s) sequentially…`);

  // 7. Run tests.
  const results: TestResult[] = [];

  for (const file of filesToRun) {
    const relPath = relative(rootDir, file);
    console.log(`\n▶️  ${relPath}`);

    const resetOk = await invokeTestApi("reset");
    const seedOk = resetOk && (await invokeTestApi("seed"));

    if (!seedOk) {
      console.error(`❌ reset/seed failed for ${relPath}. Marking as failed and continuing.`);
      results.push({ file: relPath, success: false, code: -1 });
      // Continue to the next test rather than aborting — other tests may still
      // be runnable and a full suite result is more useful than a partial one.
      continue;
    }

    const code = await runTestFile(file);
    const success = code === 0;
    results.push({ file: relPath, success, code });

    if (success) {
      console.log(`✅ Passed: ${relPath}`);
    } else {
      console.error(`❌ Failed: ${relPath} (exit code ${code})`);
    }
  }

  // 8. Summary.
  const passed = results.filter((r) => r.success).length;
  const failed = results.length - passed;

  console.log("\n────────────────────────────────────────");
  console.log(`🏁 Results: ${passed} passed, ${failed} failed, ${results.length} total`);

  if (failed > 0) {
    console.log("\nFailed tests:");
    results
      .filter((r) => !r.success)
      .forEach((r) => console.log(`  ✗ ${r.file} (code: ${r.code})`));
  } else {
    console.log("\n✅ All integration tests passed.");
  }

  clearTimeout(globalTimeout);
  await teardown();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error("\n❌ Runner error:", err instanceof Error ? err.message : err);
  await teardown();
  process.exit(1);
});
