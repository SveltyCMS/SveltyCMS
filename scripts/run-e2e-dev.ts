#!/usr/bin/env bun
/**
 * @file scripts/run-e2e-dev.ts
 * @description Local E2E against Vite dev server with fixed port (no 5173→5174 race).
 *
 * Problem this solves:
 *   concurrently + `vite dev` + `wait-on :5173` fails when 5173 is already taken —
 *   Vite silently moves to 5174 while wait-on hangs/times out on 5173.
 *
 * Fix:
 *   1. Free port 5173 when possible
 *   2. Start Vite with `--port 5173 --strictPort` (fail loud if still busy)
 *   3. Wait for health
 *   4. Run Playwright with PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:5173
 *
 * Usage:
 *   bun run test:e2e:dev
 *   bun run scripts/run-e2e-dev.ts --grep="webhooks"
 *
 * Prefer `bun run test:e2e` (CI-parity preview :4173) for ship-quality signal.
 */

import { spawn, execSync, type ChildProcess } from "node:child_process";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const PORT = 5173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function freePort(port: number): void {
  try {
    if (process.platform === "win32") {
      execSync(
        `powershell -NoProfile -Command "$conns = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue; foreach ($c in $conns) { $owner = $c.OwningProcess; if ($owner -and $owner -ne $PID) { Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue } }"`,
        { stdio: "ignore" },
      );
    } else {
      execSync(`lsof -ti:${port} | xargs -r kill -9 || true`, { stdio: "ignore" });
    }
  } catch {
    // non-fatal
  }
}

async function waitForServer(url: string, timeoutMs = 90_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url + "/api/system/health", {
        signal: AbortSignal.timeout(2000),
      }).catch(async () => fetch(url, { signal: AbortSignal.timeout(2000) }));
      if (res && (res.ok || res.status === 404 || res.status === 533)) return;
    } catch {
      // not ready
    }
    await sleep(400);
  }
  throw new Error(
    `Vite dev server did not become ready at ${url} within ${timeoutMs}ms.\n` +
      `  Tip: free port ${PORT} or use CI-parity: bun run test:e2e`,
  );
}

function runCmd(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
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
  const extraPwArgs = argv.filter((a) => a !== "--no-free-port");

  console.log(`🧹 Ensuring port ${PORT} is free for Vite (strictPort)...`);
  if (!argv.includes("--no-free-port")) {
    freePort(PORT);
    await sleep(400);
  }

  console.log(`🚀 Starting Vite with --port ${PORT} --strictPort...`);
  let vite: ChildProcess | null = spawn(
    process.platform === "win32" ? "bun.cmd" : "bun",
    ["x", "vite", "dev", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"],
    {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
      env: {
        ...process.env,
        TEST_MODE: process.env.TEST_MODE || "true",
      },
    },
  );

  const log = (buf: Buffer, _prefix: string) => {
    const s = buf.toString();
    if (s.includes("Port is already in use") || s.includes("strictPort")) {
      process.stderr.write(`[vite:err] ${s}`);
    } else {
      process.stdout.write(`[vite] ${s}`);
    }
  };
  vite.stdout?.on("data", (d: Buffer) => log(d, "out"));
  vite.stderr?.on("data", (d: Buffer) => log(d, "err"));

  const cleanup = () => {
    if (!vite) return;
    try {
      if (process.platform === "win32" && vite.pid) {
        spawn("taskkill", ["/PID", String(vite.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        vite.kill("SIGTERM");
      }
    } catch {
      /* ok */
    }
    vite = null;
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });

  try {
    await waitForServer(BASE_URL);
    console.log(`✅ Dev server ready at ${BASE_URL}\n`);

    const env = {
      ...process.env,
      PLAYWRIGHT_TEST_BASE_URL: BASE_URL,
      TEST_MODE: process.env.TEST_MODE || "true",
      ORIGIN: BASE_URL,
    };

    const code = await runCmd(
      "bun",
      ["x", "playwright", "test", ...extraPwArgs],
      env as NodeJS.ProcessEnv,
    );
    process.exit(code);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    cleanup();
  }
}

// Only auto-run when executed as the entry script (not when imported)
const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("run-e2e-dev.ts") || process.argv[1].endsWith("run-e2e-dev"));

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
