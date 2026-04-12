/**
 * @file src/databases/config-state.ts
 * @description
 * Configuration state management.
 *
 * This module holds the loaded private configuration state to avoid circular dependencies
 * between db.ts and other modules like secureQuery.ts or settingsService.ts.
 */

import type { privateConfigSchema } from "@src/databases/schemas";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import type { InferOutput } from "valibot";

export let privateEnv: InferOutput<typeof privateConfigSchema> | null = null;
let loadPromise: Promise<InferOutput<typeof privateConfigSchema> | null> | null = null;

export function setPrivateEnv(env: InferOutput<typeof privateConfigSchema> | null) {
  privateEnv = env;
  loadPromise = null;
}

// Function to load private config when needed
export async function loadPrivateConfig(
  forceReload = false,
): Promise<InferOutput<typeof privateConfigSchema> | null> {
  if (privateEnv && !forceReload) {
    return privateEnv;
  }

  if (loadPromise && !forceReload) {
    return loadPromise;
  }

  loadPromise = (async () => {
    try {
      // ⚡ ENTERPRISE OVERRIDE: Check Environment Variables first
      const envOverride: any = {};
      if (process.env.DB_TYPE) {
        logger.info("Using Environment Variable overrides for database configuration");
        envOverride.DB_TYPE = process.env.DB_TYPE;
        if (process.env.DB_NAME) envOverride.DB_NAME = process.env.DB_NAME;
        if (process.env.DB_HOST) envOverride.DB_HOST = process.env.DB_HOST;
        if (process.env.DB_PORT) envOverride.DB_PORT = process.env.DB_PORT;
        if (process.env.DB_USER) envOverride.DB_USER = process.env.DB_USER;
        if (process.env.DB_PASSWORD) envOverride.DB_PASSWORD = process.env.DB_PASSWORD;
        if (process.env.USE_REDIS) envOverride.USE_REDIS = process.env.USE_REDIS === "true";
        if (process.env.REDIS_HOST) envOverride.REDIS_HOST = process.env.REDIS_HOST;
        if (process.env.REDIS_PORT) envOverride.REDIS_PORT = process.env.REDIS_PORT;
        if (process.env.TEST_API_SECRET) envOverride.TEST_API_SECRET = process.env.TEST_API_SECRET;

        // If we have at least a DB_TYPE, we can bypass the file load if it fails
        privateEnv = envOverride as any;
      }

      // SAFETY: Force TEST_MODE if running in test environment (Bun test)
      if (process.env.NODE_ENV === "test" && !process.env.TEST_MODE) {
        console.warn(
          "⚠️ Running in TEST environment but TEST_MODE is not set. Forcing usage of private.test.ts to protect live database.",
        );
        process.env.TEST_MODE = "true";
      }

      try {
        logger.debug("Loading @config/private configuration...");
        let module: any;
        if (process.env.TEST_MODE) {
          const pathUtil = await import("node:path");
          const { pathToFileURL } = await import("node:url");
          const configPath = pathUtil
            .resolve(process.cwd(), "config/private.test.ts")
            .replace(/\\/g, "/");
          if (!(await import("node:fs")).existsSync(configPath)) {
            logger.debug("TEST_MODE: config/private.test.ts not found");
            return null;
          }
          const configURL = `${pathToFileURL(configPath).href}?t=${Date.now()}`;

          try {
            module = await import(/* @vite-ignore */ configURL);
            if (!module.privateEnv && (module as any).DB_TYPE) {
              module = {
                privateEnv: { ...module } as any,
                __VIRTUAL__: true,
              };
            }
          } catch (err) {
            // Fallback for Node.js (e.g. vite preview) which cannot import .ts files natively
            logger.debug(
              "Dynamic import of private.test.ts failed (likely Node.js). Falling back to string parser.",
            );
            const fs = await import("node:fs");
            const content = fs.readFileSync(configPath, "utf8");
            const match = content.match(/export const privateEnv = ({[\s\S]*?});/);
            if (match) {
              const getObj = new Function(`return ${match[1]}`);
              module = { privateEnv: getObj() };
              module.__VIRTUAL__ = true;
            } else {
              throw err;
            }
          }
        } else {
          // STRICT SAFETY: Never allow loading live config if NODE_ENV is 'test'
          if (process.env.NODE_ENV === "test") {
            const msg =
              "CRITICAL SAFETY ERROR: Attempted to load live config/private.ts in TEST environment. Strict isolation requires config/private.test.ts.";
            logger.error(msg);
            throw new AppError(msg, 500, "TEST_ENV_SAFETY_VIOLATION");
          }

          try {
            const pathUtil = await import("node:path");
            const { pathToFileURL } = await import("node:url");
            const configPath = pathUtil.resolve(process.cwd(), "config", "private.ts");
            const configURL = `${pathToFileURL(configPath).href}?t=${Date.now()}`;
            module = await import(/* @vite-ignore */ configURL);
          } catch (err: unknown) {
            logger.debug(
              "Could not load config/private: " +
                (err instanceof Error ? err.message : String(err)),
            );
            return null;
          }
        }
        privateEnv = { ...module.privateEnv, ...envOverride };

        // 🛡️ ENHANCED MERGE: Ensure environment variables ALWAYS take precedence for infrastructure
        if (process.env.TEST_API_SECRET) privateEnv!.TEST_API_SECRET = process.env.TEST_API_SECRET;
        if (process.env.JWT_SECRET_KEY) privateEnv!.JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;
        if (process.env.ENCRYPTION_KEY) privateEnv!.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

        // SAFETY: Double-check we are not connecting to production in test mode
        if (
          (process.env.TEST_MODE || process.env.NODE_ENV === "test") &&
          privateEnv?.DB_NAME &&
          !privateEnv.DB_NAME.includes("test") &&
          !privateEnv.DB_NAME.endsWith("_functional")
        ) {
          const msg = `⚠️ SAFETY ERROR: DB_NAME '${privateEnv.DB_NAME}' does not look like a test database! Tests must use isolated databases.`;
          logger.error(msg);
          throw new AppError(msg, 500, "TEST_DB_SAFETY_VIOLATION");
        }

        // ✨ DEV FALLBACK: If import worked but result is empty, try direct file read
        // This handles cases where Vite's dynamic import might return an empty module during setup.
        if (!privateEnv?.DB_TYPE && !process.env.TEST_MODE) {
          try {
            const fs = await import("node:fs");
            const pathUtil = await import("node:path");
            const configPath = pathUtil.resolve(process.cwd(), "config", "private.ts");
            if (fs.existsSync(configPath)) {
              logger.debug("Falling back to direct file read for config/private.ts");
              const content = fs.readFileSync(configPath, "utf8");
              const match = content.match(/export const privateEnv = ({[\s\S]*?});/);
              if (match) {
                const getObj = new Function(`return ${match[1]}`);
                const parsed = getObj();
                privateEnv = { ...parsed, ...envOverride };
                logger.info("✅ Successfully loaded config via direct file read fallback");
              }
            }
          } catch (fallbackError) {
            logger.warn("Config fallback reading failed:", fallbackError);
          }
        }

        logger.debug(
          module.__VIRTUAL__ || (!module.privateEnv && privateEnv?.DB_TYPE)
            ? "Using fallback configuration (Setup Mode active)"
            : "Private config loaded successfully",
          {
            hasConfig: !!privateEnv,
            dbType: privateEnv?.DB_TYPE,
            hasTestSecret: !!privateEnv?.TEST_API_SECRET,
          },
        );
        return privateEnv;
      } catch (error: any) {
        // Private config doesn't exist during setup - this is expected
        if (process.env.TEST_MODE) {
          logger.error(
            "CRITICAL: config/private.test.ts not found or unreadable in TEST_MODE. " +
              "Please run 'scripts/setup-system.ts' or the benchmark runner first.",
          );
        } else {
          logger.trace(
            "Private config not found during setup - this is expected during initial setup",
          );
        }
        return null;
      }
    } catch (error: any) {
      // Private config doesn't exist during setup - this is expected
      logger.trace(
        "Private config not found during setup - this is expected during initial setup",
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return null;
    }
  })();

  return loadPromise;
}

/**
 * Get the in-memory private config if available.
 * Returns null if config hasn't been loaded yet (e.g., during setup).
 * Used by settingsService to avoid filesystem imports when config is already in memory.
 */
export function getPrivateEnv(): InferOutput<typeof privateConfigSchema> | null {
  return privateEnv;
}

/**
 * Get the structured database configuration
 */
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

/**
 * Get the structured Redis configuration
 */
export function getRedisConfig() {
  const env = getPrivateEnv();
  const useRedis = env?.USE_REDIS === true;
  const host = env?.REDIS_HOST || "localhost";
  const port = env?.REDIS_PORT || 6379;
  const password = env?.REDIS_PASSWORD;

  return {
    useRedis,
    host,
    port,
    password,
    url: `redis://${host}:${port}`,
    retryAttempts: 3,
    retryDelay: 2000,
  };
}

/**
 * Construct the database connection string based on config
 */
export function getDatabaseConnectionString(): string {
  const config = getDatabaseConfig();
  if (!config) return "";

  const { type, host, port, name, user, password } = config;

  // If host is already a full connection string, use it
  if (host.includes("://")) {
    // If it's a full URI, we check if it already has a database name
    // If not, we append the name from config
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

  switch (type) {
    case "mongodb": {
      const authParam = user ? `?authSource=admin` : "";
      return `mongodb://${authPart}${host}:${port}/${name}${authParam}`;
    }
    case "mongodb+srv": {
      // mongodb+srv (Atlas) often requires authSource=admin ONLY if the user is in the admin db.
      // For many Atlas clusters, it's better to omit it and let Atlas decide.
      // We will only include it if it's explicitly needed via the host string.
      return `mongodb+srv://${authPart}${host}/${name}?retryWrites=true&w=majority`;
    }
    case "mariadb":
      return `mysql://${authPart}${host}:${port}/${name}`;
    case "postgresql":
      return `postgresql://${authPart}${host}:${port}/${name}`;
    case "sqlite": {
      // Standardize SQLite placement under config/database/ unless an absolute path is provided
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

// Function to clear private config cache (used after setup completion)
export function clearPrivateConfigCache(keepPrivateEnv = false) {
  logger.debug("Clearing private config cache", {
    keepPrivateEnv,
    hadPrivateEnv: !!privateEnv,
  });
  if (!keepPrivateEnv) {
    privateEnv = null;
  }
}
