/**
 * @file src/databases/seedSettings.ts
 * @description Seeds the database with default system settings.
 * This replaces the static configuration files with database-driven settings.
 */

import type { SystemPreferences } from '@src/databases/dbInterface';
import { SystemPreferencesModel } from '@src/databases/mongodb/models/systemPreferences';

/**
 * Default public settings that were previously in config/public.ts
 */
const defaultPublicSettings: Array<{ key: string; value: any; description?: string }> = [
	// Host configuration
	{ key: 'HOST_DEV', value: 'http://localhost:5173', description: 'Development server URL' },
	{ key: 'HOST_PROD', value: 'https://yourdomain.com', description: 'Production server URL' },

	// Site configuration
	{ key: 'SITE_NAME', value: 'SveltyCMS', description: 'The public name of the website' },
	{ key: 'PASSWORD_LENGTH', value: 8, description: 'Minimum required length for user passwords' },

	// Language Configuration
	{ key: 'DEFAULT_CONTENT_LANGUAGE', value: 'en', description: 'Default language for content' },
	{ key: 'AVAILABLE_CONTENT_LANGUAGES', value: ['en'], description: 'List of available content languages' },
	{ key: 'BASE_LOCALE', value: 'en', description: 'Default/base locale for the CMS interface' },
	{ key: 'LOCALES', value: ['en'], description: 'List of available interface locales' },

	// Media configuration
	{ key: 'MEDIA_FOLDER', value: './static/media', description: 'Server path where media files are stored' },
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
 */
const defaultPrivateSettings: Array<{ key: string; value: any; description?: string }> = [
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
 * Seeds the database with default settings.
 * This should be called during initial setup or when resetting to defaults.
 */
export async function seedDefaultSettings(): Promise<void> {
	console.log('🌱 Seeding default settings...');

	const allSettings = [...defaultPublicSettings, ...defaultPrivateSettings];

	for (const setting of allSettings) {
		const isPublic = defaultPublicSettings.some((s) => s.key === setting.key);

		const systemPreference: Partial<SystemPreferences> = {
			key: setting.key,
			value: setting.value,
			scope: 'system',
			visibility: isPublic ? 'public' : 'private',
			description: setting.description || '',
			isGlobal: true,
			createdAt: new Date(),
			updatedAt: new Date()
		};

		try {
			// Use upsert to avoid duplicates
			await SystemPreferencesModel.updateOne({ key: setting.key, scope: 'system' }, { $set: systemPreference }, { upsert: true });
		} catch (error) {
			console.error(`Failed to seed setting ${setting.key}:`, error);
		}
	}

	console.log(`✅ Seeded ${allSettings.length} default settings`);
}

/**
 * Exports all current settings to a JSON file.
 * This creates a settings snapshot for project templates.
 */
export async function exportSettingsSnapshot(): Promise<Record<string, any>> {
	const settings = await SystemPreferencesModel.find({ scope: 'system' }).lean().exec();

	const snapshot: Record<string, any> = {
		version: '1.0.0',
		exportedAt: new Date().toISOString(),
		settings: {}
	};

	for (const setting of settings) {
		snapshot.settings[setting.key] = {
			value: setting.value,
			visibility: setting.visibility,
			description: setting.description
		};
	}

	return snapshot;
}

/**
 * Imports settings from a snapshot file.
 * This allows restoring settings from a project template.
 */
export async function importSettingsSnapshot(snapshot: Record<string, any>): Promise<void> {
	if (!snapshot.settings) {
		throw new Error('Invalid settings snapshot format');
	}

	console.log('📥 Importing settings snapshot...');

	for (const [key, settingData] of Object.entries(snapshot.settings)) {
		const systemPreference: Partial<SystemPreferences> = {
			key,
			value: settingData.value,
			scope: 'system',
			visibility: settingData.visibility || 'public',
			description: settingData.description || '',
			isGlobal: true,
			updatedAt: new Date()
		};

		try {
			await SystemPreferencesModel.updateOne({ key, scope: 'system' }, { $set: systemPreference }, { upsert: true });
		} catch (error) {
			console.error(`Failed to import setting ${key}:`, error);
		}
	}

	console.log('✅ Settings snapshot imported successfully');
}
