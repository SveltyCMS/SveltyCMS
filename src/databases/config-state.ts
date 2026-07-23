/**
 * @file src/databases/config-state.ts
 * @description
 * Centralized, type-safe private configuration loader for the CMS.
 * Prefers SvelteKit $env/dynamic/private, with optional file fallback for setup/complex cases.
 * Avoids circular dependencies and fragile dynamic imports.
 */

import { privateConfigSchema } from "@src/databases/private-config-schema";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { isIsolatedTestDbName } from "@utils/test-db-safety";
import { isCiRunner } from "@utils/private-config-policy";
import { safeParse, type InferOutput } from "valibot";

/** Read env at runtime — production builds inline bare `process.env.*` to `{}`. */
function runtimeEnv(): NodeJS.ProcessEnv {
  return (globalThis as typeof globalThis & { process?: NodeJS.Process }).process?.env ?? {};
}

function env(key: string): string | undefined {
  return runtimeEnv()[key];
}

if (env("TEST_MODE") === "true" && env("BENCHMARK") !== "true") {
  logger.debug("config-state.ts initialized");
}

// Types based on schema
export type AppPrivateConfig = Readonly<InferOutput<typeof privateConfigSchema>>;
type RawEnv = Partial<Record<string, string | number | boolean>>;

// In-memory singleton
let privateEnv: AppPrivateConfig | null = null;
let loadPromise: Promise<AppPrivateConfig | null> | null = null;

export function setPrivateEnv(env: AppPrivateConfig | null) {
  privateEnv = env ? (Object.freeze(env) as AppPrivateConfig) : null;
  loadPromise = null;
}

/**
 * Main loader – called once, cached via promise.
 * 🚀 High-ROI: Now ensures config immutability and zero side-effects.
 */
export async function loadPrivateConfig(forceReload = false): Promise<AppPrivateConfig | null> {
  if (privateEnv && !forceReload) return privateEnv;
  // if (loadPromise && !forceReload) return loadPromise;

  loadPromise = (async (): Promise<AppPrivateConfig | null> => {
    try {
      logger.debug("Loading private configuration...");

      const isTest = env("TEST_MODE") === "true" || env("NODE_ENV") === "test";

      // 1. Start with SvelteKit's private env (best practice) or runtime env for tests
      let svelteEnv: RawEnv = {};
      if (isTest) {
        svelteEnv = runtimeEnv() as RawEnv;
      } else {
        try {
          if (import.meta.env?.SSR) {
            // @ts-ignore - Dynamic SvelteKit environment variable loading
            const mod = await import("$env/dynamic/private");
            svelteEnv = mod.env;
          }
        } catch {
          svelteEnv = runtimeEnv() as RawEnv;
        }
      }

      let config: RawEnv = { ...svelteEnv };

      // 🚀 HARDENING: If running in test mode and DB_TYPE is in runtime env,
      // strictly prioritize it to avoid config-file pollution from parallel runs.
      if (isTest && env("DB_TYPE")) {
        config.DB_TYPE = env("DB_TYPE");
      }

      // 2. Optional file-based override
      const fileConfig = await loadConfigFromFileIfNeeded(svelteEnv);
      if (fileConfig) {
        config = { ...config, ...fileConfig };
      }

      // 3. Environment variable overrides (always take precedence)
      const overrides = getEnvOverrides();
      config = { ...config, ...overrides };

      // 4. Validate and Freeze
      const result = safeParse(privateConfigSchema, config);

      if (!result.success) {
        const hasEssentialKeys = !!(config.DB_TYPE || config.DB_HOST || config.JWT_SECRET_KEY);
        const isBenchmark = env("SVELTY_BENCHMARK_SUITE") === "true" || env("BENCHMARK") === "true";
        // Only log error if we actually have some configuration attempted
        // 🚀 BENCHMARK: Suppress noise — bench child process uses HTTP API, not direct DB
        if ((hasEssentialKeys || fileConfig) && !isBenchmark) {
          logger.error("Private config validation failed:", {
            error: result.issues[0]?.message || "Validation failed",
            issues: result.issues.map((i: any) => ({
              path: i.path?.map((p: any) => p.key).join("."),
              message: i.message,
            })),
          });
        }
        return null;
      }

      const validated = result.output;

      // 🚀 DEBUG: Trace benchmark configuration leakage
      if (isTest && (validated.DB_TYPE !== "sqlite" || env("BENCHMARK_DEBUG") === "true")) {
        console.log(
          `[Config] Loaded type: ${validated.DB_TYPE}, host: ${validated.DB_HOST}, name: ${validated.DB_NAME}`,
        );
      }

      // 5. Test mode safety checks
      await enforceTestSafety(validated);

      // 🚀 Architectural Refine: config is now immutable
      privateEnv = Object.freeze(validated) as AppPrivateConfig;

      logger.debug(`Private config loaded and frozen successfully (DB_TYPE: ${validated.DB_TYPE})`);

      return privateEnv;
    } catch (error: unknown) {
      logger.error("Unexpected error during config loading:", error);

      // A test-DB safety violation means we nearly booted against a non-isolated
      // (potentially production) database. Never let boot continue in that state —
      // continuing previously caused the server to limp forward with DB_TYPE
      // undefined, producing confusing "no such table" errors downstream instead
      // of a clear, immediate failure.
      if (error instanceof AppError && error.code === "TEST_DB_SAFETY_VIOLATION") {
        logger.error("Aborting startup: refusing to boot with an unsafe test DB config.");
        process.exit(1);
      }

      return null;
    }
  })();

  return loadPromise;
}

