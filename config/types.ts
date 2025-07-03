/**
 * @file config/types.ts
 * @description Configuration schemas and types with Valibot validation.
 * The Valibot schemas serve as the single source of truth for
 * both runtime validation and static TypeScript type generation.
 */

import { object, string, number, boolean, array, optional, minLength, minValue, maxValue, literal, union, safeParse, pipe } from 'valibot';
import type { InferOutput } from 'valibot';

import type { Locale } from '@src/paraglide/runtime';

/**
 * The PRIVATE configuration for the application,
 */
export const privateConfigSchema = object({
	// --- Database configuration ---
	// Define the database type (Default: 'mongodb')
	DB_TYPE: union([literal('mongodb'), literal('mariadb')]),

	DB_HOST: pipe(string(), minLength(1)), // Database Host
	DB_PORT: pipe(number(), minValue(1)), // Database Port
	DB_NAME: pipe(string(), minLength(1)), // Database Name
	DB_USER: pipe(string(), minLength(1)), // Database User
	DB_PASSWORD: pipe(string(), minLength(1)), // Database Password
	DB_RETRY_ATTEMPTS: optional(pipe(number(), minValue(1))), // Database Retry Attempts
	DB_RETRY_DELAY: optional(pipe(number(), minValue(1))), // Database Retry Delay
	DB_POOL_SIZE: optional(pipe(number(), minValue(1))), // Database Pool Size

	// --- SMTP config - See https://nodemailer.com ---
	SMTP_HOST: optional(string()), // SMTP Host
	SMTP_PORT: optional(pipe(number(), minValue(1))), // SMTP Port
	SMTP_EMAIL: optional(string()), // SMTP Email
	SMTP_PASSWORD: optional(string()), // SMTP Password
	SERVER_PORT: optional(pipe(number(), minValue(1))), // Server Port

	// --- Google OAuth - See https://developers.google.com/identity/protocols/oauth2/web-server ---
	USE_GOOGLE_OAUTH: boolean(), // Enable Google OAuth. Set to `true` to enable
	GOOGLE_CLIENT_ID: optional(string()), // Google Client ID
	GOOGLE_CLIENT_SECRET: optional(string()), // Google Client Secret

	// --- Redis config - See https://redis.io/documentation ---
	USE_REDIS: boolean(), // Enable Redis for caching by setting to true
	REDIS_HOST: optional(string()), // The hostname or IP address of your Redis server.
	REDIS_PORT: optional(pipe(number(), minValue(1))), // The port number of your Redis server.
	REDIS_PASSWORD: optional(string()), // The password for your Redis server (if any).

	// --- Session configuration ---
	SESSION_CLEANUP_INTERVAL: optional(pipe(number(), minValue(1))), // Session Cleanup Interval
	MAX_IN_MEMORY_SESSIONS: optional(pipe(number(), minValue(1))), // Max In Memory Sessions
	DB_VALIDATION_PROBABILITY: optional(pipe(number(), minValue(0), maxValue(1))), // DB Validation Probability
	SESSION_EXPIRATION_SECONDS: optional(pipe(number(), minValue(1))), // Session Expiration Seconds

	// --- Mapbox config  - See https://docs.mapbox.com/ ---
	USE_MAPBOX: boolean(), // Enable Mapbox. Set to `true` to enable
	MAPBOX_API_TOKEN: optional(string()), // Public Mapbox API Token
	SECRET_MAPBOX_API_TOKEN: optional(string()), // Secret Mapbox API Token

	// --- Google API for map & youtube ---
	GOOGLE_API_KEY: optional(string()),

	// --- TWITCH_TOKEN - See https://dev.twitch.tv/docs/authentication/ ---
	TWITCH_TOKEN: optional(string()),

	// --- TIKTOK_TOKEN - See https://dev.tiktok.com/docs/ ---
	USE_TIKTOK: optional(boolean()),
	TIKTOK_TOKEN: optional(string()),

	// --- Large Language Model API configurations ---
	LLM_APIS: optional(object({})),

	// --- Roles and Permissions ---
	ROLES: pipe(array(pipe(string(), minLength(1))), minLength(1)),
	PERMISSIONS: pipe(array(pipe(string(), minLength(1))), minLength(1)),

	// --- Secret key for signing and verifying JSON Web Tokens (JWTs) ---
	JWT_SECRET_KEY: pipe(string(), minLength(32))
});

/**
 * The PUBLIC configuration for the application,
 */
