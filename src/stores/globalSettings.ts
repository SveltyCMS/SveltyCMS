/**
 * @file src/stores/globalSettings.ts
 * @deprecated This store is deprecated. Use @src/lib/settings.server for server-side and @src/stores/publicSettings for client-side.
 * @description DEPRECATED: Loads and caches all system-wide settings from the database at startup.
 *
 * SECURITY WARNING: This approach exposes private settings to the client, which is a security risk.
 *
 * MIGRATION GUIDE:
 * - Server-side: Use @src/lib/settings.server.ts
 * - Client-side: Use @src/stores/publicSettings.ts
 * - Private settings: Use @src/lib/env.server.ts
 */

import type { SystemPreferences } from '@src/databases/dbInterface';

// In-memory cache for settings
let settingsCache: Record<string, SystemPreferences> = {};
let cacheLoaded = false;
let setupMode = false;

// Default settings for setup mode (when database isn't configured yet)
const setupModeDefaults: Partial<PublicSettings> & Record<string, unknown> = {
	// Setup status
	SETUP_COMPLETED: false,

	// Public settings
	SITE_NAME: 'SveltyCMS',
	HOST_DEV: 'http://localhost:5173',
	HOST_PROD: 'https://yourdomain.com',
	DEFAULT_CONTENT_LANGUAGE: 'en',
	AVAILABLE_CONTENT_LANGUAGES: ['en'],
	BASE_LOCALE: 'en',
	LOCALES: ['en'],
	MEDIA_FOLDER: './static/media',
	MAX_FILE_SIZE: 10485760, // 10MB
	BODY_SIZE_LIMIT: 10485760, // 10MB
	PASSWORD_LENGTH: 8,

	// Demo Mode
	DEMO: false,
	SEASONS: false,

	// Private settings
	USE_REDIS: false,
	REDIS_HOST: 'localhost',
	REDIS_PORT: 6379,
	REDIS_PASSWORD: ''
};

// Type definitions for public settings (previously in public.ts)
export interface PublicSettings {
	// Setup status
	SETUP_COMPLETED?: boolean;

	// Host configuration
	HOST_DEV?: string;
	HOST_PROD?: string;

	// Site configuration
	SITE_NAME?: string;
	PASSWORD_LENGTH?: number;

	// Language Configuration
	DEFAULT_CONTENT_LANGUAGE?: string;
	AVAILABLE_CONTENT_LANGUAGES?: string[];
	BASE_LOCALE?: string;
	LOCALES?: string[];

	// Media configuration
	MEDIA_FOLDER?: string;
	MEDIA_OUTPUT_FORMAT_QUALITY?: {
		format: 'original' | 'jpg' | 'webp' | 'avif';
		quality: number;
	};
	MEDIASERVER_URL?: string;
	IMAGE_SIZES?: Record<string, number>;
	MAX_FILE_SIZE?: number;
	BODY_SIZE_LIMIT?: number;
	EXTRACT_DATA_PATH?: string;
	USE_ARCHIVE_ON_DELETE?: boolean;

	// Seasons Icons for login page
	SEASONS?: boolean;
	SEASON_REGION?: 'Western_Europe' | 'South_Asia' | 'East_Asia' | 'Global';

	// Versioning
	PKG_VERSION?: string;

	// Logging
	LOG_LEVELS?: string[];
	LOG_RETENTION_DAYS?: number;
	LOG_ROTATION_SIZE?: number;

	// Demo Mode
	DEMO?: boolean;
}

/**
 * @deprecated Use @src/lib/settings.server.ts instead
 */
export function enableSetupMode(): void {
	console.warn('DEPRECATED: enableSetupMode() - Use @src/lib/settings.server.ts instead');
	setupMode = true;
	cacheLoaded = true;
}

/**
 * @deprecated Use @src/lib/settings.server.ts instead
 */
export function disableSetupMode(): void {
	console.warn('DEPRECATED: disableSetupMode() - Use @src/lib/settings.server.ts instead');
	setupMode = false;
	cacheLoaded = false;
}

/**
 * @deprecated Use @src/lib/settings.server.ts instead
 */
