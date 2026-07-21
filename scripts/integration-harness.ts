/**
 * @file scripts/integration-harness.ts
 * @description Shared helpers for integration orchestrators (run-integration, start-integration-server).
 *
 * Single source of truth for:
 * - test secrets (TEST_API_SECRET / JWT / ENCRYPTION) so config file and process env never desync
 * - private.test.ts generation
 * - SQLite test DB cleanup
 * - health polling
 * - cautious port reclaim
 * - process-tree teardown
 * - Docker adapter *hints* (not a full multi-DB matrix)
 *
 * ### Features:
 * - stable default secrets matching tests/integration helpers
 * - FORCE_FREE_PORT opt-in for aggressive kill
 * - cross-platform build env via spawn (no `set VAR&&` shell)
 */

import { execSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  getDefaultDbPort,
  getDockerDefaultDbCredentials,
  getIntegrationDbName,
} from "../src/utils/test-db-credentials.ts";

// ── Constants (aligned with tests/integration/helpers/server.ts) ─────────────

/** Stable default — tests fall back to this when env is unset. Never randomize. */
export const DEFAULT_INTEGRATION_TEST_API_SECRET = "SVELTYCMS_TEST_SECRET_2026";
export const DEFAULT_INTEGRATION_JWT = "Integration-Test-JWT-Secret-Key-2026-pad-to-32chars!!";
export const DEFAULT_INTEGRATION_ENCRYPTION = "Integration-Encryption-Key-2026-32ch";
export const DEFAULT_INTEGRATION_ADMIN_PASSWORD = "Password123!";

/** Health states accepted while CMS progressive boot settles. */
export const INTEGRATION_HEALTH_STATES = new Set([
  "ready",
  "healthy",
  "setup",
  "warmed",
  "warming",
  "degraded",
  "initializing",
  "idle",
  "ok",
]);

/** Exact compose names from tests/docker-compose.yml + common image prefixes. */
const DOCKER_ADAPTER_HINTS: Record<string, { containerNames: string[]; imagePrefixes: string[] }> =
  {
    mongodb: {
      containerNames: ["sveltycms-mongodb"],
      imagePrefixes: ["mongo:", "mongodb/mongodb-community-server"],
    },
    postgresql: {
      containerNames: ["sveltycms-postgresql"],
      imagePrefixes: ["postgres:", "postgresql:"],
    },
    mariadb: {
      containerNames: ["sveltycms-mariadb"],
      imagePrefixes: ["mariadb:", "mysql:"],
    },
  };

export interface IntegrationSecrets {
  jwt: string;
  encryption: string;
  testApiSecret: string;
  adminPassword: string;
}

export interface IntegrationRunContext {
  root: string;
  port: string;
  apiBaseUrl: string;
  dbType: string;
  dbName: string;
  secrets: IntegrationSecrets;
}

// ── Secrets (resolve + pin once — never generate twice) ───────────────────────

/**
 * Process-lifetime pin. After the first resolve/pin, every consumer
 * (private.test.ts, preview env, bun test env, health probes) sees the same values.
 * Avoids the historical bug: randomUUID() in writePrivateTestConfig AND again in serverEnv.
 */
let _pinnedSecrets: IntegrationSecrets | null = null;

/** Test-only: clear pin between unit cases. */
export function resetPinnedIntegrationSecrets(): void {
  _pinnedSecrets = null;
}

/**
 * Resolve secrets once per process. Prefer env; fall back to stable defaults
 * shared with integration test helpers (not random UUIDs).
 *
 * Subsequent calls return the same pinned object (by value) unless reset.
 */
export function resolveIntegrationSecrets(
  env: NodeJS.ProcessEnv = process.env,
): IntegrationSecrets {
  if (_pinnedSecrets) {
    return { ..._pinnedSecrets };
  }
  return {
    jwt: env.JWT_SECRET_KEY || DEFAULT_INTEGRATION_JWT,
    encryption: env.ENCRYPTION_KEY || DEFAULT_INTEGRATION_ENCRYPTION,
    testApiSecret: env.TEST_API_SECRET || DEFAULT_INTEGRATION_TEST_API_SECRET,
    adminPassword: env.ADMIN_PASSWORD || DEFAULT_INTEGRATION_ADMIN_PASSWORD,
  };
}

/**
 * Pin secrets onto process.env so parent + all later readers share one source.
 * Idempotent: first call wins for the process (unless resetPinnedIntegrationSecrets).
 */
