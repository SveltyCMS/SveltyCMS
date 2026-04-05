/**
 * @file src/databases/cache-warming-service.ts
 * @description Service for cache warming and predictive prefetching configuration.
 */

import { logger } from "@utils/logger";
import { CacheCategory } from "./cache/types";
import { cacheService } from "./cache/cache-service";
import type { IDBAdapter } from "./db-interface";

/**
 * Initialize cache warming for critical application paths.
 */
export async function initializeCacheWarming(dbAdapter: IDBAdapter): Promise<void> {
  logger.info("🔥 Initializing cache warming...");

  // Register predictive prefetch patterns
  registerPrefetchPatterns();

  // Warm critical caches
  await warmCriticalCaches(dbAdapter);

  logger.info("✅ Cache warming initialized");
}

/**
 * Register predictive prefetch patterns.
 */
function registerPrefetchPatterns(): void {
  // 1. User Profile → Permissions, Roles, Settings
  cacheService.registerPrefetchPattern({
    pattern: /^user:(\w+):profile$/,
    prefetchKeys: (matchedKey: string) => {
      const userId = matchedKey.match(/^user:(\w+):profile$/)?.[1];
      if (!userId) return [];
      return [`user:${userId}:permissions`, `user:${userId}:roles`, `user:${userId}:settings`];
    },
    category: CacheCategory.USER,
  });

  // 2. Schema → Widgets, Fields
  cacheService.registerPrefetchPattern({
    pattern: /^schema:(\w+)$/,
    prefetchKeys: (matchedKey: string) => {
      const schemaName = matchedKey.match(/^schema:(\w+)$/)?.[1];
      if (!schemaName) return [];
      return [
        `widget:${schemaName}:list`,
        `widget:${schemaName}:form`,
        `schema:${schemaName}:fields`,
      ];
    },
    category: CacheCategory.SCHEMA,
  });

  // 3. Theme Config → CSS, Assets
  cacheService.registerPrefetchPattern({
    pattern: /^theme:(\w+):config$/,
    prefetchKeys: (matchedKey: string) => {
      const themeId = matchedKey.match(/^theme:(\w+):config$/)?.[1];
      if (!themeId) return [];
      return [`theme:${themeId}:css`, `theme:${themeId}:assets`];
    },
    category: CacheCategory.THEME,
  });

  // 4. Content Entry → Metadata (for revisions/SEO)
  cacheService.registerPrefetchPattern({
    pattern: /^entry:(\w+):(\w+)$/,
    prefetchKeys: (matchedKey: string) => {
      const match = matchedKey.match(/^entry:(\w+):(\w+)$/);
      if (!match) return [];
      const [, collectionName, entryId] = match;
      return [
        `entry:${collectionName}:${entryId}:metadata`,
        `entry:${collectionName}:${entryId}:revisions`,
      ];
    },
    category: CacheCategory.ENTRY,
  });

  logger.info("✅ Registered predictive prefetch patterns");
}

/**
 * Warm critical caches that are frequently accessed.
 */
async function warmCriticalCaches(dbAdapter: IDBAdapter): Promise<void> {
  try {
    await Promise.all([
      warmSchemasCache(dbAdapter),
      warmThemesCache(dbAdapter),
      warmWidgetsCache(dbAdapter),
      warmSystemSettingsCache(dbAdapter),
    ]);
    logger.info("✅ Critical caches warmed successfully");
  } catch (error) {
    logger.error("Failed to warm critical caches:", error);
  }
}

async function warmSchemasCache(dbAdapter: IDBAdapter): Promise<void> {
  try {
    await cacheService.warmCache({
      keys: ["schemas:all", "schemas:list"],
      fetcher: async () => {
        const result = await dbAdapter.collection?.listSchemas();
        return result?.success ? result.data : [];
      },
      category: CacheCategory.SCHEMA,
    });
  } catch (error) {
    logger.warn("Failed to warm schemas cache:", error);
  }
}

async function warmThemesCache(dbAdapter: IDBAdapter): Promise<void> {
  try {
    await cacheService.warmCache({
      keys: ["themes:active"],
      fetcher: async () => {
        const result = await dbAdapter.system?.themes?.getActive();
        return result?.success ? result.data : null;
      },
      category: CacheCategory.THEME,
    });
  } catch (error) {
    logger.warn("Failed to warm themes cache:", error);
  }
}

async function warmWidgetsCache(dbAdapter: IDBAdapter): Promise<void> {
  try {
    await cacheService.warmCache({
      keys: ["widgets:active"],
      fetcher: async () => {
        const result = await dbAdapter.system?.widgets?.getActiveWidgets();
        return result?.success ? result.data : [];
      },
      category: CacheCategory.WIDGET,
    });
  } catch (error) {
    logger.warn("Failed to warm widgets cache:", error);
  }
}

async function warmSystemSettingsCache(dbAdapter: IDBAdapter): Promise<void> {
  try {
    await cacheService.warmCache({
      keys: ["settings:system:critical"],
      fetcher: async () => {
        const result = await dbAdapter.system?.preferences?.getByCategory("system", "system");
        return result?.success ? result.data : {};
      },
      category: CacheCategory.SETTING,
    });
  } catch (error) {
    logger.warn("Failed to warm system settings cache:", error);
  }
}

/**
 * Warm cache for a specific tenant.
 */
export async function warmTenantCache(dbAdapter: IDBAdapter, tenantId: string): Promise<void> {
  logger.info(`🔥 Warming cache for tenant: ${tenantId}`);

  try {
    await cacheService.warmCache({
      keys: ["config", "settings", "theme"],
      fetcher: async () => {
        const [theme, settings] = await Promise.all([
          dbAdapter.system?.themes?.getDefaultTheme(tenantId as any),
          dbAdapter.system?.preferences?.getByCategory("system", "system"),
        ]);
        return {
          theme: theme?.success ? theme.data : null,
          settings: settings?.success ? settings.data : {},
        };
      },
      category: CacheCategory.API,
      tenantId,
    });
  } catch (error) {
    logger.error(`Failed to warm cache for tenant ${tenantId}:`, error);
  }
}

// Export object for convenience
export const cacheWarmingService = {
  initialize: initializeCacheWarming,
  warmTenant: warmTenantCache,
};
