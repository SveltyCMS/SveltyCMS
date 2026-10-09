/**
 * @file src/databases/db-init.ts
 * @description 🚀  Topological Service Registry with Health Integration.
 */

import { logger } from "@utils/logger";
import { getGlobal, setGlobal } from "@src/utils/native-utils";
import type { IDBAdapter } from "./db-interface";
import { withSystemScope } from "./system-tenant-scope";

export interface DBInitPlugin {
  id: string;
  dependencies?: string[];
  critical?: boolean;
  initialize(adapter: IDBAdapter): Promise<void>;
}

export class DBPluginRegistry {
  private plugins: Map<string, DBInitPlugin> = new Map();
  private initialized: Set<string> = new Set();

  public register(plugin: DBInitPlugin): void {
    if (this.plugins.has(plugin.id)) {
      logger.info(`[DB Registry] Plugin '${plugin.id}' is already registered. Overwriting.`);
    }
    this.plugins.set(plugin.id, plugin);
  }

  public reset(): void {
    this.plugins.clear();
    this.initialized.clear();
    logger.info("[DB Registry] Plugin registry reset.");
  }

  public async bootAll(adapter: IDBAdapter): Promise<void> {
    logger.info(`[DB Registry] Booting ${this.plugins.size} services (dependency order)...`);
    this.initialized.clear();
    const queue = Array.from(this.plugins.values());

    while (queue.length > 0) {
      const readyToBoot: DBInitPlugin[] = [];
      const blocked: DBInitPlugin[] = [];
      for (let i = 0; i < queue.length; i++) {
        const plugin = queue[i];
        const deps = plugin.dependencies;
        if (!deps || deps.every((d) => this.initialized.has(d))) {
          readyToBoot.push(plugin);
        } else {
          blocked.push(plugin);
        }
      }

      if (readyToBoot.length === 0) {
        const remaining = blocked.map((p) => p.id).join(", ");
        throw new Error(
          `[DB Registry] Circular dependency or missing services detected: ${remaining}`,
        );
      }

      await Promise.all(
        readyToBoot.map(async (plugin) => {
          try {
            logger.debug(`[DB Registry] Initializing service: ${plugin.id}...`);
            await plugin.initialize(adapter);
            this.initialized.add(plugin.id);
            logger.debug(`[DB Registry] Initialized: ${plugin.id}`);
          } catch (error) {
            logger.error(`[DB Registry] Failed to initialize ${plugin.id}:`, error);
            if (plugin.critical) {
              throw new Error(
                `CRITICAL BOOT FAILURE: Service '${plugin.id}' failed to initialize: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
            this.initialized.add(plugin.id);
          }
        }),
      );
      queue.length = 0;
      for (let i = 0; i < blocked.length; i++) queue.push(blocked[i]);
    }

    logger.info("[DB Registry] System services online.");
  }
}

export const dbPluginRegistry = new DBPluginRegistry();

/** Cached lazy handle to the content engine — one module-registry lookup instead of one per call. */
let contentModulePromise: Promise<typeof import("@src/content/index.server")> | undefined;
function loadContentModule(): Promise<typeof import("@src/content/index.server")> {
  return (contentModulePromise ??= import("@src/content/index.server"));
}

// 🟢 Bun/Node compatibility: Shim `node:v8` for the `bson` package
// so MongoDB adapter works under Bun without requiring Node.js/vitest.
import "@utils/v8-shim";

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
        try {
          (adapter as any).authService = new Auth(adapter, getDefaultSessionStore());
        } catch (e: any) {
          logger.error(`[DB Init] Auth service assignment failed: ${e?.message || e}`);
        }
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

      // Migrations for SQLite run inside adapter.provision() (via ensure* below);
      // PostgreSQL/MariaDB run them in their connect() implementations.
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
      const { loadPrivateConfig } = await import("./config-state");
      const config = await loadPrivateConfig();
      await cacheService.initialize(config);
      updateServiceHealth("cache", "healthy", "Cache service online");

      // Warm critical paths on startup in background if setup complete.
      // 🔴 FIX 9 (readiness gate): the boot cache-warming is non-blocking by design, but we
      // now expose a `cacheWarming` service status so the load-balancer readiness probe can
      // hold traffic until the smart pre-warm completes. We set it to `initializing` before
      // firing, then `healthy` (or a non-blocking note) on settle — NOT awaited, so the boot
      // itself stays fast, but the probe knows warming is still in flight.
      const { isSetupComplete } = await import("../utils/server/setup-check");
      if (isSetupComplete()) {
        startServiceInitialization("cacheWarming");
        const { cacheWarmingService } = await import("./cache/cache-warming-service");
        cacheWarmingService
          .initialize(adapter)
          .then(() => {
            updateServiceHealth("cacheWarming", "healthy", "Cache warming complete");
          })
          .catch((err) => {
            logger.trace("Cache warming failed:", err);
            // Non-fatal: warming is best-effort. Mark healthy so readiness is released —
            // a cold cache is recoverable, an infinitely-unready pod is not.
            updateServiceHealth("cacheWarming", "healthy", "Cache warming skipped (non-fatal)");
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
      const { contentSystem } = await loadContentModule();
      await contentSystem.initialize(null, { skipReconciliation: true }, adapter);
      updateServiceHealth("contentSystem", "healthy", "Content system online");

      // 🚀 Pre-warm SDK schema LRU + adapter table registry immediately after content loads.
      // This ensures the first collection create/update hits in-memory cache (zero DDL cost).
      try {
        const { contentStore } = await import("@src/stores/content-registry.svelte");
        const { prewarmCollectionSchemas } =
          await import("@src/services/sdk/namespaces/collections/schema-store");
        const schemas = contentStore.getAllCollections(null);
        if (schemas.length > 0) {
          prewarmCollectionSchemas(schemas, adapter, null);
          logger.info(`[DB Init] Pre-warmed ${schemas.length} collection schemas into SDK LRU`);
        }
      } catch (err) {
        logger.warn("[DB Init] Schema pre-warm failed (non-fatal):", err);
      }
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
      const { initializePlugins } = await import("@src/plugins/init.server");
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
    const result = await adapter.crud.findMany<any>(
      "system_preferences",
      {},
      withSystemScope("bootstrap"),
    );
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