export function pinIntegrationSecrets(
  secrets?: IntegrationSecrets,
  env: NodeJS.ProcessEnv = process.env,
): IntegrationSecrets {
  if (_pinnedSecrets) {
    // Re-apply pin to env (in case env was wiped) without regenerating values.
    env.JWT_SECRET_KEY = _pinnedSecrets.jwt;
    env.ENCRYPTION_KEY = _pinnedSecrets.encryption;
    env.TEST_API_SECRET = _pinnedSecrets.testApiSecret;
    env.ADMIN_PASSWORD = _pinnedSecrets.adminPassword;
    return { ..._pinnedSecrets };
  }
  const resolved = secrets ?? resolveIntegrationSecrets(env);
  _pinnedSecrets = { ...resolved };
  env.JWT_SECRET_KEY = _pinnedSecrets.jwt;
  env.ENCRYPTION_KEY = _pinnedSecrets.encryption;
  env.TEST_API_SECRET = _pinnedSecrets.testApiSecret;
  env.ADMIN_PASSWORD = _pinnedSecrets.adminPassword;
  return { ..._pinnedSecrets };
}

/** Single accessor for tests / helpers — always the pinned secret after orchestrator start. */
export function getIntegrationTestApiSecret(env: NodeJS.ProcessEnv = process.env): string {
  if (_pinnedSecrets) return _pinnedSecrets.testApiSecret;
  return env.TEST_API_SECRET || DEFAULT_INTEGRATION_TEST_API_SECRET;
}

// ── Config ────────────────────────────────────────────────────────────────────

export function writePrivateTestConfig(ctx: IntegrationRunContext): void {
  const { root, apiBaseUrl, dbType, dbName, secrets } = ctx;
  const creds = getDockerDefaultDbCredentials(dbType);
  const dbPort = getDefaultDbPort(dbType);
  const configDir = join(root, "config");
  mkdirSync(configDir, { recursive: true });
  mkdirSync(join(root, "config", "test-database"), { recursive: true });
  mkdirSync(join(root, "config", "test-collections"), { recursive: true });

  const content = `/**
 * @file config/private.test.ts
 * @description Auto-generated by integration harness — do not edit by hand.
 */
export const privateEnv = {
  DB_TYPE: ${JSON.stringify(dbType)},
  DB_HOST: ${JSON.stringify(process.env.DB_HOST || "127.0.0.1")},
  DB_PORT: ${dbPort ? Number(dbPort) : "undefined"},
  DB_NAME: ${JSON.stringify(dbName)},
  DB_USER: ${JSON.stringify(process.env.DB_USER ?? creds.user)},
  DB_PASSWORD: ${JSON.stringify(process.env.DB_PASSWORD ?? creds.password)},
  JWT_SECRET_KEY: ${JSON.stringify(secrets.jwt)},
  ENCRYPTION_KEY: ${JSON.stringify(secrets.encryption)},
  TEST_API_SECRET: ${JSON.stringify(secrets.testApiSecret)},
  PASSWORD_MIN_LENGTH: 8,
  USE_REDIS: false,
  MULTI_TENANT: false,
  DEMO: false,
  HOST_PROD: ${JSON.stringify(apiBaseUrl)},
};
export const privateConfig = privateEnv;
export default privateEnv;
`;
  writeFileSync(join(configDir, "private.test.ts"), content, "utf8");
  console.log(`✅ Wrote config/private.test.ts (DB_TYPE=${dbType})`);
}

export function cleanSqliteTestFiles(root: string, dbType: string, dbName: string): void {
  if (dbType !== "sqlite") return;
  const fileName = dbName.endsWith(".sqlite") ? dbName : `${dbName}.sqlite`;
  for (const dir of ["database", "test-database"]) {
    const base = join(root, "config", dir, fileName);
    for (const p of [
      base,
      `${base}-wal`,
      `${base}-shm`,
      join(root, "config", dir, `${dbName}.db`),
    ]) {
      if (existsSync(p)) {
        try {
          unlinkSync(p);
        } catch {
          /* ignore locked files */
        }
      }
    }
  }
}

// ── Server env ────────────────────────────────────────────────────────────────

/** Env for preview `node build/index.js` and the bun test child — same secrets as private.test.ts. */
export function buildIntegrationServerEnv(
  ctx: IntegrationRunContext,
  extra: Record<string, string> = {},
): Record<string, string> {
  const { port, apiBaseUrl, dbType, dbName, secrets } = ctx;
  const creds = getDockerDefaultDbCredentials(dbType);
  return {
    ...process.env,
    PORT: port,
    HOST: "127.0.0.1",
    ORIGIN: apiBaseUrl,
    API_BASE_URL: apiBaseUrl,
    DB_TYPE: dbType,
    DB_HOST: process.env.DB_HOST || "127.0.0.1",
    DB_PORT: process.env.DB_PORT || getDefaultDbPort(dbType),
    DB_NAME: dbName,
    DB_USER: process.env.DB_USER ?? creds.user,
    DB_PASSWORD: process.env.DB_PASSWORD ?? creds.password,
    TEST_MODE: "true",
    NODE_ENV: process.env.NODE_ENV || "test",
    JWT_SECRET_KEY: secrets.jwt,
    ENCRYPTION_KEY: secrets.encryption,
    TEST_API_SECRET: secrets.testApiSecret,
    PASSWORD_MIN_LENGTH: "8",
    ADMIN_PASSWORD: secrets.adminPassword,
    ...extra,
  };
}

