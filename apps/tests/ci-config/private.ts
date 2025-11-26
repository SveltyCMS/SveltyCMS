/**
 * Test Private Config for CI
 * Copy this file to config/private.ts in CI before build.
 */
import { createPrivateConfig } from '../../src/databases/schemas.ts';

export const privateEnv = createPrivateConfig({
	// --- Database Configuration ---
	DB_TYPE: 'mongodb',
	DB_HOST: 'localhost',
	DB_PORT: 27017,
	DB_NAME: 'SveltyCMS',
	DB_USER: 'admin',
	DB_PASSWORD: 'admin',
	// DB_RETRY_ATTEMPTS: 3,
	// DB_RETRY_DELAY: 1000,
	// DB_POOL_SIZE: 5,
	MULTI_TENANT: false,

	// --- SMTP Configuration ---
	// SMTP_HOST: '',
	// SMTP_PORT: 587,
	// SMTP_EMAIL: '',
	// SMTP_PASSWORD: '',
	SERVER_PORT: 4173,

	// --- Redis Caching ---
	USE_REDIS: false,
	// REDIS_HOST: '',
	// REDIS_PORT: 6379,
	// REDIS_PASSWORD: '',

	// --- Session Management ---
	// SESSION_CLEANUP_INTERVAL: 60000,
	// MAX_IN_MEMORY_SESSIONS: 1000,
	// DB_VALIDATION_PROBABILITY: 0.1,
	// SESSION_EXPIRATION_SECONDS: 86400,

	// --- Google OAuth ---
	USE_GOOGLE_OAUTH: false,
	// GOOGLE_CLIENT_ID: 'dummy-google-client-id-for-testing.apps.googleusercontent.com',
	// GOOGLE_CLIENT_SECRET: 'GOCSPX-dummy-google-client-secret-for-ci',

	// --- Other APIs ---
	// GOOGLE_API_KEY: '',
	USE_MAPBOX: false,
	// MAPBOX_API_TOKEN: '',
	// SECRET_MAPBOX_API_TOKEN: '',
	// TWITCH_TOKEN: '',
	USE_TIKTOK: false,
	// TIKTOK_TOKEN: '',

	// --- LLM APIs ---
	LLM_APIS: {},

	// --- JWT Secret ---
	JWT_SECRET_KEY: 'a-super-secret-jwt-key-for-github-actions-that-is-long-enough',

	// --- Two-Factor Authentication ---
	USE_2FA: false,
	TWO_FACTOR_AUTH_BACKUP_CODES_COUNT: 10,

	// --- Roles & Permissions ---
	ROLES: ['admin', 'editor'],
	PERMISSIONS: ['create', 'read', 'update', 'delete']
});
