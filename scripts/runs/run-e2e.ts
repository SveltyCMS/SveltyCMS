#!/usr/bin/env bun
/**
 * @file scripts/runs/run-e2e.ts
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

import { spawn, spawnSync, execSync, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureIntegrationBuild } from "./integration-harness.ts";

// import.meta.dirname needs Node ≥20.11/Bun — fall back for older runtimes.
const __dirname =
  typeof import.meta.dirname !== "undefined"
    ? import.meta.dirname
    : dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");

/**
 * Resolve the shared test API secret exactly like playwright.config.ts and
 * the benchmark scripts: env → tests/e2e/.auth/test-secret.txt → local default.
 * Both the preview server and the Playwright process must agree on this value
 * or every /api/testing call 401s ("Blocked unauthorized test-worker context").
 */
function resolveTestSecret(): string {
  if (process.env.TEST_API_SECRET) return process.env.TEST_API_SECRET;
  const secretPath = join(ROOT, "tests", "e2e", ".auth", "test-secret.txt");
  if (existsSync(secretPath)) {
    const fromFile = readFileSync(secretPath, "utf8").trim();
    if (fromFile) return fromFile;
  }
  return "SVELTYCMS_TEST_SECRET_2026";
}
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
      // Portable POSIX: BSD xargs (macOS) has no -r flag, so guard with an
      // explicit non-empty PID check instead of `xargs -r`.
      execSync(
        `pids=$(lsof -ti:${port} 2>/dev/null); if [ -n "$pids" ]; then kill -9 $pids 2>/dev/null || true; fi`,
        { stdio: "ignore", shell: "/bin/sh" },
      );
    }
  } catch {
    /* non-fatal */
  }
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

/**
 * Confirm the port is actually released after `freePort`.
 *
 * Stop-Process/lsof are asynchronous at the OS level: without this check the
 * newly spawned preview can die with EADDRINUSE while the readiness probe is
 * happily answered by the STALE server — Playwright then tests an old bundle
 * (the classic "changed UI looks like a product failure" trap).
 */
async function waitForPortFree(port: number, timeoutMs = 5_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await fetch(`http://127.0.0.1:${port}/api/system/health`, {
        signal: AbortSignal.timeout(500),
      });
    } catch {
      return; // connection refused → port is free
    }
    await sleep(150);
  }
  throw new Error(
    `Port ${port} is still accepting connections after cleanup — a stale preview server survived. Kill it and rerun.`,
  );
}

/** Fail fast when the spawned server exits before the readiness probe answers. */
async function waitForServerOrExit(server: ChildProcess, url: string): Promise<void> {
  const exited = new Promise<never>((_, reject) => {
    server.once("exit", (code, signal) => {
      reject(
        new Error(
          `Preview server exited before becoming ready (code ${code}, signal ${signal}). ` +
            `The port is likely held by a stale server; kill it and rerun.`,
        ),
      );
    });
  });
  await Promise.race([waitForServer(url), exited]);
}

