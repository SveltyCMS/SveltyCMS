/**
 * @file src/services/settings.ts
 * @description Server-only settings cache and management
 *
 * ⚠️ SECURITY: This file should NEVER be imported in client-side components
 * It handles both public AND private settings on the server only.
 *
 * ### Features
 * - Server-side cache for fast access
 * - Type-safe getters for public and private settings
 * - Database synchronization
 * - Settings import/export for admin operations
 */

import { privateConfigSchema, publicConfigSchema } from '@src/databases/schemas';
import { type InferOutput } from 'valibot';
import { logger } from '@utils/logger';

type PrivateEnv = InferOutput<typeof privateConfigSchema>;
type PublicEnv = InferOutput<typeof publicConfigSchema> & { PKG_VERSION?: string };

// Extract setting keys from schemas (single source of truth)
const KNOWN_PUBLIC_KEYS = Object.keys(publicConfigSchema.entries);

// Infrastructure keys that come from config file, not database
const INFRASTRUCTURE_KEYS = new Set([
	'DB_TYPE',
	'DB_HOST',
	'DB_PORT',
	'DB_NAME',
	'DB_USER',
	'DB_PASSWORD',
	'DB_RETRY_ATTEMPTS',
	'DB_RETRY_DELAY',
	'DB_POOL_SIZE',
	'JWT_SECRET_KEY',
	'ENCRYPTION_KEY',
	'MULTI_TENANT'
]);

const KNOWN_PRIVATE_KEYS = Object.keys(privateConfigSchema.entries).filter((key) => !INFRASTRUCTURE_KEYS.has(key));

// Internal server-side cache (not reactive, plain objects)
const cache = {
	loaded: false,
	private: {} as PrivateEnv,
	public: {} as PublicEnv
};

// Memoized version loader
let pkgVersionPromise: Promise<string> | null = null;
async function loadPkgVersion(): Promise<string> {
	if (!pkgVersionPromise) {
		pkgVersionPromise = import('../../package.json').then((pkg) => pkg.version || '0.0.0').catch(() => '0.0.0');
	}
	return pkgVersionPromise;
}

/**
 * Loads settings from the database into the server-side cache if not already loaded.
 * This is the single source of truth on the server.
 */
export async function loadSettingsCache(): Promise<typeof cache> {
	if (cache.loaded) {
		return cache;
	}

	try {
		const { dbAdapter, getPrivateEnv } = await import('@src/databases/db');
		if (!dbAdapter?.systemPreferences) {
			throw new Error('Database adapter for systemPreferences is not available.');
		}

		// Load both public and private settings in parallel
		const [publicResult, privateResult] = await Promise.all([
			dbAdapter.systemPreferences.getMany(KNOWN_PUBLIC_KEYS, 'system'),
			dbAdapter.systemPreferences.getMany(KNOWN_PRIVATE_KEYS, 'system')
		]);

		if (!publicResult.success) {
			throw new Error(`Failed to load public settings: ${publicResult.error?.message || 'Unknown error'}`);
		}

		// Get public settings from database
		const publicSettings = publicResult.data || {};

		// Get private settings from database (may be empty)
		const privateDynamic = privateResult.success ? privateResult.data || {} : {};

		// Get private config settings (infrastructure settings)
		// Prefer in-memory config (set by initializeWithConfig) over filesystem import
		// This eliminates unnecessary file I/O and Vite cache dependency
		const inMemoryConfig = getPrivateEnv();

		let privateConfig: PrivateEnv;
		if (inMemoryConfig) {
			// Use in-memory config when available (post-setup, zero-restart mode)
			privateConfig = inMemoryConfig;
		} else {
			try {
				// Fall back to filesystem import (normal startup or first load)
				const { privateEnv } = await import('@config/private');
				privateConfig = privateEnv;
			} catch (error) {
				// Private config doesn't exist during setup - this is expected
				logger.trace('Private config not found during setup - this is expected during initial setup', {
					error: error instanceof Error ? error.message : String(error)
				});
				// During setup, allow private env to be empty but correctly typed
				privateConfig = {} as PrivateEnv;
			}
		}

		// Merge: infrastructure settings from config + dynamic settings from DB
		const mergedPrivate = {
			...privateConfig,
			...privateDynamic
		};

		// Update cache with merged data
		cache.private = mergedPrivate as PrivateEnv;
		cache.public = publicSettings as PublicEnv;
		cache.public.PKG_VERSION = await loadPkgVersion();
		cache.loaded = true;

		return cache;
	} catch (error) {
		const { logger } = await import('@utils/logger');
		const errMessage = error instanceof Error ? error.message : String(error);

		// Suppress error logging if DB adapter is missing (expected during setup)
		if (errMessage.includes('Database adapter') || errMessage.includes('not available')) {
			logger.trace('Settings cache not available (expected during setup or DB init):', errMessage);
		} else {
			// Log unexpected errors
			logger.error('Failed to load settings cache:', error);
		}

		// Return empty cache with PKG_VERSION to allow server to continue
		cache.public.PKG_VERSION = await loadPkgVersion();
		throw error; // Re-throw for caller to handle
	}
}

