/**
 * @file src/databases/db-init.ts
 * @description Core initialization logic for SveltyCMS Database system.
 * 🚀 V8 UPDATE: Uses the BootEngine for declarative, dependency-aware startup.
 */

import { logger } from "@utils/logger";
import type { DatabaseAdapter } from "./db-interface";
import { BootEngine } from "./agnostic-core/boot-engine";
import { createSchemaProxy } from "./agnostic-core/schema-proxy";

// Lazy Holders for Server-Only Modules
let _settingsService: any = null;
async function getSettingsService() {
  if (!_settingsService) _settingsService = await import("../services/core/settings-service");
  return _settingsService;
}

let _resilience: any = null;
async function getResilience() {
  if (!_resilience) {
    const { getDatabaseResilience } = await import("./database-resilience");
    _resilience = getDatabaseResilience({ maxAttempts: 3, initialDelayMs: 500 });
  }
  return _resilience;
}

/**
 * Loads adapters and wraps with the V8 Schema Proxy.
 */
export async function loadAdapters(config: any): Promise<DatabaseAdapter | null> {
  const isSSR = typeof import.meta.env !== "undefined" ? (import.meta.env as any).SSR : true;
  if (!isSSR) return null;

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

      // 🚀Apply Schema Proxy for db.collection.find() syntax
      dbAdapter = createSchemaProxy(dbAdapter);

      // 🚀 Lazy-Loading Core Services
      // This allows the system to boot without instantiating heavy services until needed.
      const target = dbAdapter as any;
      let _auth: any = null;
      let _content: any = null;
      let _media: any = null;

      Object.defineProperties(target, {
        authService: {
          get: () => {
            if (_auth) return _auth;
            // Note: This is an async-capable getter pattern.
            // While getters are sync, the internal init can be triggered.
            // For V8, we still rely on runSystemBoot for the actual critical init.
            return _auth;
          },
          set: (val) => {
            _auth = val;
          },
          configurable: true,
          enumerable: true,
        },
        contentService: {
          get: () => _content,
          set: (val) => {
            _content = val;
          },
          configurable: true,
          enumerable: true,
        },
        mediaService: {
          get: () => _media,
          set: (val) => {
            _media = val;
          },
          configurable: true,
          enumerable: true,
        },
      });
    }
  }, "Database Adapter Loading");

  return dbAdapter;
}

/**
 * Orchestrates the full system boot using the V8 Boot Engine.
 */
export async function runSystemBoot(dbAdapter: DatabaseAdapter) {
  const engine = new BootEngine();

  // 0. Base Adapter (already initialized, but needed for dependency resolution)
  engine.register({
    id: "adapter",
    dependencies: [],
    init: async () => {},
  });

  // 1. Settings & Core
  engine.register({
    id: "settings",
    dependencies: ["adapter"],
    critical: true,
    init: async () => {
      await loadSettingsFromDB(dbAdapter, false);
    },
  });

  // 2. Authentication
  engine.register({
    id: "auth",
    dependencies: ["settings"],
    critical: true,
    init: async () => {
      if (dbAdapter.ensureAuth) await dbAdapter.ensureAuth();
      const { Auth } = await import("./auth");
      const { getDefaultSessionStore } = await import("./auth/session-manager");
      (dbAdapter as any).authService = new Auth(dbAdapter, getDefaultSessionStore());
    },
  });

  // 3. Content System
  engine.register({
    id: "content",
    dependencies: ["settings"],
    critical: true,
    init: async () => {
      if (dbAdapter.ensureSystem) await dbAdapter.ensureSystem();
      if (dbAdapter.ensureCollections) await dbAdapter.ensureCollections();
      if (dbAdapter.ensureContent) await dbAdapter.ensureContent();
      const { contentSystem } = await import("../content/index.server");
      await contentSystem.initialize(null, { skipReconciliation: true }, dbAdapter);
    },
  });

  // 4. Media & Assets
  engine.register({
    id: "media",
    dependencies: ["settings"],
    init: async () => {
      if (dbAdapter.ensureMedia) await dbAdapter.ensureMedia();
    },
  });

  // 5. Themes
  engine.register({
    id: "themes",
    dependencies: ["content"],
    init: async () => {
      const { ThemeManager } = await import("./theme-manager");
      await ThemeManager.getInstance().initialize(dbAdapter);
    },
  });

  // 6. Cache Warming
  engine.register({
    id: "cache",
    dependencies: ["content", "themes"],
    init: async () => {
      const { cacheWarmingService } = await import("./cache-warming-service");
      await cacheWarmingService.initialize(dbAdapter);
    },
  });

  // 7. Optimizer & Monitoring
  engine.register({
    id: "optimizer",
    dependencies: ["adapter"],
    init: async () => {
      if (dbAdapter.ensureMonitoring) await dbAdapter.ensureMonitoring();
      const { initializeIndexOptimizer, indexOptimizer } =
        await import("../services/database/index-optimizer.server");
      initializeIndexOptimizer(dbAdapter);
      void indexOptimizer?.optimizeAll();
    },
  });

  // Start the DAG boot process
  await engine.boot();
}

/**
 * Legacy compatibility wrappers
 */
export async function loadSettingsFromDB(
  dbAdapter: DatabaseAdapter,
  _criticalOnly = false,
  tenantId?: string | null,
): Promise<boolean> {
  try {
    if (!dbAdapter) return false;
    const { settingsService } = await getSettingsService();
    await settingsService.loadSettingsCache(tenantId || undefined, {
      dbAdapter,
      getPrivateEnv: () => (globalThis as any)._privateEnv,
    });
    return true;
  } catch (error) {
    logger.error("Failed to load settings:", error);
    return false;
  }
}

export async function initializeCriticalServices(dbAdapter: DatabaseAdapter) {
  await runSystemBoot(dbAdapter);
  return (dbAdapter as any).authService;
}

export async function runBackgroundTasks(_dbAdapter: DatabaseAdapter) {
  // runSystemBoot already covers background tasks in V8
  return Promise.resolve();
}
