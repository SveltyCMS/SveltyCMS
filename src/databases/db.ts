/**
 * @file src/databases/db.ts
 * @description Core Database system with enhanced resilience and performance optimization.
 */

import { logger } from "@utils/logger";
import { type DatabaseAdapter } from "./db-interface";
import { loadPrivateConfig as loadConfig, getPrivateEnv } from "./config-state";

const ADAPTER_KEY = "__DB_ADAPTER_INSTANCE__";

export let dbAdapter: DatabaseAdapter | null = null;
export let auth: any = null;
let isConnected = false;

// Initialization Guards (Optimized for Multi-Threaded/Async Resilience)
let _dbInitializationPromise: Promise<any | null> | null = null;
let _redisCacheInitialized = false;
let _backgroundTasksStarted = false;
let _settingsLoaded = false;
let _cachedPrivateConfig: any = null;

// Lazy Holders for Server-Only Modules (Optimized for Cold-Starts & Build Safety)
let _dbInit: any = null;
async function getDbInit() {
  if (!_dbInit) {
    _dbInit = await import("./db-init");
  }
  return _dbInit;
}

export function getBootPhase() {
  return "FULL";
}
export { getPrivateEnv };

export function isDbConnected(): boolean {
  return isConnected;
}

/**
 * Initializes the database and core services.
 * This is the primary entry point for ensuring the CMS is ready for traffic.
 *
 * @param config - Optional override configuration.
 * @returns {Promise<any | null>} The initialized Auth service.
 */
export async function ensureFullInitialization(config?: any): Promise<any | null> {
  if (_dbInitializationPromise) return _dbInitializationPromise;

  _dbInitializationPromise = (async () => {
    const start = performance.now();
    try {
      const cfg = config || (await loadPrivateConfig());
      const { updateServiceHealth } = await import("../stores/system/state");

      if (!cfg) {
        logger.debug("[db.ts] Missing configuration - skipping database initialization");
        // During setup, missing config is expected. Do NOT mark as unhealthy or it blocks the redirect after setup.
        updateServiceHealth("database", "initializing", "Waiting for configuration...");
        return null;
      }

      // 1. Core Adapter & Connection
      const dbInit = await getDbInit();
      const adapter = await dbInit.loadAdapters(cfg);
      if (!adapter) {
        updateServiceHealth("database", "unhealthy" as any, "Failed to load database adapter");
        return null;
      }

      // Global singleton assignment
      dbAdapter = adapter;
      (globalThis as any)[ADAPTER_KEY] = adapter;
      (process as any)[ADAPTER_KEY] = adapter;

      const connectionResult = await adapter.connect(cfg as any);
      if (!connectionResult.success) {
        logger.error(`Database connection failed: ${connectionResult.message}`);
        throw new Error(`Database connection failed: ${connectionResult.message}`);
      }
      isConnected = true;
      logger.info(`Database initialized with adapter: ${adapter.type}`);
      dbAdapter = adapter;

      if (!_redisCacheInitialized) {
        const { cacheService } = await import("./cache/cache-service");
        await cacheService.initializeL2(cfg).catch((e) => logger.warn("Redis Init Warning:", e));
        _redisCacheInitialized = true;
      }

      // 3. Settings (Memoized)
      if (!_settingsLoaded) {
        const settingsSuccess = await dbInit.loadSettingsFromDB(adapter, true);
        if (!settingsSuccess) {
          logger.warn("Core settings failed to load from DB. System may be in restricted mode.");
        }
        _settingsLoaded = true;
      }

      // 4. Critical Services (Auth & Plugins)
      auth = await dbInit.initializeCriticalServices(adapter);

      try {
        const { initializePlugins } = await import("../plugins");
        await initializePlugins(adapter);
      } catch (e) {
        logger.error("Plugin initialization failed:", e);
      }

      updateServiceHealth("database", "healthy", "Database initialized");

      // 5. Background Tasks (Fire-and-forget, exactly once)
      if (!_backgroundTasksStarted) {
        _backgroundTasksStarted = true;
        // 🛡️ SAFETY: Catch errors in background tasks to prevent unhandledRejection
        dbInit.runBackgroundTasks(adapter).catch((err: any) => {
          logger.error("Error in background system tasks:", {
            message: err?.message || String(err),
            stack: err?.stack,
          });
        });
      }

      const { metricsService } = await import("../services/metrics-service");
      metricsService.recordMetric("boot:total", performance.now() - start);

      return auth;
    } catch (err: any) {
      const errorDetails = {
        message: err?.message || "Unknown error",
        stack: err?.stack,
        code: err?.code,
      };

      logger.error("CRITICAL: Full initialization failed:", errorDetails);
      const { updateServiceHealth } = await import("../stores/system/state");
      updateServiceHealth(
        "database",
        "unhealthy",
        `Critical system failure: ${errorDetails.message}`,
      );
      _dbInitializationPromise = null; // Allow retry
      return null;
    }
  })();

  return _dbInitializationPromise;
}

