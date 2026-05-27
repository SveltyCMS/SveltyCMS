/**
 * @file src/databases/cache-warming-service.ts
 * @description Service for cache warming and predictive prefetching configuration.
 *
 * This service sets up cache warming for critical paths and predictive prefetching
 * for high-traffic areas based on access patterns.
 */

import { logger } from '@utils/logger';
import { CacheCategory } from './cache/types';
import { cacheService } from './cache-service';
import { dbAdapter } from './db';

/**
 * Initialize cache warming for critical application paths.
 * Should be called during application startup.
 */
export async function initializeCacheWarming(): Promise<void> {
	logger.info('🔥 Initializing cache warming...');

	// Register predictive prefetch patterns
	registerPrefetchPatterns();

	// Warm critical caches
	await warmCriticalCaches();

	logger.info('✅ Cache warming initialized');
}

/**
 * Register predictive prefetch patterns.
 * When a key matching a pattern is accessed, related keys will be prefetched.
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
		category: CacheCategory.USER
	});

	// 2. Schema → Widgets, Fields
	cacheService.registerPrefetchPattern({
		pattern: /^schema:(\w+)$/,
		prefetchKeys: (matchedKey: string) => {
			const schemaName = matchedKey.match(/^schema:(\w+)$/)?.[1];
			if (!schemaName) return [];
			return [`widget:${schemaName}:list`, `widget:${schemaName}:form`, `schema:${schemaName}:fields`];
		},
		category: CacheCategory.SCHEMA
	});

	// 3. Theme Config → CSS, Assets
	cacheService.registerPrefetchPattern({
		pattern: /^theme:(\w+):config$/,
		prefetchKeys: (matchedKey: string) => {
			const themeId = matchedKey.match(/^theme:(\w+):config$/)?.[1];
			if (!themeId) return [];
			return [`theme:${themeId}:css`, `theme:${themeId}:assets`];
		},
		category: CacheCategory.THEME
	});

	// 4. Content Entry → Metadata (for revisions/SEO)
	cacheService.registerPrefetchPattern({
		pattern: /^entry:(\w+):(\w+)$/,
		prefetchKeys: (matchedKey: string) => {
			const match = matchedKey.match(/^entry:(\w+):(\w+)$/);
			if (!match) return [];
			const [, collectionName, entryId] = match;
			return [`entry:${collectionName}:${entryId}:metadata`, `entry:${collectionName}:${entryId}:revisions`];
		},
		category: CacheCategory.ENTRY
	});

	logger.info('✅ Registered predictive prefetch patterns');
}

/**
 * Warm critical caches that are frequently accessed.
 */
async function warmCriticalCaches(): Promise<void> {
	try {
		await Promise.all([warmSchemasCache(), warmThemesCache(), warmWidgetsCache(), warmSystemSettingsCache()]);
		logger.info('✅ Critical caches warmed successfully');
	} catch (error) {
		logger.error('Failed to warm critical caches:', error);
	}
}

/**
 * Warm the schemas cache with all collection definitions.
 */
async function warmSchemasCache(): Promise<void> {
	if (!dbAdapter) return;
	try {
		await cacheService.warmCache({
			keys: ['schemas:all', 'schemas:list'],
			fetcher: async () => {
				const result = await dbAdapter!.collection.listSchemas();
				return result.success ? result.data : [];
			},
			category: CacheCategory.SCHEMA
		});
	} catch (error) {
		logger.warn('Failed to warm schemas cache:', error);
	}
}

/**
 * Warm the themes cache with the active theme.
 */
async function warmThemesCache(): Promise<void> {
	if (!dbAdapter) return;
	try {
		await cacheService.warmCache({
			keys: ['themes:active'],
			fetcher: async () => {
				const result = await dbAdapter!.system.themes.getActive();
				return result.success ? result.data : null;
			},
			category: CacheCategory.THEME
		});
	} catch (error) {
		logger.warn('Failed to warm themes cache:', error);
	}
}

/**
 * Warm the widgets cache with active widgets.
 */
async function warmWidgetsCache(): Promise<void> {
	if (!dbAdapter) return;
	try {
		await cacheService.warmCache({
			keys: ['widgets:active'],
			fetcher: async () => {
				const result = await dbAdapter!.system.widgets.getActiveWidgets();
				return result.success ? result.data : [];
			},
			category: CacheCategory.WIDGET
		});
	} catch (error) {
		logger.warn('Failed to warm widgets cache:', error);
	}
}

/**
 * Warm the system settings cache.
 */
async function warmSystemSettingsCache(): Promise<void> {
	if (!dbAdapter) return;
	try {
		await cacheService.warmCache({
			keys: ['settings:system:critical'],
			fetcher: async () => {
				// We call loadSettingsFromDB elsewhere, but this ensures they are in cache too
				const result = await dbAdapter!.system.preferences.getByCategory('system', 'system');
				return result.success ? result.data : {};
			},
			category: CacheCategory.SETTING
		});
	} catch (error) {
		logger.warn('Failed to warm system settings cache:', error);
	}
}

/**
 * Warm cache for a specific tenant.
 */
export async function warmTenantCache(tenantId: string): Promise<void> {
	if (!dbAdapter) return;
	logger.info(`🔥 Warming cache for tenant: ${tenantId}`);

	try {
		await cacheService.warmCache({
			keys: ['config', 'settings', 'theme'],
			fetcher: async () => {
				const [theme, settings] = await Promise.all([
					dbAdapter!.system.themes.getDefaultTheme(tenantId),
					dbAdapter!.system.preferences.getByCategory('system', 'system') // Assuming tenantId isolation in adapter
				]);
				return { theme: theme.success ? theme.data : null, settings: settings.success ? settings.data : {} };
			},
			category: CacheCategory.API,
			tenantId
		});
	} catch (error) {
		logger.error(`Failed to warm cache for tenant ${tenantId}:`, error);
	}
}
