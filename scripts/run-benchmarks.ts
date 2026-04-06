#!/usr/bin/env bun
/**
 * @file scripts/run-benchmarks.ts
 * @description Benchmark Runner for SveltyCMS.
 * Starts a production preview server and runs performance benchmarks against it.
 *
 * ### Flags
 * | Flag              | Description                                            |
 * |-------------------|--------------------------------------------------------|
 * | --no-build        | Skip build check even if src/ is newer than build/     |
 * | --timeout=<ms>    | Global script timeout in ms (default: 300000)          |
 * | <file>            | Benchmark file to run (required)                       |
 *
 * ### Environment
 * | Variable          | Default       | Notes                                  |
 * |-------------------|---------------|----------------------------------------|
 * | HOST              | 127.0.0.1     |                                        |
 * | PORT              | 4173          |                                        |
 * | TEST_API_SECRET   | (required)    | No hardcoded default — CI must supply  |
 * | DB_TYPE           | sqlite        |                                        |
 * | RESULTS_DIR       | benchmark-results | Where to write JSON result files   |
 * | GLOBAL_TIMEOUT_MS | 300000        | 5 min hard ceiling                     |
 */

// NOTE: No imports from ../src — this script must be runnable before the CMS
// is built. Use only Node built-ins and packages from the project's own
// package.json devDependencies.
import { spawn, type ChildProcess } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// picocolors is a devDependency — safe to import without a src/ dependency.
// If it isn't available, fall back to plain strings.
let pc: {
  blue: (s: string) => string;
  green: (s: string) => string;
  red: (s: string) => string;
  yellow: (s: string) => string;
  cyan: (s: string) => string;
  magenta: (s: string) => string;
  dim: (s: string) => string;
  bold: (s: string) => string;
};
try {
  const mod = await import("picocolors");
  pc = (mod as any).default || mod;
} catch {
  const id = (s: string) => s;
  pc = { blue: id, green: id, red: id, yellow: id, cyan: id, magenta: id, dim: id, bold: id };
}

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
const pkgManager = process.env.npm_execpath ?? "bun";

/**
 * TEST_API_SECRET has no hardcoded default — a predictable value in source is
 * effectively no secret. CI must supply it via a secrets manager.
 */
const TEST_API_SECRET = process.env.TEST_API_SECRET;
if (!TEST_API_SECRET) {
  console.error(
    pc.red(
      "❌ TEST_API_SECRET is not set.\n" +
        "   Provide it via environment variable. A hardcoded default is a security risk.",
    ),
  );
  process.exit(1);
}
process.env.TEST_API_SECRET = TEST_API_SECRET;

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseCli() {
  const argv = process.argv.slice(2);
  const flags = argv.filter((a) => a.startsWith("--"));
  const positional = argv.filter((a) => !a.startsWith("--"));

  const timeoutFlag = flags.find((f) => f.startsWith("--timeout="));
  const globalTimeoutMs = timeoutFlag
    ? Number(timeoutFlag.slice(timeoutFlag.indexOf("=") + 1))
    : Number(process.env.GLOBAL_TIMEOUT_MS ?? 300_000);

  return {
    skipBuild: flags.includes("--no-build"),
    benchmarkFile: positional[0] ?? null,
    globalTimeoutMs,
  };
}

const cli = parseCli();

