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

export { privateEnv, publicEnv };
