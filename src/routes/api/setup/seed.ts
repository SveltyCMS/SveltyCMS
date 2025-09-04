/**
 * @file src/routes/api/setup/seed.ts
 * @description Seeds the database with default system settings
 *
 * This replaces the static configuration files with database-driven settings.
 * Uses database-agnostic interfaces for compatibility across different database engines.
 */

import type { DatabaseAdapter } from '@src/databases/dbInterface';
import type { SystemPreferences } from '@src/databases/dbInterface';
import { setSettingsCache } from '@src/stores/globalSettings';
import { safeParse } from 'valibot';
import { privateConfigSchema, publicConfigSchema } from '@root/config/types';

// System Logger
import { logger } from '@utils/logger.svelte';

// Default public settings that were previously in config/public.ts
const defaultPublicSettings: Array<{ key: string; value: unknown; description?: string }> = [
	// Host configuration
	{ key: 'HOST_DEV', value: 'http://localhost:5173', description: 'Development server URL' },
	{ key: 'HOST_PROD', value: 'https://yourdomain.com', description: 'Production server URL' },

	// Site configuration
	{ key: 'SITE_NAME', value: 'SveltyCMS', description: 'The public name of the website' },
	{ key: 'PASSWORD_LENGTH', value: 8, description: 'Minimum required length for user passwords' },

	// Language Configuration
	{ key: 'DEFAULT_CONTENT_LANGUAGE', value: 'en', description: 'Default language for content' },
	{ key: 'AVAILABLE_CONTENT_LANGUAGES', value: ['en', 'de'], description: 'List of available content languages' },
	{ key: 'BASE_LOCALE', value: 'en', description: 'Default/base locale for the CMS interface' },
	{ key: 'LOCALES', value: ['en'], description: 'List of available interface locales' },

	// Media configuration
	{ key: 'MEDIA_FOLDER', value: './mediaFolder', description: 'Server path where media files are stored' },
	{ key: 'MEDIA_OUTPUT_FORMAT_QUALITY', value: { format: 'webp', quality: 80 }, description: 'Image format and quality settings' },
	{ key: 'IMAGE_SIZES', value: { sm: 600, md: 900, lg: 1200 }, description: 'Image sizes for automatic resizing' },
	{ key: 'MAX_FILE_SIZE', value: 10485760, description: 'Maximum file size for uploads in bytes (10MB)' },
	{ key: 'BODY_SIZE_LIMIT', value: 10485760, description: 'Body size limit for server requests in bytes (10MB)' },
	{ key: 'USE_ARCHIVE_ON_DELETE', value: true, description: 'Enable archiving instead of permanent deletion' },

	// Seasons Icons for login page
	{ key: 'SEASONS', value: true, description: 'Enable seasonal themes on the login page' },
	{ key: 'SEASON_REGION', value: 'Western_Europe', description: 'Region for determining seasonal themes' },

	// Versioning
	{ key: 'PKG_VERSION', value: '0.0.5', description: 'Package version for display' },

	// Logging
	{ key: 'LOG_LEVELS', value: ['error', 'warn', 'info'], description: 'Active logging levels' },
	{ key: 'LOG_RETENTION_DAYS', value: 30, description: 'Number of days to keep log files' },
	{ key: 'LOG_ROTATION_SIZE', value: 10485760, description: 'Maximum size of a log file in bytes before rotation (10MB)' },

	// Demo Mode
	{ key: 'DEMO', value: false, description: 'Enable demo mode (restricts certain features)' }
];

/**
 * Default private settings that were previously in config/private.ts
 * Note: Sensitive settings like API keys should be set via GUI or CLI
 * Database config, JWT keys, and encryption keys are handled separately in private config files
 */
