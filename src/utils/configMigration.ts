/**
 * @file src/utils/configMigration.ts
 * @description Utility functions to help migrate from old config system to new database-driven settings.
 * This provides backward compatibility during the transition period.
 */

import { getPrivateSetting, getPublicSetting, getPublicSettings, enableSetupMode } from '@src/stores/globalSettings';

// Enable setup mode initially to prevent startup errors
enableSetupMode();

/**
 * Legacy compatibility function that mimics the old publicEnv object.
 * This allows existing code to continue working during the migration.
 */
export const publicEnv = new Proxy({} as any, {
	get(target, prop) {
		if (typeof prop === 'string') {
			try {
				return getPublicSetting(prop);
			} catch {
				// Settings not loaded yet, return undefined
				return undefined;
			}
		}
		return undefined;
	}
});

/**
 * Legacy compatibility function that mimics the old privateEnv object.
 * This allows existing code to continue working during the migration.
 */
export const privateEnv = new Proxy({} as any, {
	get(target, prop) {
		if (typeof prop === 'string') {
			try {
				return getPrivateSetting(prop);
			} catch {
				// Settings not loaded yet, return undefined
				return undefined;
			}
		}
		return undefined;
	}
});

/**
 * Gets a public setting with fallback to a default value.
 * This is useful for settings that might not be in the database yet.
 */
export function getPublicSettingWithFallback<T>(key: string, fallback: T): T {
	const value = getPublicSetting<T>(key);
	return value !== undefined ? value : fallback;
}

/**
 * Gets a private setting with fallback to a default value.
 * This is useful for settings that might not be in the database yet.
 */
export function getPrivateSettingWithFallback<T>(key: string, fallback: T): T {
	const value = getPrivateSetting<T>(key);
	return value !== undefined ? value : fallback;
}

/**
 * Checks if the settings system is ready (database is connected and settings are loaded).
 */
export function isSettingsReady(): boolean {
	try {
		getPublicSettings();
		return true;
	} catch {
		return false;
	}
}

/**
 * Provides a safe way to access settings that might not be loaded yet.
 * Returns the fallback value if settings are not ready.
 */
export function safeGetSetting<T>(getter: () => T, fallback: T): T {
	try {
		return getter();
	} catch {
		return fallback;
	}
}
