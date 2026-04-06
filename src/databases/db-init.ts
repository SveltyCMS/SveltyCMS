/**
 * @file src/databases/db-init.ts
 * @description Core initialization logic for SveltyCMS Database system.
 * Separated from db.ts to reduce initial module count and improve cold-starts.
 */

import { logger } from "@utils/logger";
import { updateServiceHealth } from "@src/stores/system/state";
import { cacheService } from "@src/databases/cache/cache-service";
import { loadPrivateConfig } from "./config-state";
import { KNOWN_PUBLIC_KEYS, KNOWN_PRIVATE_KEYS, CRITICAL_SETTINGS } from "./db-utils";
import {
  setSettingsCache,
  invalidateSettingsCache,
  type PublicEnv,
} from "@src/services/settings-service";
import type { DatabaseAdapter } from "./db-interface";

async function getResilience() {
  const { getDatabaseResilience } = await import("./database-resilience");
  return getDatabaseResilience({
    maxAttempts: 3,
    initialDelayMs: 500,
    backoffMultiplier: 2,
    maxDelayMs: 5000,
    jitterMs: 200,
  });
}

/**
 * Loads all settings from the database and populates the in-memory cache.
 */
export async function loadSettingsFromDB(
  dbAdapter: DatabaseAdapter,
  criticalOnly = false,
): Promise<boolean> {
  try {
    if (!dbAdapter) {
      await invalidateSettingsCache();
      return false;
    }

    if (dbAdapter.ensureSystem) {
      await dbAdapter.ensureSystem();
    }

    const keysToLoad = criticalOnly ? CRITICAL_SETTINGS : KNOWN_PUBLIC_KEYS;
    const privateKeys = criticalOnly ? [] : KNOWN_PRIVATE_KEYS;

    const [settingsResult, privateDynResult] = await Promise.all([
      dbAdapter.system.preferences.getMany(keysToLoad, "system"),
      privateKeys.length > 0
        ? dbAdapter.system.preferences.getMany(privateKeys, "system")
        : Promise.resolve({ success: true, data: {} }),
    ]);

    if (!settingsResult.success) {
      throw new Error(`Could not load settings: ${settingsResult.error?.message}`);
    }

    const settings = settingsResult.data || {};
    const privateDynamic = privateDynResult.success ? privateDynResult.data || {} : {};

    if (Object.keys(settings).length === 0 && !criticalOnly) {
      await invalidateSettingsCache();
      return false;
    }

    const privateConfig = await loadPrivateConfig(false);
    if (!privateConfig) return false;

    const mergedPrivate = { ...privateConfig, ...privateDynamic };
    await setSettingsCache(mergedPrivate as any, settings as unknown as PublicEnv);

    await cacheService
      .reconfigure()
      .catch((e: any) => logger.warn("Failed to reconfigure CacheService:", e));

    if (!criticalOnly) {
      logger.info("✅ Full system settings loaded and cached.");
    }
    return true;
  } catch (error) {
    if (!criticalOnly) logger.error("Failed to load settings:", error);
    await invalidateSettingsCache();
    return false;
  }
}

export async function loadAdapters(config: any): Promise<DatabaseAdapter | null> {
  if (!import.meta.env.SSR) return null;

  const resilience = await getResilience();
  let dbAdapter: DatabaseAdapter | null = null;

  await resilience.executeWithRetry(async () => {
    switch (config.DB_TYPE) {
      case "mongodb":
      case "mongodb+srv": {
        const { MongoDBAdapter } = await import("./mongodb/mongo-db-adapter");
        dbAdapter = new MongoDBAdapter() as unknown as DatabaseAdapter;
        break;
      }
      case "mariadb": {
        const { MariaDBAdapter } = await import("./mariadb/mariadb-adapter");
        dbAdapter = new MariaDBAdapter() as unknown as DatabaseAdapter;
        break;
      }
      case "postgresql": {
        const { PostgreSQLAdapter } = await import("./postgresql/postgres-adapter");
        dbAdapter = new PostgreSQLAdapter() as unknown as DatabaseAdapter;
        break;
      }
      case "sqlite": {
        const { SQLiteAdapter } = await import("./sqlite/adapter");
        dbAdapter = new SQLiteAdapter() as unknown as DatabaseAdapter;
        break;
      }
      default:
        throw new Error(`Unsupported DB_TYPE: ${config.DB_TYPE}`);
    }

    if (dbAdapter) {
      const { wrapAdapterWithWebhooks } = await import("./webhook-wrapper");
      dbAdapter = await wrapAdapterWithWebhooks(dbAdapter);
    }
  }, "Database Adapter Loading");

  return dbAdapter;
}

export async function initializeCriticalServices(dbAdapter: DatabaseAdapter) {
  updateServiceHealth("auth", "initializing", "Initializing authentication service...");

  if (dbAdapter?.ensureAuth) await dbAdapter.ensureAuth();
  if (dbAdapter?.ensureCollections) await dbAdapter.ensureCollections();
  if (dbAdapter?.ensureContent) await dbAdapter.ensureContent();
  if (dbAdapter?.ensureMedia)
    await dbAdapter.ensureMedia().catch((e) => logger.warn("Media activation issue:", e));
  if (dbAdapter?.ensureMonitoring) await dbAdapter.ensureMonitoring();

  const [{ Auth }, { getDefaultSessionStore }] = await Promise.all([
    import("@src/databases/auth"),
    import("@src/databases/auth/session-manager"),
  ]);

  const auth = new Auth(dbAdapter, getDefaultSessionStore());
  updateServiceHealth("auth", "healthy", "Authentication service ready");

  return auth;
}

export async function runBackgroundTasks(dbAdapter: DatabaseAdapter) {
  try {
    // Initialize Index Optimizer
    try {
      const { initializeIndexOptimizer, indexOptimizer } =
        await import("@src/services/database/index-optimizer.server");
      initializeIndexOptimizer(dbAdapter);
      void indexOptimizer?.optimizeAll();
    } catch (e) {
      logger.warn("[db] Index optimization failed to start:", e);
    }

    updateServiceHealth("cache", "initializing", "Warming up cache...");
    updateServiceHealth("themeManager", "initializing", "Initializing themes...");

    await Promise.all([
      (async () => {
        const { ThemeManager } = await import("@src/databases/theme-manager");
        const instance = ThemeManager?.getInstance();
        if (instance?.initialize) {
          await instance.initialize(dbAdapter);
          updateServiceHealth("themeManager", "healthy", "Themes initialized");
        }
      })(),
      (async () => {
        const { cacheWarmingService } = await import("@src/databases/cache-warming-service");
        if (cacheWarmingService?.initialize) {
          await cacheWarmingService.initialize(dbAdapter);
          updateServiceHealth("cache", "healthy", "Cache warmed up");
        }
      })(),
      (async () => {
        updateServiceHealth("contentManager", "initializing", "Initializing content manager...");
        const { contentSystem } = await import("@src/content");
        if (contentSystem?.initialize) {
          await contentSystem.initialize(null, true, dbAdapter);
          updateServiceHealth("contentManager", "healthy", "Content manager initialized");
        }
      })(),
    ]);

    logger.info("✅ All background services ready.");
  } catch (error) {
    logger.error("Error in background system tasks:", error);
  } finally {
    cacheService.setBootstrapping(false);
  }
}
