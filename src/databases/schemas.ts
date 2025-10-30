/**
 * @file src/databases/schemas.ts
 * @description Defines validation schemas for application configuration and base database structures.
 * @summary
 * This file serves as the "rulebook" for the application's configuration and base database models,
 * primarily using Valibot for schema definition and validation. It ensures the integrity of
 * critical configuration and provides foundational data structures.
 *
 * Key definitions in this file include:
 * - `privateConfigSchema`: Validates `private.ts`, covering sensitive data like database credentials and API keys.
 * - `publicConfigSchema`: Validates `public.ts`, covering public settings like site name and feature flags.
 * - `databaseConfigSchema`: Defines the structure for database connections during setup.
 * - Validation logic and helpers for ensuring configuration is correct at startup.
 *
 * You should edit this file when you need to:
 * - Add or change a required environment variable for the system to run.
 * - Define the validation rules for new configuration settings.
 * - Specify the base schema for a new database table or collection.
 */

import type { BaseIssue, BaseSchema, InferOutput } from 'valibot';
import { array, boolean, literal, maxValue, minLength, minValue, number, object, optional, pipe, safeParse, string, union } from 'valibot';

// ----------------- CONFIGURATION SCHEMAS -----------------

/**
 * The PRIVATE configuration for the application.
 *
 * NOTE: Only essential startup values are kept here. All other settings are now database-driven.
 * This includes database connection info and JWT secret that are required for the server to start.
 */
export const privateConfigSchema = object({
	// --- Database configuration (Essential for startup) ---
	DB_TYPE: union([literal('mongodb'), literal('mongodb+srv')]), // Define the database type
	DB_HOST: pipe(string(), minLength(1, 'Database host is required.')), // Database host address
	DB_PORT: pipe(number(), minValue(1)), // Database port number
	DB_NAME: pipe(string(), minLength(1, 'Database name is required.')), // Database name
	DB_USER: string(), // Database username (optional for some databases like Docker MongoDB without auth)
	DB_PASSWORD: string(), // Database password (optional for some databases like Docker MongoDB without auth)
	DB_RETRY_ATTEMPTS: optional(pipe(number(), minValue(1))), // Optional: Number of retry attempts on connection failure
	DB_RETRY_DELAY: optional(pipe(number(), minValue(1))), // Optional: Delay in ms between retry attempts
	DB_POOL_SIZE: optional(pipe(number(), minValue(1))), // Optional: Database connection pool size

	// --- JWT Secret (Essential for startup) ---
	JWT_SECRET_KEY: pipe(string(), minLength(32, 'JWT Secret Key must be at least 32 characters long for security.')), // Secret key for JWT

	// --- Encryption Key (Essential for startup) ---
	ENCRYPTION_KEY: pipe(string(), minLength(32, 'Encryption Key must be at least 32 characters long for security.')), // Encryption key for sensitive data

	// --- Multi-tenancy (Essential for startup) ---
	MULTI_TENANT: optional(boolean()), // Enable multi-tenant database support

	// --- Optional service toggles (populated dynamically post-startup) ---
	USE_REDIS: optional(boolean()),
	REDIS_HOST: optional(pipe(string(), minLength(1))),
	REDIS_PORT: optional(pipe(number(), minValue(1))),
	REDIS_PASSWORD: optional(string()),

	// --- Cache TTL Configuration (in seconds) ---
	CACHE_TTL_SCHEMA: optional(pipe(number(), minValue(1))), // TTL for schema/collection definitions
	CACHE_TTL_WIDGET: optional(pipe(number(), minValue(1))), // TTL for widget data
	CACHE_TTL_THEME: optional(pipe(number(), minValue(1))), // TTL for theme configurations
	CACHE_TTL_CONTENT: optional(pipe(number(), minValue(1))), // TTL for content data
	CACHE_TTL_MEDIA: optional(pipe(number(), minValue(1))), // TTL for media metadata
	CACHE_TTL_SESSION: optional(pipe(number(), minValue(1))), // TTL for user session data
	CACHE_TTL_USER: optional(pipe(number(), minValue(1))), // TTL for user permissions
	CACHE_TTL_API: optional(pipe(number(), minValue(1))), // TTL for API responses

	GOOGLE_CLIENT_ID: optional(pipe(string(), minLength(1))),
	GOOGLE_CLIENT_SECRET: optional(pipe(string(), minLength(1))),
	GOOGLE_API_KEY: optional(pipe(string(), minLength(1))),
	SMTP_HOST: optional(pipe(string(), minLength(1))),
	SMTP_PORT: optional(pipe(number(), minValue(1))),
	SMTP_USER: optional(string()),
	SMTP_PASS: optional(string()),
	SMTP_MAIL_FROM: optional(string()),
	SMTP_EMAIL: optional(string()),
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

	// --- Cloud Storage Credentials (Private - never expose to client) ---
	MEDIA_CLOUD_ACCESS_KEY: optional(pipe(string(), minLength(1))), // Access key for S3/R2/compatible services
	MEDIA_CLOUD_SECRET_KEY: optional(pipe(string(), minLength(1))), // Secret key for S3/R2/compatible services
	MEDIA_CLOUDINARY_CLOUD_NAME: optional(pipe(string(), minLength(1))), // Cloudinary cloud name
	MEDIA_CLOUDINARY_API_KEY: optional(pipe(string(), minLength(1))), // Cloudinary API key
	MEDIA_CLOUDINARY_API_SECRET: optional(pipe(string(), minLength(1))), // Cloudinary API secret

	TWITCH_CLIENT_ID: optional(pipe(string(), minLength(1))),
	TWITCH_TOKEN: optional(pipe(string(), minLength(1))),
	TIKTOK_TOKEN: optional(pipe(string(), minLength(1)))
});