/** Helper: Load from private.test.ts (automated) or private.ts (live app only). */
async function loadConfigFromFileIfNeeded(svelteEnv: any): Promise<any | null> {
  const isTest = env("TEST_MODE") === "true" || env("NODE_ENV") === "test";
  const isBenchmark = env("SVELTY_BENCHMARK_SUITE") === "true" || env("BENCHMARK") === "true";

  // 🚀 BENCHMARK MODE: Skip file-based config entirely — all values come from env vars
  if (isBenchmark) return null;

  if (!isTest && !shouldUseFileConfig(svelteEnv)) {
    return null; // Prefer pure env in normal/prod runs
  }

  // Automated harnesses must NEVER load config/private.ts (live data risk).
  // See src/utils/private-config-policy.ts
  const { resolvePrivateConfigFileName, assertAutomatedMustNotUseLivePrivateTs } =
    await import("@utils/private-config-policy");
  const filename = resolvePrivateConfigFileName();
  if (filename === "private.ts") {
    // Live app path only — double-check harness flags did not slip through
    assertAutomatedMustNotUseLivePrivateTs("load");
  }
  const configPath = `${process.cwd()}/config/${filename}`;

  try {
    const fs = await import("node:fs");
    if (!fs.existsSync(configPath)) {
      logger.debug(`${filename} not found, skipping file config`);
      return null;
    }

    // Use dynamic import with cache bust only in dev/setup
    const { pathToFileURL } = await import("node:url");
    const url = `${pathToFileURL(configPath).href}?t=${Date.now()}`;

    const module = await import(/* @vite-ignore */ url);
    // Security: Do NOT log rawContent. It contains secrets and keys.
    logger.debug(`[Config] Loaded ${filename} successfully.`);
    return module.privateEnv ?? module; // support both export styles
  } catch (err) {
    logger.trace(`Failed to load ${filename}`, {
      error: (err as Error).message,
    });
    return null;
  }
}

