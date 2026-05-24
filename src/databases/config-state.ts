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
import { safeParse, type InferOutput } from "valibot";

if (process.env.TEST_MODE === "true" && process.env.BENCHMARK !== "true") {
  logger.debug("config-state.ts initialized");
}

// Types based on schema
export type AppPrivateConfig = Readonly<InferOutput<typeof privateConfigSchema>>;
type RawEnv = Partial<Record<string, string | number | boolean>>;

// In-memory singleton
export let privateEnv: AppPrivateConfig | null = null;
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

      const isTest = process.env.TEST_MODE === "true" || process.env.NODE_ENV === "test";

      // 1. Start with SvelteKit's private env (best practice) or process.env for tests
      let svelteEnv: RawEnv = {};
      if (isTest) {
        svelteEnv = process.env as RawEnv;
      } else {
        try {
          if (import.meta.env?.SSR) {
            // @ts-ignore - Dynamic SvelteKit environment variable loading
            const mod = await import("$env/dynamic/private");
            svelteEnv = mod.env;
          }
        } catch {
          svelteEnv = process.env as RawEnv;
        }
      }

      let config: RawEnv = { ...svelteEnv };

      // 🚀 HARDENING: If running in test mode and DB_TYPE is in process.env,
      // strictly prioritize it to avoid config-file pollution from parallel runs.
      if (isTest && process.env.DB_TYPE) {
        config.DB_TYPE = process.env.DB_TYPE;
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
        const isBenchmark =
          process.env.SVELTY_BENCHMARK_SUITE === "true" || process.env.BENCHMARK === "true";
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
      if (isTest && (validated.DB_TYPE !== "sqlite" || process.env.BENCHMARK_DEBUG === "true")) {
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
    } catch (error: any) {
      logger.error("Unexpected error during config loading:", error);
      return null;
    }
  })();

  return loadPromise;
}