/**
 * The PUBLIC configuration for the application.
 *
 * NOTE: Most public settings are now stored in the database and loaded dynamically.
 * This schema only validates essential startup values that must be available immediately.
 */
export const publicConfigSchema = object({
	// --- Host configuration ---
	HOST_DEV: pipe(string(), minLength(1)), // Development server URL (e.g., 'http://localhost:5173')
	HOST_PROD: pipe(string(), minLength(1)), // Production server URL (e.g., 'https://mywebsite.com')
	// --- Site configuration ---

	SITE_NAME: pipe(string(), minLength(1)), // The public name of the website
	PASSWORD_LENGTH: pipe(number(), minValue(8)), // Minimum required length for user passwords
	// --- Language Configuration ---

	DEFAULT_CONTENT_LANGUAGE: pipe(string(), minLength(1)), // Default language for content (e.g., 'en')
	AVAILABLE_CONTENT_LANGUAGES: pipe(array(pipe(string(), minLength(1))), minLength(1)), // List of available content languages
	BASE_LOCALE: pipe(string(), minLength(1)), // Default/base locale for the CMS interface (from inlang)
	LOCALES: pipe(array(pipe(string(), minLength(1))), minLength(1)), // List of available interface locales (from inlang)
	// --- Media configuration ---

	MEDIA_STORAGE_TYPE: union([literal('local'), literal('s3'), literal('r2'), literal('cloudinary')]), // Type of media storage
	MEDIA_FOLDER: pipe(string(), minLength(1)), // Local: Server path where media files are stored | Cloud: Bucket name or container
	MEDIA_OUTPUT_FORMAT_QUALITY: object({
		format: union([literal('original'), literal('jpg'), literal('webp'), literal('avif')]), // Image format for output
		quality: pipe(number(), minValue(1), maxValue(100)) // Image quality (1-100) for compressed formats
	}),
	MEDIASERVER_URL: optional(string()), // Optional: URL of a separate media server or CDN endpoint

	// --- Cloud Storage Configuration (Optional - only needed if MEDIA_STORAGE_TYPE is not 'local') ---
	MEDIA_CLOUD_REGION: optional(string()), // Cloud storage region (e.g., 'us-east-1', 'auto' for R2)
	MEDIA_CLOUD_ENDPOINT: optional(string()), // Custom endpoint URL for S3-compatible services (R2, MinIO, etc.)
	MEDIA_CLOUD_PUBLIC_URL: optional(string()), // Public URL for accessing uploaded files (CDN or bucket URL)
	IMAGE_SIZES: object({}), // Defines image sizes for automatic resizing (e.g., { sm: 600, md: 900 })
	MAX_FILE_SIZE: optional(pipe(number(), minValue(1))), // Maximum file size for uploads in bytes
	BODY_SIZE_LIMIT: optional(pipe(number(), minValue(1))), // Body size limit for server requests in bytes
	EXTRACT_DATA_PATH: optional(string()), // Optional file path where exported collection data will be written (e.g., './exports/data.json')
	USE_ARCHIVE_ON_DELETE: optional(boolean()), // Set to `true` to enable archiving instead of permanent deletion
	// --- Seasons Icons for login page ---

	SEASONS: optional(boolean()), // Set to `true` to enable seasonal themes on the login page
	SEASON_REGION: optional(union([literal('Western_Europe'), literal('South_Asia'), literal('East_Asia'), literal('Global')])), // Region for determining seasonal themes
	// --- Versioning ---

	PKG_VERSION: optional(string()), // Package version, often synced with package.json for display
	// --- Logging ---

	LOG_LEVELS: pipe(
		array(
			union([
				literal('none'), // No logger output will be generated (fastest performance)
				literal('error'), // Application errors and exceptions that need investigation
				literal('info'), // General informational messages about application flow
				literal('warn'), // Warning messages about potential issues or deprecated features
				literal('debug'), // Detailed debugging information for development (verbose)
				literal('fatal'), // Critical system failures that require immediate attention
				literal('trace') // Most detailed tracing information for deep debugging (very verbose)
			])
		),
		minLength(1)
	), // Defines the logging levels to be active. Default: ['error'] for production efficiency
	LOG_RETENTION_DAYS: optional(pipe(number(), minValue(1))), // Number of days to keep log files
	LOG_ROTATION_SIZE: optional(pipe(number(), minValue(1))), // Maximum size of a log file in bytes before rotation
	// --- Demo Mode ---

	DEMO: optional(boolean()), // Set to `true` to enable demo mode, which may restrict certain features
	USE_GOOGLE_OAUTH: optional(boolean()) // Enable Google OAuth login on the public-facing login page
});