if (!cli.benchmarkFile) {
  console.error(
    pc.red(
      "❌ No benchmark file specified.\n" +
        "   Usage: bun run scripts/run-benchmarks.ts [--no-build] <benchmark-file>",
    ),
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Global timeout
// ---------------------------------------------------------------------------

const globalTimer = setTimeout(() => {
  console.error(pc.red(`\n❌ Global timeout of ${cli.globalTimeoutMs}ms exceeded.`));
  teardown().finally(() => process.exit(1));
}, cli.globalTimeoutMs);
globalTimer.unref();

// ---------------------------------------------------------------------------
// Process lifecycle — single teardown path
// ---------------------------------------------------------------------------

let previewProcess: ChildProcess | null = null;
let serverLogFd: number | null = null;
let isShuttingDown = false;

/**
 * Idempotent teardown. Never calls process.exit() — callers decide exit code.
 */
async function teardown(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(pc.magenta("\n🧹 Cleaning up benchmark environment…"));
  await killPreviewProcess();

  if (serverLogFd !== null) {
    try {
      closeSync(serverLogFd);
    } catch {
      /* already closed */
    }
    serverLogFd = null;
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

    // Force-kill after 5s if SIGTERM is ignored.
    const forceKill = setTimeout(() => {
      try {
        if (process.platform === "win32") {
          spawn("taskkill", ["/F", "/T", "/PID", proc.pid!.toString()], { stdio: "ignore" });
        } else {
          process.kill(-proc.pid!, "SIGKILL");
        }
      } catch {
        /* already gone */
      }
    }, 5_000);
    forceKill.unref();

    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/F", "/T", "/PID", proc.pid.toString()], { stdio: "ignore" });
      } else {
        process.kill(-proc.pid, "SIGTERM");
      }
    } catch {
      proc.kill("SIGTERM");
    }
  });
}

async function handleSignal(signal: NodeJS.Signals, code: number): Promise<never> {
  console.log(`\nReceived ${signal}.`);
  await teardown();
  process.exit(code);
}
process.on("SIGINT", () => handleSignal("SIGINT", 130));
process.on("SIGTERM", () => handleSignal("SIGTERM", 143));

// ---------------------------------------------------------------------------
// runCommand
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
}

function runCommand(command: string, args: string[], opts: RunOpts = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: rootDir,
      shell: process.platform === "win32",
      stdio: opts.capture || opts.silent ? "pipe" : "inherit",
      env: { ...process.env, ...opts.env },
    });

    let stdout = "";
    let stderr = "";
    if (proc.stdout)
      proc.stdout.on("data", (d: Buffer) => {
        stdout += d;
      });
    if (proc.stderr)
      proc.stderr.on("data", (d: Buffer) => {
        stderr += d;
      });

    // Without this, ENOENT hangs the promise indefinitely.
    proc.on("error", (err) => reject(new Error(`Failed to spawn "${command}": ${err.message}`)));

    proc.on("close", (code) =>
      // code is null when the process was killed by a signal — treat as failure.
      resolve({ code: code ?? 1, stdout, stderr }),
    );
  });
}

// ---------------------------------------------------------------------------
// Build check
// ---------------------------------------------------------------------------

/**
 * Shallow mtime check: only inspects direct children of src/, not the full tree.
 * Avoids symlink loops, .svelte-kit churn, and accidental node_modules walks.
 */
function requiresRebuild(): boolean {
  const buildPath = join(rootDir, "build");
  if (!existsSync(buildPath)) return true;

  const buildTime = statSync(buildPath).mtimeMs;
  const srcPath = join(rootDir, "src");

  try {
    for (const entry of readdirSync(srcPath, { withFileTypes: true })) {
      if (statSync(join(srcPath, entry.name)).mtimeMs > buildTime) return true;
    }
  } catch {
    return false;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Config generation
// ---------------------------------------------------------------------------

/**
 * Writes config/private.test.ts with the provided secret.
 *
 * This is deferred to main() so:
 * - CLI is fully parsed first (we know DB_TYPE, etc.)
 * - TEST_API_SECRET is validated before being written to disk
 * - The file is never pre-created at module load time with a stale/wrong value
 */
function writeTestConfig(secret: string): void {
  const configDir = join(rootDir, "config");
  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });

  const dbType = process.env.DB_TYPE ?? "sqlite";
  const dbHost = dbType === "sqlite" ? "." : (process.env.DB_HOST ?? "127.0.0.1");

  const content =
    [
      `// AUTO-GENERATED by run-benchmarks.ts — do not commit`,
      `export const privateEnv = {`,
      `  DB_TYPE: ${JSON.stringify(dbType)},`,
      `  DB_NAME: ${JSON.stringify(process.env.DB_NAME ?? "sveltycms_benchmark.db")},`,
      `  DB_HOST: ${JSON.stringify(dbHost)},`,
      `  DB_PORT: ${JSON.stringify(process.env.DB_PORT ?? "")},`,
      `  DB_USER: ${JSON.stringify(process.env.DB_USER ?? "")},`,
      `  DB_PASSWORD: ${JSON.stringify(process.env.DB_PASSWORD ?? "")},`,
      `  TEST_API_SECRET: ${JSON.stringify(secret)},`,
      `  MULTI_TENANT: false,`,
      `};`,
    ].join("\n") + "\n";

  writeFileSync(join(configDir, "private.test.ts"), content, "utf8");
}

