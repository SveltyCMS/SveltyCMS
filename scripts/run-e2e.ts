#!/usr/bin/env bun
/**
 * @file scripts/run-e2e.ts
 * @description Unified E2E runner — CI-parity or dev mode.
 *
 * Default (CI mode): builds with COMPILE_ALL_ADAPTERS=true, starts production
 * preview on :4173, runs wizard → auth-setup → chromium.
 *
 * --dev mode:       starts Vite dev server on :5173, runs Playwright directly.
 *                   Faster for local iteration (no build), but not CI-identical.
 *
 * Usage:
 *   bun run test:e2e                              # CI mode (full run)
 *   bun run test:e2e --dev                        # Vite dev server
 *   bun run test:e2e --no-build                   # reuse existing build
 *   bun run test:e2e --grep="webhooks"            # filter tests
 *   bun run test:e2e --dev --grep="login"         # dev mode + filter
 */

import { spawn, execSync, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const DEV_MODE = args.includes("--dev");
const SKIP_BUILD = args.includes("--no-build");
const PORT = DEV_MODE ? 5173 : 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Strip known script flags so remaining args pass through to Playwright
const EXTRA_PW_ARGS = args.filter((a) => !a.startsWith("--dev") && !a.startsWith("--no-build"));

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function freePort(port: number): void {
  try {
    if (process.platform === "win32") {
      execSync(
        `powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue; foreach ($x in $c) { $o = $x.OwningProcess; if ($o -and $o -ne $PID) { Stop-Process -Id $o -Force -ErrorAction SilentlyContinue } }"`,
        { stdio: "ignore" },
      );
    } else {
      execSync(`lsof -ti:${port} | xargs -r kill -9 || true`, { stdio: "ignore" });
    }
  } catch {
    /* non-fatal */
  }
}

function collectJsFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    try {
      const st = statSync(full);
      if (st.isDirectory()) collectJsFiles(full, out);
      else if (st.isFile() && name.endsWith(".js")) out.push(full);
    } catch {
      /* skip */
    }
  }
  return out;
}

async function waitForServer(url: string, timeoutMs = 120_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url + "/api/system/health", { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await sleep(500);
  }
  throw new Error(`Server did not become ready at ${url} within ${timeoutMs}ms`);
}

async function runCmd(cmd: string, cargs: string[], env: Record<string, string>): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, cargs, {
      cwd: ROOT,
      stdio: "inherit",
      shell: false,
      env: { ...process.env, ...env },
    });
    proc.on("close", (code) => resolve(code ?? 1));
    proc.on("error", (err) => {
      console.error(`Failed to spawn ${cmd}:`, err);
      resolve(1);
    });
  });
}

async function buildIfNeeded(): Promise<void> {
  if (DEV_MODE) return;

  if (!SKIP_BUILD) {
    console.log("Building with COMPILE_ALL_ADAPTERS=true...");
    const code = await runCmd("bun", ["run", "build"], {
      ...process.env,
      COMPILE_ALL_ADAPTERS: "true",
    } as any);
    if (code !== 0) {
      console.error("Build failed");
      process.exit(1);
    }
    console.log("Build complete.\n");
    return;
  }

  // --no-build: verify existing build has the testing harness
  const FULL_MARKERS = ["Unauthorized: Testing endpoints are disabled", "[TestingHandler]"];
  const scanDirs = [
    join(ROOT, "build", "server", "chunks"),
    join(ROOT, ".svelte-kit", "output", "server", "chunks"),
  ];
  const files = scanDirs.flatMap((d) => collectJsFiles(d));
  const hasHarness = files.some((f) => {
    try {
      return FULL_MARKERS.some((m) => readFileSync(f, "utf8").includes(m));
    } catch {
      return false;
    }
  });
  if (!hasHarness) {
    console.error(
      "❌ Existing build is deploy-stripped (no /api/testing). Run without --no-build.",
    );
    process.exit(1);
  }
  console.log("✅ Existing build includes testing harness.\n");
}