const defaultPrivateSettings: Array<{ key: string; value: unknown; description?: string }> = [
	// SMTP config
	{ key: 'SMTP_HOST', value: '', description: 'SMTP server host for sending emails' },
	{ key: 'SMTP_PORT', value: 587, description: 'SMTP server port' },
	{ key: 'SMTP_EMAIL', value: '', description: 'Email address to send from' },
	{ key: 'SMTP_PASSWORD', value: '', description: 'Password for the SMTP email account' },

	// Google OAuth
	{ key: 'USE_GOOGLE_OAUTH', value: false, description: 'Enable Google OAuth for login' },
	{ key: 'GOOGLE_CLIENT_ID', value: '', description: 'Google OAuth Client ID' },
	{ key: 'GOOGLE_CLIENT_SECRET', value: '', description: 'Google OAuth Client Secret' },

	// Redis config
	{ key: 'USE_REDIS', value: false, description: 'Enable Redis for caching' },
	{ key: 'REDIS_HOST', value: 'localhost', description: 'Redis server host address' },
	{ key: 'REDIS_PORT', value: 6379, description: 'Redis server port number' },
	{ key: 'REDIS_PASSWORD', value: '', description: 'Password for Redis server' },

	// Session configuration
	{ key: 'SESSION_CLEANUP_INTERVAL', value: 300000, description: 'Interval in ms to clean up expired sessions (5 minutes)' },
	{ key: 'MAX_IN_MEMORY_SESSIONS', value: 1000, description: 'Maximum number of sessions to hold in memory' },
	{ key: 'DB_VALIDATION_PROBABILITY', value: 0.1, description: 'Probability (0-1) of validating a session against the DB' },
	{ key: 'SESSION_EXPIRATION_SECONDS', value: 86400, description: 'Duration in seconds until a session expires (24 hours)' },

	// Mapbox config
	{ key: 'USE_MAPBOX', value: false, description: 'Enable Mapbox integration' },
	{ key: 'MAPBOX_API_TOKEN', value: '', description: 'Public Mapbox API token (for client-side use)' },
	{ key: 'SECRET_MAPBOX_API_TOKEN', value: '', description: 'Secret Mapbox API token (for server-side use)' },

	// Other APIs
	{ key: 'GOOGLE_API_KEY', value: '', description: 'Google API Key for services like Maps and YouTube' },
	{ key: 'TWITCH_TOKEN', value: '', description: 'API token for Twitch integration' },
	{ key: 'USE_TIKTOK', value: false, description: 'Enable TikTok integration' },
	{ key: 'TIKTOK_TOKEN', value: '', description: 'API token for TikTok integration' },

	// Server configuration
	{ key: 'SERVER_PORT', value: 5173, description: 'Port for the application server' },

	// Roles and Permissions (previously required in private config)
	{ key: 'ROLES', value: ['admin', 'editor', 'viewer'], description: 'List of user roles available in the system' },
	{ key: 'PERMISSIONS', value: ['read', 'write', 'delete', 'admin'], description: 'List of permissions available in the system' }
];

/**
 * Seeds the database with default settings using database-agnostic interface.
 * This should be called during initial setup or when resetting to defaults.
 * Note: Database config and security keys are handled in private config files, not in DB
 * @param dbAdapter Database adapter to use for operations
 */
