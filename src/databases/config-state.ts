/**
 * @file src/databases/config-state.ts
 * @description
 * Centralized, type-safe private configuration loader for the CMS.
 * Prefers SvelteKit $env/dynamic/private, with optional file fallback for setup/complex cases.
 * Avoids circular dependencies and fragile dynamic imports.
 */

import { privateConfigSchema } from "@src/databases/schemas";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { parse, type InferOutput } from "valibot";

// In-memory singleton
export let privateEnv: InferOutput<typeof privateConfigSchema> | null = null;
let loadPromise: Promise<InferOutput<typeof privateConfigSchema> | null> | null = null;

export function setPrivateEnv(env: InferOutput<typeof privateConfigSchema> | null) {
  privateEnv = env;
  loadPromise = null;
}

/**
 * Main loader – called once, cached via promise.
 */
export async function loadPrivateConfig(
  forceReload = false,
): Promise<InferOutput<typeof privateConfigSchema> | null> {
  if (privateEnv && !forceReload) return privateEnv;
  if (loadPromise && !forceReload) return loadPromise;

  loadPromise = (async (): Promise<InferOutput<typeof privateConfigSchema> | null> => {
    try {
      logger.debug("Loading private configuration...");

      const isTest = process.env.TEST_MODE === "true" || process.env.NODE_ENV === "test";

      // 1. Start with SvelteKit's private env (best practice) or process.env for tests
      let svelteEnv: any = {};
      if (isTest) {
        svelteEnv = process.env;
      } else {
        try {
          // We use dynamic import to avoid breaking standalone scripts (Bun/Node)
          // while staying idiomatic for SvelteKit runtime.
          // @ts-ignore - Dynamic SvelteKit environment variable loading
          const mod = await import("$env/dynamic/private");
          svelteEnv = mod.env;
        } catch {
          // Not in SvelteKit context (e.g. standalone script), fallback to process.env
          svelteEnv = process.env;
        }
      }

      let config: any = { ...svelteEnv };

      // 2. Optional file-based override (for setup mode or legacy complex configs)
      const fileConfig = await loadConfigFromFileIfNeeded(svelteEnv);
      if (fileConfig) {
        config = { ...config, ...fileConfig };
      }

      // 3. Environment variable overrides (always take precedence for infra)
      const overrides = getEnvOverrides();
      config = { ...config, ...overrides };

      // 4. Validate with Valibot
      // Throws if invalid, caught by the outer catch
      const validated = parse(privateConfigSchema, config);

      // 5. Test mode safety checks
      await enforceTestSafety(validated);

      privateEnv = validated;

      // Initialize Redis L2 Cache if enabled
      if (validated.USE_REDIS) {
        const { cacheService } = await import("./cache/cache-service");
        await cacheService.initializeL2(validated);
      }

      logger.debug("Private config loaded successfully", {
        dbType: validated.DB_TYPE,
        useRedis: validated.USE_REDIS,
      });

      return privateEnv;
    } catch (error: any) {
      if (process.env.NODE_ENV === "test" || process.env.TEST_MODE === "true") {
        // Only crash if the test config FILE exists but is invalid.
        // If the file is simply absent, we're in pre-setup state — return null gracefully.
        const { existsSync } = await import("node:fs");
        const configPath = `${process.cwd()}/config/private.test.ts`;
        if (existsSync(configPath)) {
          logger.error("Config loading failed in test mode", { error: error.message });
          throw new AppError(
            "Critical config error in test environment. Run setup or check private.test config.",
            500,
            "CONFIG_LOAD_FAILURE",
          );
        }
        logger.debug("private.test.ts not found — pre-setup state, returning null");
        return null;
      }

      logger.trace("Private config not available (expected during initial setup)", {
        error: error.message,
      });
      return null;
    }
  })();

  return loadPromise;
}

/** Helper: Load from config/private.ts or private.test.ts only when necessary */
async function loadConfigFromFileIfNeeded(svelteEnv: any): Promise<any | null> {
  const isTest = process.env.TEST_MODE === "true" || process.env.NODE_ENV === "test";

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
    return module.privateEnv ?? module; // support both export styles
  } catch (err) {
    logger.warn(`Failed to load ${filename}`, { error: (err as Error).message });
    return null;
  }
}