export async function loadGlobalSettings(): Promise<void> {
	console.warn('DEPRECATED: loadGlobalSettings() - Use @src/lib/settings.server.ts instead');
	try {
		// Dynamically import SystemPreferencesModel to avoid mongoose initialization issues
		const { SystemSettingModel } = await import('@src/databases/mongodb/models/setting');

		const allPrefs = await SystemSettingModel.find({ scope: 'system' }).lean().exec();
		settingsCache = {};
		for (const pref of allPrefs) {
			settingsCache[pref.key] = pref;
		}
		cacheLoaded = true;

		// Check if setup is complete based on loaded settings
		const setupCompleted = settingsCache['SETUP_COMPLETED']?.value;
		if (setupCompleted) {
			setupMode = false; // Disable setup mode if setup is complete
		}
	} catch (error) {
		// If database connection fails, fall back to setup mode
		console.warn('Database connection failed, enabling setup mode:', error);
		enableSetupMode();
		throw error; // Re-throw to let caller handle it
	}
}

/**
 * @deprecated Use @src/lib/settings.server.ts instead
 */
export function getSetting(key: string): SystemPreferences | undefined {
	console.warn('DEPRECATED: getSetting() - Use @src/lib/settings.server.ts instead');
	// If cache is not loaded, fallback to setupModeDefaults
	if (!cacheLoaded || setupMode) {
		return {
			_id: key,
			key,
			value: setupModeDefaults[key],
			scope: 'system',
			visibility: key in setupModeDefaults ? 'public' : 'private',
			createdAt: new Date(),
			updatedAt: new Date()
		};
	}

	return settingsCache[key];
}

/**
 * @deprecated Use @src/lib/settings.server.ts instead
 */
export function getPublicSetting<T = string>(key: string): T | undefined {
	console.warn('DEPRECATED: getPublicSetting() - Use @src/lib/settings.server.ts instead');
	const setting = getSetting(key);
	return setting?.value as T | undefined;
}

/**
 * @deprecated Use @src/lib/settings.server.ts instead
 */
export function getPublicSettings(): PublicSettings {
	console.warn('DEPRECATED: getPublicSettings() - Use @src/lib/settings.server.ts instead');
	if (!cacheLoaded) {
		enableSetupMode();
	}

	const settings: PublicSettings = {};

	if (setupMode) {
		// In setup mode, return default public settings
		for (const [key, value] of Object.entries(setupModeDefaults)) {
			if (key !== 'USE_REDIS' && key !== 'REDIS_HOST' && key !== 'REDIS_PORT' && key !== 'REDIS_PASSWORD') {
				(settings as PublicSettings)[key as keyof PublicSettings] = value as string | number | boolean | string[] | undefined;
			}
		}
		return settings;
	}

	// Map database settings to the public settings interface
	for (const [key, setting] of Object.entries(settingsCache)) {
		if (setting.scope === 'system' && setting.visibility === 'public') {
			(settings as PublicSettings)[key as keyof PublicSettings] = setting.value as string | number | boolean | string[] | undefined;
		}
	}

	return settings;
}

/**
 * @deprecated Use @src/lib/settings.server.ts instead
 */
export function getPrivateSetting<T = string>(key: string): T | undefined {
	console.warn('DEPRECATED: getPrivateSetting() - Use @src/lib/settings.server.ts instead');
	const setting = getSetting(key);
	return setting?.value as T | undefined;
}

/**
 * @deprecated Use @src/lib/settings.server.ts instead
 */
export async function refreshGlobalSettings(): Promise<void> {
	console.warn('DEPRECATED: refreshGlobalSettings() - Use @src/lib/settings.server.ts instead');
	await loadGlobalSettings();
}

/**
 * @deprecated Use @src/lib/settings.server.ts instead
 */
export function invalidateSettingsCache(): void {
	console.warn('DEPRECATED: invalidateSettingsCache() - Use @src/lib/settings.server.ts instead');
	cacheLoaded = false;
	settingsCache = {};
}

/**
 * @deprecated Use @src/lib/settings.server.ts instead
 */
export function getAllSettings(): Record<string, SystemPreferences> {
	console.warn('DEPRECATED: getAllSettings() - Use @src/lib/settings.server.ts instead');
	if (!cacheLoaded) throw new Error('Global settings cache not loaded.');
	return settingsCache;
}

/**
 * @deprecated Use @src/lib/settings.server.ts instead
 */
export function getGlobalSetting<T = string>(key: string): T | undefined {
	console.warn('DEPRECATED: getGlobalSetting() - Use @src/lib/settings.server.ts instead');
	return getPublicSetting<T>(key);
}