export async function seedSettings(dbAdapter: DatabaseAdapter): Promise<void> {
	logger.info('🌱 Seeding default settings...');

	if (!dbAdapter || !dbAdapter.systemPreferences) {
		throw new Error('Database adapter or systemPreferences interface not available');
	}

	// Test database accessibility
	try {
		// Try a simple getMany operation to test connectivity
		await dbAdapter.systemPreferences.getMany(['HOST_DEV'], 'system');
		logger.debug('Database adapter is accessible');
	} catch (error) {
		logger.error('Database adapter is not accessible:', error);
		throw new Error(`Cannot access database adapter: ${error instanceof Error ? error.message : String(error)}`);
	}

	const allSettings = [...defaultPublicSettings, ...defaultPrivateSettings];

	// Prepare settings for batch operation
	const settingsToSet: Array<{
		key: string;
		value: unknown;
		scope: 'user' | 'system';
		userId?: string;
	}> = [];

	for (const setting of allSettings) {
		const isPublic = defaultPublicSettings.some((s) => s.key === setting.key);

		// Store the actual value directly, not wrapped in metadata
		// The metadata can be inferred from the setting key and visibility
		settingsToSet.push({
			key: setting.key,
			value: setting.value, // Store the actual value directly
			scope: 'system'
		});
	}

	// Use batch operation for better performance
	try {
		const result = await dbAdapter.systemPreferences.setMany(settingsToSet);

		if (!result.success) {
			throw new Error(result.error?.message || 'Failed to seed settings');
		}

		logger.info(`✅ Seeded ${allSettings.length} default settings`);
	} catch (error) {
		logger.error('Failed to seed settings:', error);
		throw error;
	}

	// Populate public settings cache immediately after seeding
	// Private settings will be loaded later when the app starts and reads the private config file
	try {
		logger.info('🔄 Populating public settings cache...');

		// Only organize public settings for immediate cache population
		const publicSettings: Record<string, unknown> = {};

		for (const setting of allSettings) {
			const isPublic = defaultPublicSettings.some((s) => s.key === setting.key);
			if (isPublic) {
				publicSettings[setting.key] = setting.value;
			}
		}

		// Validate public settings
		const parsedPublic = safeParse(publicConfigSchema, publicSettings);

		if (parsedPublic.success) {
			// For now, just populate public settings
			// Private settings will be loaded when the app starts normally
			logger.info('✅ Public settings validated successfully');
			logger.info('ℹ️ Private settings will be loaded from config files when app starts');
		} else {
			logger.warn('Public settings validation failed');
			logger.debug('Public settings validation issues:', parsedPublic.issues);
		}
	} catch (error) {
		logger.error('Failed to populate settings cache:', error);
		// Don't throw here - seeding was successful, cache population is just an optimization
	}
}

/**
 * Exports all current settings to a JSON file using database-agnostic interface.
 * This creates a settings snapshot for project templates.
 */
type SettingsSnapshot = {
	version: string;
	exportedAt: string;
	settings: Record<string, { value: unknown; visibility: string; description: string }>;
};

export async function exportSettingsSnapshot(dbAdapter: DatabaseAdapter): Promise<SettingsSnapshot> {
	if (!dbAdapter || !dbAdapter.systemPreferences) {
		throw new Error('Database adapter or systemPreferences interface not available');
	}

	// Get all system settings - we'll need to implement a method to get all settings
	// For now, we'll get the known settings keys
	const allSettingKeys = [...defaultPublicSettings, ...defaultPrivateSettings].map((s) => s.key);

	const settingsResult = await dbAdapter.systemPreferences.getMany(allSettingKeys, 'system');

	if (!settingsResult.success) {
		throw new Error(`Failed to export settings: ${settingsResult.error?.message}`);
	}

	const snapshot: SettingsSnapshot = {
		version: '1.0.0',
		exportedAt: new Date().toISOString(),
		settings: {}
	};

	// Transform the settings data
	for (const [key, settingData] of Object.entries(settingsResult.data)) {
		if (settingData && typeof settingData === 'object' && 'data' in settingData) {
			const data = settingData as any;
			snapshot.settings[key] = {
				value: data.data,
				visibility: data.visibility || 'public',
				description: data.description || ''
			};
		}
	}

	return snapshot;
}

/**
 * Imports settings from a snapshot file using database-agnostic interface.
 * This allows restoring settings from a project template.
 */
export async function importSettingsSnapshot(snapshot: Record<string, unknown>, dbAdapter: DatabaseAdapter): Promise<void> {
	if (!dbAdapter || !dbAdapter.systemPreferences) {
		throw new Error('Database adapter or systemPreferences interface not available');
	}

	if (!snapshot.settings) {
		throw new Error('Invalid settings snapshot format');
	}

	logger.info('📥 Importing settings snapshot...');

	const settingsToSet: Array<{
		key: string;
		value: unknown;
		scope: 'user' | 'system';
		userId?: string;
	}> = [];

	for (const [key, settingData] of Object.entries(snapshot.settings)) {
		const data = settingData as any;
		settingsToSet.push({
			key,
			value: {
				data: data.value,
				visibility: data.visibility || 'public',
				description: data.description || '',
				isGlobal: true,
				updatedAt: new Date()
			},
			scope: 'system'
		});
	}

	const result = await dbAdapter.systemPreferences.setMany(settingsToSet);

	if (!result.success) {
		throw new Error(`Failed to import settings: ${result.error?.message}`);
	}

	logger.info('✅ Settings snapshot imported successfully');
}
