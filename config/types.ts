/**
 * @file config/types.ts
 * @description Configuration schemas and types with Valibot validation.
 * This version is compatible with older Valibot versions by handling
 * cross-field validation in a separate function instead of using `refine`.
 * It maintains enhanced, developer-friendly error reporting.
 */

import type { BaseSchema, InferOutput, BaseIssue } from 'valibot';
import { array, boolean, literal, maxValue, minLength, minValue, number, object, optional, pipe, safeParse, string, union } from 'valibot';

// ----------------- CONFIGURATION SCHEMAS -----------------

/**
 * The PRIVATE configuration for the application.
 */
export const privateConfigSchema = object({
	// --- Database configuration ---
	DB_TYPE: union([literal('mongodb'), literal('mariadb')]), // Define the database type (e.g., 'mongodb')
	DB_HOST: pipe(string(), minLength(1, 'Database host is required.')), // Database host address
	DB_PORT: pipe(number(), minValue(1)), // Database port number
	DB_NAME: pipe(string(), minLength(1, 'Database name is required.')), // Database name
	DB_USER: pipe(string(), minLength(1, 'Database user is required.')), // Database username
	DB_PASSWORD: pipe(string(), minLength(1, 'Database password is required.')), // Database password
	DB_RETRY_ATTEMPTS: optional(pipe(number(), minValue(1))), // Optional: Number of retry attempts on connection failure
	DB_RETRY_DELAY: optional(pipe(number(), minValue(1))), // Optional: Delay in ms between retry attempts
	DB_POOL_SIZE: optional(pipe(number(), minValue(1))), // Optional: Database connection pool size
	MULTI_TENANT: optional(boolean()), // Optional: Set to `true` to enable multi-tenancy
	// --- SMTP config - See https://nodemailer.com ---

	SMTP_HOST: optional(string()), // SMTP server host for sending emails
	SMTP_PORT: optional(pipe(number(), minValue(1))), // SMTP server port
	SMTP_EMAIL: optional(string()), // Email address to send from
	SMTP_PASSWORD: optional(string()), // Password for the SMTP email account
	SERVER_PORT: optional(pipe(number(), minValue(1))), // Port for the application server
	// --- Google OAuth ---

	USE_GOOGLE_OAUTH: boolean(), // Set to `true` to enable Google OAuth for login
	GOOGLE_CLIENT_ID: optional(string()), // Google OAuth Client ID
	GOOGLE_CLIENT_SECRET: optional(string()), // Google OAuth Client Secret
	// --- Redis config ---

	USE_REDIS: boolean(), // Set to `true` to enable Redis for caching
	REDIS_HOST: optional(string()), // Redis server host address
	REDIS_PORT: optional(pipe(number(), minValue(1))), // Redis server port number
	REDIS_PASSWORD: optional(string()), // Optional: Password for Redis server
	// --- Session configuration ---

	SESSION_CLEANUP_INTERVAL: optional(pipe(number(), minValue(1))), // Interval in ms to clean up expired sessions
	MAX_IN_MEMORY_SESSIONS: optional(pipe(number(), minValue(1))), // Maximum number of sessions to hold in memory
	DB_VALIDATION_PROBABILITY: optional(pipe(number(), minValue(0), maxValue(1))), // Probability (0-1) of validating a session against the DB
	SESSION_EXPIRATION_SECONDS: optional(pipe(number(), minValue(1))), // Duration in seconds until a session expires
	// --- Mapbox config ---

	USE_MAPBOX: boolean(), // Set to `true` to enable Mapbox integration
	MAPBOX_API_TOKEN: optional(string()), // Public Mapbox API token (for client-side use)
	SECRET_MAPBOX_API_TOKEN: optional(string()), // Secret Mapbox API token (for server-side use)
	// --- Other APIs ---

	GOOGLE_API_KEY: optional(string()), // Google API Key for services like Maps and YouTube
	TWITCH_TOKEN: optional(string()), // API token for Twitch integration
	USE_TIKTOK: optional(boolean()), // Set to `true` to enable TikTok integration
	TIKTOK_TOKEN: optional(string()), // API token for TikTok integration
	// --- LLM APIs ---

	LLM_APIS: optional(object({})), // Configuration object for Large Language Model APIs
	// --- Roles and Permissions ---

	ROLES: pipe(array(pipe(string(), minLength(1))), minLength(1, 'At least one role is required.')), // List of user roles available in the system
	PERMISSIONS: pipe(array(pipe(string(), minLength(1))), minLength(1, 'At least one permission is required.')), // List of permissions available in the system
	// --- JWT Secret ---

	JWT_SECRET_KEY: pipe(string(), minLength(32, 'JWT Secret Key must be at least 32 characters long for security.')), // Secret key for JWT

	// --- Two-Factor Authentication ---

	USE_2FA: optional(boolean()), // Set to `true` to enable Two-Factor Authentication globally
	TWO_FACTOR_AUTH_SECRET: optional(string()), // Optional: Secret for 2FA token generation (auto-generated if not provided)
	TWO_FACTOR_AUTH_BACKUP_CODES_COUNT: optional(pipe(number(), minValue(1), maxValue(50))) // Optional: Number of backup codes to generate (default: 10)
});

