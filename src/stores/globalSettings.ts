/**
 * @file src/stores/globalSettings.ts
 * @description Global settings management for SveltyCMS applications
 *
 * ### Features
 * - Global settings management
 * - Reactive settings management with auto-refresh
 * - Error handling for API calls
 * - TypeScript support
 * - Type-safe public and private settings
 * - Client-side & Server-side configuration
 * - Static & Dynamic configuration
 * - Valibot schema validation
 */

import { privateConfigSchema, publicConfigSchema } from '@root/config/types';
import { type InferOutput } from 'valibot';
// Use the direct Valibot types. This is your contract.
type PrivateEnv = InferOutput<typeof privateConfigSchema>;
type PublicEnv = InferOutput<typeof publicConfigSchema>;

// In-memory cache for settings (final merged configuration: static + dynamic)
let cacheLoaded = false;
let privateEnv: PrivateEnv = {} as PrivateEnv;
let publicEnv: PublicEnv = {} as PublicEnv;

// Read PKG_VERSION dynamically from package.json
// This ensures version always reflects installed package and helps detect outdated installations
let cachedPkgVersion: string | null = null;
async function loadPkgVersion(): Promise<string> {
	if (cachedPkgVersion) return cachedPkgVersion;
	try {
		// Dynamic import works in both dev and production
		const packageJson = await import('../../package.json');
		cachedPkgVersion = packageJson.version || '0.0.0';
		return cachedPkgVersion;
	} catch {
		cachedPkgVersion = '0.0.0';
		return cachedPkgVersion;
	}
}

// A boolean indicating whether the settings cache has been loaded
export function isCacheLoaded(): boolean {
	return cacheLoaded;
}

/**
 * Populates the settings cache. This should only be called from the server.
 * @param newPrivate - The private settings object.
 * @param newPublic - The public settings object.
 */
export async function setSettingsCache(newPrivate: PrivateEnv, newPublic: PublicEnv) {
	// Expects complete, validated objects that match the schemas
	privateEnv = newPrivate;
	publicEnv = newPublic;

	// 🚀  Inject PKG_VERSION dynamically from package.json (not stored in DB)
	const version = await loadPkgVersion();
	(publicEnv as Record<string, unknown>)['PKG_VERSION'] = version;

	cacheLoaded = true;
}

/**
 * Invalidates the settings cache.
 * Call this after updating settings in the database.
 */
export function invalidateSettingsCache(): void {
	cacheLoaded = false;
	privateEnv = {} as PrivateEnv;
	publicEnv = {} as PublicEnv;
}

/**
 * Gets a public setting value by key with optional fallback.
 * This function is type-safe and uses generics to infer the return type.
 * @param key - The key of the public setting to retrieve.
 * @param fallback - Optional fallback value if the key is not found.
 * @returns The value of the public setting or the fallback.
 */
export function getPublicSetting<K extends keyof PublicEnv>(key: K): PublicEnv[K] {
	return publicEnv[key];
}

/**
 * Gets a private setting value by key with optional fallback.
 * This function is type-safe and uses generics to infer the return type.
 * @param key - The key of the private setting to retrieve.
 * @param fallback - Optional fallback value if the key is not found.
 * @returns The value of the private setting or the fallback.
 */
export function getPrivateSetting<K extends keyof PrivateEnv>(key: K): PrivateEnv[K] {
	return privateEnv[key];
}

/**
 * Gets a setting that is NOT defined in the schema.
 * Use this as an escape hatch only when necessary. It's not type-safe.
 * @param key The string key of the setting to retrieve.
 * @param scope Optional scope to limit search to 'public' or 'private' only (recommended for security)
 * @returns The value of the setting, or undefined if not found.
 */
export function getUntypedSetting<T = unknown>(key: string, scope?: 'public' | 'private'): T | undefined {
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

// Export publicEnv for safe client-side access
export { publicEnv };

// Export privateEnv for SERVER-SIDE use only
// ⚠️ WARNING: Never import privateEnv in .svelte files or client-side code!
// The Vite security plugin will detect and block such imports during build.
// For server-side code (.ts files in /auth, /hooks, /databases, /routes/api), this is safe.
export { privateEnv };

// --- Snapshot Utilities ---
/**
 * Returns a merged view of all current settings for export.
 *
 * ⚠️ SECURITY WARNING: This function exposes PRIVATE settings!
 * Only use this for:
 * - Server-side admin operations
 * - Authenticated admin export functionality
 * - System backup/restore operations
 *
 * NEVER expose this data to:
 * - Client-side code
 * - Non-admin users
 * - Public APIs
 * - Logs or error messages
 */
export async function getAllSettings(): Promise<Record<string, unknown>> {
	return {
		public: { ...publicEnv },
		private: { ...privateEnv }
	} as Record<string, unknown>;
}

/**
 * Applies a snapshot to the database via systemPreferences adapter.
 * Note: This function delegates to the DB layer; the store only invalidates cache after updates.
 */
export async function updateSettingsFromSnapshot(snapshot: Record<string, unknown>): Promise<{ updated: number }> {
	const { dbAdapter } = await import('@src/databases/db');
	if (!dbAdapter || !dbAdapter.systemPreferences) {
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
	if (!res.success) throw new Error(res.error?.message || 'Failed to update settings');
	invalidateSettingsCache();
	return { updated: ops.length };
}
