/**
 * @file src/databases/db-init.ts
 * @description 🚀  Topological Service Registry with Health Integration.
 */

import { logger } from "@utils/logger";
import { getGlobal, setGlobal } from "@src/utils/native-utils";
import type { IDBAdapter } from "./db-interface";
import { dbPluginRegistry } from "./core/plugin-registry";

/**
 * 🚀 AGNOSTIC CORE: Loads the physical database adapter based on config.
 */
export async function loadAdapters(config: any): Promise<IDBAdapter | null> {
  // 🚀 HARDENING: Support both UPPER_SNAKE_CASE (Private Config) and camelCase (SDK/Manual)
  const type = (
    config?.DB_TYPE ||
    config?.type ||
    config?.DATABASE_ENGINE ||
    process.env.DATABASE_ENGINE ||
    (process.env.TEST_MODE === "true" ? null : "sqlite")
  )?.toLowerCase();

  if (process.env.TEST_MODE === "true" || process.env.BENCHMARK_DEBUG === "true") {
    const source = config?.DB_TYPE
      ? "config.DB_TYPE"
      : config?.type
        ? "config.type"
        : process.env.DATABASE_ENGINE
          ? "DATABASE_ENGINE"
          : "Default";
    console.log(`[DB Init] Resolved adapter type: ${type} (Source: ${source})`);
  }

  if (!type) {
    throw new Error(
      "[DB Init] No database engine type specified (DB_TYPE or DATABASE_ENGINE). Defaulting is disabled in test mode.",
    );
  }

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
  } catch (err) {
    logger.error(`[DB Init] Failed to load adapter for ${type}:`, err);
    return null;
  }
}

/**
 * 🚀 AGNOSTIC CORE: Main entry point for initializing all system services.
 */
export async function initializeDatabase(adapter: IDBAdapter): Promise<void> {
  const { setSystemState, getSystemState, updateServiceHealth, startServiceInitialization } =
    await import("@src/stores/system/state.svelte");
  const { isSetupComplete } = await import("@utils/setup-check");

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
      const { contentSystem } = await import("@src/content/index.server");
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
      const { MediaService } = await import("@src/utils/media/media-service.server");
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

  // 🚀 PERFORMANCE: Reduced sync delay from 50ms to 5ms
  await new Promise((r) => setTimeout(r, 5));
  const services: any[] = ["cache", "media", "widgets", "themeManager", "search", "contentSystem"];
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
