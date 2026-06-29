/**
 * @file src/databases/db-init.ts
 * @description 🚀  Topological Service Registry with Health Integration.
 */

import { logger } from "@utils/logger";
import type { IDBAdapter } from "./db-interface";
import { dbPluginRegistry } from "./core/plugin-registry";

// 🟢 Bun/Node compatibility: Shim `node:v8` for the `bson` package
// so MongoDB adapter works under Bun without requiring Node.js/vitest.
import "@utils/v8-shim";

/**
 * 🚀 GLOBAL STATE HELPERS — inlined from @src/utils/native-utils to avoid
 * runtime alias resolution issues in bundled output (CI DB integration tests).
 */
const setGlobal = (key: string, val: any) => {
  (globalThis as any)[key] = val;
  return val;
};
const getGlobal = <T = any>(key: string, defaultVal: T = null as any): T => {
  const val = (globalThis as any)[key];
  return val !== undefined ? val : defaultVal;
};

/**
 * 🚀 AGNOSTIC CORE: Loads the physical database adapter based on config.
 */
export async function loadAdapters(config: any): Promise<IDBAdapter | null> {
  // 🚀 RESILIENT RESOLUTION: Support all casing and environment sources
  const type = (
    config?.DB_TYPE ||
    config?.type ||
    config?.DATABASE_ENGINE ||
    process.env.DATABASE_ENGINE ||
    process.env.DB_TYPE ||
    "sqlite"
  ).toLowerCase();

  logger.debug(`[DB Init] Loading ${type} adapter...`);

  try {
    if (type === "sqlite") {
      const { SQLiteAdapter } = await import("./sqlite/sqlite-adapter");
      return new SQLiteAdapter(config);
    } else if (type === "postgresql") {
      const { PostgreSQLAdapter } = await import("./postgresql/postgres-adapter");
      return new PostgreSQLAdapter(config);
    } else if (type === "mariadb") {
      const { MariaDBAdapter } = await import("./mariadb/mariadb-adapter");
      return new MariaDBAdapter(config);
    } else if (type === "mongodb") {
      const { MongoDBAdapter } = await import("./mongodb/mongo-db-adapter");
      return new MongoDBAdapter(config);
    }
    throw new Error(`Unsupported database type: ${type}`);
  } catch (err: any) {
    logger.error(`[DB Init] Failed to load adapter for ${type}:`, {
      message: err.message,
      stack: err.stack,
      error: err,
    });
    return null;
  }
}

/**
 * 🚀 AGNOSTIC CORE: Main entry point for initializing all system services.
 */