export const publicConfigSchema = object({
	// --- Host configuration ---
	HOST_DEV: pipe(string(), minLength(1)), // Hostname for development eg. http://localhost:5173
	HOST_PROD: pipe(string(), minLength(1)), // Hostname for production eg. 'mywebsite.com'

	// --- Site configuration ---
	SITE_NAME: pipe(string(), minLength(1)), // The name of the site that this CMS should get
	PASSWORD_LENGTH: pipe(number(), minValue(8)), // Password Length ( default 8)

	// --- Content Language for database ---
	DEFAULT_CONTENT_LANGUAGE: pipe(string(), minLength(1)) as unknown as Locale, // Default Content Language
	AVAILABLE_CONTENT_LANGUAGES: pipe(array(pipe(string(), minLength(1)) as unknown as Locale), minLength(1)), // Available Content Languages

	// --- System Language ---
	AVAILABLE_SYSTEM_LANGUAGES: pipe(array(pipe(string(), minLength(1)) as unknown as Locale), minLength(1)), // Available System Languages
	DEFAULT_SYSTEM_LANGUAGE: pipe(string(), minLength(1)) as unknown as Locale, // Default System Language

	// --- Media configuration ---
	MEDIA_FOLDER: pipe(string(), minLength(1)), // Media Folder where the site's media files will be stored.
	/**
	 * Determines how media files are saved on the server.
	 * Options are: 'original', 'webp', or 'avif'.
	 * 'original' saves the file in its original format.
	 * 'webp' and 'avif' save the file in an optimized format using the respective codec.
	 */
	MEDIA_OUTPUT_FORMAT_QUALITY: object({
		format: union([literal('original'), literal('jpg'), literal('webp'), literal('avif')]),
		quality: pipe(number(), minValue(1), maxValue(100))
	}),

	MEDIASERVER_URL: optional(pipe(string(), minLength(1))), // Media Server URL
	IMAGE_SIZES: object({}), // The sizes of images that the site will generate. eg. { sm: 600, md: 900, lg: 1200 }
	MAX_FILE_SIZE: optional(pipe(number(), minValue(1))), // MAX_FILE_SIZE
	BODY_SIZE_LIMIT: optional(pipe(number(), minValue(1))), //Define body size limit for your Uploads eg. 100mb
	EXTRACT_DATA_PATH: optional(string()), // Define path to extract data

	// --- Seasons Icons for login page. Set to `true` to enable ---
	SEASONS: optional(boolean()),
	SEASON_REGION: optional(union([literal('Western_Europe'), literal('South_Asia'), literal('East_Asia'), literal('Global')])), // Restricted to Western_Europe, South_Asia, or East_Asia

	// --- Github VERSION synchronization to display updated ---
	PKG_VERSION: optional(string()),

	// --- Log Level (default: 'error') (Options: Options: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'none') ---
	LOG_LEVELS: pipe(
		array(union([literal('fatal'), literal('error'), literal('warn'), literal('debug'), literal('info'), literal('trace'), literal('none')])),
		minLength(1)
	),
	LOG_RETENTION_DAYS: optional(pipe(number(), minValue(1))), // New: Number of days to retain log files (default: 2 days)
	LOG_ROTATION_SIZE: optional(pipe(number(), minValue(1))), // New: Max log file size before rotation in bytes (default: 5MB)

	DEMO: optional(boolean()) // DEMO Mode for testing
});

// ----------------- TYPES & HELPERS -----------------
export type PrivateConfig = InferOutput<typeof privateConfigSchema>;
export type PublicConfig = InferOutput<typeof publicConfigSchema>;

export const createPrivateConfig = (arg: PrivateConfig): PrivateConfig => arg;
export const createPublicConfig = (arg: PublicConfig): PublicConfig => arg;

// ----------------- ENHANCED VALIDATION -----------------
interface ValidationError {
	field: string;
	message: string;
	received?: unknown;
	expected?: string;
}

// A flag to ensure the validation start message is only logged once.
let validationLogPrinted = false;

// Format validation path for better readability
function formatPath(path: Array<{ key: string | number }> | undefined): string {
	if (!path || path.length === 0) return 'root';
	return path
		.map((p) => p.key)
		.filter(Boolean)
		.join('.');
}