// ---------------------------------------------------------------------------
// Server management
// ---------------------------------------------------------------------------

async function startPreviewServer(): Promise<void> {
  if (previewProcess) {
    console.log(pc.dim("🛑 Stopping existing preview process…"));
    await killPreviewProcess();

    if (serverLogFd !== null) {
      try {
        closeSync(serverLogFd);
      } catch {
        /* ignore */
      }
      serverLogFd = null;
    }

    await waitForPortFree(Number(PORT), 10_000);
  }

  const serverPath = join(rootDir, "build", "index.js");
  if (!existsSync(serverPath)) {
    throw new Error(
      `Server build not found at ${serverPath}. ` +
        `Run 'bun run build' first, or remove --no-build.`,
    );
  }

  console.log(pc.blue(`📦 Spawning preview server (${HOST}:${PORT})…`));

  const logFile = join(rootDir, "benchmark-server.log");
  serverLogFd = openSync(logFile, "a");

  previewProcess = spawn(
    "bun",
    ["run", "preview", "--port", PORT, "--host", HOST, "--strictPort"],
    {
      cwd: rootDir,
      stdio: ["ignore", serverLogFd, serverLogFd],
      detached: process.platform !== "win32",
      shell: process.platform === "win32",
      env: {
        ...process.env,
        NODE_ENV: "production",
        TEST_MODE: "true",
        TEST_API_SECRET,
        PORT,
        HOST,
        ORIGIN: API_BASE_URL,
      },
    },
  );

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

    previewProcess!.on("close", (code) =>
      settle(() => reject(new Error(`Preview server exited prematurely (code ${code})`))),
    );

    waitForServer()
      .then(() => settle(resolve))
      .catch((err) => settle(() => reject(err)));
  });
}

async function waitForPortFree(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://${HOST}:${port}/`, { signal: AbortSignal.timeout(500) });
      await sleep(200); // Port still occupied — keep polling.
    } catch {
      return; // Fetch failed — port is free.
    }
  }
  console.warn(pc.yellow(`⚠️  Port ${port} did not free within ${timeoutMs}ms. Proceeding.`));
}

/**
 * Polls the health endpoint until the server reports an actionable state.
 * 503 alone is NOT sufficient — it fires during INITIALIZING too.
 */