export async function initializeDatabase(adapter: IDBAdapter): Promise<void> {
  const { setSystemState, getSystemState, updateServiceHealth, startServiceInitialization } =
    await import("@src/stores/system/state.svelte.ts");
  const { isSetupComplete } = await import("../utils/server/setup-check");

  const setupComplete = isSetupComplete();

  if (!setupComplete) {
    logger.info("[DB Init] Fresh install detected. Entering SETUP mode.");

    // 1. Critical Base Setup
    dbPluginRegistry.register({
      id: "base",
      critical: true,
      initialize: async (adapter) => {
        startServiceInitialization("database");
        // For setup, we only need basic system tables
        const target = adapter as any;
        if (typeof target.ensureSystem === "function") await target.ensureSystem();
        updateServiceHealth("database", "healthy", "Database service ready (SETUP mode)");
      },
    });

    // 2. Critical Auth Setup
    dbPluginRegistry.register({
      id: "auth",
      dependencies: ["base"],
      critical: true,
      initialize: async (adapter) => {
        startServiceInitialization("auth");
        const { Auth } = await import("./auth");
        const { getDefaultSessionStore } = await import("./auth/session-manager");
        (adapter as any).authService = new Auth(adapter, getDefaultSessionStore());
        updateServiceHealth("auth", "healthy", "Auth service ready (SETUP mode)");
      },
    });

    // 3. Skip non-critical services
    const skipped: any[] = ["media", "widgets", "themeManager", "search", "contentSystem", "cache"];
    for (const s of skipped) {
      updateServiceHealth(s, "skipped", "Skipped during setup phase");
    }

    setSystemState("SETUP", "System awaiting configuration");
    logger.info(`[DB Init] System entered SETUP mode.`);

    // Bootstrap critical setup services
    await dbPluginRegistry.bootAll(adapter);
    return;
  }

  // 1. Base Setup (Critical)
  dbPluginRegistry.register({
    id: "base",
    critical: true,
    initialize: async (adapter) => {
      startServiceInitialization("database");

      // 🚀 HARDENING: Run migrations before ANY services start
      if (adapter.type === "sqlite") {
        const { runMigrations } = await import("./sqlite/migrations");
        const client = (adapter as any).sqlite;
        await runMigrations(client);
      }

      const target = adapter as any;
      if (typeof target.ensureAuth === "function") await target.ensureAuth();
      if (typeof target.ensureSystem === "function") await target.ensureSystem();

      updateServiceHealth("database", "healthy", "Database initialized and migrated");
    },
  });

  // 2. Settings (Critical)
  dbPluginRegistry.register({
    id: "settings",
    dependencies: ["base"],
    critical: true,
    initialize: async (adapter) => {
      await loadSettingsFromDB(adapter, true);
    },
  });

  // Cache Service (Critical)
  dbPluginRegistry.register({
    id: "cache",
    dependencies: ["base"],
    critical: true,
    initialize: async (adapter) => {
      startServiceInitialization("cache");
      const { cacheService } = await import("./cache/cache-service");
      const { loadPrivateConfig } = await import("./db");
      const config = await loadPrivateConfig();
      await cacheService.initialize(config);
      updateServiceHealth("cache", "healthy", "Cache service online");

      // Warm critical paths on startup in background if setup complete
      const { isSetupComplete } = await import("../utils/server/setup-check");
      if (isSetupComplete()) {
        const { cacheWarmingService } = await import("./cache/cache-warming-service");
        cacheWarmingService.initialize(adapter).catch((err) => {
          logger.trace("Cache warming failed:", err);
        });
      }
    },
  });

  // 3. Auth Service
  dbPluginRegistry.register({
    id: "auth",
    dependencies: ["base"],
    critical: true,
    initialize: async (adapter) => {
      startServiceInitialization("auth");
      const { Auth } = await import("./auth");
      const { getDefaultSessionStore } = await import("./auth/session-manager");
      (adapter as any).authService = new Auth(adapter, getDefaultSessionStore());
      updateServiceHealth("auth", "healthy", "Auth service online");
    },
  });

  // 4. Content System
  dbPluginRegistry.register({
    id: "content",
    dependencies: ["base"],
    critical: true,
    initialize: async (adapter) => {
      startServiceInitialization("contentSystem");
      let contentSystem: any;
      // Try multiple resolution strategies for the content system
      try {
        // Strategy 1: Check if already loaded on globalThis (by hooks.server or other)
        contentSystem = (globalThis as any).__contentSystem__;
        if (!contentSystem) {
          // Strategy 2: Dynamic import with @vite-ignore (works in dev, may fail in prod)
          ({ contentSystem } = await import(/* @vite-ignore */ "@src/content/index.server"));
        }
        if (!contentSystem) {
          // Strategy 3: Use createRequire with process.cwd() to find the source
          const { createRequire } = await import("node:module");
          const path = await import("node:path");
          const require = createRequire(import.meta.url);
          const contentPath = path.resolve(process.cwd(), "src/content/index.server");
          contentSystem = require(contentPath).contentSystem;
        }
      } catch (e) {
        logger.error("[DB Init] All content system import strategies failed:", e);
        throw e;
      }
      if (!contentSystem) throw new Error("Content system module not found");
      await contentSystem.initialize(null, { skipReconciliation: true }, adapter);
      updateServiceHealth("contentSystem", "healthy", "Content system online");
    },
  });

  // 5. Media & Assets
  dbPluginRegistry.register({
    id: "media",
    dependencies: ["base"],
    initialize: async (adapter) => {
      startServiceInitialization("media");
      const { MediaService } = await import(/* @vite-ignore */ "@utils/media/media-service.server");
      (adapter as any).mediaService = new MediaService(adapter);
      updateServiceHealth("media", "healthy", "Media service online");
    },
  });

  // 6. Audit Hooks (Security)
  dbPluginRegistry.register({
    id: "audit-hooks",
    dependencies: ["base"],
    initialize: async (adapter) => {
      const { auditService } = await import("@src/services/security/audit-service");
      auditService.registerHooks(adapter);
    },
  });

  // 7. SEO & Plugins
  dbPluginRegistry.register({
    id: "seo",
    dependencies: ["content"],
    initialize: async (adapter) => {
      const { initializePlugins } = await import("@src/plugins/index");
      await initializePlugins(adapter);
    },
  });

  // 🚀 Start the parallel topological boot
  setSystemState("INITIALIZING", "Starting phased topological boot");
  logger.info(`[DB Init] Starting bootAll...`);
  await dbPluginRegistry.bootAll(adapter);
  logger.info(`[DB Init] bootAll complete.`);

  // Theme file discovery on boot (production/preview — no Vite HMR required)
  try {
    const { syncAllThemeFiles } = await import("@src/services/core/theme-file-sync");
    await syncAllThemeFiles();
  } catch (err) {
    logger.warn("[DB Init] Theme file sync failed (non-fatal):", err);
  }

  // 🚀 PERFORMANCE: Reduced sync delay from 50ms to 5ms
  await new Promise((r) => setTimeout(r, 5));
  const services: any[] = [
    "database",
    "auth",
    "cache",
    "media",
    "widgets",
    "themeManager",
    "search",
    "contentSystem",
  ];
  for (const s of services) {
    const current = (getSystemState().services as any)[s];
    if (!current || (current.status !== "healthy" && current.status !== "unhealthy")) {
      updateServiceHealth(s, "healthy", "Phased boot completed");
    }
  }
}

