/**
 * @file scripts/security/auth.ts
 * @description Authenticated security audit engine.
 *
 * Starts the production build in TEST_MODE, seeds admin credentials,
 * and runs the OWASP scanner with --auth. Uses `node build/index.js`
 * (not `vite dev`) for production-accurate results.
 *
 * Usage:
 *   bun run scripts/security/auth.ts
 *   bun run scripts/security/auth.ts -- --ci
 *   PORT=4174 bun run scripts/security/auth.ts
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const PORT = process.env.AUDIT_PORT || "4173";
const BASE = `http://127.0.0.1:${PORT}`;
const HEALTH_PATH = "/api/system/health";

export interface AuthAuditOptions {
  extraFlags?: string[];
}

function resolveTestSecret(): string {
  if (process.env.TEST_API_SECRET) return process.env.TEST_API_SECRET;
  const secretPath = join(ROOT, "tests", "e2e", ".auth", "test-secret.txt");
  if (existsSync(secretPath)) return readFileSync(secretPath, "utf8").trim();
  return "SVELTYCMS_TEST_SECRET_2026";
}

async function waitForServer(secret: string, timeoutMs = 60_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${BASE}${HEALTH_PATH}`, {
        headers: { "x-test-mode": "true", "x-test-secret": secret },
        signal: AbortSignal.timeout(3000),
      });
      const data = await res.json().catch(() => ({}));
      const payload = data?.data && typeof data.data === "object" ? data.data : data;
      const state = (payload.overallStatus || payload.status || "").toUpperCase();
      // Accept READY or SETUP (seed will follow)
      if (state === "READY" || state === "SETUP" || state === "INITIALIZING") {
        console.log(`✅ Server ready (${state}) at ${BASE} — ${Date.now() - started}ms`);
        return;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for server at ${BASE}`);
}

async function seedServer(secret: string): Promise<void> {
  console.log("  Seeding admin user...");
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch(`${BASE}/api/testing`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-mode": "true",
          "x-test-secret": secret,
        },
        body: JSON.stringify({
          action: "seed",
          email: "admin@example.com",
          password: "Password123!",
        }),
      });
      if (res.ok) {
        console.log("  ✅ Admin seeded");
        return;
      }
      const text = await res.text();
      console.log(`  ⏳ Seed attempt ${i + 1}: ${res.status} — ${text.slice(0, 100)}`);
    } catch (err: any) {
      console.log(`  ⏳ Seed attempt ${i + 1} crashed: ${err.message?.slice(0, 100)}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Failed to seed admin after 10 attempts");
}

export async function runAuthAudit(options: AuthAuditOptions = {}): Promise<number> {
  const testSecret = resolveTestSecret();
  const extraFlags = options.extraFlags ?? [];
  const entryPoint = join(ROOT, "build", "index.js");

  if (!existsSync(entryPoint)) {
    console.log("  Build not found. Running build first...");
    const build = spawn("bun", ["run", "build"], {
      stdio: "inherit",
      shell: process.platform === "win32",
      cwd: ROOT,
    });
    await new Promise<void>((resolve, reject) => {
      build.on("close", (code) => (code === 0 ? resolve() : reject(new Error("Build failed"))));
      build.on("error", reject);
    });
  }

  console.log(`  Starting server on port ${PORT}...`);
  const server: ChildProcess = spawn("node", [entryPoint], {
    env: {
      ...process.env,
      PORT,
      NODE_ENV: "production",
      TEST_MODE: "true",
      TEST_API_SECRET: testSecret,
      JWT_SECRET_KEY: process.env.JWT_SECRET_KEY || "Integration-Test-JWT-Secret-Key-2026",
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || "Integration-Encryption-Key-2026-32ch",
      ORIGIN: BASE,
    },
    stdio: "pipe",
    shell: process.platform === "win32",
    cwd: ROOT,
  });

  // Capture logs for diagnostics
  server.stdout?.on("data", (d: Buffer) => process.stdout.write(d));
  server.stderr?.on("data", (d: Buffer) => process.stderr.write(d));

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
  process.on("SIGTERM", () => {
    killServer();
    process.exit(143);
  });

  let auditExit = 1;
  try {
    await waitForServer(testSecret);
    await seedServer(testSecret);

    auditExit = await new Promise<number>((resolve, reject) => {
      const scanner = spawn(
        "bun",
        ["run", "scripts/security/scanner.ts", "--auth", `--base=${BASE}`, ...extraFlags],
        {
          env: { ...process.env, TEST_API_SECRET: testSecret, TEST_MODE: "true" },
          stdio: "inherit",
          shell: process.platform === "win32",
          cwd: ROOT,
        },
      );
      scanner.on("error", reject);
      scanner.on("close", (code) => resolve(code ?? 1));
    });
  } finally {
    killServer();
    await new Promise((r) => setTimeout(r, 1000));
  }

  return auditExit;
}

// CLI entry
if (import.meta.main) {
  const extraFlags = process.argv.slice(2).filter((a) => a !== "--");
  runAuthAudit({ extraFlags }).then((code) => process.exit(code));
}
