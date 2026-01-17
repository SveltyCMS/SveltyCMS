/**
 * @file shared/utils/src/config/defaults.ts
 * @description Default system settings for SveltyCMS.
 */

import inlangSettings from '@root/project.inlang/settings.json';

export const DEFAULT_SYSTEM_LANGUAGES = inlangSettings.locales || ['en', 'de'];
export const DEFAULT_BASE_LOCALE = inlangSettings.baseLocale || 'en';
export const DEFAULT_CONTENT_LANGUAGES = DEFAULT_SYSTEM_LANGUAGES;
export const DEFAULT_CONTENT_LANGUAGE = DEFAULT_BASE_LOCALE;

export const defaultPublicSettings = [
	{ key: 'HOST_DEV', value: 'http://localhost:5173', description: 'Development server URL' },
	{ key: 'HOST_PROD', value: 'https://yourdomain.com', description: 'Production server URL' },
	{ key: 'SITE_NAME', value: 'SveltyCMS', description: 'The public name of the website' },
	{ key: 'PASSWORD_LENGTH', value: 8, description: 'Minimum required length for user passwords' },
	{ key: 'DEFAULT_CONTENT_LANGUAGE', value: DEFAULT_CONTENT_LANGUAGE, description: 'Default language for content' },
	{ key: 'AVAILABLE_CONTENT_LANGUAGES', value: DEFAULT_CONTENT_LANGUAGES, description: 'List of available content languages' },
	{ key: 'BASE_LOCALE', value: DEFAULT_BASE_LOCALE, description: 'Default/base locale for the CMS interface' },
	{ key: 'LOCALES', value: DEFAULT_SYSTEM_LANGUAGES, description: 'List of available interface locales' },
	{ key: 'MEDIA_STORAGE_TYPE', value: 'local', description: 'Type of media storage (local, s3, r2, cloudinary)' },
	{ key: 'MEDIA_FOLDER', value: './mediaFolder', description: 'Server path where media files are stored' },
	{ key: 'MEDIA_OUTPUT_FORMAT_QUALITY', value: { format: 'webp', quality: 80 }, description: 'Image format and quality settings' },
	{ key: 'IMAGE_SIZES', value: { sm: 600, md: 900, lg: 1200 }, description: 'Image sizes for automatic resizing' },
	{ key: 'MAX_FILE_SIZE', value: 10485760, description: 'Maximum file size for uploads in bytes (10MB)' },
	{ key: 'BODY_SIZE_LIMIT', value: 10485760, description: 'Body size limit for server requests in bytes (10MB)' },
	{ key: 'USE_ARCHIVE_ON_DELETE', value: true, description: 'Enable archiving instead of permanent deletion' },
	{ key: 'SEASONS', value: true, description: 'Enable seasonal themes on the login page' },
	{ key: 'SEASON_REGION', value: 'Western_Europe', description: 'Region for determining seasonal themes' },
	{ key: 'DEFAULT_THEME_ID', value: '', description: 'ID of the default theme (set by adapter)' },
	{ key: 'DEFAULT_THEME_NAME', value: 'SveltyCMSTheme', description: 'Name of the default theme' },
	{ key: 'DEFAULT_THEME_PATH', value: '', description: 'Path to the default theme CSS file' },
	{ key: 'DEFAULT_THEME_IS_DEFAULT', value: true, description: 'Whether the default theme is the default theme' },
	{ key: 'EXTRACT_DATA_PATH', value: './exports/data.json', description: 'File path for exported collection data' },
	{ key: 'PKG_VERSION', value: '1.0.0', description: 'Application version' },
	{ key: 'LOG_LEVELS', value: ['info', 'warn', 'error', 'debug'], description: 'Active logging levels' },
	{ key: 'LOG_RETENTION_DAYS', value: 30, description: 'Number of days to keep log files' },
	{ key: 'LOG_ROTATION_SIZE', value: 10485760, description: 'Maximum size of a log file in bytes before rotation' },
	{ key: 'DEMO', value: false, description: 'Enable demo mode' }
];