// Enhanced validation function with detailed error reporting
export function validateConfig(schema: unknown, config: unknown, configName: string): unknown {
	// --- MODIFICATION START ---
	// Only log the "Starting..." message on the first validation call.
	if (!validationLogPrinted) {
		console.log('🚀 Starting CMS with configuration validation...');
		validationLogPrinted = true;
	}
	// --- MODIFICATION END ---

	// Warn about unknown fields (now treated as a hard error)
	const allowedKeys = Object.keys(schema.entries || {});
	const configKeys = Object.keys(config as object);
	const unknownKeys = configKeys.filter((k) => !allowedKeys.includes(k));
	if (unknownKeys.length > 0) {
		console.error(`\n❌ ${configName} contains unknown/unexpected fields:`);
		unknownKeys.forEach((k) => {
			console.error(`  - ${k}`);
		});
		console.error('  These fields are not defined in the schema and must be removed.');
		console.error('  Please check for typos or remove unused fields.');
		console.error('━'.repeat(70));
		console.error('\n💀 Server cannot start with invalid configuration.');
		process.exit(1);
	}

	const result = safeParse(schema, config);

	if (result.success) {
		// Perform conditional validation checks - only show errors if they occur
		return performConditionalValidation(result.output, configName);
	} else {
		// Determine config file path for clearer messaging
		const configFile = configName.includes('Private') ? 'config/private.ts' : 'config/public.ts';

		// Enhanced error reporting with clear file reference
		console.error(`\n❌ ${configName} validation failed:`);
		console.error(`📁 File: ${configFile}`);
		console.error('━'.repeat(70));

		const errors: ValidationError[] = [];
		const missingFields: string[] = [];

		// Process validation issues
		for (const issue of result.issues) {
			const fieldPath = formatPath(issue.path);
			const isMissingField =
				issue.message.toLowerCase().includes('required') || issue.message.toLowerCase().includes('missing') || issue.input === undefined;

			if (isMissingField && !missingFields.includes(fieldPath)) {
				missingFields.push(fieldPath);
			}

			errors.push({
				field: fieldPath,
				message: issue.message,
				received: issue.input,
				expected: extractExpectedType(issue.message)
			});
		}

		// Print missing fields with file context
		if (missingFields.length > 0) {
			console.error('\n🚫 Missing required fields:');
			missingFields.forEach((field) => {
				console.error(`  - In ${configFile}: ${field} is required but missing`);
				console.error(`    💡 Add: export const ${field} = <appropriate_value>;`);
			});
		}

		// Print validation errors with file context
		if (errors.length > 0) {
			console.error('\n⚠️  Validation errors:');
			errors.forEach((error) => {
				if (!missingFields.includes(error.field)) {
					console.error(`  - In ${configFile}: ${error.field}`);
					console.error(`    ❌ ${error.message}`);
					if (error.received !== undefined) {
						console.error(`    📥 Current value: ${JSON.stringify(error.received)}`);
					}
					if (error.expected) {
						console.error(`    ✅ Expected: ${error.expected}`);
					}
					console.error('');
				}
			});
		}

		console.error('\n💡 Quick Solutions:');
		console.error(`  • Open ${configFile} in your editor`);
		console.error('  • Fix the validation errors listed above');
		console.error('  • Save the file and restart the dev server');
		console.error('  • Run `npm run installer` to regenerate config files if needed');
		console.error('━'.repeat(70));
		console.error('\n💀 Server cannot start with invalid configuration.');
		process.exit(1);
	}
}

// Extract expected type from error message
function extractExpectedType(message: string): string {
	if (message.includes('Expected number')) return 'number';
	if (message.includes('Expected string')) return 'string';
	if (message.includes('Expected boolean')) return 'boolean';
	if (message.includes('Expected array')) return 'array';
	if (message.includes('Expected object')) return 'object';
	return 'valid value';
}

// Perform conditional validation checks
function performConditionalValidation(config: unknown, configName: string): unknown {
	// Add null/undefined check at the start - only show error if there's actually an issue
	if (config == null || typeof config !== 'object') {
		console.error(`\n❌ ${configName} conditional validation failed:`);
		console.error('━'.repeat(60));
		console.error(`  - Configuration object is ${config == null ? 'null/undefined' : `type: ${typeof config}`}`);
		console.error('  - Expected: valid object');
		console.error('\n🔧 Debug info:');
		console.error(`  - Config value: ${JSON.stringify(config)}`);
		console.error(`  - This error occurs in the conditional validation step after schema validation`);
		console.error('\n💡 Please check your config file and restart the server.');
		console.error('━'.repeat(60));
		process.exit(1);
	}

	const errors: string[] = [];

	// Google OAuth validation
	if (config.USE_GOOGLE_OAUTH && (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET)) {
		errors.push('Google Client ID and Secret are required when Google OAuth is enabled');
	}

	// Redis validation
	if (config.USE_REDIS && (!config.REDIS_HOST || !config.REDIS_PORT)) {
		errors.push('Redis host and port are required when Redis is enabled');
	}

	// Mapbox validation
	if (config.USE_MAPBOX && !config.MAPBOX_API_TOKEN) {
		errors.push('Mapbox API token is required when Mapbox is enabled');
	}

	// TikTok validation
	if (config.USE_TIKTOK === true && !config.TIKTOK_TOKEN) {
		errors.push('TikTok token is required when TikTok is enabled');
	}

	// Language validation
	if (
		config.DEFAULT_CONTENT_LANGUAGE &&
		config.AVAILABLE_CONTENT_LANGUAGES &&
		!config.AVAILABLE_CONTENT_LANGUAGES.includes(config.DEFAULT_CONTENT_LANGUAGE)
	) {
		errors.push('Default content language must be one of the available content languages');
	}

	if (
		config.DEFAULT_SYSTEM_LANGUAGE &&
		config.AVAILABLE_SYSTEM_LANGUAGES &&
		!config.AVAILABLE_SYSTEM_LANGUAGES.includes(config.DEFAULT_SYSTEM_LANGUAGE)
	) {
		errors.push('Default system language must be one of the available system languages');
	}

	// Seasons validation
	if (config.SEASONS === true && !config.SEASON_REGION) {
		errors.push('Season region is required when seasons are enabled');
	}

	// Only show errors if there are any
	if (errors.length > 0) {
		console.error(`\n❌ ${configName} conditional validation failed:`);
		console.error('━'.repeat(60));
		errors.forEach((error) => {
			console.error(`  - ${error}`);
		});
		console.error('\n💡 Please update your config file and restart the server.');
		console.error('━'.repeat(60));
		process.exit(1);
	}

	return config;
}