export function createIntegrationContext(
  root: string,
  overrides: Partial<{
    port: string;
    apiBaseUrl: string;
    dbType: string;
    dbName: string;
  }> = {},
): IntegrationRunContext {
  // Pin once: private.test.ts, preview env, and bun test env all share this object.
  const secrets = pinIntegrationSecrets();
  const port = overrides.port ?? process.env.PORT ?? "4173";
  const apiBaseUrl = overrides.apiBaseUrl ?? process.env.API_BASE_URL ?? `http://127.0.0.1:${port}`;
  const dbType = (overrides.dbType ?? process.env.DB_TYPE ?? "sqlite").toLowerCase();
  const dbName = overrides.dbName ?? process.env.DB_NAME ?? getIntegrationDbName();
  return {
    root,
    port,
    apiBaseUrl,
    dbType,
    dbName,
    secrets,
  };
}

// ── Health ────────────────────────────────────────────────────────────────────

export async function waitForIntegrationHealth(
  apiBaseUrl: string,
  options: {
    maxAttempts?: number;
    testApiSecret?: string;
    logPrefix?: string;
  } = {},
): Promise<void> {
  const maxAttempts = options.maxAttempts ?? 45;
  // Prefer explicit → pinned → env → stable default (never a fresh random).
  const secret = options.testApiSecret ?? getIntegrationTestApiSecret();
  const prefix = options.logPrefix ?? "";

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${apiBaseUrl}/api/system/health`, {
        headers: {
          "x-test-mode": "true",
          "x-test-secret": secret,
        },
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok || res.status === 533) {
        const data = await res.json().catch(() => ({}));
        const payload = data?.data && typeof data.data === "object" ? data.data : data;
        const status = String(payload.overallStatus ?? payload.status ?? "").toLowerCase();
        if (INTEGRATION_HEALTH_STATES.has(status) || res.ok) {
          console.log(`${prefix}✅ Server ready (state: ${status || res.status})`);
          return;
        }
      }
    } catch {
      /* waiting */
    }
    await sleep(1000);
  }
  throw new Error(`Server not ready at ${apiBaseUrl} after ${maxAttempts}s`);
}

/** Soft health probe — true if CMS health endpoint answers. */
export async function isCmsHealthResponding(apiBaseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/system/health`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok || res.status === 533 || res.status === 503;
  } catch {
    return false;
  }
}

// ── Port / process management ─────────────────────────────────────────────────

function listListeningPids(port: string): number[] {
  try {
    if (process.platform === "win32") {
      const out = execSync(
        `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique"`,
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      );
      return out
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number)
        .filter((n) => Number.isFinite(n) && n > 0);
    }
    const out = execSync(`lsof -ti:${port} -sTCP:LISTEN 2>/dev/null || true`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    return [];
  }
}