/** Helper: Load from config/private.ts or private.test.ts only when necessary */
async function loadConfigFromFileIfNeeded(svelteEnv: any): Promise<any | null> {
  const isTest = process.env.TEST_MODE === "true" || process.env.NODE_ENV === "test";
  const isBenchmark =
    process.env.SVELTY_BENCHMARK_SUITE === "true" || process.env.BENCHMARK === "true";

  // 🚀 BENCHMARK MODE: Skip file-based config entirely — all values come from env vars
  if (isBenchmark) return null;

  if (!isTest && !shouldUseFileConfig(svelteEnv)) {
    return null; // Prefer pure env in normal/prod runs
  }

  const filename = isTest ? "private.test.ts" : "private.ts";
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

  // --- Environment variable overrides ---
  const type = process.env.DB_TYPE || "sqlite";
  const isSqlite = type.startsWith("sqlite");

  // Database
  if (process.env.DB_TYPE) overrides.DB_TYPE = process.env.DB_TYPE;

  // 🚀 HARDENING: Only set relational/network fields if NOT in SQLite mode
  if (!isSqlite) {
    if (process.env.DB_HOST) overrides.DB_HOST = process.env.DB_HOST;
    if (process.env.DB_PORT) overrides.DB_PORT = Number(process.env.DB_PORT);
    if (process.env.DB_USER) overrides.DB_USER = process.env.DB_USER;
    if (process.env.DB_PASSWORD) overrides.DB_PASSWORD = process.env.DB_PASSWORD;
  }

  if (process.env.DB_NAME) overrides.DB_NAME = process.env.DB_NAME;
  if (process.env.DB_PATH) overrides.DB_PATH = process.env.DB_PATH;
  if (process.env.DB_POOL_SIZE) overrides.DB_POOL_SIZE = Number(process.env.DB_POOL_SIZE);
  if (process.env.DB_RETRY_ATTEMPTS)
    overrides.DB_RETRY_ATTEMPTS = Number(process.env.DB_RETRY_ATTEMPTS);
  if (process.env.DB_RETRY_DELAY) overrides.DB_RETRY_DELAY = Number(process.env.DB_RETRY_DELAY);

  // Redis
  if (process.env.USE_REDIS !== undefined && process.env.USE_REDIS !== "") {
    overrides.USE_REDIS = process.env.USE_REDIS === "true";
  }
  if (process.env.REDIS_HOST) overrides.REDIS_HOST = process.env.REDIS_HOST;
  if (process.env.REDIS_PORT) overrides.REDIS_PORT = Number(process.env.REDIS_PORT);
  if (process.env.REDIS_PASSWORD) overrides.REDIS_PASSWORD = process.env.REDIS_PASSWORD;

  // Security
  if (process.env.JWT_SECRET_KEY) overrides.JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;
  if (process.env.ENCRYPTION_KEY) overrides.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
  if (process.env.TEST_API_SECRET) overrides.TEST_API_SECRET = process.env.TEST_API_SECRET;
  // Auth
  if (process.env.PASSWORD_MIN_LENGTH)
    overrides.PASSWORD_MIN_LENGTH = Number(process.env.PASSWORD_MIN_LENGTH);

  // CI/Benchmark Configuration
  if (process.env.TEST_API_SECRET) overrides.TEST_API_SECRET = process.env.TEST_API_SECRET;

  // External CDN
  if (process.env.CF_API_TOKEN) overrides.CF_API_TOKEN = process.env.CF_API_TOKEN;
  if (process.env.CF_ZONE_ID) overrides.CF_ZONE_ID = process.env.CF_ZONE_ID;
  if (process.env.CF_PURGE_MODE) overrides.CF_PURGE_MODE = process.env.CF_PURGE_MODE;

  // Read Replicas (comma-separated list)
  if (process.env.DB_REPLICA_URLS) {
    overrides.DB_REPLICA_URLS = process.env.DB_REPLICA_URLS.split(",").map((url) => url.trim());
  }

  // Edge KV
  if (process.env.EDGE_KV_URL) overrides.EDGE_KV_URL = process.env.EDGE_KV_URL;
  if (process.env.EDGE_KV_TOKEN) overrides.EDGE_KV_TOKEN = process.env.EDGE_KV_TOKEN;

  if (process.env.CONCURRENT_UPLOAD_SIZE)
    overrides.CONCURRENT_UPLOAD_SIZE = Number(process.env.CONCURRENT_UPLOAD_SIZE);

  return overrides;
}

/** Test isolation enforcement */
async function enforceTestSafety(config: any) {
  if ((process.env.TEST_MODE === "true" || process.env.NODE_ENV === "test") && config?.DB_NAME) {
    const dbName = String(config.DB_NAME).toLowerCase();
    if (!dbName.includes("test") && !dbName.includes("bench") && !dbName.endsWith("_functional")) {
      const msg = `SAFETY VIOLATION: Test mode DB_NAME '${config.DB_NAME}' does not indicate a test database.`;
      logger.error(msg);
      throw new AppError(msg, 500, "TEST_DB_SAFETY_VIOLATION");
    }
  }
}

/** Optional: Decide when file config is still needed (e.g. during setup) */
function shouldUseFileConfig(svelteEnv: any): boolean {
  // Heuristic: Use file config if essential DB_TYPE is missing from env or if in dev mode
  return !svelteEnv.DB_TYPE || process.env.NODE_ENV === "development";
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
    poolSize: env.DB_POOL_SIZE || 100,
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
      return `mongodb://${auth}${c.host}:${c.port}/${c.name}`;
    },
  },
  "mongodb+srv": {
    protocol: "mongodb+srv",
    buildConnectionString: (c) => {
      const auth = c.user ? `${c.user}:${c.password}@` : "";
      return `mongodb+srv://${auth}${c.host}/${c.name}?retryWrites=true&w=majority`;
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
