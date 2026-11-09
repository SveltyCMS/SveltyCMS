/**
 * @file src\databases\theme-manager.ts
 * @description Theme manager for the CMS, utilizing a database-agnostic interface and now multi-tenant aware.
 *
 * ### Features
 * - Singleton pattern for global access
 * - Database-agnostic via IDBAdapter interface
 * - Caches themes in-memory for performance
 * - Supports multi-tenant theme management
 * - Fallback to default theme if database is unavailable
 */
import { nowISODateString } from "@utils/date";
import { raise } from "@utils/error-handling";
// System Logger
import { logger } from "@utils/logger";
import type { DatabaseId } from "../content/types";
import { buildDefaultAdminThemeConfig } from "@src/themes/builtin-defaults";
import type { IDBAdapter, Theme } from "./db-interface";

/** Tenant scope used for the shared/global theme cache entry. */
const GLOBAL_TENANT = "global";
/** Process-local theme cache TTL (ms) — mirrors the 300s cacheService TTL. */
const THEME_CACHE_TTL_MS = 300_000;

/** One lazy handle for the cache service — avoids repeated dynamic imports. */
let cacheServiceModulePromise: Promise<typeof import("./cache/cache-service")> | undefined;
function loadCacheServiceModule(): Promise<typeof import("./cache/cache-service")> {
  return (cacheServiceModulePromise ??= import("./cache/cache-service"));
}

/**
 * Fallback theme for when database is not available
 * This should match the theme that gets seeded during setup
 */
export const DEFAULT_THEME: Theme = {
  _id: "670e8b8c4d123456789abcde" as DatabaseId, // Matches the seeded theme ID
  path: "", // Default path
  name: "Default",

  isActive: false,
  isDefault: true,
  config: {
    tailwindConfigPath: "",
    assetsPath: "",
    adminTheme: buildDefaultAdminThemeConfig(),
  },
  createdAt: nowISODateString(),
  updatedAt: nowISODateString(),
};

export class ThemeManager {
  private static instance: ThemeManager;
  private readonly themeCache: Map<string, Theme> = new Map(); // Single cache for all themes
  private readonly themeCacheExpiresAt: Map<string, number> = new Map();
  private db: IDBAdapter | null = null;
  private initialized = false;

  private constructor() {}

  /** Reads a theme from the process-local cache, honoring its TTL. */
  private getCachedTheme(cacheKey: string): Theme | undefined {
    const expiresAt = this.themeCacheExpiresAt.get(cacheKey);
    if (expiresAt !== undefined && expiresAt <= Date.now()) {
      this.themeCache.delete(cacheKey);
      this.themeCacheExpiresAt.delete(cacheKey);
      return undefined;
    }
    return this.themeCache.get(cacheKey);
  }

  /** Writes a theme to the process-local cache with a TTL. */
  private setCachedTheme(cacheKey: string, theme: Theme): void {
    this.themeCache.set(cacheKey, theme);
    this.themeCacheExpiresAt.set(cacheKey, Date.now() + THEME_CACHE_TTL_MS);
  }

