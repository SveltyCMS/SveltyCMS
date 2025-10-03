/**
 * @file src/routes/api/setup/seed.ts
 * @description Seeds the database with default system settings
 *
 * This replaces the static configuration files with database-driven settings.
 * Uses database-agnostic interfaces for compatibility across different database engines.
 */

import { publicConfigSchema } from '@root/config/types';
import type { DatabaseId, ISODateString } from '@src/content/types';
import type { DatabaseAdapter, Theme } from '@src/databases/dbInterface';
import { invalidateSettingsCache } from '@src/stores/globalSettings';
import { logger } from '@utils/logger.svelte';
import { safeParse } from 'valibot';

// Type for setting data in snapshots
interface SettingData {
	value: unknown;
	visibility?: 'public' | 'private';
	description?: string;
}

// Default theme that matches the ThemeManager's DEFAULT_THEME
const defaultTheme: Theme = {
	_id: '670e8b8c4d123456789abcde' as DatabaseId, // MongoDB ObjectId-style string
	name: 'SveltyCMSTheme',
	path: '/src/themes/SveltyCMS/SveltyCMSTheme.css',
	isActive: false,
	isDefault: true,
	config: {
		tailwindConfigPath: '',
		assetsPath: ''
	},
	createdAt: new Date().toISOString() as ISODateString,
	updatedAt: new Date().toISOString() as ISODateString
};

/**
 * Seeds the default theme into the database
 */
export async function seedDefaultTheme(dbAdapter: DatabaseAdapter): Promise<void> {
	logger.info('🎨 Seeding default theme...');

	if (!dbAdapter || !dbAdapter.themes) {
		throw new Error('Database adapter or themes interface not available');
	}

	try {
		// Check if themes already exist
		const existingThemes = await dbAdapter.themes.getAllThemes();
		if (Array.isArray(existingThemes) && existingThemes.length > 0) {
			logger.info('✅ Default theme already exists, skipping seeding');
			return;
		}

		// Seed the default theme
		await dbAdapter.themes.storeThemes([defaultTheme]);
		logger.info('✅ Default theme seeded successfully');
	} catch (error) {
		logger.error('Failed to seed default theme:', error);
		throw error;
	}
}

/**
 * Seeds collections from filesystem into database by creating models
 */
export async function seedCollections(dbAdapter: DatabaseAdapter): Promise<void> {
	logger.info('📦 Seeding collections from filesystem...');

	if (!dbAdapter || !dbAdapter.collection) {
		throw new Error('Database adapter or collection interface not available');
	}

	try {
		// Import contentManager instance to process collection schemas
		const { contentManager } = await import('@src/content/ContentManager');

		// Initialize ContentManager to scan and load collections from filesystem
		await contentManager.initialize();

		// Get all collections from ContentManager
		const collections = contentManager.getCollections();

		if (collections.length === 0) {
			logger.info('ℹ️  No collections found in filesystem, skipping collection seeding');
			return;
		}

		logger.info(`Found ${collections.length} collections to seed`);

		let successCount = 0;
		let skipCount = 0;

		// Register each collection as a model in the database
		for (const schema of collections) {
			try {
				// Try to create the collection model in database
				await dbAdapter.collection.createModel(schema);
				logger.info(`✅ Created collection model: ${schema.name}`);
				successCount++;
			} catch (error) {
				// Collection might already exist or have schema issues
				const errorMessage = error instanceof Error ? error.message : String(error);
				if (errorMessage.includes('already exists') || errorMessage.includes('duplicate')) {
					logger.debug(`Collection '${schema.name}' already exists, skipping`);
					skipCount++;
				} else {
					logger.warn(`Failed to create collection '${schema.name}': ${errorMessage}`);
				}
			}
		}

		logger.info(`✅ Collections seeding completed: ${successCount} created, ${skipCount} skipped`);
	} catch (error) {
		logger.error('Failed to seed collections:', error);
		// Don't throw - collections can be created later through the UI
		logger.warn('Continuing setup without collection seeding...');
	}
}

/**
 * Initialize system from setup using database-agnostic interface
 * @param adapter Database adapter to use for operations
 */