/**
 * Defines the structure for database connection configuration used during setup.
 * Currently supports MongoDB (including Atlas SRV). SQL databases planned for future releases.
 */
export const databaseConfigSchema = object({
	type: union([literal('mongodb'), literal('mongodb+srv')]),
	host: pipe(string(), minLength(1)),
	port: optional(pipe(number(), minValue(0))), // Optional for Atlas (mongodb+srv), 0 or undefined allowed
	name: pipe(string(), minLength(1)),
	user: string(),
	password: string()
});

// ----------------- TYPES & HELPERS -----------------
export type DatabaseConfig = InferOutput<typeof databaseConfigSchema>;
export type PrivateConfig = InferOutput<typeof privateConfigSchema>;

export type PublicConfig = InferOutput<typeof publicConfigSchema>;

// --- DYNAMIC COLLECTION SCHEMAS ---
// Placeholder: Replace with actual collection schemas as needed
export const collectionSchemas = {
	Names: {
		name: 'Names',
		label: 'Names',
		fields: []
		// ...other Schema properties
	},
	Relation: {
		name: 'Relation',
		label: 'Relation',
		fields: []
	},
	WidgetTest: {
		name: 'WidgetTest',
		label: 'WidgetTest',
		fields: []
	}
	// Add more collections as needed
};