/** Extract env overrides cleanly */
function getEnvOverrides() {
  const overrides: any = {};
  const e = runtimeEnv();

  // --- Environment variable overrides ---
  const type = e.DB_TYPE || "sqlite";
  const isSqlite = type.startsWith("sqlite");

  // Database
  if (e.DB_TYPE) overrides.DB_TYPE = e.DB_TYPE;

  // 🚀 HARDENING: Only set relational/network fields if NOT in SQLite mode
  if (!isSqlite) {
    if (e.DB_HOST) overrides.DB_HOST = e.DB_HOST;
    if (e.DB_PORT) overrides.DB_PORT = Number(e.DB_PORT);
    if (e.DB_USER) overrides.DB_USER = e.DB_USER;
    if (e.DB_PASSWORD) overrides.DB_PASSWORD = e.DB_PASSWORD;
  }

  if (e.DB_NAME) overrides.DB_NAME = e.DB_NAME;
  if (e.DB_PATH) overrides.DB_PATH = e.DB_PATH;
  if (e.DB_POOL_SIZE) overrides.DB_POOL_SIZE = Number(e.DB_POOL_SIZE);
  if (e.DB_RETRY_ATTEMPTS) overrides.DB_RETRY_ATTEMPTS = Number(e.DB_RETRY_ATTEMPTS);
  if (e.DB_RETRY_DELAY) overrides.DB_RETRY_DELAY = Number(e.DB_RETRY_DELAY);

  // Redis
  if (e.USE_REDIS !== undefined && e.USE_REDIS !== "") {
    overrides.USE_REDIS = e.USE_REDIS === "true";
  }
  if (e.REDIS_HOST) overrides.REDIS_HOST = e.REDIS_HOST;
  if (e.REDIS_PORT) overrides.REDIS_PORT = Number(e.REDIS_PORT);
  if (e.REDIS_PASSWORD) overrides.REDIS_PASSWORD = e.REDIS_PASSWORD;

  // Security
  if (e.JWT_SECRET_KEY) overrides.JWT_SECRET_KEY = e.JWT_SECRET_KEY;
  if (e.ENCRYPTION_KEY) overrides.ENCRYPTION_KEY = e.ENCRYPTION_KEY;
  if (e.TEST_API_SECRET) overrides.TEST_API_SECRET = e.TEST_API_SECRET;
  // Auth
  if (e.PASSWORD_MIN_LENGTH) overrides.PASSWORD_MIN_LENGTH = Number(e.PASSWORD_MIN_LENGTH);

  // External CDN
  if (e.CF_API_TOKEN) overrides.CF_API_TOKEN = e.CF_API_TOKEN;
  if (e.CF_ZONE_ID) overrides.CF_ZONE_ID = e.CF_ZONE_ID;
  if (e.CF_PURGE_MODE) overrides.CF_PURGE_MODE = e.CF_PURGE_MODE;

  // Read Replicas (comma-separated list)
  if (e.DB_REPLICA_URLS) {
    overrides.DB_REPLICA_URLS = e.DB_REPLICA_URLS.split(",").map((url) => url.trim());
  }

  // Edge KV
  if (e.EDGE_KV_URL) overrides.EDGE_KV_URL = e.EDGE_KV_URL;
  if (e.EDGE_KV_TOKEN) overrides.EDGE_KV_TOKEN = e.EDGE_KV_TOKEN;

  if (e.CONCURRENT_UPLOAD_SIZE) overrides.CONCURRENT_UPLOAD_SIZE = Number(e.CONCURRENT_UPLOAD_SIZE);

  return overrides;
}

