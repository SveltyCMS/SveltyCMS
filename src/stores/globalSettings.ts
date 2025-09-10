import { privateConfigSchema, publicConfigSchema } from '@root/config/types';
import { type InferOutput } from 'valibot';

// In-memory cache for settings
let cacheLoaded = false;
let privateEnv: InferOutput<typeof privateConfigSchema> = {};
let publicEnv: InferOutput<typeof publicConfigSchema> = {};

/**
 * A boolean indicating whether the settings cache has been loaded.
 */
export function isCacheLoaded(): boolean {
	return cacheLoaded;
}

/**
 * Populates the settings cache. This should only be called from the server.
 * @param newPrivate - The private settings object.
 * @param newPublic - The public settings object.
 */
export function setSettingsCache(newPrivate: InferOutput<typeof privateConfigSchema>, newPublic: InferOutput<typeof publicConfigSchema>) {
	privateEnv = newPrivate;
	publicEnv = newPublic;
	cacheLoaded = true;
}

/**
 * Invalidates the settings cache.
 * Call this after updating settings in the database.
 */
export function invalidateSettingsCache(): void {
	cacheLoaded = false;
	privateEnv = {};
	publicEnv = {};
}

/**
 * Gets a public setting value by key with optional fallback.
 * This function is type-safe and uses generics to infer the return type.
 * @param key - The key of the public setting to retrieve.
 * @param fallback - Optional fallback value if the key is not found.
 * @returns The value of the public setting or the fallback.
 */
export function getPublicSetting<K extends keyof InferOutput<typeof publicConfigSchema>, T = InferOutput<typeof publicConfigSchema>[K]>(
	key: K,
	fallback?: T
): T {
	if (key in publicEnv && publicEnv[key] !== undefined) {
		return publicEnv[key] as T;
	}
	return fallback as T;
}

/**
 * Gets a private setting value by key with optional fallback.
 * This function is type-safe and uses generics to infer the return type.
 * @param key - The key of the private setting to retrieve.
 * @param fallback - Optional fallback value if the key is not found.
 * @returns The value of the private setting or the fallback.
 */
export function getPrivateSetting<K extends keyof InferOutput<typeof privateConfigSchema>, T = InferOutput<typeof privateConfigSchema>[K]>(
	key: K,
	fallback?: T
): T {
	if (key in privateEnv && privateEnv[key] !== undefined) {
		return privateEnv[key] as T;
	}
	return fallback as T;
}

export { privateEnv, publicEnv };
