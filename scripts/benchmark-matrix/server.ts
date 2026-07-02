/**
 * @file scripts/benchmark-matrix/server.ts
 * @description Minimal server lifecycle for benchmark tests.
 * Uses Node.js to run the production build (uWS native module requires Node).
 * Shows server startup logs via stdio: inherit.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { TEST_API_SECRET } from "./config";

export async function startServer(
  db: any,
  port: number,
  dbName: string,
): Promise<{ stop: () => Promise<void>; coldStartMs: number }> {
  const entryPoint =
    [
      path.join(process.cwd(), "build", "index.js"),
      path.join(process.cwd(), "build", "server", "index.js"),
    ].find((p) => fs.existsSync(p)) || "";
  if (!entryPoint) throw new Error("No build found. Run 'bun run build' first.");

  const env = {
    ...process.env,
    DB_TYPE: db.type,
    DB_HOST: db.host,
    DB_PORT: String(db.port),
    DB_NAME: dbName,
    DB_USER: db.user || "",
    DB_PASSWORD: db.password || "",
    USE_REDIS: db.useRedis ? "true" : "false",
    REDIS_HOST: "127.0.0.1",
    REDIS_PORT: "6379",
    TEST_MODE: "true",
    TEST_API_SECRET,
    PORT: String(port),
    ORIGIN: `http://127.0.0.1:${port}`,
  };

  let stopped = false;
  const proc = spawn("node", [entryPoint], {
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  const startTime = Date.now();
  while (Date.now() - startTime < 60000) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/system/health`, {
        headers: { "x-test-mode": "true", "x-test-secret": TEST_API_SECRET },
        signal: AbortSignal.timeout(2000),
      });
      if (r.ok) break;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  return {
    coldStartMs: Date.now() - startTime,
    stop: async () => {
      if (stopped) return;
      stopped = true;
      try {
        proc.kill("SIGTERM");
        await new Promise((r) => setTimeout(r, 1000));
        proc.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    },
  };
}

export async function runSystemSetup(
  dbConf: any,
  port: number,
  dbName: string,
  overrides: NodeJS.ProcessEnv = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("bun", ["run", "scripts/setup-system.ts"], {
      env: {
        ...process.env,
        ...overrides,
        API_BASE_URL: `http://127.0.0.1:${port}`,
      },
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    proc.on("close", (code) => resolve(code === 0));
  });
}