/** Test isolation enforcement — uses the shared classifier for consistency. */
async function enforceTestSafety(config: any) {
  if ((env("TEST_MODE") === "true" || env("NODE_ENV") === "test") && config?.DB_NAME) {
    const dbName = String(config.DB_NAME);
    if (!isIsolatedTestDbName(dbName)) {
      const msg = `SAFETY VIOLATION: Test mode DB_NAME '${dbName}' does not indicate a test database.`;
      logger.error(msg);
      throw new AppError(msg, 500, "TEST_DB_SAFETY_VIOLATION");
    }
    // CI runners create an ephemeral config/private.ts as a mirror of
    // config/private.test.ts. The live-vs-test comparison below is meant
    // to protect local developer machines, where private.ts may point at
    // a real deployment. In CI, private.ts IS the test config — skip.
    if (!isCiRunner(process.env)) {
      // Never connect to the same DB as live config/private.ts (user data)
      try {
        const fs = await import("node:fs");
        const livePath = `${process.cwd()}/config/private.ts`;
        if (fs.existsSync(livePath)) {
          const live = fs.readFileSync(livePath, "utf8");
          const liveDb = live.match(/DB_NAME\s*:\s*['"`]([^'"`]+)['"`]/)?.[1];
          if (liveDb && liveDb === dbName) {
            const msg = `SAFETY VIOLATION: Test mode DB_NAME '${dbName}' matches live config/private.ts. Refusing to use user database for tests.`;
            logger.error(msg);
            throw new AppError(msg, 500, "TEST_DB_SAFETY_VIOLATION");
          }
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
        /* ignore read errors */
      }
    }
  }
}

/** Optional: Decide when file config is still needed (e.g. during setup) */
function shouldUseFileConfig(svelteEnv: any): boolean {
  // Heuristic: Use file config if essential DB_TYPE is missing from env or if in dev mode
  return !svelteEnv.DB_TYPE || env("NODE_ENV") === "development";
}

// Sync getters (safe after loadPrivateConfig has been called at least once)
export function getPrivateEnv(): AppPrivateConfig | null {
  return privateEnv;
}

// Micro-caches for derived configs
let dbConfigCache: any = null;
let redisConfigCache: any = null;

export function getDatabaseConfig() {
  if (dbConfigCache) return dbConfigCache;

  const env = getPrivateEnv();
  if (!env) return null;

  const dbType = env.DB_TYPE || "mongodb";
  const host = env.DB_HOST || "localhost";
  const port =
    env.DB_PORT || (dbType === "mongodb" ? 27017 : dbType === "postgresql" ? 5432 : 3306);
  const name = env.DB_NAME || "sveltycms";
  const user = env.DB_USER;
  const password = env.DB_PASSWORD;

  dbConfigCache = {
    type: dbType,
    host,
    port,
    name,
    user,
    password,
    poolSize: env.DB_POOL_SIZE || (dbType === "postgresql" ? 20 : dbType === "sqlite" ? 1 : 100),
    retryAttempts: env.DB_RETRY_ATTEMPTS || 5,
    retryDelay: env.DB_RETRY_DELAY || 2000,
  };

  return dbConfigCache;
}

export function getRedisConfig() {
  if (redisConfigCache) return redisConfigCache;

  const env = getPrivateEnv();
  const host = env?.REDIS_HOST || "localhost";
  const port = env?.REDIS_PORT || 6379;

  redisConfigCache = {
    useRedis: env?.USE_REDIS === true,
    host,
    port,
    password: env?.REDIS_PASSWORD,
    url: `redis://${host}:${port}`,
    retryAttempts: 3,
    retryDelay: 2000,
  };

  return redisConfigCache;
}

/**
 * Enterprise scaling: External DB pooler (PgBouncer etc.) config.
 * All fields optional. When DB_POOLER_URL is set, adapters should prefer it for connections.
 * DB_POOLER_MODE and PREPARE are hints for transaction pooling compatibility (esp. Postgres).
 */
export function getDbPoolerConfig() {
  const env = getPrivateEnv();
  return {
    type: env?.DB_POOLER_TYPE || "",
    url: env?.DB_POOLER_URL || "",
    mode: env?.DB_POOLER_MODE || "transaction",
    prepare: env?.DB_POOLER_PREPARE, // undefined = let adapter decide (true for direct, false for pgbouncer tx)
    enabled: !!(env?.DB_POOLER_TYPE || env?.DB_POOLER_URL),
  };
}

/**
 * Trusted reverse proxies (Nginx, load balancers). Used for X-Forwarded-* trust in rate limiting, auth, security.
 * Supports string "1.2.3.4,10.0.0.0/8" or array. "all" or "*" for dev.
 */
export function getTrustedProxies(): string[] | "all" {
  const env = getPrivateEnv();
  const raw = env?.TRUSTED_PROXIES;
  if (!raw) return [];
  if (raw === "all" || raw === "*") return "all";
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (Array.isArray(raw)) return raw.filter(Boolean);
  return [];
}

/**
 * 🚀 Registry-based database driver pattern.
 * Provides a clean, extensible way to generate connection strings and handle DB specifics.
 */
interface DriverDefinition {
  protocol: string;
  buildConnectionString: (config: {
    host: string;
    port: number | string;
    user?: string;
    password?: string;
    name: string;
    type: string;
  }) => string;
}

const DATABASE_REGISTRY: Record<string, DriverDefinition> = {
  mongodb: {
    protocol: "mongodb",
    buildConnectionString: (c) => {
      const auth = c.user && c.user.trim() ? `${c.user}:${c.password}@` : "";
      const dbName = c.name.replace(/\.db$/, "").replace(/\./g, "_");
      return `mongodb://${auth}${c.host}:${c.port}/${dbName}?authSource=admin`;
    },
  },
  "mongodb+srv": {
    protocol: "mongodb+srv",
    buildConnectionString: (c) => {
      const auth = c.user ? `${c.user}:${c.password}@` : "";
      const dbName = c.name.replace(/\.db$/, "").replace(/\./g, "_");
      return `mongodb+srv://${auth}${c.host}/${dbName}?retryWrites=true&w=majority`;
    },
  },
  postgresql: {
    protocol: "postgresql",
    buildConnectionString: (c) => {
      const auth = c.user ? `${c.user}:${c.password}@` : "";
      return `postgresql://${auth}${c.host}:${c.port}/${c.name}`;
    },
  },
  mariadb: {
    protocol: "mysql",
    buildConnectionString: (c) => {
      const auth = c.user ? `${c.user}:${c.password}@` : "";
      return `mysql://${auth}${c.host}:${c.port}/${c.name}`;
    },
  },
  sqlite: {
    protocol: "file",
    buildConnectionString: (c) => resolveSqlitePath(c.host, c.name),
  },
};

/**
 * Registry-based connection string generation.
 * Avoids growing switch statements and improves extensibility.
 */
export function getDatabaseConnectionString(): string {
  const config = getDatabaseConfig();
  if (!config) return "";

  // If host is already a full connection string, use it
  if (config.host.includes("://")) {
    const hasDatabase = config.host.split("?")[0].split("/").length > 3;
    if (!hasDatabase && config.name) {
      const separator = config.host.includes("?") ? "?" : "/";
      if (separator === "?") {
        const [base, query] = config.host.split("?");
        return `${base}/${config.name}?${query}`;
      }
      return `${config.host}/${config.name}`;
    }
    return config.host;
  }

  // Use the registry
  const driver = DATABASE_REGISTRY[config.type];
  if (!driver) {
    throw new Error(`[DB] No driver found in registry for type: ${config.type}`);
  }

  const connectionString = driver.buildConnectionString(config);
  logger.info(`[DB] Registry resolved database user: ${config.user || "default/empty"}`);
  const masked = connectionString.includes("://")
    ? connectionString.replace(/:([^@]+)@/, ":****@")
    : connectionString;

  logger.info(`[DB] Registry resolved connection string: ${masked}`);
  return connectionString;
}

/**
 * Enhanced SQLite path resolver.
 * Distinguishes between directory paths and network addresses (IPs/localhost).
 */
export function resolveSqlitePath(host: string | undefined, name: string): string {
  const finalName = name.endsWith(".sqlite") ? name : `${name}.sqlite`;

  // Test mode: use config/test-database/ to avoid clobbering dev DB
  // Only activate if the directory exists to avoid breaking CI which creates
  // config/database/ but not config/test-database/
  const isTest =
    typeof process !== "undefined" &&
    (process.env?.TEST_MODE === "true" ||
      process.env?.VITE_TEST_MODE === "true" ||
      process.env?.VITEST === "true" ||
      process.env?.BUN_TEST === "true" ||
      name.includes("test") ||
      name.includes("benchmark"));
  if (isTest) {
    try {
      const { mkdirSync } = require("node:fs");
      const { join } = require("node:path");
      const testDir = join(process.cwd(), "config", "test-database");
      mkdirSync(testDir, { recursive: true });
      return `config/test-database/${finalName}`;
    } catch {
      // FS check not available (edge runtime) — fall through
    }
  }

  // If host is an IP or localhost, it's NOT a directory for SQLite
  const isNetworkAddr =
    !host ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    /^(\d{1,3}\.){3}\d{1,3}$/.test(host);

  if (isNetworkAddr) {
    return `config/database/${finalName}`;
  }

  // If it clearly looks like a path, use it as a directory
  const hostStr = host!;
  const isPath =
    hostStr.startsWith("/") ||
    hostStr.startsWith("./") ||
    hostStr.startsWith("../") ||
    hostStr.includes("/") ||
    hostStr.includes("\\") ||
    /^[a-zA-Z]:/.test(hostStr); // Windows drive letter

  if (isPath) {
    const p = hostStr.endsWith("/") || hostStr.endsWith("\\") ? hostStr : `${hostStr}/`;
    return `${p}${finalName}`;
  }

  // Fallback to default directory
  return `config/database/${finalName}`;
}

export function clearPrivateConfigCache(keepPrivateEnv = false) {
  logger.debug("Clearing private config cache", { keepPrivateEnv });
  if (!keepPrivateEnv) {
    privateEnv = null;
    loadPromise = null;
  }
  dbConfigCache = null;
  redisConfigCache = null;
}

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    logger.info("🔥 HMR: Reloading private configuration");
    clearPrivateConfigCache();
    loadPrivateConfig(true).catch((err) => {
      logger.error("HMR Config Reload Failed:", err);
    });
  });
}