async function waitForServer(): Promise<void> {
  const ACCEPTABLE = new Set(["READY", "SETUP", "DEGRADED", "WARMING", "WARMED"]);
  const maxAttempts = 60;

  console.log(pc.dim(`⏳ Waiting for server at ${API_BASE_URL}/api/system/health…`));

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/system/health`, {
        signal: AbortSignal.timeout(5_000),
      });
      const data = await res.json().catch(() => null);
      const status: string = data?.overallStatus ?? "";

      if (ACCEPTABLE.has(status)) {
        console.log(pc.green(`✅ Server ready (state: ${status}).`));
        return;
      }

      if (i % 10 === 0) {
        console.log(pc.dim(`   Attempt ${i}: status="${status || `HTTP ${res.status}`}"…`));
      }
    } catch (err) {
      if (i % 10 === 0) {
        console.log(pc.dim(`   Attempt ${i}: not reachable (${(err as Error).message})…`));
      }
    }
    await sleep(1_000);
  }

  throw new Error(`Server did not reach a ready state within ${maxAttempts}s.`);
}

// ---------------------------------------------------------------------------
// Benchmark result persistence
// ---------------------------------------------------------------------------

interface BenchmarkMeta {
  file: string;
  timestamp: string;
  durationMs: number;
  exitCode: number;
  dbType: string;
  apiBaseUrl: string;
  nodeVersion: string;
  platform: string;
}

/**
 * Writes a JSON sidecar next to the benchmark results directory.
 * CI pipelines can compare these files across runs for regression detection.
 */
function persistBenchmarkMeta(meta: BenchmarkMeta): void {
  const resultsDir = join(rootDir, process.env.RESULTS_DIR ?? "benchmark-results");
  mkdirSync(resultsDir, { recursive: true });

  const slug = meta.file.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-");
  const outPath = join(resultsDir, `${slug}-${meta.timestamp}.json`);

  writeFileSync(outPath, JSON.stringify(meta, null, 2), "utf8");
  console.log(pc.dim(`📊 Benchmark metadata written to ${outPath}`));
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

async function main(): Promise<void> {
  console.log(pc.bold(pc.cyan("🚀 SveltyCMS Performance Benchmark Suite")));

  // 1. Build check.
  if (!cli.skipBuild) {
    if (requiresRebuild()) {
      console.log(pc.yellow("🏗️ src/ has changes — rebuilding…"));
      const { code } = await runCommand(pkgManager, ["run", "build"]);
      if (code !== 0) throw new Error("Build failed. Aborting benchmarks.");
    } else {
      console.log(pc.green("✅ Build is current — skipping rebuild."));
    }
  }

  // 2. Write config (deferred to here so CLI + secret are validated first).
  console.log(pc.blue("📝 Writing config/private.test.ts for benchmark run…"));
  writeTestConfig(TEST_API_SECRET || "");

  // 3. Start preview server.
  console.log(pc.blue("📦 Starting preview server…"));
  await startPreviewServer();

  // 4. Run system setup.
  const dbType = process.env.DB_TYPE ?? "sqlite";
  const dbHost = dbType === "sqlite" ? "." : (process.env.DB_HOST ?? HOST);

  console.log(pc.blue("⚙️ Running system setup…"));
  const { code: setupCode } = await runCommand(pkgManager, ["run", "scripts/setup-system.ts"], {
    env: {
      DB_TYPE: dbType,
      DB_HOST: dbHost,
      DB_NAME: process.env.DB_NAME ?? "sveltycms_benchmark.db",
      DB_USER: process.env.DB_USER ?? "",
      DB_PASSWORD: process.env.DB_PASSWORD ?? "",
      DB_PORT: process.env.DB_PORT ?? "",
      TEST_MODE: "true",
      API_BASE_URL: API_BASE_URL || "",
      TEST_API_SECRET: TEST_API_SECRET || "",
    },
  });
  if (setupCode !== 0) throw new Error("System setup failed — cannot proceed.");
  console.log(pc.green("✅ System configured."));

  // 5. Restart to pick up new config.
  console.log(pc.blue("🔄 Restarting server with new configuration…"));
  await startPreviewServer();
  console.log(pc.green("✅ Server restarted."));

  // 6. Run the benchmark.
  console.log(pc.bold(pc.magenta(`\n▶️ Running benchmark: ${cli.benchmarkFile}`)));
  const benchStart = Date.now();

  const { code: benchCode } = await runCommand("bun", ["run", cli.benchmarkFile!], {
    env: {
      ...process.env,
      API_BASE_URL: API_BASE_URL || "http://localhost:4173",
      TEST_API_SECRET: TEST_API_SECRET || "",
    },
  });

  const durationMs = Date.now() - benchStart;

  // 7. Persist metadata for CI trend analysis.
  persistBenchmarkMeta({
    file: cli.benchmarkFile!,
    timestamp: new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19),
    durationMs,
    exitCode: benchCode,
    dbType,
    apiBaseUrl: API_BASE_URL,
    nodeVersion: process.version,
    platform: process.platform,
  });

  if (benchCode !== 0) {
    console.error(pc.red(`\n❌ Benchmark exited with code ${benchCode}.`));
  } else {
    console.log(pc.green(`\n✅ Benchmark complete (${durationMs}ms).`));
  }

  clearTimeout(globalTimer);
  await teardown();
  process.exit(benchCode);
}

main().catch(async (err) => {
  console.error(pc.red("\n❌ Runner error:"), err instanceof Error ? err.message : err);
  await teardown();
  process.exit(1);
});
