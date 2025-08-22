/**
 * @file src/stores/globalSettings.ts
 * @description Loads and caches all system-wide settings from the database at startup.
 * Provides fast, reactive access to settings throughout the app.
 *
 * This service handles both public and private settings that were previously in config files.
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
	REDIS_PASSWORD: '',

	// Database Configuration (from config/private.ts)
	DB_TYPE: 'mongodb',
	DB_HOST: 'mongodb+srv://cluster0.4aydgs4.mongodb.net',
	DB_PORT: 27017,
	DB_NAME: 'SveltyCMS',
	DB_USER: 'madsaaeq',
	DB_PASSWORD: 'kEGkk1I9lfr3Hm2Z',
	DB_POOL_SIZE: 5,

	// Security Keys (from config/private.ts)
	JWT_SECRET_KEY: '95dae4b9f9c0c26f33f7890ed5848fb14c52abea700cdd04cd430ad730f454f2',
	ENCRYPTION_KEY: '21a3a0285e7d3ee5c3670baed82f94b8e6d7ce6b29fc1216bd3d318007f61b72',

	// Multi-tenancy
	MULTI_TENANT: false
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
 * Enables setup mode for when database isn't configured yet
 */
export function enableSetupMode(): void {
	setupMode = true;
	cacheLoaded = true;
}

/**
 * Disables setup mode and loads settings from database
 */
export function disableSetupMode(): void {
	setupMode = false;
	cacheLoaded = false;
}

/**
 * Loads all system-wide settings from the database into memory.
 * Call this at app/server startup.
 */
export async function loadGlobalSettings(): Promise<void> {
	try {
		// Dynamically import SystemSettingModel (key-value settings)
		const { SystemSettingModel } = await import('@src/databases/mongodb/models/setting');

		const allSettings = await SystemSettingModel.find({ scope: 'system' }).lean().exec();
		settingsCache = {};
		for (const setting of allSettings) {
			if (!setting.key) continue; // Safety guard
			settingsCache[setting.key] = setting as unknown as SystemPreferences; // Reuse interface shape
		}
		cacheLoaded = true;

		const setupCompleted = settingsCache['SETUP_COMPLETED']?.value;
		if (setupCompleted) {
			setupMode = false;
			console.log('✅ Setup completed, disabling setup mode');
		}
	} catch (error) {
		console.warn('Database connection failed, enabling setup mode:', error);
		enableSetupMode();
		throw error;
	}
}

/**
 * Gets a setting by key from the cache (fast, in-memory).
 * If not loaded, throws an error.
 */
export function getSetting(key: string): SystemPreferences | undefined {
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
 * Gets a public setting value by key.
 * Returns the value directly, or undefined if not found.
 */
export function getPublicSetting<T = string>(key: string): T | undefined {
	const setting = getSetting(key);
	return setting?.value as T | undefined;
}

/**
 * Gets all public settings as a structured object.
 * This replaces the old publicEnv object.
 */
export function getPublicSettings(): PublicSettings {
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
 * Gets a private setting value by key.
 * Returns the value directly, or undefined if not found.
 */
export function getPrivateSetting<T = string>(key: string): T | undefined {
	const setting = getSetting(key);
	return setting?.value as T | undefined;
}

/**
 * Optionally, expose a function to refresh the cache (e.g., after settings change).
 */
export async function refreshGlobalSettings(): Promise<void> {
	await loadGlobalSettings();
}

/**
 * Invalidates the settings cache, forcing a reload on next access.
 */
export function invalidateSettingsCache(): void {
	cacheLoaded = false;
	settingsCache = {};
}

// Optionally, expose the full cache for advanced use
export function getAllSettings(): Record<string, SystemPreferences> {
	if (!cacheLoaded) throw new Error('Global settings cache not loaded.');
	return settingsCache;
}

// Legacy compatibility - provide a function that mimics the old publicEnv
export function getGlobalSetting<T = string>(key: string): T | undefined {
	return getPublicSetting<T>(key);
}
