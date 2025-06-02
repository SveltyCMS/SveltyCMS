/**
 @file cli-installer/createOrUpdateConfigFile.js
 @description Create or Update Config File

 ### Features
 - Creates a new config file if it doesn't exist
 - Updates an existing config file
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

// Generate a random JWT secret key of specified length
function generateRandomJWTSecret(length = 64) {
	return crypto.randomBytes(length).toString('hex');
}

// Helper to format value as boolean literal
const formatBoolean = (value) => (value ? 'true' : 'false');

// Helper to format value as number literal or default
const formatNumber = (value, defaultValue) => (value !== undefined && value !== null && !isNaN(Number(value)) ? Number(value) : defaultValue);

// Helper to format value as string literal or default
const formatString = (value, defaultValue = '') => (value !== undefined && value !== null ? String(value) : defaultValue);

// Helper to format IMAGE_SIZES object
const formatImageSizesObject = (sizes) => {
	if (!sizes || typeof sizes !== 'object' || Object.keys(sizes).length === 0) {
		return 'sm: 600, md: 900, lg: 1200'; // Default string if invalid/empty
	}
	// Convert object back to the "key: value" string format expected by the template literal
	return Object.entries(sizes)
		.map(([key, value]) => `${key}: ${value}`)
		.join(', ');
};

// Create or Update Config File
export async function createOrUpdateConfigFile(configData) {
	// Ensure JWT secret exists if not provided
	const jwtSecret = configData?.JWT_SECRET_KEY || generateRandomJWTSecret();
	// Generate private configuration file content
	const privateConfigContent = `
        /**
         * Do not Edit as the file will be overwritten by CLI Installer!!!
         * Use 'npm installer' to start the installer
         *
         * PRIVATE configuration for the application
         */

        import { createPrivateConfig } from './types';

        export const privateEnv = createPrivateConfig({
            // Define the database type (Default: 'mongodb')
            DB_TYPE: '${formatString(configData?.DB_TYPE, 'mongodb')}',

            // Database connection details
            DB_HOST: '${formatString(configData?.DB_HOST)}',
            DB_PORT: ${formatNumber(configData?.DB_PORT, null)}, // Use null default if not provided? Or specific default? Check type. Assuming null is ok.
            DB_NAME: '${formatString(configData?.DB_NAME, 'SveltyCMS')}',

            // Optional database credentials
            DB_USER: '${formatString(configData?.DB_USER)}',
            DB_PASSWORD: '${formatString(configData?.DB_PASSWORD)}',

            // Define the database retry settings
            DB_RETRY_ATTEMPTS: ${formatNumber(configData?.DB_RETRY_ATTEMPTS, 3)}, // Default from system.js prompt
            DB_RETRY_DELAY: ${formatNumber(configData?.DB_RETRY_DELAY, 3000)}, // Default from system.js prompt
            DB_POOL_SIZE: ${formatNumber(configData?.DB_POOL_SIZE, 5)}, // Default from system.js prompt

            // Define the SMTP server for email sending
            SMTP_HOST: '${formatString(configData?.SMTP_HOST)}',
            SMTP_PORT: ${formatNumber(configData?.SMTP_PORT, 587)}, // Common default
            SMTP_EMAIL: '${formatString(configData?.SMTP_EMAIL)}',
            SMTP_PASSWORD: '${formatString(configData?.SMTP_PASSWORD)}',

            // Enable Redis Caching (optional - Not full yet implemented).
            USE_REDIS: ${formatBoolean(configData?.USE_REDIS)}, // Use boolean formatting
            REDIS_HOST: '${formatString(configData?.REDIS_HOST, 'localhost')}',
            REDIS_PORT: ${formatNumber(configData?.REDIS_PORT, 6379)},
            REDIS_PASSWORD: '${formatString(configData?.REDIS_PASSWORD)}',

            // Session Management configuration
            SESSION_CLEANUP_INTERVAL: ${formatNumber(configData?.SESSION_CLEANUP_INTERVAL, 60000)},
            MAX_IN_MEMORY_SESSIONS: ${formatNumber(configData?.MAX_IN_MEMORY_SESSIONS, 10000)},
            DB_VALIDATION_PROBABILITY: ${formatNumber(configData?.DB_VALIDATION_PROBABILITY, 0.1)},
            SESSION_EXPIRATION_SECONDS: ${formatNumber(configData?.SESSION_EXPIRATION_SECONDS, 3600)},

            // Enable Google OAuth (optional).
            USE_GOOGLE_OAUTH: ${formatBoolean(configData?.USE_GOOGLE_OAUTH)}, // Use boolean formatting
            GOOGLE_CLIENT_ID: '${formatString(configData?.GOOGLE_CLIENT_ID)}',
            GOOGLE_CLIENT_SECRET: '${formatString(configData?.GOOGLE_CLIENT_SECRET)}',

            // Google API for map & youtube (optional).
            GOOGLE_API_KEY: '${formatString(configData?.GOOGLE_API_KEY)}',

            // Mapbox (optional).
            USE_MAPBOX: ${formatBoolean(configData?.USE_MAPBOX)}, // Use boolean formatting
            MAPBOX_API_TOKEN: '${formatString(configData?.MAPBOX_API_TOKEN)}',

            // TIKTOK_TOKEN (optional)
            USE_TIKTOK: ${formatBoolean(configData?.USE_TIKTOK)}, // Use boolean formatting
            TIKTOK_TOKEN: '${formatString(configData?.TIKTOK_TOKEN)}',

            // Large Language Model API configurations
            LLM_APIS: ${JSON.stringify(configData?.LLM_APIS || {}, null, 4)}, // Keep JSON stringify for object

            // Secret key for signing and verifying JSON Web Tokens (JWTs)
            JWT_SECRET_KEY: '${jwtSecret}', // Use the ensured secret

            // Roles & permissions arrays
            ROLES: [],
            PERMISSIONS: [],
        });
    `;

	const publicConfigContent = `
        /**
         * Do not Edit as the file will be overwritten by CLI Installer!!!
         * Use 'npm installer' to start the installer
         *
         * PUBLIC configuration for the application
         */

        import { createPublicConfig } from './types';

        export const publicEnv = createPublicConfig({
            // The name of the site that this CMS should get. (Default: 'SveltyCMS')
            SITE_NAME: '${configData?.SITE_NAME || 'SveltyCMS'}',

            // The default language for the site. (Default: 'en')
            DEFAULT_CONTENT_LANGUAGE: '${configData?.DEFAULT_CONTENT_LANGUAGE || 'en'}',

            // The available languages for the site. (Default: 'en', 'de')
            AVAILABLE_CONTENT_LANGUAGES: ${JSON.stringify(configData?.AVAILABLE_CONTENT_LANGUAGES || ['en', 'de'])},

            // The default language for the user interface. (Default: 'en')
            DEFAULT_SYSTEM_LANGUAGE: '${configData?.DEFAULT_SYSTEM_LANGUAGE || 'en'}',

            // The available languages for the user interface. Restrict if Required (Default: 'en').
            AVAILABLE_SYSTEM_LANGUAGES: ${JSON.stringify(configData?.AVAILABLE_SYSTEM_LANGUAGES || ['en'])},

            // The sizes of images that the site will generate. (Default: 'sm: 600, md: 900, lg: 1200')
            IMAGE_SIZES: { ${formatImageSizesObject(configData?.IMAGE_SIZES)} } as const,

            // Define Max File Size (default: 100mb)
            MAX_FILE_SIZE: ${formatNumber(configData?.MAX_FILE_SIZE, 104857600)}, // Aligned with system.js prompt default

            // The URL of the media server (Default: '' = localhost)
            // Example External Storage -  MEDIASERVER_URL: 'https://my-server.com/'
            MEDIASERVER_URL: '${formatString(configData?.MEDIASERVER_URL)}',

            // The folder where the site's media files will be stored. (Default: 'mediaFiles')
            MEDIA_FOLDER: '${formatString(configData?.MEDIA_FOLDER, 'mediaFiles')}',

            // Media Format & Quality how images are saved on the server.
            MEDIA_OUTPUT_FORMAT_QUALITY: {
                format: '${formatString(configData?.MEDIA_OUTPUT_FORMAT_QUALITY?.format, 'original')}', // 'original' or 'avif', 'webp' (default: original)
                quality: ${formatNumber(configData?.MEDIA_OUTPUT_FORMAT_QUALITY?.quality, 80)} // quality between 0 and 100 (default: 80)
            } as const,

            // Defines body size limit (Default: 1mb)
            BODY_SIZE_LIMIT: ${formatNumber(configData?.BODY_SIZE_LIMIT, 1048576)}, // Aligned with system.js prompt default

            // The path where the site's data will be extracted. (Default: './extracted_data' if enabled, '' if disabled)
            EXTRACT_DATA_PATH: '${configData?.EXTRACT_DATA_PATH ? './extracted_data' : ''}', // Handle boolean to path string

            // Define your hostname where your site is running in development/production
            HOST_DEV: '${formatString(configData?.HOST_DEV, 'http://localhost:5173')}',
            HOST_PROD: '${formatString(configData?.HOST_PROD, 'https://yourdomain.de')}', // Consider prompting for this default?

            // Overwrite the default Password Length (Default 8)
            PASSWORD_LENGTH: ${formatNumber(configData?.PASSWORD_LENGTH, 8)}, // Aligned with system.js prompt default

            // Log Levels (Default: ['info', 'warn', 'error']) (Options: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'none')
            LOG_LEVELS: ${JSON.stringify(configData?.LOG_LEVELS || ['info', 'warn', 'error'])}, // Aligned with system.js prompt default

            // Log Retention Days (Default: 2 days)
            LOG_RETENTION_DAYS: ${formatNumber(configData?.LOG_RETENTION_DAYS, 2)}, // New: Default to 2 days

            // Log Rotation Size in bytes (Default: 5MB)
            LOG_ROTATION_SIZE: ${formatNumber(configData?.LOG_ROTATION_SIZE, 5 * 1024 * 1024)}, // New: Default to 5MB

            // Seasons/Events for login page (Default: false)
            SEASONS: ${formatBoolean(configData?.SEASONS)}, // Use boolean formatting
            SEASON_REGION: '${formatString(configData?.SEASON_REGION, 'Global')}', // Options: 'Europe' (European festivals), 'Asia' (Asian festivals), 'Global' (Both)
        });
    `;

	try {
		// Create or update the config directory
		const configDir = path.join(process.cwd(), 'config');
		await fs.mkdir(configDir, { recursive: true });

		// Write private config file
		await fs.writeFile(path.join(configDir, 'private.ts'), privateConfigContent, 'utf-8');

		// Write public config file
		await fs.writeFile(path.join(configDir, 'public.ts'), publicConfigContent, 'utf-8');

		console.log('Configuration files created successfully!');
	} catch (error) {
		console.error('Error creating or updating configuration files:', error);
	}
}