/**
 * 🚀 AGNOSTIC CORE: Loads system settings from the database into memory.
 */
export async function loadSettingsFromDB(adapter: IDBAdapter, force = false): Promise<boolean> {
  try {
    if (!force && getGlobal("__SETTINGS_LOADED__", false)) return true;

    // Load from system_preferences table
    const result = await adapter.crud.findMany<any>("system_preferences", {});
    if (result.success && result.data) {
      const settings: Record<string, any> = {};
      for (const pref of result.data) {
        settings[pref.key] = pref.value;
      }
      setGlobal("__SYSTEM_SETTINGS__", settings);
      setGlobal("__SETTINGS_LOADED__", true);
      return true;
    }
    return false;
  } catch (error) {
    logger.error("[DB Init] Failed to load settings from DB:", error);
    return false;
  }
}

/**
 * 🚀 AGNOSTIC CORE: Compatibility wrapper for runSystemBoot.
 */
export async function runSystemBoot(adapter: IDBAdapter): Promise<void> {
  await initializeDatabase(adapter);
}

/**
 * 🚀 AGNOSTIC CORE: Start background maintenance tasks.
 */
export async function runBackgroundTasks(adapter: IDBAdapter): Promise<void> {
  logger.info("[DB Init] Starting background maintenance tasks...");

  // Periodic cleanup (sessions, tokens)
  setInterval(
    async () => {
      try {
        if (adapter.cleanupExpiredData) {
          await adapter.cleanupExpiredData();
        }
      } catch (err) {
        logger.error("[Background Tasks] Cleanup failed:", err);
      }
    },
    1000 * 60 * 60,
  ); // Hourly
}
