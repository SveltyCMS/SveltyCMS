/**
 * @file scripts/run-security-audit-auth.ts
 * @description Starts dev server in TEST_MODE and runs authenticated security-audit.ts.
 *
 * The testing API (`/api/testing`) is only available when TEST_MODE=true — not on
 * production preview builds. This script orchestrates the full auth audit locally.
 *
 * Usage:
 *   bun run audit:security:auth
 *   bun run audit:security:auth -- --ci
 *   AUDIT_PORT=5173 TEST_API_SECRET=... bun run audit:security:auth
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const PORT = process.env.AUDIT_PORT || process.env.PORT || "5173";
const BASE = `http://127.0.0.1:${PORT}`;
const HEALTH_PATH = "/api/system/health";

function resolveTestSecret(): string {
  if (process.env.TEST_API_SECRET) return process.env.TEST_API_SECRET;
  const secretPath = join(ROOT, "tests", "e2e", ".auth", "test-secret.txt");
  if (existsSync(secretPath)) return readFileSync(secretPath, "utf8").trim();
  return "SVELTYCMS_TEST_SECRET_2026";
}

async function waitForServer(secret: string, timeoutMs = 120_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${BASE}${HEALTH_PATH}`, {
        headers: { "x-test-mode": "true", "x-test-secret": secret },
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        console.log(`✅ Dev server ready at ${BASE} (${Date.now() - started}ms)`);
        return;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for dev server at ${BASE}`);
}

function spawnProcess(
  command: string,
  args: string[],
  env: Record<string, string | undefined>,
): ChildProcess {
  return spawn(command, args, {
    env: { ...process.env, ...env },
    stdio: "inherit",
    shell: process.platform === "win32",
    cwd: ROOT,
  });
}

async function main(): Promise<void> {
  const testSecret = resolveTestSecret();
  const auditArgs = process.argv.slice(2).filter((a) => a !== "--");
  const extraAuditFlags = auditArgs.length ? auditArgs : [];

  console.log("\n🔐 Authenticated Security Audit Orchestrator");
  console.log(`   Base URL: ${BASE}`);
  console.log(`   TEST_MODE: true`);
  console.log(`   Flags: ${["--auth", ...extraAuditFlags].join(" ") || "--auth"}`);

  const devProc = spawnProcess("bun", ["run", "dev", "--", "--port", PORT, "--host", "127.0.0.1"], {
    TEST_MODE: "true",
    TEST_API_SECRET: testSecret,
    PORT,
    ORIGIN: BASE,
  });

  let auditExit = 1;

  const killDev = () => {
    if (devProc.killed) return;
    try {
      devProc.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  };

  process.on("SIGINT", () => {
    killDev();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    killDev();
    process.exit(143);
  });

  try {
    await waitForServer(testSecret);

    auditExit = await new Promise<number>((resolve, reject) => {
      const auditProc = spawnProcess(
        "bun",
        ["run", "scripts/security-audit.ts", "--auth", `--base=${BASE}`, ...extraAuditFlags],
        { TEST_API_SECRET: testSecret, TEST_MODE: "true" },
      );
      auditProc.on("error", reject);
      auditProc.on("close", (code) => resolve(code ?? 1));
    });
  } finally {
    killDev();
    await new Promise((r) => setTimeout(r, 1500));
  }

  process.exit(auditExit);
}

main().catch((err) => {
  console.error("❌ Authenticated security audit failed:", err);
  process.exit(1);
});