  public static getInstance(): ThemeManager {
    if (!ThemeManager.instance) {
      ThemeManager.instance = new ThemeManager();
    }
    return ThemeManager.instance;
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public async initialize(db: IDBAdapter): Promise<void> {
    if (this.initialized && this.db === db) {
      logger.debug("ThemeManager already initialized, skipping.");
      return;
    }

    try {
      this.db = db;
      this.themeCache.clear();
      this.themeCacheExpiresAt.clear();

      // Load and cache the default theme
      await this.loadAndCacheDefaultTheme();

      this.initialized = true;
      // Removed logger.info here - will be combined with timing in system init
    } catch (err) {
      const message = `Error in ThemeManager.initialize: ${(err as any)?.message || String(err)}`;
      logger.error(message);
      raise(500, message);
    }
  }

  private async ensureReady(): Promise<void> {
    const activeDb = this.db?.isConnected()
      ? this.db
      : ((await import("./db")).getDb() as IDBAdapter | null);

    if (!activeDb) {
      throw new Error("ThemeManager is not initialized.");
    }

    if (!this.initialized || this.db !== activeDb) {
      this.db = activeDb;
      this.themeCache.clear();
      this.themeCacheExpiresAt.clear();
      await this.loadAndCacheDefaultTheme();
      this.initialized = true;
    }
  }

  /**
   * Load the default theme from database and cache it
   */
  private async loadAndCacheDefaultTheme(): Promise<void> {
    if (!this.db) {
      throw new Error("Database adapter not initialized.");
    }

    try {
      // Single optimized database call - get all themes at once
      const allThemes = await this.db.system.themes.getAllThemes();

      if (!Array.isArray(allThemes) || allThemes.length === 0) {
        if (process.env.TEST_MODE !== "true") {
          logger.warn("No themes found in database. Using DEFAULT_THEME fallback.");
        }
        this.setCachedTheme(GLOBAL_TENANT, DEFAULT_THEME);
        try {
          const { cacheService } = await loadCacheServiceModule();
          await cacheService.set(`theme:${GLOBAL_TENANT}`, DEFAULT_THEME, 300, GLOBAL_TENANT);
        } catch (error) {
          logger.debug("[theme-manager] suppressed error", error);
        }
        return;
      }

      // Find active theme, or default theme, or first theme
      const defaultTheme =
        allThemes.find((t) => t.isActive) || allThemes.find((t) => t.isDefault) || allThemes[0];

      // Cache it as the global default
      this.setCachedTheme(GLOBAL_TENANT, defaultTheme);
      try {
        const { cacheService } = await loadCacheServiceModule();
        await cacheService.set(`theme:${GLOBAL_TENANT}`, defaultTheme, 300, GLOBAL_TENANT);
      } catch (error) {
        logger.debug("[theme-manager] suppressed error", error);
      }
      logger.debug(`Default theme cached: ${defaultTheme.name}`);
    } catch (err) {
      logger.error("Failed to load themes from database:", err);
      // Fallback to DEFAULT_THEME on error
      this.setCachedTheme(GLOBAL_TENANT, DEFAULT_THEME);
      try {
        const { cacheService } = await loadCacheServiceModule();
        await cacheService.set(`theme:${GLOBAL_TENANT}`, DEFAULT_THEME, 300, GLOBAL_TENANT);
      } catch (error) {
        logger.debug("[theme-manager] suppressed error", error);
      }
    }
  }

  public async getTheme(tenantId?: string | null): Promise<Theme> {
    await this.ensureReady();

    const cacheKey = tenantId || GLOBAL_TENANT;

    // Return from cache if available (includes the tenant→global mapping cached
    // below, so a tenant without its own theme no longer re-resolves per request).
    const cachedTheme = this.getCachedTheme(cacheKey);
    if (cachedTheme) {
      return cachedTheme;
    }

    // Try cacheService L1/L2. The global theme is stored under tenant "global" —
    // matching the write side — not under the "default" tenant.
    try {
      const { cacheService } = await loadCacheServiceModule();
      const scopeTenantId = tenantId || GLOBAL_TENANT;
      const cached = await cacheService.get<Theme>(`theme:${cacheKey}`, scopeTenantId);
      if (cached) {
        this.setCachedTheme(cacheKey, cached);
        return cached;
      }
    } catch (error) {
      logger.debug("[theme-manager] suppressed error", error);
    }

    // For tenant-specific themes, fall back to the global theme since
    // tenant-specific themes require additional schema implementation.
    if (tenantId) {
      logger.debug(`No tenant-specific theme for ${tenantId}, using global theme`);
      const globalTheme = await this.getTheme(null);
      if (globalTheme) {
        this.setCachedTheme(cacheKey, globalTheme);
        return globalTheme;
      }
    }

    // Global theme expired from both the local map and L1/L2: reload from DB.
    if (cacheKey === GLOBAL_TENANT) {
      await this.loadAndCacheDefaultTheme();
      const reloaded = this.getCachedTheme(GLOBAL_TENANT);
      if (reloaded) return reloaded;
    }

    // Final fallback - should rarely reach here
    logger.warn("No cached theme found, using DEFAULT_THEME fallback.");
    return DEFAULT_THEME;
  }

  public async setTheme(theme: Theme, tenantId?: string | null): Promise<void> {
    await this.ensureReady();
    const db = this.db;
    if (!db) {
      throw new Error("ThemeManager is not initialized.");
    }

    try {
      // Update database to set this theme as default
      const setDefaultResult = await db.system.themes.setDefault(theme._id);

      if (!setDefaultResult.success) {
        throw new Error(setDefaultResult.error?.message || "Failed to set theme as default");
      }

      // Update cache. The global theme is written and invalidated under tenant
      // "global" so the write/read/invalidation scope all agree.
      const cacheKey = tenantId || GLOBAL_TENANT;
      const scopeTenantId = tenantId || GLOBAL_TENANT;
      this.setCachedTheme(cacheKey, theme);
      try {
        const { cacheService } = await loadCacheServiceModule();
        await cacheService.set(`theme:${cacheKey}`, theme, 300, scopeTenantId);
        await cacheService.publishInvalidation(`theme:${cacheKey}`, scopeTenantId);
      } catch (error) {
        logger.debug("[theme-manager] suppressed error", error);
      }

      logger.info(`Theme updated to: ${theme.name}`, {
        tenantId: tenantId || GLOBAL_TENANT,
      });
    } catch (err: any) {
      const message = `Error in ThemeManager.setTheme: ${err.message}`;
      logger.error(message, { tenantId });
      raise(500, message);
    }
  }

  /**
   * Clear cache and reload themes from database
   */
  public async refresh(): Promise<void> {
    await this.ensureReady();

    this.themeCache.clear();
    this.themeCacheExpiresAt.clear();
    try {
      const { cacheService } = await loadCacheServiceModule();
      await cacheService.clearByPattern("theme:*");
    } catch (error) {
      logger.debug("[theme-manager] suppressed error", error);
    }
    await this.loadAndCacheDefaultTheme();
    logger.debug("ThemeManager cache refreshed.");
  }
}
