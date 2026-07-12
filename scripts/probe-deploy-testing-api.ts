#!/usr/bin/env bun
/**
 * @file scripts/probe-deploy-testing-api.ts
 * @description
 * CI/local gate: deploy-safe build + artifact scan + live /api/testing A01 probe.
 *
 * Ensures a normal `bun run build` (no COMPILE_ALL_ADAPTERS) strips the testing
 * backdoor and rejects unauthenticated probes at runtime.
 *
 * Usage:
 *   bun run scripts/probe-deploy-testing-api.ts
 *   bun run scripts/probe-deploy-testing-api.ts --skip-build   # reuse existing build/
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const PORT = process.env.PROBE_PORT || "4175";
const BASE = `http://127.0.0.1:${PORT}`;
const SKIP_BUILD = process.argv.includes("--skip-build");

function run(cmd: string, args: string[], env: Record<string, string> = {}): number {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...env },
  });
  return result.status ?? 1;
}

function ensureProbeConfig(): void {
  const configDir = join(ROOT, "config");
  const privatePath = join(configDir, "private.ts");
  if (existsSync(privatePath)) return;

  mkdirSync(configDir, { recursive: true });
  mkdirSync(join(configDir, "database"), { recursive: true });

  writeFileSync(
    privatePath,
    `export const privateEnv = {
  DB_TYPE: "sqlite",
  DB_HOST: "127.0.0.1",
  DB_PORT: "",
  DB_NAME: "sveltycms_probe",
  DB_USER: "",
  DB_PASSWORD: "",
  JWT_SECRET_KEY: "Probe-JWT-Secret-Key-2026-32chars!",
  ENCRYPTION_KEY: "Probe-Encryption-Key-2026-32ch!",
  MULTI_TENANT: false,
  DEMO: false,
};
export const privateConfig = privateEnv;
export default privateEnv;
`,
  );
}

async function waitForPort(timeoutMs = 120_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/system/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for deploy preview at ${BASE}`);
}

function startPreview(): ChildProcess {
  return spawn("node", ["build/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT,
      ORIGIN: BASE,
      HOST_PROD: BASE,
      NODE_ENV: "production",
    },
    stdio: "pipe",
    shell: process.platform === "win32",
  });
}

async function main(): Promise<void> {
  console.log("\n🚪 Deploy /api/testing Backdoor Probe (A01)\n");

  if (!SKIP_BUILD) {
    console.log("  Building deploy-safe artifact (no COMPILE_ALL_ADAPTERS)...");
    if (run("bun", ["run", "build"]) !== 0) {
      process.exit(1);
    }
  } else if (!existsSync(join(ROOT, "build", "index.js"))) {
    console.error("❌ build/index.js missing. Remove --skip-build or run bun run build first.");
    process.exit(1);
  }

  console.log("  Scanning build chunks (deploy mode)...");
  if (run("bun", ["run", "scripts/verify-prod-build-backdoor.ts", "--mode=deploy"]) !== 0) {
    process.exit(1);
  }

  ensureProbeConfig();

  console.log(`  Starting deploy preview on ${BASE}...`);
  const server = startPreview();

  const killServer = () => {
    if (server.killed) return;
    try {
      server.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  };

  process.on("SIGINT", () => {
    killServer();
    process.exit(130);
  });

  let exitCode = 1;
  try {
    await waitForPort();
    console.log("  Live A01 probe (/api/testing must be 401/403/404)...");
    exitCode = run("bun", [
      "run",
      "scripts/security-audit.ts",
      `--base=${BASE}`,
      "--only=backdoor",
      "--ci",
    ]);
  } catch (err) {
    console.error("❌ Deploy preview probe failed:", err);
    exitCode = 1;
  } finally {
    killServer();
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (exitCode === 0) {
    console.log("\n✅ Deploy backdoor probe passed (build strip + live rejection)\n");
  }
  process.exit(exitCode);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