export async function initSystemFromSetup(adapter: DatabaseAdapter): Promise<void> {
	logger.info('🚀 Starting system initialization from setup...');

	if (!adapter) {
		throw new Error('Database adapter not available. Database must be initialized first.');
	}

	// Set up system models first
	if (adapter.system?.setupSystemModels) {
		await adapter.system.setupSystemModels();
	}

	// Seed the database with default settings using database-agnostic interface
	await seedSettings(adapter);

	// Seed the default theme
	await seedDefaultTheme(adapter);

	// Seed collections from filesystem (creates collection tables in database)
	await seedCollections(adapter);

	// Invalidate the settings cache to force a reload
	invalidateSettingsCache();

	logger.info('✅ System initialization completed');
}

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

	// Default Theme Configuration
	// The ID will be generated by the database adapter and set after insertion
	{ key: 'DEFAULT_THEME_ID', value: '', description: 'ID of the default theme (set by adapter)' },
	{ key: 'DEFAULT_THEME_NAME', value: 'SveltyCMSTheme', description: 'Name of the default theme' },
	{ key: 'DEFAULT_THEME_PATH', value: '/src/themes/SveltyCMS/SveltyCMSTheme.css', description: 'Path to the default theme CSS file' },
	{ key: 'DEFAULT_THEME_IS_DEFAULT', value: true, description: 'Whether the default theme is the default theme' },

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
	// Security / 2FA
	{ key: 'USE_2FA', value: false, description: 'Enable Two-Factor Authentication globally' },
	{ key: 'TWO_FACTOR_AUTH_BACKUP_CODES_COUNT', value: 10, description: 'Backup codes count for 2FA (1-50)' },

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

	// Cache TTL Configuration (in seconds)
	{ key: 'CACHE_TTL_SCHEMA', value: 600, description: 'TTL for schema/collection definitions (10 minutes)' },
	{ key: 'CACHE_TTL_WIDGET', value: 600, description: 'TTL for widget data (10 minutes)' },
	{ key: 'CACHE_TTL_THEME', value: 300, description: 'TTL for theme configurations (5 minutes)' },
	{ key: 'CACHE_TTL_CONTENT', value: 180, description: 'TTL for content data (3 minutes)' },
	{ key: 'CACHE_TTL_MEDIA', value: 300, description: 'TTL for media metadata (5 minutes)' },
	{ key: 'CACHE_TTL_SESSION', value: 86400, description: 'TTL for user session data (24 hours)' },
	{ key: 'CACHE_TTL_USER', value: 60, description: 'TTL for user permissions (1 minute)' },
	{ key: 'CACHE_TTL_API', value: 300, description: 'TTL for API responses (5 minutes)' },

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

	// Create a Set of private setting keys for efficient lookup
	const privateSettingKeys = new Set(defaultPrivateSettings.map((s) => s.key));

	// Prepare settings for batch operation with category
	const settingsToSet: Array<{
		key: string;
		value: unknown;
		category: 'public' | 'private';
		scope: 'user' | 'system';
		userId?: DatabaseId;
	}> = [];

	for (const setting of allSettings) {
		// Determine category based on whether the setting is in the private list
		const category = privateSettingKeys.has(setting.key) ? 'private' : 'public';

		settingsToSet.push({
			key: setting.key,
			value: setting.value, // Store the actual value directly
			category, // Add category field for proper classification
			scope: 'system'
		});
	}

	// Use batch operation for better performance
	try {
		const result = await dbAdapter.systemPreferences.setMany(settingsToSet);

		if (!result.success) {
			throw new Error(result.error?.message || 'Failed to seed settings');
		}

		logger.info(`✅ Seeded \x1b[34m${allSettings.length}\x1b[0m default settings`);
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
			// Private settings will be loaded when the app starts normally
			logger.info('✅ Public settings validated successfully');
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
	settings: Record<string, { value: unknown; category: string; description: string }>;
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
			const data = settingData as { data: SettingData };
			snapshot.settings[key] = {
				value: data.data.value,
				category: data.data.category || 'public',
				description: data.data.description || ''
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
		userId?: DatabaseId;
	}> = [];

	for (const [key, settingData] of Object.entries(snapshot.settings)) {
		const data = settingData as SettingData;
		settingsToSet.push({
			key,
			value: {
				data: data.value,
				category: data.category || 'public',
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