export const createPrivateConfig = (arg: PrivateConfig): PrivateConfig => arg;
export const createPublicConfig = (arg: PublicConfig): PublicConfig => arg;

// ----------------- ENHANCED VALIDATION & LOGGING -----------------

// A flag to ensure the validation start message is only logged once.
let validationLogPrinted = false;

// Console colors for better readability
const colors = {
	reset: '\x1b[0m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	magenta: '\x1b[35m',
	cyan: '\x1b[36m',
	white: '\x1b[37m',
	gray: '\x1b[90m'
};

/**
 * Formats the path of a validation issue for better readability.
 * @param path - The path array from a Valibot issue.
 * @returns A dot-separated string representing the field path.
 */
function formatPath(path: BaseIssue<unknown>['path']): string {
	if (!path || path.length === 0) return 'root';
	return path.map((p) => String(p.key)).join('.');
}

/**
 * Logs detailed, formatted, and colored error messages for validation failures.
 * @param issues - An array of Valibot issues.
 * @param configFile - The name of the configuration file being validated.
 */
function logValidationErrors(issues: BaseIssue<unknown>[], configFile: string): void {
	console.error(`\n${colors.yellow}⚠️ Invalid configuration in ${colors.cyan}${configFile}${colors.reset}`);

	issues.forEach((issue) => {
		const fieldPath = formatPath(issue.path) || 'Configuration object';
		console.error(`\n   - ${colors.white}Location:${colors.cyan} ${fieldPath}`);
		console.error(`     ${colors.red}Error: ${issue.message}${colors.reset}`);
		if (issue.input !== undefined) {
			console.error(`     ${colors.magenta}Received: ${colors.red}${JSON.stringify(issue.input)}${colors.reset}`);
		}
	});
}

/**
 * Performs conditional validation checks that depend on multiple config values.
 * This is used as a fallback for older Valibot versions that don't support `refine`.
 * @param config - The successfully parsed configuration object.
 * @returns An array of human-readable error messages.
 */
interface Config {
	USE_2FA?: boolean;
	TWO_FACTOR_AUTH_BACKUP_CODES_COUNT?: number;
	USE_GOOGLE_OAUTH?: boolean;
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
	USE_REDIS?: boolean;
	REDIS_HOST?: string;
	REDIS_PORT?: number;
	USE_MAPBOX?: boolean;
	MAPBOX_API_TOKEN?: string;
	USE_TIKTOK?: boolean;
	TIKTOK_TOKEN?: string;
	SEASONS?: string[];
	SEASON_REGION?: string;
	AVAILABLE_CONTENT_LANGUAGES?: string[];
	DEFAULT_CONTENT_LANGUAGE?: string;
	LOCALES?: string[];
	BASE_LOCALE?: string;
	// Add other properties as needed
}

function performConditionalValidation(config: Config): string[] {
	const errors: string[] = []; // Private Config Checks

	if (config.USE_GOOGLE_OAUTH && (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET)) {
		errors.push(
			`When ${colors.cyan}USE_GOOGLE_OAUTH${colors.reset} is true, both ${colors.cyan}GOOGLE_CLIENT_ID${colors.reset} and ${colors.cyan}GOOGLE_CLIENT_SECRET${colors.reset} are required.`
		);
	}
	if (config.USE_REDIS && (!config.REDIS_HOST || !config.REDIS_PORT)) {
		errors.push(
			`When ${colors.cyan}USE_REDIS${colors.reset} is true, both ${colors.cyan}REDIS_HOST${colors.reset} and ${colors.cyan}REDIS_PORT${colors.reset} are required.`
		);
	}
	if (config.USE_MAPBOX && !config.MAPBOX_API_TOKEN) {
		errors.push(`When ${colors.cyan}USE_MAPBOX${colors.reset} is true, a ${colors.cyan}MAPBOX_API_TOKEN${colors.reset} is required.`);
	}
	if (config.USE_TIKTOK && !config.TIKTOK_TOKEN) {
		errors.push(`When ${colors.cyan}USE_TIKTOK${colors.reset} is true, a ${colors.cyan}TIKTOK_TOKEN${colors.reset} is required.`);
	}

	// 2FA validation
	if (
		config.USE_2FA &&
		config.TWO_FACTOR_AUTH_BACKUP_CODES_COUNT &&
		(config.TWO_FACTOR_AUTH_BACKUP_CODES_COUNT < 1 || config.TWO_FACTOR_AUTH_BACKUP_CODES_COUNT > 50)
	) {
		errors.push(
			`When ${colors.cyan}USE_2FA${colors.reset} is enabled, ${colors.cyan}TWO_FACTOR_AUTH_BACKUP_CODES_COUNT${colors.reset} must be between 1 and 50.`
		);
	}

	// Public Config Checks

	if (config.SEASONS && !config.SEASON_REGION) {
		errors.push(`When ${colors.cyan}SEASONS${colors.reset} is true, a ${colors.cyan}SEASON_REGION${colors.reset} must be selected.`);
	}
	if (
		config.DEFAULT_CONTENT_LANGUAGE &&
		config.AVAILABLE_CONTENT_LANGUAGES &&
		!config.AVAILABLE_CONTENT_LANGUAGES.includes(config.DEFAULT_CONTENT_LANGUAGE)
	) {
		errors.push(
			`The ${colors.cyan}DEFAULT_CONTENT_LANGUAGE${colors.reset} must be included in the ${colors.cyan}AVAILABLE_CONTENT_LANGUAGES${colors.reset} array.`
		);
	}
	if (config.BASE_LOCALE && config.LOCALES && Array.isArray(config.LOCALES) && config.LOCALES.includes(config.BASE_LOCALE)) {
		errors.push(`The ${colors.cyan}BASE_LOCALE${colors.reset} must be included in the ${colors.cyan}LOCALES${colors.reset} array.`);
	}

	return errors;
}

/**
 * The main validation function that orchestrates schema checks.
 * @param schema - The Valibot schema to validate against.
 * @param config - The configuration object to validate.
 * @param configName - The name of the configuration (e.g., "Private Config").
 * @returns The validated configuration object.
 */
export function validateConfig(schema: BaseSchema<unknown, unknown, BaseIssue<unknown>>, config: unknown, configName: string): unknown {
	if (!validationLogPrinted) {
		logger.trace(`\n${colors.blue}🚀 Validating CMS configuration...${colors.reset}`);
		validationLogPrinted = true;
	}

	const result = safeParse(schema, config, { abortEarly: false });
	const configFile = configName.includes('Private') ? 'config/private.ts' : 'config/public.ts';

	if (result.success) {
		// Perform secondary, cross-field validation
		const conditionalErrors = performConditionalValidation(result.output as Config);
		if (conditionalErrors.length > 0) {
			logger.error(`\n${colors.red}❌ ${configName} validation failed with logical errors:${colors.reset}`);
			logger.error(`${colors.gray}   File: ${configFile}${colors.reset}`);
			logger.error('━'.repeat(70));
			logger.error(`\n${colors.yellow}⚠️ Logical Validation Errors:${colors.reset}`);
			conditionalErrors.forEach((error) => {
				logger.error(`   - ${error}`);
			});
			logger.error('\n' + '━'.repeat(70));
			logger.error(`\n${colors.red}💀 Server cannot start. Please fix the logical inconsistencies listed above.${colors.reset}\n`);
			process.exit(1);
		}
		return result.output;
	} else {
		// Handle schema validation failures
		logger.error(`\n${colors.red}❌ ${configName} validation failed. Please check your configuration.${colors.reset}`);
		logger.error('━'.repeat(70));

		logValidationErrors(result.issues, configFile);

		logger.error('\n' + '━'.repeat(70));
		logger.error(`\n${colors.red}💀 Server cannot start. Please fix the errors listed above.${colors.reset}\n`);
		process.exit(1);
	}
}
