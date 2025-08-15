/**
 * @file src/lib/settings.server.ts
 * @description Server-side settings service that properly separates public and private settings
 *
 * This service handles:
 * - Loading public settings from database (client-accessible)
 * - Loading private settings from database (server-only)
 * - Caching for performance
 * - Type safety for settings
 * - Fallback to database defaults when settings aren't configured
 */

import type { SystemPreferences } from '@src/databases/dbInterface';

// In-memory cache for settings (separated by visibility)
let publicSettingsCache: Record<string, SystemPreferences> = {};
let privateSettingsCache: Record<string, SystemPreferences> = {};
let cacheLoaded = false;

// Minimal fallback settings for when database isn't available
// These are only used during initial setup or if database connection fails
const fallbackSettings = {
	// Public settings (client-accessible)
	public: {
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
		DEMO: false,
		SEASONS: false,
		SETUP_COMPLETED: false,
		USE_MAPBOX: false,
		MAPBOX_API_TOKEN: ''
	},
	// Private settings (server-only)
	private: {
		// These will be loaded from database, not environment variables
		USE_REDIS: false,
		REDIS_HOST: 'localhost',
		REDIS_PORT: 6379,
		REDIS_PASSWORD: '',
		LOG_LEVELS: ['error', 'warn', 'info'],
		LOG_RETENTION_DAYS: 30,
		LOG_ROTATION_SIZE: 10485760, // 10MB
		USE_GOOGLE_OAUTH: false,
		GOOGLE_CLIENT_ID: '',
		GOOGLE_CLIENT_SECRET: '',
		GOOGLE_API_KEY: '',
		TWITCH_TOKEN: '',
		SECRET_MAPBOX_API_TOKEN: '',
		MULTI_TENANT: false
	}
};

// Type definitions for public settings
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

	// Demo Mode
	DEMO?: boolean;

	// Mapbox configuration (public)
	USE_MAPBOX?: boolean;
	MAPBOX_API_TOKEN?: string;
}

// Type definitions for private settings
export interface PrivateSettings {
	// Redis configuration
	USE_REDIS?: boolean;
	REDIS_HOST?: string;
	REDIS_PORT?: number;
	REDIS_PASSWORD?: string;

	// Logging configuration
	LOG_LEVELS?: string[];
	LOG_RETENTION_DAYS?: number;
	LOG_ROTATION_SIZE?: number;

	// OAuth configuration
	USE_GOOGLE_OAUTH?: boolean;
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;

	// API Keys and Tokens
	GOOGLE_API_KEY?: string;
	TWITCH_TOKEN?: string;
	SECRET_MAPBOX_API_TOKEN?: string;

	// SMTP configuration
	SMTP_HOST?: string;
	SMTP_PORT?: number;
	SMTP_EMAIL?: string;
	SMTP_PASSWORD?: string;

	// Session configuration
	SESSION_CLEANUP_INTERVAL?: number;
	MAX_IN_MEMORY_SESSIONS?: number;
	DB_VALIDATION_PROBABILITY?: number;
	SESSION_EXPIRATION_SECONDS?: number;

	// Multi-tenancy
	MULTI_TENANT?: boolean;

	// Server configuration
	SERVER_PORT?: number;

	// Roles and permissions
	ROLES?: string[];
	PERMISSIONS?: string[];
}

/**
 * Loads all settings from the database, properly separated by visibility
 */
export async function loadSettings(): Promise<void> {
	try {
		// Dynamically import SystemSettingModel to avoid mongoose initialization issues
		const { SystemSettingModel } = await import('@src/databases/mongodb/models/setting');

		const allPrefs = await SystemSettingModel.find({ scope: 'system' }).lean().exec();

		// Clear existing cache
		publicSettingsCache = {};
		privateSettingsCache = {};

		// Separate settings by visibility
		for (const pref of allPrefs) {
			if (pref.visibility === 'public') {
				publicSettingsCache[pref.key] = pref;
			} else {
				privateSettingsCache[pref.key] = pref;
			}
		}

		cacheLoaded = true;
	} catch (error) {
		console.warn('Failed to load settings from database:', error);
		// Don't throw - fall back to setup mode defaults
		cacheLoaded = false;
	}
}

/**
 * Gets a public setting value (client-accessible)
 */
export function getPublicSetting<T = string>(key: string): T | undefined {
	if (!cacheLoaded) {
		// Return setup mode default if cache not loaded
		return fallbackSettings.public[key] as T | undefined;
	}

	const setting = publicSettingsCache[key];
	return setting?.value as T | undefined;
}

/**
 * Gets all public settings as a structured object
 */
export function getPublicSettings(): PublicSettings {
	if (!cacheLoaded) {
		return fallbackSettings.public as PublicSettings;
	}

	const settings: PublicSettings = {};
	for (const [key, setting] of Object.entries(publicSettingsCache)) {
		(settings as PublicSettings)[key as keyof PublicSettings] = setting.value as string | number | boolean | string[] | undefined;
	}

	return settings;
}

/**
 * Gets a private setting value (server-only)
 */
export function getPrivateSetting<T = string>(key: string): T | undefined {
	if (!cacheLoaded) {
		// Return setup mode default if cache not loaded
		return fallbackSettings.private[key] as T | undefined;
	}

	const setting = privateSettingsCache[key];
	return setting?.value as T | undefined;
}

/**
 * Gets all private settings as a structured object
 */
export function getPrivateSettings(): PrivateSettings {
	if (!cacheLoaded) {
		return fallbackSettings.private as PrivateSettings;
	}

	const settings: PrivateSettings = {};
	for (const [key, setting] of Object.entries(privateSettingsCache)) {
		(settings as PrivateSettings)[key as keyof PrivateSettings] = setting.value as string | number | boolean | string[] | undefined;
	}

	return settings;
}

/**
 * Checks if setup is completed
 */
export function isSetupCompleted(): boolean {
	return getPublicSetting<boolean>('SETUP_COMPLETED') || false;
}

/**
 * Refreshes the settings cache
 */
export async function refreshSettings(): Promise<void> {
	cacheLoaded = false;
	await loadSettings();
}

/**
 * Invalidates the settings cache
 */
export function invalidateSettingsCache(): void {
	cacheLoaded = false;
	publicSettingsCache = {};
	privateSettingsCache = {};
}

// Legacy compatibility - redirect to new functions
export function getGlobalSetting<T = string>(key: string): T | undefined {
	return getPublicSetting<T>(key);
}
