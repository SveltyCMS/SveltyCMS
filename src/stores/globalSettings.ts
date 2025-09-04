import { type InferOutput } from 'valibot';
import { privateConfigSchema, publicConfigSchema } from '@root/config/types';

// In-memory cache for settings
let privateEnv: InferOutput<typeof privateConfigSchema> = {};
let publicEnv: InferOutput<typeof publicConfigSchema> = {};
let cacheLoaded = false;

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
 * @param key - The key of the public setting to retrieve.
 * @param fallback - Optional fallback value if the key is not found.
 * @returns The value of the public setting or the fallback.
 */
export function getPublicSetting<T = unknown>(key: string, fallback?: T): T {
	return (publicEnv as any)[key] ?? fallback;
}

/**
 * Gets a private setting value by key with optional fallback.
 * @param key - The key of the private setting to retrieve.
 * @param fallback - Optional fallback value if the key is not found.
 * @returns The value of the private setting or the fallback.
 */
export function getPrivateSetting<T = unknown>(key: string, fallback?: T): T {
	return (privateEnv as any)[key] ?? fallback;
}

export { privateEnv, publicEnv };