/**
 * Loads the private configuration.
 * Results are cached in-memory to avoid redundant disk/environment access.
 *
 * @param forceReload - If true, ignores the cache and re-reads the config.
 */
export async function loadPrivateConfig(forceReload = false) {
  if (_cachedPrivateConfig && !forceReload) return _cachedPrivateConfig;
  _cachedPrivateConfig = await loadConfig(forceReload);
  return _cachedPrivateConfig;
}

/**
 * Compatibility Export: Clears the private config cache.
 */
export function clearPrivateConfigCache(forceReload = false) {
  _cachedPrivateConfig = null;
  if (forceReload) return loadPrivateConfig(true);
}

/**
 * Compatibility Export: can be used as a Promise-like object OR called as a function
 */
export function getDbInitPromise(forceReload = false, _phase?: string) {
  if (forceReload) resetDbInitPromise();
  return ensureFullInitialization();
}

/**
 * Compatibility Export Proxy
 * @deprecated Use ensureFullInitialization() instead.
 */
export const dbInitPromise = new Proxy(getDbInitPromise, {
  get(target, prop) {
    const promise = target();
    if (prop === "then") return promise.then.bind(promise);
    if (prop === "catch") return promise.catch.bind(promise);
    if (prop === "finally") return promise.finally.bind(promise);
    const val = (promise as any)[prop];
    return typeof val === "function" ? val.bind(promise) : val;
  },
  apply(target, thisArg, argumentsList) {
    return Reflect.apply(target, thisArg, argumentsList);
  },
}) as any;

/**
 * Alias for backward compatibility.
 */
export const initializeSystem = ensureFullInitialization;

/**
 * PURE Accessor: Does not trigger initialization to avoid recursion.
 */
export function getDb(): DatabaseAdapter | null {
  return (process as any)[ADAPTER_KEY] || (globalThis as any)[ADAPTER_KEY] || dbAdapter;
}

/**
 * Initializes the system with a specific configuration.
 */
export async function initializeWithConfig(config: any): Promise<void> {
  if (config) {
    const { setPrivateEnv } = await import("./config-state");
    setPrivateEnv(config);
    _cachedPrivateConfig = config;
  }
  await ensureFullInitialization(config);
}

/**
 * Compatibility Export: Loads settings from database.
 */
export async function loadSettingsFromDB(
  adapter?: DatabaseAdapter,
  forceReload = false,
  tenantId?: string | null,
) {
  const dbInit = await getDbInit();
  const db = adapter || getDb();
  if (!db) return false;
  return dbInit.loadSettingsFromDB(db, forceReload, tenantId);
}

/**
 * Resets the database initialization state.
 * Sync function used by tests to clear memory before re-init.
 */
export function resetDbInitPromise(): void {
  isConnected = false;
  dbAdapter = null;
  (process as any)[ADAPTER_KEY] = null;
  _dbInitializationPromise = null;
  _redisCacheInitialized = false;
  _backgroundTasksStarted = false;
  _settingsLoaded = false;
  _cachedPrivateConfig = null;
}

export async function reinitializeSystem(force: boolean = true): Promise<any> {
  if (force) resetDbInitPromise();
  return ensureFullInitialization();
}

/**
 * ✨ ENTERPRISE: Graceful Shutdown
 * Ensures all connections and caches are closed cleanly.
 */
export async function shutdownSystem(): Promise<void> {
  logger.info("🛑 Shutting down system database and caches...");
  try {
    const adapter = getDb();
    if (adapter) {
      await adapter.disconnect();
    }

    const { cacheService } = await import("./cache/cache-service");
    await cacheService.cleanup();

    isConnected = false;
    resetDbInitPromise();
    logger.info("✅ Shutdown complete.");
  } catch (err) {
    logger.error("❌ Error during shutdown:", err);
  }
}