/**
 * Invalidates the server-side cache, forcing a reload on the next request.
 * Call this after any database update to the settings.
 * Note: PKG_VERSION is preserved as it's read from package.json, not database.
 */
export async function invalidateSettingsCache(): Promise<void> {
	const pkgVersion = await loadPkgVersion();
	cache.loaded = false;
	cache.private = {} as PrivateEnv;
	cache.public = { PKG_VERSION: pkgVersion } as PublicEnv;
}

/**
 * Populates the settings cache with new values.
 * Used by loadSettingsFromDB in db.ts
 */
export async function setSettingsCache(newPrivate: PrivateEnv, newPublic: PublicEnv): Promise<void> {
	cache.private = newPrivate;
	cache.public = { ...newPublic, PKG_VERSION: await loadPkgVersion() };
	cache.loaded = true;
}

/**
 * Check if cache is loaded
 */
export function isCacheLoaded(): boolean {
	return cache.loaded;
}

/**
 * Type-safe getter for a private setting (SERVER ONLY)
 */
export async function getPrivateSetting<K extends keyof PrivateEnv>(key: K): Promise<PrivateEnv[K]> {
	const { private: privateEnv } = await loadSettingsCache();
	return privateEnv[key];
}

/**
 * Type-safe getter for a public setting (SERVER ONLY)
 */
export async function getPublicSetting<K extends keyof PublicEnv>(key: K): Promise<PublicEnv[K]> {
	const { public: publicEnv } = await loadSettingsCache();
	return publicEnv[key];
}

/**
 * Gets a setting that is NOT defined in the schema (SERVER ONLY)
 * Use this as an escape hatch only when necessary. It's not type-safe.
 */
export async function getUntypedSetting<T = unknown>(key: string, scope?: 'public' | 'private'): Promise<T | undefined> {
	const { public: publicEnv, private: privateEnv } = await loadSettingsCache();

	if (!scope || scope === 'public') {
		if ((publicEnv as Record<string, unknown>)[key] !== undefined) {
			return (publicEnv as unknown as Record<string, T>)[key];
		}
	}
	if (!scope || scope === 'private') {
		if ((privateEnv as Record<string, unknown>)[key] !== undefined) {
			return (privateEnv as unknown as Record<string, T>)[key];
		}
	}
	return undefined;
}

/**
 * SYNCHRONOUS cache accessors for legacy compatibility.
 * ⚠️ WARNING: These bypass the async loading pattern and can return empty values!
 *
 * These exist ONLY for:
 * - Module-level initialization (CacheService, googleAuth, etc.)
 * - Synchronous hooks that can't await
 *
 * In all other cases, prefer the async getters:
 * - Use getPublicSetting() for public settings
 * - Use getPrivateSetting() for private settings
 *
 * The cache must be pre-loaded via hooks.server.ts or these will return undefined!
 */
export function getPublicSettingSync<K extends keyof PublicEnv>(key: K): PublicEnv[K] {
	return cache.public[key];
}

export function getPrivateSettingSync<K extends keyof PrivateEnv>(key: K): PrivateEnv[K] {
	return cache.private[key];
}

/**
 * Returns a merged view of all current settings for export.
 *
 * ⚠️ SECURITY WARNING: This function exposes PRIVATE settings!
 * Only use this for:
 * - Server-side admin operations
 * - Authenticated admin export functionality
 * - System backup/restore operations
 */
export async function getAllSettings(): Promise<Record<string, unknown>> {
	const { public: publicEnv, private: privateEnv } = await loadSettingsCache();
	return {
		public: { ...publicEnv },
		private: { ...privateEnv }
	} as Record<string, unknown>;
}

/**
 * Applies a snapshot to the database via systemPreferences adapter.
 * Invalidates cache after successful update.
 */
export async function updateSettingsFromSnapshot(snapshot: Record<string, unknown>): Promise<{ updated: number }> {
	const { dbAdapter } = await import('@src/databases/db');
	if (!dbAdapter?.systemPreferences) {
		throw new Error('Database adapter not available');
	}

	type SnapshotRecord = Record<string, unknown>;
	type Snapshot = { settings?: SnapshotRecord } | SnapshotRecord;
	const snap = snapshot as Snapshot;
	const settings: SnapshotRecord = (snap as { settings?: SnapshotRecord }).settings ?? (snap as SnapshotRecord);

	const ops: Array<{ key: string; value: unknown; scope: 'user' | 'system' }> = [];

	function isValueWrapper(v: unknown): v is { value: unknown } {
		return typeof v === 'object' && v !== null && 'value' in (v as Record<string, unknown>);
	}

	for (const [key, value] of Object.entries(settings)) {
		const v = isValueWrapper(value) ? value.value : value;
		ops.push({ key, value: v, scope: 'system' });
	}

	const res = await dbAdapter.systemPreferences.setMany(ops);
	if (!res.success) {
		throw new Error(res.error?.message || 'Failed to update settings');
	}

	// Invalidate cache so next access fetches fresh data
	invalidateSettingsCache();

	return { updated: ops.length };
}
