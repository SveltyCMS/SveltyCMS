/**
 * @file src/databases/schemas.ts
 * @description Defines validation schemas for application configuration and base database structures.
 */

import type { BaseIssue, BaseSchema, InferOutput } from 'valibot';
import type { DatabaseId, ISODateString } from './dbInterface';
import { array, boolean, literal, maxValue, minLength, minValue, number, object, optional, pipe, safeParse, string, transform, union } from 'valibot';
import { logger } from '@utils/logger';

// ----------------- CONFIGURATION SCHEMAS -----------------

// The PRIVATE configuration for the application.
export const privateConfigSchema = object({
	// --- Database configuration (Essential for startup) ---
	DB_TYPE: union([literal('mongodb'), literal('mongodb+srv'), literal('mariadb')]),
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
	LICENSE_KEY: optional(string()), // For Enterprise users to disable nags/tracking
	SVELTYCMS_TELEMETRY: optional(boolean()), // Usage tracking (default: true)

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

// The PUBLIC configuration for the application.
export const publicConfigSchema = object({
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

export const websiteTokenSchema = object({
	_id: pipe(
		string(),
		transform((input) => input as DatabaseId)
	) as BaseSchema<string, DatabaseId, BaseIssue<string>>,
	name: pipe(string(), minLength(1, 'Token name is required.')),
	token: pipe(string(), minLength(32)),
	createdAt: pipe(
		string(),
		transform((input) => input as ISODateString)
	) as BaseSchema<string, ISODateString, BaseIssue<string>>,
	updatedAt: pipe(
		string(),
		transform((input) => input as ISODateString)
	) as BaseSchema<string, ISODateString, BaseIssue<string>>,
	createdBy: string()
});

export const databaseConfigSchema = object({
	type: union([literal('mongodb'), literal('mongodb+srv'), literal('mariadb')]),
	host: pipe(string(), minLength(1)),
	port: optional(pipe(number(), minValue(0))),
	name: pipe(string(), minLength(1)),
	user: string(),
	password: string()
});

// ----------------- TYPES & HELPERS -----------------
export type DatabaseConfig = InferOutput<typeof databaseConfigSchema>;
export type PrivateConfig = InferOutput<typeof privateConfigSchema>;
export type WebsiteToken = InferOutput<typeof websiteTokenSchema>;
export type PublicConfig = InferOutput<typeof publicConfigSchema>;

// --- DYNAMIC COLLECTION SCHEMAS ---
export const collectionSchemas = {
	Names: { name: 'Names', label: 'Names', fields: [] },
	Relation: { name: 'Relation', label: 'Relation', fields: [] },
	WidgetTest: { name: 'WidgetTest', label: 'WidgetTest', fields: [] }
};

export const createPrivateConfig = (arg: PrivateConfig): PrivateConfig => arg;
export const createPublicConfig = (arg: PublicConfig): PublicConfig => arg;

// ----------------- ENHANCED VALIDATION & LOGGING -----------------
let validationLogPrinted = false;

const colors = {
	reset: '',
	red: '',
	green: '',
	yellow: '',
	blue: '',
	magenta: '',
	cyan: '',
	white: '',
	gray: ''
};

function formatPath(path: BaseIssue<unknown>['path']): string {
	if (!path || path.length === 0) return 'root';
	return path.map((p) => String(p.key)).join('.');
}

function logValidationErrors(issues: BaseIssue<unknown>[], configFile: string): void {
	logger.error(`\n${colors.yellow}⚠️ Invalid configuration in ${colors.cyan}${configFile}${colors.reset}`);
	issues.forEach((issue) => {
		const fieldPath = formatPath(issue.path) || 'Configuration object';
		logger.error(`\n   - ${colors.white}Location:${colors.cyan} ${fieldPath}`);
		logger.error(`     ${colors.red}Error: ${issue.message}${colors.reset}`);
		if (issue.input !== undefined) {
			logger.error(`     ${colors.magenta}Received: ${colors.red}${JSON.stringify(issue.input)}${colors.reset}`);
		}
	});
}

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
}

function performConditionalValidation(config: Config): string[] {
	const errors: string[] = [];

	if (config.USE_GOOGLE_OAUTH && (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET)) {
		errors.push(`When USE_GOOGLE_OAUTH is true, both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required.`);
	}
	if (config.USE_REDIS && (!config.REDIS_HOST || !config.REDIS_PORT)) {
		errors.push(`When USE_REDIS is true, both REDIS_HOST and REDIS_PORT are required.`);
	}
	if (config.USE_MAPBOX && !config.MAPBOX_API_TOKEN) {
		errors.push(`When USE_MAPBOX is true, a MAPBOX_API_TOKEN is required.`);
	}
	if (config.USE_TIKTOK && !config.TIKTOK_TOKEN) {
		errors.push(`When USE_TIKTOK is true, a TIKTOK_TOKEN is required.`);
	}
	if (
		config.USE_2FA &&
		config.TWO_FACTOR_AUTH_BACKUP_CODES_COUNT &&
		(config.TWO_FACTOR_AUTH_BACKUP_CODES_COUNT < 1 || config.TWO_FACTOR_AUTH_BACKUP_CODES_COUNT > 50)
	) {
		errors.push(`When USE_2FA is enabled, TWO_FACTOR_AUTH_BACKUP_CODES_COUNT must be between 1 and 50.`);
	}
	if (config.SEASONS && !config.SEASON_REGION) {
		errors.push(`When SEASONS is true, a SEASON_REGION must be selected.`);
	}
	if (
		config.DEFAULT_CONTENT_LANGUAGE &&
		config.AVAILABLE_CONTENT_LANGUAGES &&
		!config.AVAILABLE_CONTENT_LANGUAGES.includes(config.DEFAULT_CONTENT_LANGUAGE)
	) {
		errors.push(`The DEFAULT_CONTENT_LANGUAGE must be included in the AVAILABLE_CONTENT_LANGUAGES array.`);
	}
	if (config.BASE_LOCALE && config.LOCALES && Array.isArray(config.LOCALES) && config.LOCALES.includes(config.BASE_LOCALE)) {
		errors.push(`The BASE_LOCALE must be included in the LOCALES array.`);
	}

	return errors;
}

export function validateConfig(schema: BaseSchema<unknown, unknown, BaseIssue<unknown>>, config: unknown, configName: string): unknown {
	if (!validationLogPrinted) {
		logger.info('Validating CMS configuration...');
		validationLogPrinted = true;
	}

	const result = safeParse(schema, config, { abortEarly: false });
	const configFile = configName.includes('Private') ? 'config/private.ts' : 'config/public.ts';

	if (result.success) {
		const conditionalErrors = performConditionalValidation(result.output as Config);
		if (conditionalErrors.length > 0) {
			logger.error(`${configName} validation failed with logical errors:`);
			conditionalErrors.forEach((error) => logger.error(`   - ${error}`));
			process.exit(1);
		}
		return result.output;
	} else {
		logger.error(`${configName} validation failed. Please check your configuration.`);
		logValidationErrors(result.issues, configFile);
		process.exit(1);
	}
}