export const defaultPrivateSettings = [
	{ key: 'USE_2FA', value: false, description: 'Enable Two-Factor Authentication globally' },
	{ key: 'TWO_FACTOR_AUTH_BACKUP_CODES_COUNT', value: 10, description: 'Backup codes count for 2FA (1-50)' },
	{ key: 'SVELTYCMS_TELEMETRY', value: true, description: 'Enable SveltyCMS telemetry tracking' },
	{ key: 'SMTP_HOST', value: '', description: 'SMTP server host for sending emails' },
	{ key: 'SMTP_PORT', value: 587, description: 'SMTP server port' },
	{ key: 'SMTP_EMAIL', value: '', description: 'Email address to send from' },
	{ key: 'SMTP_PASSWORD', value: '', description: 'Password for the SMTP email account' },
	{ key: 'USE_GOOGLE_OAUTH', value: false, description: 'Enable Google OAuth for login' },
	{ key: 'GOOGLE_CLIENT_ID', value: '', description: 'Google OAuth Client ID' },
	{ key: 'GOOGLE_CLIENT_SECRET', value: '', description: 'Google OAuth Client Secret' },
	{ key: 'USE_REDIS', value: false, description: 'Enable Redis for caching' },
	{ key: 'REDIS_HOST', value: 'localhost', description: 'Redis server host address' },
	{ key: 'REDIS_PORT', value: 6379, description: 'Redis server port number' },
	{ key: 'REDIS_PASSWORD', value: '', description: 'Password for Redis server' },
	{ key: 'CACHE_TTL_SCHEMA', value: 600, description: 'TTL for schema/collection definitions' },
	{ key: 'CACHE_TTL_WIDGET', value: 600, description: 'TTL for widget data' },
	{ key: 'CACHE_TTL_THEME', value: 300, description: 'TTL for theme configurations' },
	{ key: 'CACHE_TTL_CONTENT', value: 180, description: 'TTL for content data' },
	{ key: 'CACHE_TTL_MEDIA', value: 300, description: 'TTL for media metadata' },
	{ key: 'CACHE_TTL_SESSION', value: 86400, description: 'TTL for user session data' },
	{ key: 'CACHE_TTL_USER', value: 60, description: 'TTL for user permissions' },
	{ key: 'CACHE_TTL_API', value: 300, description: 'TTL for API responses' },
	{ key: 'SESSION_CLEANUP_INTERVAL', value: 300000, description: 'Interval in ms to clean up expired sessions' },
	{ key: 'MAX_IN_MEMORY_SESSIONS', value: 1000, description: 'Maximum number of sessions to hold in memory' },
	{ key: 'DB_VALIDATION_PROBABILITY', value: 0.1, description: 'Probability of validating a session against the DB' },
	{ key: 'SESSION_EXPIRATION_SECONDS', value: 86400, description: 'Duration in seconds until a session expires' },
	{ key: 'USE_MAPBOX', value: false, description: 'Enable Mapbox integration' },
	{ key: 'MAPBOX_API_TOKEN', value: '', description: 'Public Mapbox API token' },
	{ key: 'SECRET_MAPBOX_API_TOKEN', value: '', description: 'Secret Mapbox API token' },
	{ key: 'GOOGLE_API_KEY', value: '', description: 'Google API Key' },
	{ key: 'TWITCH_TOKEN', value: '', description: 'API token for Twitch integration' },
	{ key: 'USE_TIKTOK', value: false, description: 'Enable TikTok integration' },
	{ key: 'TIKTOK_TOKEN', value: '', description: 'API token for TikTok integration' },
	{ key: 'SERVER_PORT', value: 5173, description: 'Port for the application server' },
	{ key: 'ROLES', value: ['admin', 'editor', 'viewer'], description: 'List of user roles available in the system' },
	{ key: 'PERMISSIONS', value: ['read', 'write', 'delete', 'admin'], description: 'List of permissions available in the system' }
];