/** Extract env overrides cleanly */
function getEnvOverrides() {
  const overrides: any = {};

  // Database
  if (process.env.DB_TYPE) overrides.DB_TYPE = process.env.DB_TYPE;
  if (process.env.DB_HOST) overrides.DB_HOST = process.env.DB_HOST;
  if (process.env.DB_PORT) overrides.DB_PORT = Number(process.env.DB_PORT);
  if (process.env.DB_NAME) overrides.DB_NAME = process.env.DB_NAME;
  if (process.env.DB_USER) overrides.DB_USER = process.env.DB_USER;
  if (process.env.DB_PASSWORD) overrides.DB_PASSWORD = process.env.DB_PASSWORD;
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

  // SMTP
  if (process.env.SMTP_PORT) overrides.SMTP_PORT = Number(process.env.SMTP_PORT);

  return overrides;
}

/** Test isolation enforcement */
async function enforceTestSafety(config: any) {
  if ((process.env.TEST_MODE === "true" || process.env.NODE_ENV === "test") && config?.DB_NAME) {
    const dbName = String(config.DB_NAME).toLowerCase();
    if (!dbName.includes("test") && !dbName.endsWith("_functional")) {
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
export function getPrivateEnv(): InferOutput<typeof privateConfigSchema> | null {
  return privateEnv;
}

export function getDatabaseConfig() {
  const env = getPrivateEnv();
  if (!env) return null;

  const dbType = env.DB_TYPE || "mongodb";
  const host = env.DB_HOST || "localhost";
  const port =
    env.DB_PORT || (dbType === "mongodb" ? 27017 : dbType === "postgresql" ? 5432 : 3306);
  const name = env.DB_NAME || "sveltycms";
  const user = env.DB_USER;
  const password = env.DB_PASSWORD;

  return {
    type: dbType,
    host,
    port,
    name,
    user,
    password,
    poolSize: env.DB_POOL_SIZE || 10,
    retryAttempts: env.DB_RETRY_ATTEMPTS || 5,
    retryDelay: env.DB_RETRY_DELAY || 2000,
  };
}

export function getRedisConfig() {
  const env = getPrivateEnv();
  const host = env?.REDIS_HOST || "localhost";
  const port = env?.REDIS_PORT || 6379;

  return {
    useRedis: env?.USE_REDIS === true,
    host,
    port,
    password: env?.REDIS_PASSWORD,
    url: `redis://${host}:${port}`,
    retryAttempts: 3,
    retryDelay: 2000,
  };
}

export function getDatabaseConnectionString(): string {
  const config = getDatabaseConfig();
  if (!config) return "";

  const { type, host, port, name, user, password } = config;

  // If host is already a full connection string, use it
  if (host.includes("://")) {
    const hasDatabase = host.split("?")[0].split("/").length > 3;
    if (!hasDatabase && name) {
      const separator = host.includes("?") ? "?" : "/";
      if (separator === "?") {
        const [base, query] = host.split("?");
        return `${base}/${name}?${query}`;
      }
      return `${host}/${name}`;
    }
    return host;
  }

  const authPart = user
    ? `${encodeURIComponent(user)}${password ? `:${encodeURIComponent(password)}` : ""}@`
    : "";

  const connectionString = getSwitchResult(type, authPart, host, port, name, user);
  const masked = connectionString.replace(/:([^@]+)@/, ":****@");
  logger.info(`[DB] Generated connection string: ${masked}`);
  return connectionString;
}

function getSwitchResult(
  type: string,
  authPart: string,
  host: string,
  port: number | string | undefined,
  name: string,
  _user?: string | undefined,
) {
  switch (type) {
    case "mongodb": {
      // NOTE: MongoDB driver now handles authentication via the connection string authPart
      return `mongodb://${authPart}${host}:${port}/${name}`;
    }
    case "mongodb+srv":
      return `mongodb+srv://${authPart}${host}/${name}?retryWrites=true&w=majority`;
    case "mariadb":
      return `mysql://${authPart}${host}:${port}/${name}`;
    case "postgresql":
      return `postgresql://${authPart}${host}:${port}/${name}`;
    case "sqlite": {
      const finalName = name.endsWith(".sqlite") ? name : `${name}.sqlite`;
      if (host && (host.startsWith("/") || host.startsWith("C:"))) {
        const path = host.endsWith("/") ? host : `${host}/`;
        return `${path}${finalName}`;
      }
      return `config/database/${finalName}`;
    }
    default:
      return "";
  }
}

export function clearPrivateConfigCache(keepPrivateEnv = false) {
  logger.debug("Clearing private config cache", { keepPrivateEnv });
  if (!keepPrivateEnv) privateEnv = null;
  loadPromise = null;
}
