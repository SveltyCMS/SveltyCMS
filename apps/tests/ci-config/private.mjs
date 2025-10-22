/**
 * Private config for CI in plain ESM (no TypeScript imports)
 * Copied to config/private.mjs by GitHub Actions before build.
 */

export const privateEnv = {
	// --- Database Configuration ---
	DB_TYPE: 'mongodb',
	DB_HOST: 'localhost',
	DB_PORT: 27017,
	DB_NAME: 'SveltyCMS',
	DB_USER: 'admin',
	DB_PASSWORD: 'admin',
	MULTI_TENANT: false,

	// --- SMTP Configuration ---
	SERVER_PORT: 4173,

	// --- Redis Caching ---
	USE_REDIS: false,

	// --- Google OAuth ---
	USE_GOOGLE_OAUTH: false,

	// --- Other APIs ---
	USE_MAPBOX: false,
	USE_TIKTOK: false,

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
};
