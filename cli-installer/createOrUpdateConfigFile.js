/**
 @file cli-installer/createOrUpdateConfigFile.js
 @description Create or Update Config File.
 This script generates valid configuration files based on user input or sensible defaults,
 ensuring they align with the validation schemas in `config/types.ts`.
 */

import fs from 'fs/promises';
import path from 'path';
import { generateRandomJWTSecret, generateRandom2FASecret } from './utils/cryptoUtils.js';

// Helper to format values. It omits the line if the value is null or undefined.
const formatLine = (key, value, isString = true) => {
	if (value === null || value === undefined) {
		return `// ${key}: undefined, // Optional: Uncomment and provide a value`;
	}
	const formattedValue = isString ? `'${String(value)}'` : value;
	return `${key}: ${formattedValue},`;
};

// Helper to format array values
const formatArrayLine = (key, value, defaultValue) => {
	const arrayToFormat = Array.isArray(value) && value.length > 0 ? value : defaultValue;
	return `${key}: ${JSON.stringify(arrayToFormat, null, 4)},`;
};

// Create or Update Config File
export async function createOrUpdateConfigFile(configData) {
	// Ensure JWT secret exists and is valid
	const jwtSecret = configData?.JWT_SECRET_KEY && configData.JWT_SECRET_KEY.length >= 64 ? configData.JWT_SECRET_KEY : generateRandomJWTSecret();

	// Generate 2FA secret if 2FA is enabled but no secret is provided
	const twoFASecret = configData?.USE_2FA && !configData?.TWO_FACTOR_AUTH_SECRET ? generateRandom2FASecret() : configData?.TWO_FACTOR_AUTH_SECRET;

	// Determine default port based on DB type
	const defaultDbPort = configData?.DB_TYPE === 'mariadb' ? 3306 : 27017;

	// Generate private configuration file content
	const privateConfigContent = `
/**
 * Do not Edit as the file will be overwritten by CLI Installer!!!
 * Use 'npm run installer' to start the installer
 *
 * PRIVATE configuration for the application
 */

import { createPrivateConfig } from './types.ts';

export const privateEnv = createPrivateConfig({
    // --- Database Configuration ---
    ${formatLine('DB_TYPE', configData?.DB_TYPE || 'mongodb')}
    ${formatLine('DB_HOST', configData?.DB_HOST || 'localhost')}
    ${formatLine('DB_PORT', configData?.DB_PORT || defaultDbPort, false)}
    ${formatLine('DB_NAME', configData?.DB_NAME || 'SveltyCMS')}
    ${formatLine('DB_USER', configData?.DB_USER || 'root')}
    ${formatLine('DB_PASSWORD', configData?.DB_PASSWORD || 'password')}
    ${formatLine('DB_RETRY_ATTEMPTS', configData?.DB_RETRY_ATTEMPTS, false)}
    ${formatLine('DB_RETRY_DELAY', configData?.DB_RETRY_DELAY, false)}
    ${formatLine('DB_POOL_SIZE', configData?.DB_POOL_SIZE, false)}
    ${formatLine('MULTI_TENANT', configData?.MULTI_TENANT || false, false)}

    // --- SMTP Configuration ---
    ${formatLine('SMTP_HOST', configData?.SMTP_HOST)}
    ${formatLine('SMTP_PORT', configData?.SMTP_PORT, false)}
    ${formatLine('SMTP_EMAIL', configData?.SMTP_EMAIL)}
    ${formatLine('SMTP_PASSWORD', configData?.SMTP_PASSWORD)}
    ${formatLine('SERVER_PORT', configData?.SERVER_PORT, false)}

    // --- Redis Caching ---
    ${formatLine('USE_REDIS', configData?.USE_REDIS || false, false)}
    ${formatLine('REDIS_HOST', configData?.REDIS_HOST)}
    ${formatLine('REDIS_PORT', configData?.REDIS_PORT, false)}
    ${formatLine('REDIS_PASSWORD', configData?.REDIS_PASSWORD)}

    // --- Session Management ---
    ${formatLine('SESSION_CLEANUP_INTERVAL', configData?.SESSION_CLEANUP_INTERVAL, false)}
    ${formatLine('MAX_IN_MEMORY_SESSIONS', configData?.MAX_IN_MEMORY_SESSIONS, false)}
    ${formatLine('DB_VALIDATION_PROBABILITY', configData?.DB_VALIDATION_PROBABILITY, false)}
    ${formatLine('SESSION_EXPIRATION_SECONDS', configData?.SESSION_EXPIRATION_SECONDS, false)}

    // --- Google OAuth ---
    ${formatLine('USE_GOOGLE_OAUTH', configData?.USE_GOOGLE_OAUTH || false, false)}
    ${formatLine('GOOGLE_CLIENT_ID', configData?.GOOGLE_CLIENT_ID)}
    ${formatLine('GOOGLE_CLIENT_SECRET', configData?.GOOGLE_CLIENT_SECRET)}

    // --- Other APIs ---
    ${formatLine('GOOGLE_API_KEY', configData?.GOOGLE_API_KEY)}
    ${formatLine('USE_MAPBOX', configData?.USE_MAPBOX || false, false)}
    ${formatLine('MAPBOX_API_TOKEN', configData?.MAPBOX_API_TOKEN)}
    ${formatLine('SECRET_MAPBOX_API_TOKEN', configData?.SECRET_MAPBOX_API_TOKEN)}
    ${formatLine('TWITCH_TOKEN', configData?.TWITCH_TOKEN)}
    ${formatLine('USE_TIKTOK', configData?.USE_TIKTOK || false, false)}
    ${formatLine('TIKTOK_TOKEN', configData?.TIKTOK_TOKEN)}

    // --- LLM APIs ---
    LLM_APIS: ${JSON.stringify(configData?.LLM_APIS || {}, null, 4)},

    // --- JWT Secret ---
    ${formatLine('JWT_SECRET_KEY', jwtSecret)}

    // --- Two-Factor Authentication ---
    ${formatLine('USE_2FA', configData?.USE_2FA || false, false)}
    ${formatLine('TWO_FACTOR_AUTH_SECRET', twoFASecret)}
    ${formatLine('TWO_FACTOR_AUTH_BACKUP_CODES_COUNT', configData?.TWO_FACTOR_AUTH_BACKUP_CODES_COUNT || 10, false)}

    // --- Roles & Permissions ---
    ${formatArrayLine('ROLES', configData?.ROLES, ['admin', 'editor'])}
    ${formatArrayLine('PERMISSIONS', configData?.PERMISSIONS, ['manage', 'edit', 'create'])}
});
`;

	const publicConfigContent = `
/**
 * Do not Edit as the file will be overwritten by CLI Installer!!!
 * Use 'npm run installer' to start the installer
 *
 * PUBLIC configuration for the application
 */

import { createPublicConfig } from './types.ts';

export const publicEnv = createPublicConfig({
    // --- Site Configuration ---
    ${formatLine('SITE_NAME', configData?.SITE_NAME || 'SveltyCMS')}
    ${formatLine('PASSWORD_LENGTH', configData?.PASSWORD_LENGTH || 8, false)}

    // --- Language Configuration ---
    ${formatLine('DEFAULT_CONTENT_LANGUAGE', configData?.DEFAULT_CONTENT_LANGUAGE || 'en')}
    ${formatArrayLine('AVAILABLE_CONTENT_LANGUAGES', configData?.AVAILABLE_CONTENT_LANGUAGES, ['en', 'de'])}
    ${formatLine('BASE_LOCALE', configData?.BASE_LOCALE || 'en')}
    ${formatArrayLine('LOCALES', configData?.LOCALES, ['en', 'de', 'fr', 'es'])}

    // --- Media Configuration ---
    ${formatLine('MEDIA_FOLDER', configData?.MEDIA_FOLDER || 'mediaFiles')}
    MEDIA_OUTPUT_FORMAT_QUALITY: {
        format: '${configData?.MEDIA_OUTPUT_FORMAT_QUALITY?.format || 'avif'}',
        quality: ${configData?.MEDIA_OUTPUT_FORMAT_QUALITY?.quality || 80}
    },
    ${formatLine('MEDIASERVER_URL', configData?.MEDIASERVER_URL)}
    IMAGE_SIZES: ${JSON.stringify(configData?.IMAGE_SIZES || { sm: 600, md: 900, lg: 1200 }, null, 4)},
    ${formatLine('MAX_FILE_SIZE', configData?.MAX_FILE_SIZE, false)}
    ${formatLine('BODY_SIZE_LIMIT', configData?.BODY_SIZE_LIMIT, false)}
    ${formatLine('EXTRACT_DATA_PATH', configData?.EXTRACT_DATA_PATH)}
    ${formatLine('USE_ARCHIVE_ON_DELETE', configData?.USE_ARCHIVE_ON_DELETE || true, false)}

    // --- Host Configuration ---
    ${formatLine('HOST_DEV', configData?.HOST_DEV || 'http://localhost:5173')}
    ${formatLine('HOST_PROD', configData?.HOST_PROD || 'https://example.com')}

    // --- Logging ---
    ${formatArrayLine('LOG_LEVELS', configData?.LOG_LEVELS, ['info', 'warn', 'error'])}
    ${formatLine('LOG_RETENTION_DAYS', configData?.LOG_RETENTION_DAYS, false)}
    ${formatLine('LOG_ROTATION_SIZE', configData?.LOG_ROTATION_SIZE, false)}

    // --- Theming ---
    ${formatLine('SEASONS', configData?.SEASONS || false, false)}
    ${formatLine('SEASON_REGION', configData?.SEASON_REGION)}

    // --- Demo Mode ---
    ${formatLine('DEMO', configData?.DEMO || false, false)}
});
`;

	try {
		// Create the config directory if it doesn't exist
		const configDir = path.join(process.cwd(), 'config');
		await fs.mkdir(configDir, { recursive: true });

		// Write the private and public config files
		await fs.writeFile(path.join(configDir, 'private.ts'), privateConfigContent.trim(), 'utf-8');
		await fs.writeFile(path.join(configDir, 'public.ts'), publicConfigContent.trim(), 'utf-8');

		console.log('✅ Configuration files created successfully!');
	} catch (error) {
		console.error('❌ Error creating or updating configuration files:', error);
	}
}