function killPidTree(pid: number, force = false): void {
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /pid ${pid} /T ${force ? "/F" : ""}`.trim(), {
        stdio: "ignore",
      });
    } else {
      try {
        process.kill(-pid, force ? "SIGKILL" : "SIGTERM");
      } catch {
        process.kill(pid, force ? "SIGKILL" : "SIGTERM");
      }
    }
  } catch {
    /* already gone */
  }
}

/**
 * Ensure port is free before starting preview.
 *
 * - Empty port → ok
 * - CMS health already answering → stop those PIDs (stale integration server)
 * - Unknown listener → error unless FORCE_FREE_PORT=1
 */
export async function ensurePortAvailable(
  port: string,
  apiBaseUrl: string,
  options: { force?: boolean } = {},
): Promise<void> {
  const force = options.force || process.env.FORCE_FREE_PORT === "1";
  const pids = listListeningPids(port);
  if (pids.length === 0) return;

  const cmsLike = await isCmsHealthResponding(apiBaseUrl);
  if (cmsLike) {
    console.warn(
      `⚠️ Port ${port} already has a CMS health endpoint (PID(s): ${pids.join(", ")}). Stopping for a clean run.`,
    );
    for (const pid of pids) killPidTree(pid, true);
    await sleep(400);
    return;
  }

  if (force) {
    console.warn(`⚠️ FORCE_FREE_PORT: killing non-CMS listener(s) on ${port}: ${pids.join(", ")}`);
    for (const pid of pids) killPidTree(pid, true);
    await sleep(400);
    return;
  }

  throw new Error(
    `Port ${port} is in use by PID(s) ${pids.join(", ")} and does not look like SveltyCMS. ` +
      `Stop that process, set PORT to a free port, or set FORCE_FREE_PORT=1 to kill it.`,
  );
}

/**
 * Structured teardown for the preview (and grandchildren on Windows via /T).
 * SIGTERM first, then force after a short grace period.
 */
export async function stopChildProcessTree(
  child: ChildProcess | null | undefined,
  options: { graceMs?: number; label?: string } = {},
): Promise<void> {
  if (!child?.pid) return;
  const graceMs = options.graceMs ?? 800;
  const label = options.label ?? "process";
  const pid = child.pid;

  try {
    if (process.platform === "win32") {
      // /T kills the whole tree; prefer graceful then force
      try {
        execSync(`taskkill /pid ${pid} /T`, { stdio: "ignore" });
      } catch {
        /* may already be exiting */
      }
      await sleep(graceMs);
      try {
        execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" });
      } catch {
        /* gone */
      }
    } else {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      await sleep(graceMs);
      if (child.exitCode === null && !child.killed) {
        try {
          child.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }
    }
  } catch (err) {
    console.warn(`⚠️ Failed to stop ${label} (pid ${pid}):`, err);
  }
}

// ── Build ─────────────────────────────────────────────────────────────────────

/** Production build with COMPILE_ALL_ADAPTERS via spawn env (no fragile shell `set` / export). */
export function runProductionBuild(root: string): Promise<void> {
  console.log("🏗️  Building (COMPILE_ALL_ADAPTERS=true)...");
  return new Promise((resolve, reject) => {
    const child = spawn("bun", ["run", "build"], {
      cwd: root,
      stdio: "inherit",
      // Windows needs shell so `bun.cmd` resolves on PATH; env still injects COMPILE_ALL_ADAPTERS.
      shell: process.platform === "win32",
      env: {
        ...process.env,
        COMPILE_ALL_ADAPTERS: "true",
      },
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Production build exited with code ${code ?? 1}`));
    });
  });
}

// ── Docker adapter hints (not a matrix runner) ────────────────────────────────

function listDockerPsLines(): string[] {
  try {
    const out =
      typeof Bun !== "undefined" && typeof Bun.spawnSync === "function"
        ? new TextDecoder().decode(
            Bun.spawnSync(["docker", "ps", "--format", "{{.Names}}\t{{.Image}}"], {
              stdout: "pipe",
              stderr: "pipe",
            }).stdout,
          )
        : execSync('docker ps --format "{{.Names}}\t{{.Image}}"', {
            encoding: "utf8",
            timeout: 3000,
            stdio: ["ignore", "pipe", "ignore"],
          });
    return out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Hint which optional DB adapter *suites* may run (tests skip if container absent).
 * Always includes sqlite. Does **not** start containers or switch CMS DB_TYPE.
 */
export function detectDockerAdapterHints(): {
  available: string[];
  detail: string;
} {
  const lines = listDockerPsLines();
  const available = ["sqlite"];
  const matched: string[] = [];

  for (const [adapter, rule] of Object.entries(DOCKER_ADAPTER_HINTS)) {
    const hit = lines.some((line) => {
      const [nameRaw = "", imageRaw = ""] = line.split("\t");
      const name = nameRaw.toLowerCase();
      const image = imageRaw.toLowerCase();

      // Exact compose container names only (tests/docker-compose.yml) — no loose "postgres" substring.
      if (rule.containerNames.some((n) => name === n.toLowerCase())) return true;

      // Image family match: "postgres:16", "library/postgres:16", "mirror/mariadb:11"
      return rule.imagePrefixes.some((p) => {
        const pref = p.toLowerCase();
        const bare = pref.replace(/:$/, "");
        return (
          image === bare ||
          image.startsWith(pref) ||
          image.includes(`/${pref}`) ||
          image.includes(`/${bare}:`) ||
          image.endsWith(`/${bare}`)
        );
      });
    });
    if (hit) {
      available.push(adapter);
      matched.push(adapter);
    }
  }

  const detail =
    matched.length > 0
      ? `optional adapter tests may run for: ${matched.join(", ")} (CMS still uses single DB_TYPE)`
      : "no compose DB containers detected — only sqlite + in-process suites";

  return { available, detail };
}
