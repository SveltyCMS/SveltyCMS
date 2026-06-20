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
import { error } from "@sveltejs/kit";
import { nowISODateString } from "@utils/date";
// System Logger
import { logger } from "@utils/logger";
import type { DatabaseId } from "../content/types";
import { buildDefaultAdminThemeConfig } from "@src/themes/builtin-defaults";
import type { IDBAdapter, Theme } from "./db-interface";

/**
 * Fallback theme for when database is not available
 * This should match the theme that gets seeded during setup
 */
export const DEFAULT_THEME: Theme = {
  _id: "670e8b8c4d123456789abcde" as DatabaseId, // Matches the seeded theme ID
  path: "", // Default path
  name: "SveltyCMSTheme",

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
  private db: IDBAdapter | null = null;
  private initialized = false;

  private constructor() {}

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

      // Load and cache the default theme
      await this.loadAndCacheDefaultTheme();

      this.initialized = true;
      // Removed logger.info here - will be combined with timing in system init
    } catch (err) {
      const message = `Error in ThemeManager.initialize: ${(err as any)?.message || String(err)}`;
      logger.error(message);
      throw error(500, message);
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
        logger.warn("No themes found in database. Using DEFAULT_THEME fallback.");
        this.themeCache.set("global", DEFAULT_THEME);
        try {
          const { cacheService } = await import("./cache/cache-service");
          await cacheService.set("theme:global", DEFAULT_THEME, 300, "global");
        } catch {}
        return;
      }

      // Find active theme, or default theme, or first theme
      const defaultTheme =
        allThemes.find((t) => t.isActive) || allThemes.find((t) => t.isDefault) || allThemes[0];

      // Cache it as the global default
      this.themeCache.set("global", defaultTheme);
      try {
        const { cacheService } = await import("./cache/cache-service");
        await cacheService.set("theme:global", defaultTheme, 300, "global");
      } catch {}
      logger.debug(`Default theme cached: ${defaultTheme.name}`);
    } catch (err) {
      logger.error("Failed to load themes from database:", err);
      // Fallback to DEFAULT_THEME on error
      this.themeCache.set("global", DEFAULT_THEME);
      try {
        const { cacheService } = await import("./cache/cache-service");
        await cacheService.set("theme:global", DEFAULT_THEME, 300, "global");
      } catch {}
    }
  }

  public async getTheme(tenantId?: string | null): Promise<Theme> {
    await this.ensureReady();

    const cacheKey = tenantId || "global";

    // Return from cache if available
    if (this.themeCache.has(cacheKey)) {
      return this.themeCache.get(cacheKey)!;
    }

    // Try cacheService L1/L2
    try {
      const { cacheService } = await import("./cache/cache-service");
      const cached = await cacheService.get<Theme>(`theme:${cacheKey}`, tenantId);
      if (cached) {
        this.themeCache.set(cacheKey, cached);
        return cached;
      }
    } catch {}

    // For tenant-specific themes, fetch from database
    // For now, fall back to global theme since tenant-specific themes
    // require additional schema implementation
    if (tenantId) {
      logger.debug(`No tenant-specific theme for ${tenantId}, using global theme`);
      const globalTheme = await this.getTheme(null);
      if (globalTheme) {
        return globalTheme;
      }
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

      // Update cache
      const cacheKey = tenantId || "global";
      this.themeCache.set(cacheKey, theme);
      try {
        const { cacheService } = await import("./cache/cache-service");
        await cacheService.set(`theme:${cacheKey}`, theme, 300, tenantId);
        await cacheService.publishInvalidation(`theme:${cacheKey}`, tenantId);
      } catch {}

      logger.info(`Theme updated to: ${theme.name}`, {
        tenantId: tenantId || "global",
      });
    } catch (err: any) {
      const message = `Error in ThemeManager.setTheme: ${err.message}`;
      logger.error(message, { tenantId });
      throw error(500, message);
    }
  }

  /**
   * Clear cache and reload themes from database
   */
  public async refresh(): Promise<void> {
    await this.ensureReady();

    this.themeCache.clear();
    try {
      const { cacheService } = await import("./cache/cache-service");
      await cacheService.clearByPattern("theme:*");
    } catch {}
    await this.loadAndCacheDefaultTheme();
    logger.debug("ThemeManager cache refreshed.");
  }
}
