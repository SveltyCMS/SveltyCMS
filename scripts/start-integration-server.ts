#!/usr/bin/env bun
/**
 * @file scripts/start-integration-server.ts
 * @description Starts the integration test preview server in the background with
 *   health-check polling, singleton detection, and hot-reload awareness.
 *
 * Prefer `bun run scripts/run-integration.ts` for a full orchestrated run.
 * Use this when you need a long-lived server for manual `bun test tests/integration/`.
 *
 *   bun run scripts/start-integration-server.ts
 *   bun run scripts/start-integration-server.ts --force    # kill existing + restart
 *   bun test tests/integration/
 *
 * On Windows, bun test cannot reliably spawn child processes, so the server
 * must be started separately (or via run-integration.ts).
 */

import { spawn, execSync } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { join } from "node:path";
import * as v from "valibot";
import {
  buildIntegrationServerEnv,
  cleanSqliteTestFiles,
  createIntegrationContext,
  ensurePortAvailable,
  writePrivateTestConfig,
} from "./integration-harness.ts";

const ROOT = join(import.meta.dirname, "..");
const entryPoint = join(ROOT, "build", "index.js");

// ─── CLI Schema ─────────────────────────────────────────────────────────────

const CliArgsSchema = v.object({
  force: v.optional(v.boolean(), false),
});

type CliArgs = v.InferOutput<typeof CliArgsSchema>;

function parseArgs(): CliArgs {
  const force = process.argv.includes("--force");
  const result = v.safeParse(CliArgsSchema, { force });
  if (!result.success) {
    for (const issue of result.issues) console.error(`  ❌ ${issue.message}`);
    process.exit(2);
  }
  return result.output;
}

// ─── Singleton Detection ────────────────────────────────────────────────────

async function isServerAlreadyRunning(apiBaseUrl: string, testSecret: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/system/health`, {
      signal: AbortSignal.timeout(3000),
      headers: { "x-test-mode": "true", "x-test-secret": testSecret },
    });
    return res.ok;
  } catch {
    return false;
  }
}

function findExistingServerPid(port: string): number | null {
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, {
      encoding: "utf8",
      cwd: ROOT,
      timeout: 5000,
    });
    for (const line of out.trim().split(/\r?\n/)) {
      if (line.includes("LISTENING")) {
        const pid = parseInt(line.trim().split(/\s+/).pop() ?? "", 10);
        if (!Number.isNaN(pid) && pid > 0) return pid;
      }
    }
  } catch {
    /* ok */
  }
  return null;
}

function killPid(pid: number): void {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    try {
      execSync(`taskkill /F /PID ${pid}`, { timeout: 5000 });
    } catch {
      /* ok */
    }
  }
}

// ─── Health Check Polling ───────────────────────────────────────────────────

async function pollUntilReady(
  apiBaseUrl: string,
  testSecret: string,
  maxAttempts = 30,
): Promise<boolean> {
  console.log("⏳ Waiting for server...");
  const start = Date.now();

  for (let i = 1; i <= maxAttempts; i++) {
    if (await isServerAlreadyRunning(apiBaseUrl, testSecret)) {
      console.log(`   ✅ Ready after ${((Date.now() - start) / 1000).toFixed(1)}s`);
      return true;
    }
    if (i % 5 === 0) {
      process.stderr.write(
        `\r   ...${((Date.now() - start) / 1000).toFixed(0)}s elapsed (attempt ${i}/${maxAttempts})`,
      );
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();
  const ctx = createIntegrationContext(ROOT);
  const { port, apiBaseUrl, secrets } = ctx;

  if (!existsSync(entryPoint)) {
    console.error("❌ Build not found. Run: bun run scripts/run-integration.ts");
    process.exit(1);
  }

  // ── Singleton ───────────────────────────────────────────────────────────
  if (await isServerAlreadyRunning(apiBaseUrl, secrets.testApiSecret)) {
    if (args.force) {
      console.log(`⚠️  Server already running on :${port}. Killing...`);
      const pid = findExistingServerPid(port);
      if (pid) killPid(pid);
      await new Promise((r) => setTimeout(r, 1500));
      if (await isServerAlreadyRunning(apiBaseUrl, secrets.testApiSecret)) {
        console.error(`❌ Could not kill existing server on :${port}`);
        process.exit(1);
      }
      console.log("   ✅ Old server stopped.");
    } else {
      console.log(`✅ Server already running on :${port} (use --force to restart)`);
      process.exit(0);
    }
  }

  // ── Setup ───────────────────────────────────────────────────────────────
  writePrivateTestConfig(ctx);
  cleanSqliteTestFiles(ctx.root, ctx.dbType, ctx.dbName);

  try {
    await ensurePortAvailable(port, apiBaseUrl);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  // ── Start ───────────────────────────────────────────────────────────────
  const env = buildIntegrationServerEnv(ctx);
  console.log(`🚀 Starting server on port ${port} (DB_TYPE=${ctx.dbType})...`);

  const server = spawn("node", [entryPoint], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    shell: false,
  });
  server.unref();

  const logStream = createWriteStream("preview.log", { flags: "a" });
  server.stdout?.pipe(logStream);
  server.stderr?.pipe(logStream);

  // ── Health check ────────────────────────────────────────────────────────
  if (await pollUntilReady(apiBaseUrl, secrets.testApiSecret)) {
    console.log(`   Detached pid=${server.pid} — logs: preview.log`);
    process.exit(0);
  }
  console.error("❌ Server not ready. Check preview.log");
  try {
    if (server.pid) process.kill(server.pid, "SIGTERM");
  } catch {
    /* ok */
  }
  process.exit(1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