/**
 * The PUBLIC configuration for the application.
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

	MEDIA_FOLDER: pipe(string(), minLength(1)), // Server path where media files are stored
	MEDIA_OUTPUT_FORMAT_QUALITY: object({
		format: union([literal('original'), literal('jpg'), literal('webp'), literal('avif')]), // Image format for output
		quality: pipe(number(), minValue(1), maxValue(100)) // Image quality (1-100) for compressed formats
	}),
	MEDIASERVER_URL: optional(string()), // Optional: URL of a separate media server
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

	DEMO: optional(boolean()) // Set to `true` to enable demo mode, which may restrict certain features
});

// ----------------- TYPES & HELPERS -----------------
export type PrivateConfig = InferOutput<typeof privateConfigSchema>;
export type PublicConfig = InferOutput<typeof publicConfigSchema>;

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
	return path.map((p: { key: string }) => p.key).join('.');
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
function performConditionalValidation(config: Record<string, unknown>): string[] {
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
		config.AVAILABLE_CONTENT_LANGUAGES &&
		Array.isArray(config.AVAILABLE_CONTENT_LANGUAGES) &&
		!config.AVAILABLE_CONTENT_LANGUAGES.includes(config.DEFAULT_CONTENT_LANGUAGE)
	) {
		errors.push(
			`The ${colors.cyan}DEFAULT_CONTENT_LANGUAGE${colors.reset} must be included in the ${colors.cyan}AVAILABLE_CONTENT_LANGUAGES${colors.reset} array.`
		);
	}
	if (config.LOCALES && Array.isArray(config.LOCALES) && !config.LOCALES.includes(config.BASE_LOCALE)) {
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
		console.log(`\n${colors.blue}🚀 Validating CMS configuration...${colors.reset}`);
		validationLogPrinted = true;
	}

	const result = safeParse(schema, config, { abortEarly: false });
	const configFile = configName.includes('Private') ? 'config/private.ts' : 'config/public.ts';

	if (result.success) {
		// Perform secondary, cross-field validation
		const conditionalErrors = performConditionalValidation(result.output as Record<string, unknown>);
		if (conditionalErrors.length > 0) {
			console.error(`\n${colors.red}❌ ${configName} validation failed with logical errors:${colors.reset}`);
			console.error(`${colors.gray}   File: ${configFile}${colors.reset}`);
			console.error('━'.repeat(70));
			console.error(`\n${colors.yellow}⚠️ Logical Validation Errors:${colors.reset}`);
			conditionalErrors.forEach((error) => {
				console.error(`   - ${error}`);
			});
			console.error('\n' + '━'.repeat(70));
			console.error(`\n${colors.red}💀 Server cannot start. Please fix the logical inconsistencies listed above.${colors.reset}\n`);
			process.exit(1);
		}
		return result.output;
	} else {
		// Handle schema validation failures
		console.error(`\n${colors.red}❌ ${configName} validation failed. Please check your configuration.${colors.reset}`);
		console.error('━'.repeat(70));

		logValidationErrors(result.issues, configFile);

		console.error('\n' + '━'.repeat(70));
		console.error(`\n${colors.red}💀 Server cannot start. Please fix the errors listed above.${colors.reset}\n`);
		process.exit(1);
	}
}
