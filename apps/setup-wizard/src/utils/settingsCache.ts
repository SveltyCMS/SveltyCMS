/**
 * @file apps/setup-wizard/src/utils/settingsCache.ts
 * @description Minimal settings cache helper for setup-wizard
 * Duplicated from CMS to avoid circular dependency
 */

/**
 * Invalidate settings cache
 * This is a minimal implementation for setup-wizard
 * The full implementation lives in CMS
 */
export function invalidateSettingsCache(): void {
	// In setup-wizard context, we don't have a cache to invalidate
	// This is a no-op placeholder that matches the CMS interface
	// The actual cache invalidation happens in CMS after setup completes
	console.log('[Setup] Settings cache invalidation requested (no-op in setup context)');
}