/** Remove stale Playwright artifacts so a crashed prior run cannot leak traces/results. */
function cleanRunArtifacts(): void {
  for (const rel of [
    "tests/test-results",
    "tests/playwright-report",
    "tests/playwright-results.json",
  ]) {
    try {
      rmSync(join(ROOT, rel), { recursive: true, force: true });
    } catch {
      /* non-fatal */
    }
  }
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

  try {
    // Local --no-build: auto-rebuild if deploy-stripped OR source is newer than
    // build/. Without the freshness check, `test:e2e:smoke` silently tests a
    // stale bundle (a changed testid/UI can look like a product failure).
    // CI: fail closed (strict) — artifacts must already be current.
    const strict =
      process.env.CI === "true" || process.env.CI === "1" || process.env.CI_STRICT_BUILD === "1";
    const stale = !strict && SKIP_BUILD && buildIsStale(ROOT);
    if (stale) {
      console.log("ℹ️  Source is newer than build/ — rebuilding with COMPILE_ALL_ADAPTERS=true…");
    }
    await ensureIntegrationBuild(ROOT, {
      noBuild: SKIP_BUILD && !stale,
      strictNoBuild: SKIP_BUILD && strict,
    });
    console.log("");
  } catch (err) {
    console.error(`❌ ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

/** Newest mtime under a file/directory (0 when missing). */
function newestMtime(path: string): number {
  let newest = 0;
  try {
    const stat = statSync(path);
    if (!stat.isDirectory()) return stat.mtimeMs;
    for (const name of readdirSync(path)) {
      newest = Math.max(newest, newestMtime(join(path, name)));
    }
  } catch {
    /* missing or unreadable — ignore */
  }
  return newest;
}

/**
 * True when any build input is newer than the production entrypoint.
 * Kept intentionally narrow: only paths that change the runtime bundle.
 */
function buildIsStale(root: string): boolean {
  const entry = join(root, "build", "index.js");
  if (!existsSync(entry)) return true;
  const buildMtime = statSync(entry).mtimeMs;
  const inputs = [
    "src",
    "static",
    "vite.config.ts",
    "svelte.config.js",
    "path-aliases.ts",
    "package.json",
  ];
  return inputs.some((input) => newestMtime(join(root, input)) > buildMtime);
}

async function startDevServer(): Promise<ChildProcess> {
  freePort(PORT);
  await sleep(400);
  const proc = spawn(
    "bun",
    ["x", "vite", "dev", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"],
    {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env: {
        ...process.env,
        TEST_MODE: process.env.TEST_MODE || "true",
        TEST_API_SECRET: resolveTestSecret(),
        // 🛡️ CI-PARITY: without DB_TYPE/DB_NAME/JWT/ENCRYPTION keys, the private
        // config validation fails and the SQLite adapter refuses to boot
        // (fail-closed guard) — and after a wizard reset the re-init gets an
        // empty connection string, leaving the adapter down (worker isolation
        // 503s). Match the e2e-prep CI env exactly.
        DB_TYPE: "sqlite",
        DB_HOST: "127.0.0.1",
        // MUST match the setup wizard's DB_NAME default (setup-wizard.spec.ts
        // fills `#db-name` with env.DB_NAME || "e2e_auth_test") — when the
        // runner env and the wizard-written private.test.ts disagree, the
        // adapter re-init flips the base connection between two files
        // (sveltycms_test.sqlite empty vs e2e_auth_test.sqlite seeded),
        // producing intermittent empty reads (roles=0 → permissions matrix
        // broken, stale sessions, etc.).
        DB_NAME: "e2e_auth_test",
        DB_USER: "",
        DB_PASSWORD: "",
        JWT_SECRET_KEY: "Integration-Test-JWT-Secret-Key-2026",
        ENCRYPTION_KEY: "Integration-Encryption-Key-2026-32ch",
        ADMIN_PASSWORD: "Password123!",
        PASSWORD_MIN_LENGTH: "8",
        PREVIEW_SECRET: "Integration-Preview-Secret-2026",
        // Tests must never be throttled. Configuration only — the limiter still
        // runs and still enforces the configured ceiling.
        RATE_LIMIT_MAX_REQUESTS: "1000000",
        RATE_LIMIT_COMMERCE_MAX_REQUESTS: "1000000",
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
    // Strict setup gate: TEST_MODE relaxes the /setup→/login redirect by
    // design; the wizard project re-enables it so the seeded-ready exit
    // contract is verified locally exactly like CI (setup-wizard.spec.ts).
    STRICT_SETUP_CHECK: "true",
    TEST_API_SECRET: resolveTestSecret(),
    SKIP_TEST_CLEANUP: "true",
    // 🛡️ CI-PARITY SECRETS: privateConfigSchema requires JWT_SECRET_KEY +
    // ENCRYPTION_KEY (≥32 chars). Without them the private config validation
    // fails after a wizard reset → re-init gets an empty connection string →
    // SQLite fail-closed guard → adapter stays down → worker isolation 503s.
    JWT_SECRET_KEY: "Integration-Test-JWT-Secret-Key-2026",
    ENCRYPTION_KEY: "Integration-Encryption-Key-2026-32ch",
    ADMIN_PASSWORD: "Password123!",
    PASSWORD_MIN_LENGTH: "8",
    PREVIEW_SECRET: "E2E-Preview-Secret-2026",
    HOST: "127.0.0.1",
    PORT: String(PORT),
    ORIGIN: BASE_URL,
    PLAYWRIGHT_TEST_BASE_URL: BASE_URL,
    DB_TYPE: "sqlite",
    DB_HOST: "127.0.0.1",
    // MUST match the wizard's DB_NAME default (see startDevServer comment).
    DB_NAME: "e2e_auth_test",
    DB_USER: "",
    DB_PASSWORD: "",
    // Tests must never be throttled. Configuration only — the limiter still
    // runs and still enforces the configured ceiling.
    RATE_LIMIT_MAX_REQUESTS: "1000000",
    RATE_LIMIT_COMMERCE_MAX_REQUESTS: "1000000",
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

/**
 * Synchronous process cleanup — safe inside the 'exit' event (and SIGINT/
 * SIGTERM handlers), where async spawn() is cancelled before it can run.
 */
function cleanupSync(proc: ChildProcess | null) {
  if (!proc || !proc.pid) return;
  try {
    if (process.platform === "win32") {
      // /T kills the whole process tree; spawnSync is mandatory here.
      spawnSync("taskkill", ["/PID", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      proc.kill("SIGKILL");
    }
  } catch {
    /* ok */
  }
}

async function main() {
  console.log(`🧪 E2E — ${DEV_MODE ? "Dev mode (Vite :5173)" : "CI mode (preview :4173)"}\n`);

  await buildIfNeeded();

  freePort(PORT);
  await waitForPortFree(PORT);
  cleanRunArtifacts();
  const server = DEV_MODE ? await startDevServer() : await startPreviewServer();

  process.on("exit", () => cleanupSync(server));
  process.on("SIGINT", () => {
    cleanupSync(server);
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    cleanupSync(server);
    process.exit(143);
  });

  try {
    await waitForServerOrExit(server, BASE_URL);
    console.log(`✅ Server ready at ${BASE_URL}\n`);

    if (!DEV_MODE) {
      console.log("--- Phase 1: Wizard + Auth Setup ---");
      // Run projects as SEPARATE invocations exactly like CI (e2e-prep). A single
      // invocation with both projects lets Playwright run wizard and firstuser
      // concurrently — the wizard's resetToSetupMode() leaves the system in SETUP
      // while firstuser's homepage test expects / or /login (race).
      const setupCode = await runCmd("bun", ["x", "playwright", "test", "--project=wizard"], {
        ...process.env,
        PLAYWRIGHT_TEST_BASE_URL: BASE_URL,
        TEST_MODE: "true",
        ORIGIN: BASE_URL,
      } as any);
      if (setupCode !== 0) {
        console.error("Setup phase failed");
        process.exit(1);
      }
      const authCode = await runCmd("bun", ["x", "playwright", "test", "--project=auth-setup"], {
        ...process.env,
        PLAYWRIGHT_TEST_BASE_URL: BASE_URL,
        TEST_MODE: "true",
        ORIGIN: BASE_URL,
      } as any);
      if (authCode !== 0) {
        console.error("Auth setup phase failed");
        process.exit(1);
      }
      if (!process.env.TEST_API_SECRET) {
        // Keep the shared secret file in sync so server-side getTestSecret()
        // and script-based runs agree with the value used for this run.
        const { mkdirSync, writeFileSync } = await import("node:fs");
        const authDir = join(ROOT, "tests", "e2e", ".auth");
        mkdirSync(authDir, { recursive: true });
        writeFileSync(join(authDir, "test-secret.txt"), resolveTestSecret());
      }
      console.log("");
    }

    console.log("--- Phase 2: Chromium E2E Tests ---");
    const pwArgs = ["x", "playwright", "test"];
    if (!DEV_MODE) pwArgs.push("--project=chromium");
    pwArgs.push(...EXTRA_PW_ARGS);
    // CI shards run one worker: the SQLite E2E database is shared, so parallel
    // files race on resets/seeds and produce retried-pass flakes. Match CI
    // locally unless the caller chose a worker count explicitly.
    if (!DEV_MODE && !EXTRA_PW_ARGS.some((arg) => arg.startsWith("--workers"))) {
      pwArgs.push("--workers=1");
    }
    const exitCode = await runCmd("bun", pwArgs, {
      ...process.env,
      PLAYWRIGHT_TEST_BASE_URL: BASE_URL,
      TEST_MODE: "true",
      TEST_API_SECRET: resolveTestSecret(),
      SKIP_E2E_DEPS: DEV_MODE ? "" : "true",
      ORIGIN: BASE_URL,
    } as any);

    if (exitCode !== 0) {
      console.error("\nSome E2E tests failed.");
      process.exit(1);
    }
    console.log("\n✅ All E2E tests passed.");
  } finally {
    cleanupSync(server);
  }
}

main().catch((err) => {
  console.error("E2E runner crashed:", err);
  process.exit(1);
});
