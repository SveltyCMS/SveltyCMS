#!/usr/bin/env bun
/**
 * @file scripts/run-benchmarks.ts
 * @description Benchmark Runner for SveltyCMS.
 * Starts a production server and runs performance benchmarks against it.
 *
 * STANDARDS:
 * 1. Type Safety: Strict TypeScript.
 * 2. Isolation: Use config/private.test.ts for benchmarks.
 * 3. Process Management: Handle Windows process trees (taskkill /F /T) for cleanups.
 * 4. Metrics: Ensure p95 metrics are captured.
 * 5. Production Parity: Use build/index.js for benchmarks where applicable.
 * 6. Database Credentials: Use empty strings ("") for DB_USER and DB_PASSWORD for all Docker engines.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync, statSync, openSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pc } from "../src/utils/native-utils";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

// ✨ Configuration Constants
const HOST = process.env.HOST || "127.0.0.1";
const PORT = "4173";
const API_BASE_URL = `http://${HOST}:${PORT}`;
const pkgManager = process.env.npm_execpath || "bun";
const TEST_API_SECRET = "test-secret-123456789";

// Ensure config directory exists
const configDir = join(rootDir, "config");
if (!existsSync(configDir)) {
  mkdirSync(configDir, { recursive: true });
}

// Pre-create private.test.ts for SQLite to ensure TEST_MODE boot
const privateTestPath = join(configDir, "private.test.ts");
if (!existsSync(privateTestPath)) {
  console.log(pc.blue("📝 Pre-creating config/private.test.ts for benchmark..."));
  const configContent = `
export const privateEnv = {
  DB_TYPE: "sqlite",
  DB_NAME: "sveltycms_test.db",
  DB_HOST: ".",
  DB_PORT: "",
  DB_USER: "",
  DB_PASSWORD: "",
  TEST_API_SECRET: "${TEST_API_SECRET}",
  MULTI_TENANT: false
};
`;
  writeFileSync(privateTestPath, configContent);
}

let previewProcess: ChildProcess | null = null;

async function cleanup(exitCode: number = 0): Promise<void> {
  console.log(pc.magenta("\n🧹 Cleaning up benchmark environment..."));
  if (previewProcess && previewProcess.pid) {
    console.log(pc.dim(`Terminating process tree for PID ${previewProcess.pid}...`));
    if (process.platform === "win32") {
      spawn("taskkill", ["/F", "/T", "/PID", previewProcess.pid.toString()], {
        stdio: "ignore",
      });
    } else {
      try {
        process.kill(-previewProcess.pid, "SIGTERM");
      } catch {
        previewProcess.kill("SIGTERM");
      }
    }
  }
  process.exit(exitCode);
}

process.on("SIGINT", () => cleanup(130));
process.on("SIGTERM", () => cleanup(143));

async function main(): Promise<void> {
  try {
    console.log(pc.bold(pc.cyan("🚀 Starting SveltyCMS Performance Benchmark Suite...")));

    const args = process.argv.slice(2);
    const benchmarkFile = args.find((arg) => !arg.startsWith("--"));

    if (!benchmarkFile) {
      console.error(
        pc.red("❌ No benchmark file specified. Usage: bun run scripts/run-benchmarks.ts <file>"),
      );
      process.exit(1);
    }

    // 1. Build check (Production Parity)
    if (requiresRebuild()) {
      console.log(pc.yellow("🏗️ Detected changes in src/ or missing build. Rebuilding..."));
      const buildCode = await runCommand(pkgManager, ["run", "build"]);
      if (buildCode !== 0) throw new Error("Build failed. Aborting benchmarks.");
    }

    // 2. Start Preview Server
    console.log(pc.blue("📦 Starting preview server for benchmarks..."));
    await startPreviewServer();

    // 2.1. Run Fast System Setup
    console.log(pc.blue("⚙️ Running Fast System Setup to configure system..."));
    const dbType = process.env.DB_TYPE || "sqlite";
    const originalHost = process.env.DB_HOST || HOST;
    const dbHost = dbType === "sqlite" ? "." : originalHost;

    const setupResult = await runCommand(pkgManager, ["run", "scripts/setup-system.ts"], {
      DB_TYPE: dbType,
      DB_HOST: dbHost,
      TEST_MODE: "true",
      API_BASE_URL,
      TEST_API_SECRET,
    });

    if (setupResult !== 0) throw new Error("Fast setup failed. Cannot proceed.");
    console.log(pc.green("✅ System configured successfully via API."));

    // 2.2. RESTART SERVER to pick up new config/private.test.ts
    console.log(pc.blue("🔄 Restarting preview server to apply new configuration..."));
    await startPreviewServer();

    // 3. Run Benchmark
    console.log(pc.bold(pc.magenta(`\n▶️  [BENCHMARK] ${benchmarkFile}`)));
    // Note: The benchmark should output p95 metrics to stdout
    const code = await runCommand("bun", ["run", benchmarkFile], {
      TEST_MODE: "true",
      API_BASE_URL,
      TEST_API_SECRET,
    });

    await cleanup(code || 0);
  } catch (error) {
    console.error(pc.red("❌ Runner Error:"), error instanceof Error ? error.message : error);
    await cleanup(1);
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
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        if (checkNewer(fullPath)) return true;
      } else if (stat.mtimeMs > buildTime) {
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
      shell: process.platform === "win32",
      env: { ...process.env, ...extraEnv },
    });
    proc.on("close", (code) => resolve(code || 0));
  });
}

async function startPreviewServer(): Promise<void> {
  if (previewProcess && previewProcess.pid) {
    console.log(pc.dim("🛑 Killing existing preview process..."));
    if (process.platform === "win32") {
      spawn("taskkill", ["/F", "/T", "/PID", previewProcess.pid.toString()], {
        stdio: "ignore",
      });
    } else {
      try {
        process.kill(-previewProcess.pid, "SIGTERM");
      } catch {
        previewProcess.kill("SIGTERM");
      }
    }
    await new Promise((r) => setTimeout(r, 3000)); // Wait for OS to release port
  }

  return new Promise<void>((resolve, reject) => {
    const serverPath = join(rootDir, "build", "index.js");
    if (!existsSync(serverPath)) {
      return reject(
        new Error(`Server build not found at ${serverPath}. Run 'bun run build' first.`),
      );
    }

    const logFile = join(rootDir, "benchmark-server.log");
    const out = openSync(logFile, "a");
    previewProcess = spawn("bun", ["run", "preview", "--port", PORT], {
      cwd: rootDir,
      stdio: ["ignore", out, out],
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
    });

    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) reject(new Error("Timeout waiting for preview server health check"));
    }, 60000);

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
      if (!resolved && code !== null) {
        reject(new Error(`Preview process exited prematurely with code ${code}`));
      }
    });
  });
}

async function waitForServer(): Promise<void> {
  console.log(pc.dim(`⏳ Waiting for server health check at ${API_BASE_URL}/api/system/health...`));
  const urls = [`${API_BASE_URL}/api/system/health`, `http://localhost:${PORT}/api/system/health`];

  for (let i = 0; i < 30; i++) {
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (res.ok || res.status === 503) {
          console.log(pc.green(`✅ Server ready (Attempt ${i + 1})`));
          return;
        }
      } catch {
        // Continue waiting
      }
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("Server health check timeout after 30 attempts");
}

main();