async function startDevServer(): Promise<ChildProcess> {
  freePort(PORT);
  await sleep(400);
  const proc = spawn(
    process.platform === "win32" ? "bun.cmd" : "bun",
    ["x", "vite", "dev", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"],
    {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env: {
        ...process.env,
        TEST_MODE: process.env.TEST_MODE || "true",
        TEST_API_SECRET: process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026",
      },
    },
  );
  proc.stdout?.on("data", (d: Buffer) => process.stdout.write(`[vite] ${d}`));
  proc.stderr?.on("data", (d: Buffer) => process.stderr.write(`[vite] ${d}`));
  return proc;
}

async function startPreviewServer(): Promise<ChildProcess> {
  const entry = join(ROOT, "build", "index.js");
  if (!existsSync(entry)) {
    console.error(`❌ Missing ${entry}`);
    process.exit(1);
  }
  const env = {
    ...process.env,
    TEST_MODE: "true",
    TEST_API_SECRET: process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026",
    SKIP_TEST_CLEANUP: "true",
    ADMIN_PASSWORD: "Password123!",
    PASSWORD_MIN_LENGTH: "8",
    HOST: "127.0.0.1",
    PORT: String(PORT),
    ORIGIN: BASE_URL,
    PLAYWRIGHT_TEST_BASE_URL: BASE_URL,
    DB_TYPE: "sqlite",
    DB_HOST: "127.0.0.1",
    DB_NAME: "sveltycms_test",
    DB_USER: "",
    DB_PASSWORD: "",
  } as Record<string, string>;
  const proc = spawn("node", [entry], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    env,
  });
  proc.stdout?.on("data", (d: Buffer) => process.stdout.write(`[server] ${d}`));
  proc.stderr?.on("data", (d: Buffer) => process.stderr.write(`[server] ${d}`));
  return proc;
}

function cleanup(proc: ChildProcess | null) {
  if (!proc) return;
  try {
    if (process.platform === "win32" && proc.pid) {
      spawn("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      proc.kill("SIGTERM");
    }
  } catch {
    /* ok */
  }
}

async function main() {
  console.log(`🧪 E2E — ${DEV_MODE ? "Dev mode (Vite :5173)" : "CI mode (preview :4173)"}\n`);

  await buildIfNeeded();

  freePort(PORT);
  const server = DEV_MODE ? await startDevServer() : await startPreviewServer();

  process.on("exit", () => cleanup(server));
  process.on("SIGINT", () => {
    cleanup(server);
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    cleanup(server);
    process.exit(143);
  });

  try {
    await waitForServer(BASE_URL);
    console.log(`✅ Server ready at ${BASE_URL}\n`);

    if (!DEV_MODE) {
      console.log("--- Phase 1: Wizard + Auth Setup ---");
      const setupCode = await runCmd(
        "bun",
        ["x", "playwright", "test", "--project=wizard", "--project=auth-setup"],
        {
          ...process.env,
          PLAYWRIGHT_TEST_BASE_URL: BASE_URL,
          TEST_MODE: "true",
          ORIGIN: BASE_URL,
        } as any,
      );
      if (setupCode !== 0) {
        console.error("Setup phase failed");
        process.exit(1);
      }
      console.log("");
    }

    console.log("--- Phase 2: Chromium E2E Tests ---");
    const pwArgs = ["x", "playwright", "test"];
    if (!DEV_MODE) pwArgs.push("--project=chromium");
    pwArgs.push(...EXTRA_PW_ARGS);
    const exitCode = await runCmd("bun", pwArgs, {
      ...process.env,
      PLAYWRIGHT_TEST_BASE_URL: BASE_URL,
      TEST_MODE: "true",
      SKIP_E2E_DEPS: DEV_MODE ? "" : "true",
      ORIGIN: BASE_URL,
    } as any);

    if (exitCode !== 0) {
      console.error("\nSome E2E tests failed.");
      process.exit(1);
    }
    console.log("\n✅ All E2E tests passed.");
  } finally {
    cleanup(server);
  }
}

main().catch((err) => {
  console.error("E2E runner crashed:", err);
  process.exit(1);
});
