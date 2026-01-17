import { object, optional, pipe, string, union, array, boolean, minLength, number, minValue, literal, maxValue, transform } from 'valibot';
import './logger.js';
const privateConfigSchema = object({
	// --- Database configuration (Essential for startup) ---
	DB_TYPE: union([literal('mongodb'), literal('mongodb+srv'), literal('mariadb'), literal('')]),
	DB_HOST: pipe(string(), minLength(1, 'Database host is required.')),
	DB_PORT: pipe(number(), minValue(1)),
	DB_NAME: pipe(string(), minLength(1, 'Database name is required.')),
	DB_USER: string(),
	DB_PASSWORD: string(),
	DB_RETRY_ATTEMPTS: optional(pipe(number(), minValue(1))),
	DB_RETRY_DELAY: optional(pipe(number(), minValue(1))),
	DB_POOL_SIZE: optional(pipe(number(), minValue(1))),
	// --- JWT Secret (Essential for startup) ---
	JWT_SECRET_KEY: pipe(string(), minLength(32, 'JWT Secret Key must be at least 32 characters long for security.')),
	// --- Encryption Key (Essential for startup) ---
	ENCRYPTION_KEY: pipe(string(), minLength(32, 'Encryption Key must be at least 32 characters long for security.')),
	// --- Multi-tenancy (Essential for startup) ---
	MULTI_TENANT: optional(boolean()),
	DEMO: optional(boolean()),
	// --- Licensing & Telemetry (BSL 1.1 Support) ---
	LICENSE_KEY: optional(string()),
	// For Enterprise users to disable nags/tracking
	SVELTYCMS_TELEMETRY: optional(boolean()),
	// Usage tracking (default: true)
	// --- Optional service toggles (populated dynamically post-startup) ---
	USE_REDIS: optional(boolean()),
	REDIS_HOST: optional(pipe(string(), minLength(1))),
	REDIS_PORT: optional(pipe(number(), minValue(1))),
	REDIS_PASSWORD: optional(string()),
	// --- Cache TTL Configuration (in seconds) ---
	CACHE_TTL_SCHEMA: optional(pipe(number(), minValue(1))),
	CACHE_TTL_WIDGET: optional(pipe(number(), minValue(1))),
	CACHE_TTL_THEME: optional(pipe(number(), minValue(1))),
	CACHE_TTL_CONTENT: optional(pipe(number(), minValue(1))),
	CACHE_TTL_MEDIA: optional(pipe(number(), minValue(1))),
	CACHE_TTL_SESSION: optional(pipe(number(), minValue(1))),
	CACHE_TTL_USER: optional(pipe(number(), minValue(1))),
	CACHE_TTL_API: optional(pipe(number(), minValue(1))),
	GOOGLE_CLIENT_ID: optional(pipe(string(), minLength(1))),
	GOOGLE_CLIENT_SECRET: optional(pipe(string(), minLength(1))),
	GOOGLE_API_KEY: optional(pipe(string(), minLength(1))),
	SMTP_HOST: optional(pipe(string(), minLength(1))),
	SMTP_PORT: optional(pipe(number(), minValue(1))),
	SMTP_USER: optional(string()),
	SMTP_PASS: optional(string()),
	SMTP_MAIL_FROM: optional(string()),
	SMTP_EMAIL: optional(string()),
	// Roles schema
	ROLES: optional(
		array(
			object({
				_id: pipe(string(), minLength(1)),
				name: pipe(string(), minLength(1)),
				description: optional(string()),
				permissions: array(pipe(string(), minLength(1))),
				isAdmin: optional(boolean()),
				icon: optional(string()),
				color: optional(string())
			})
		)
	),
	MEDIA_FOLDER: optional(pipe(string(), minLength(1))),
	// --- Cloud Storage Credentials ---
	MEDIA_CLOUD_ACCESS_KEY: optional(pipe(string(), minLength(1))),
	MEDIA_CLOUD_SECRET_KEY: optional(pipe(string(), minLength(1))),
	MEDIA_CLOUDINARY_CLOUD_NAME: optional(pipe(string(), minLength(1))),
	MEDIA_CLOUDINARY_API_KEY: optional(pipe(string(), minLength(1))),
	MEDIA_CLOUDINARY_API_SECRET: optional(pipe(string(), minLength(1))),
	TWITCH_CLIENT_ID: optional(pipe(string(), minLength(1))),
	TWITCH_TOKEN: optional(pipe(string(), minLength(1))),
	TIKTOK_TOKEN: optional(pipe(string(), minLength(1))),
	// --- Firewall Configuration ---
	FIREWALL_ENABLED: optional(boolean()),
	FIREWALL_ALLOWED_BOTS: optional(array(string())),
	FIREWALL_BLOCKED_BOTS: optional(array(string()))
});
const publicConfigSchema = object({
	// --- Host configuration ---
	HOST_DEV: pipe(string(), minLength(1)),
	HOST_PROD: pipe(string(), minLength(1)),
	// --- Site configuration ---
	SITE_NAME: pipe(string(), minLength(1)),
	PASSWORD_LENGTH: pipe(number(), minValue(8)),
	// --- Language Configuration ---
	DEFAULT_CONTENT_LANGUAGE: pipe(string(), minLength(1)),
	AVAILABLE_CONTENT_LANGUAGES: pipe(array(pipe(string(), minLength(1))), minLength(1)),
	BASE_LOCALE: pipe(string(), minLength(1)),
	LOCALES: pipe(array(pipe(string(), minLength(1))), minLength(1)),
	// --- Media configuration ---
	MEDIA_STORAGE_TYPE: union([literal('local'), literal('s3'), literal('r2'), literal('cloudinary')]),
	MEDIA_FOLDER: pipe(string(), minLength(1)),
	MEDIA_OUTPUT_FORMAT_QUALITY: object({
		format: union([literal('original'), literal('jpg'), literal('webp'), literal('avif')]),
		quality: pipe(number(), minValue(1), maxValue(100))
	}),
	MEDIASERVER_URL: optional(string()),
	MEDIA_BUCKET_NAME: optional(pipe(string(), minLength(1))),
	// --- Cloud Storage Configuration ---
	MEDIA_CLOUD_REGION: optional(string()),
	MEDIA_CLOUD_ENDPOINT: optional(string()),
	MEDIA_CLOUD_PUBLIC_URL: optional(string()),
	IMAGE_SIZES: object({}),
	MAX_FILE_SIZE: optional(pipe(number(), minValue(1))),
	BODY_SIZE_LIMIT: optional(pipe(number(), minValue(1))),
	EXTRACT_DATA_PATH: optional(string()),
	USE_ARCHIVE_ON_DELETE: optional(boolean()),
	// --- Seasons Icons ---
	SEASONS: optional(boolean()),
	SEASON_REGION: optional(union([literal('Western_Europe'), literal('South_Asia'), literal('East_Asia'), literal('Global')])),
	// --- Versioning ---
	PKG_VERSION: optional(string()),
	// --- Logging ---
	LOG_LEVELS: pipe(
		array(union([literal('none'), literal('error'), literal('info'), literal('warn'), literal('debug'), literal('fatal'), literal('trace')])),
		minLength(1)
	),
	LOG_RETENTION_DAYS: optional(pipe(number(), minValue(1))),
	LOG_ROTATION_SIZE: optional(pipe(number(), minValue(1))),
	// --- Demo Mode ---
	USE_GOOGLE_OAUTH: optional(boolean()),
	DEMO: optional(boolean())
});
object({
	_id: pipe(
		string(),
		transform((input) => input)
	),
	name: pipe(string(), minLength(1, 'Token name is required.')),
	token: pipe(string(), minLength(32)),
	createdAt: pipe(
		string(),
		transform((input) => input)
	),
	updatedAt: pipe(
		string(),
		transform((input) => input)
	),
	createdBy: string()
});
object({
	type: union([literal('mongodb'), literal('mongodb+srv'), literal('mariadb')]),
	host: pipe(string(), minLength(1)),
	port: optional(pipe(number(), minValue(0))),
	name: pipe(string(), minLength(1)),
	user: string(),
	password: string()
});
export { privateConfigSchema as a, publicConfigSchema as p };
//# sourceMappingURL=schemas.js.map
