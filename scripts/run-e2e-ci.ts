/**
 * @file scripts/run-e2e-ci.ts
 * @description CI-parity E2E runner — mirrors GitHub Actions e2e + e2e-prep jobs.
 *
 * Unlike `bun run test:e2e` (dev server, port 5173), this script:
 * 1. Builds with COMPILE_ALL_ADAPTERS=true (testing handler stays in build)
 * 2. Starts the adapter-node preview server on port 4173 with TEST_MODE=true
 * 3. Runs wizard → firstuser → auth-setup sequentially (seeds system + auth state)
 * 4. Runs the chromium project tests
 * 5. Stops the server
 *
 * Usage:
 *   bun run scripts/run-e2e-ci.ts                    # full run (build + all tests)
 *   bun run scripts/run-e2e-ci.ts --no-build         # skip build, reuse existing
 *   bun run scripts/run-e2e-ci.ts --grep="Unified"   # filter tests
 *   bun run scripts/run-e2e-ci.ts --project=chromium --grep="access"
 */

import { spawn } from "node:child_process";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const PORT = "4173";
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CI_ENV = {
  ...process.env,
  TEST_MODE: "true",
  SKIP_TEST_CLEANUP: "true",
  ADMIN_PASSWORD: "Password123!",
  PASSWORD_MIN_LENGTH: "8",
  HOST: "127.0.0.1",
  PORT,
  ORIGIN: BASE_URL,
  PLAYWRIGHT_TEST_BASE_URL: BASE_URL,
  DB_TYPE: "sqlite",
  DB_HOST: "127.0.0.1",
  DB_NAME: "e2e_ci_test",
  DB_USER: "",
  DB_PASSWORD: "",
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServer(url: string, timeoutMs = 120_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url + "/api/system/health");
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await sleep(500);
  }
  throw new Error(`Server did not become ready within ${timeoutMs}ms at ${url}`);
}

async function runCmd(cmd: string, args: string[], env: Record<string, string>): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd: ROOT,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: { ...process.env, ...env },
    });
    proc.on("close", (code) => resolve(code ?? 1));
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const skipBuild = argv.includes("--no-build");
  const grepIdx = argv.indexOf("--grep");
  const grep = grepIdx !== -1 ? argv[grepIdx + 1] : "";
  const extraArgs = argv.filter((a) => a !== "--no-build" && a !== "--grep" && a !== grep);

  if (!skipBuild) {
    console.log("Building with COMPILE_ALL_ADAPTERS=true...");
    const buildCode = await runCmd("bun", ["run", "build"], {
      COMPILE_ALL_ADAPTERS: "true",
    });
    if (buildCode !== 0) {
      console.error("Build failed");
      process.exit(1);
    }
    console.log("Build complete.");
  }

  // Start preview server
  console.log(`\nStarting preview server on ${BASE_URL}...`);
  const entryPoint = join(ROOT, "build", "index.js");
  const server = spawn("node", [entryPoint], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    env: CI_ENV,
  });

  server.stdout?.on("data", (d: Buffer) => process.stdout.write(`[server] ${d}`));
  server.stderr?.on("data", (d: Buffer) => process.stderr.write(`[server:err] ${d}`));

  const cleanup = () => {
    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        server.kill("SIGTERM");
      }
    } catch {
      /* ok */
    }
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });

  try {
    await waitForServer(BASE_URL);
    console.log("Server ready.\n");

    // Phase 1: Setup (wizard → firstuser → auth-setup)
    console.log("--- Phase 1: Wizard + First User + Auth Setup ---");
    const setupCode = await runCmd(
      "bun",
      [
        "x",
        "playwright",
        "test",
        "--project=wizard",
        "--project=firstuser",
        "--project=auth-setup",
      ],
      CI_ENV,
    );
    if (setupCode !== 0) {
      console.error("Setup phase failed. Fix before running main tests.");
      process.exit(1);
    }

    // Phase 2: Main tests
    console.log("\n--- Phase 2: Chromium E2E Tests ---");
    const pwArgs = ["x", "playwright", "test", "--project=chromium"];
    if (grep) pwArgs.push("--grep", grep);
    pwArgs.push(...extraArgs);

    // Skip deps since we already ran them
    const mainEnv = { ...CI_ENV, SKIP_E2E_DEPS: "true" };
    const mainCode = await runCmd("bun", pwArgs, mainEnv);

    if (mainCode !== 0) {
      console.error("\nSome E2E tests failed. Check output above.");
      process.exit(1);
    }

    console.log("\nAll E2E tests passed.");
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error("E2E CI runner crashed:", err);
  process.exit(1);
});
