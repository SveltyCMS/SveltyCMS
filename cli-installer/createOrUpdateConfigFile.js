// @files cli-installer/createOrUpdateConfigFile.js
// @description Create or Update Config File

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

// Generate a random JWT secret key
function generateRandomJWTSecret(length = 32) {
	return crypto.randomBytes(length).toString('hex');
}

// Create or Update Config File
export async function createOrUpdateConfigFile(configData) {
	// Private configuration content
	const privateConfigContent = `
        /**
         * Do not Edit as the file will be overwritten by Cli Installer !!!
         * Rather use 'npm installer' to start the installer
         *
         * The PRIVATE configuration for the application,
         */

        import { createPrivateConfig } from './types';

        export const privateEnv = createPrivateConfig({
            // Define the database type (Default: 'mongodb')
            DB_TYPE: '${configData?.DB_TYPE || 'mongodb'}',

            // Define the database connection
            DB_HOST: '${configData?.DB_HOST || ''}',
            DB_PORT: ${configData?.DB_PORT || ''},
            DB_NAME: '${configData?.DB_NAME || 'SveltyCMS'}',

            // Define the database username & password if required
            DB_USER: '${configData?.DB_USER || ''}',
            DB_PASSWORD: '${configData?.DB_PASSWORD || ''}',

            // Define the database retry settings
            DB_RETRY_ATTEMPTS: ${configData?.DB_RETRY_ATTEMPTS || 5}, // Database Retry Attempts
            DB_RETRY_DELAY: ${configData?.DB_RETRY_DELAY || 5000}, // Database Retry Delay
            DB_POOL_SIZE: ${configData?.DB_POOL_SIZE || 10}, // Database Pool Size

            // Define the SMTP server for email sending
            SMTP_HOST: '${configData?.SMTP_HOST || ''}',
            SMTP_PORT: ${configData?.SMTP_PORT || 465},
            SMTP_EMAIL: '${configData?.SMTP_EMAIL || ''}',
            SMTP_PASSWORD: '${configData?.SMTP_PASSWORD || ''}',

            // Enable Redis Caching (optional - Not full yet implemented).
            USE_REDIS: ${configData?.USE_REDIS || 'false'}, // Set to true to enable
            REDIS_HOST: '${configData?.REDIS_HOST || ''}', // The hostname or IP address of your Redis server.
            REDIS_PORT: ${configData?.REDIS_PORT || 6379}, // The port number of your Redis server.
            REDIS_PASSWORD: '${configData?.REDIS_PASSWORD || ''}', // The password for your Redis server (if any).

            // Session configuration
	        SESSION_CLEANUP_INTERVAL: ${configData?.SESSION_CLEANUP_INTERVAL || 6000}, // 1 minute
	        MAX_IN_MEMORY_SESSIONS: ${configData?.MAX_IN_MEMORY_SESSIONS || 10000}, // 10000 sessions
	        DB_VALIDATION_PROBABILITY: ${configData?.DB_VALIDATION_PROBABILITY || 0.1}, // 10% of sessions will be validated
	        SESSION_EXPIRATION_SECONDS:  ${configData?.SESSION_EXPIRATION_SECONDS || 3600}, // 1 hour by default

            // Enable Google OAuth (optional).
            USE_GOOGLE_OAUTH: ${configData?.USE_GOOGLE_OAUTH || 'false'}, // Set to true to enable
            GOOGLE_CLIENT_ID: '${configData?.GOOGLE_CLIENT_ID || ''}', // Google Client ID
            GOOGLE_CLIENT_SECRET: '${configData?.GOOGLE_CLIENT_SECRET || ''}', // Google Client Secret

            // Google API for map & youtube (optional).
            GOOGLE_API_KEY: '${configData?.GOOGLE_API_KEY || ''}',  // Google API Key

            // Mapbox (optional).
            USE_MAPBOX: ${configData?.USE_MAPBOX || 'false'}, // Set to true to enable
            MAPBOX_API_TOKEN: '${configData?.MAPBOX_API_TOKEN || ''}',  // Mapbox API Token

            // TIKTOK_TOKEN (optional)
            USE_TIKTOK: ${configData?.USE_TIKTOK || 'false'}, // Set to true to enable
            TIKTOK_TOKEN: '${configData?.TIKTOK_TOKEN || ''}', // TIKTOK Token

            // OpenAI - Chat GPT - to be added to Lexical - See https://beta.openai.com/docs/api-reference/authentication
            USE_OPEN_AI: ${configData?.USE_OPEN_AI || 'false'}, // Set to true to enable
            VITE_OPEN_AI_KEY: '${configData?.VITE_OPEN_AI_KEY || ''}', // OpenAI Key
           
            // Secret key for signing and verifying JSON Web Tokens (JWTs)
            JWT_SECRET_KEY: '${configData?.JWT_SECRET_KEY || generateRandomJWTSecret()}',

            // Roles & Permissions
            ROLES: [], 
            PERMISSIONS: [],
        });
    `;

	// Public configuration content
	const imageSizes = configData?.IMAGE_SIZES
		? typeof configData.IMAGE_SIZES === 'string'
			? configData.IMAGE_SIZES
			: JSON.stringify(configData.IMAGE_SIZES).replace(/{|}|"/g, '')
		: 'sm: 600, md: 900, lg: 1200';

	const publicConfigContent = `
        /**
         * Do not Edit as the file will be overwritten by Cli Installer !!!
         * Rather use 'npm installer' to start the installer
         *
         * The PUBLIC configuration for the application,
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
            IMAGE_SIZES: { ${imageSizes} } as const,

            // Define Max File Size (default: 10mb)
            MAX_FILE_SIZE: ${configData?.MAX_FILE_SIZE || 10485760},

            // The URL of the media server (Default: '' = localhost)
            // Example External Storage -  MEDIASERVER_URL: 'https://my-server.com/'
            MEDIASERVER_URL: '${configData?.MEDIASERVER_URL || ''}',

            // The folder where the site's media files will be stored. (Default: 'mediaFiles')
            MEDIA_FOLDER: '${configData?.MEDIA_FOLDER || 'mediaFiles'}',

            // Media Format & Quality how images are saved on the server.
            MEDIA_OUTPUT_FORMAT_QUALITY: {
                format:  '${configData?.MEDIA_OUTPUT_FORMAT_QUALITY?.format || 'original'}', // 'original' or 'avif', 'webp' (default: original)
                quality: ${configData?.MEDIA_OUTPUT_FORMAT_QUALITY?.quality || 80} // quality between 0 and 100 (default: 80)
            } as const,

            // Defines body size limit (Default: 100mb)
            BODY_SIZE_LIMIT: ${configData?.BODY_SIZE_LIMIT || 104857600},

            // The path where the site's data will be extracted. (Default: 'data')
            EXTRACT_DATA_PATH: '${configData?.EXTRACT_DATA_PATH || ''}',

            // Define your hostname where your site is running in development/production
            HOST_DEV: '${configData?.HOST_DEV || 'http://localhost:5173'}',
            HOST_PROD: '${configData?.HOST_PROD || 'https://yourdomain.de'}',

            // Overwrite the default Password strength (Default 8)
            PASSWORD_STRENGTH: ${configData?.PASSWORD_STRENGTH || 8},

	        // Log Levels (Default: ['error']) (Options: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'none')
            LOG_LEVELS: ${JSON.stringify(configData?.LOG_LEVELS || ['error'])},

            // Seasons/Events for login page (Default: false)
            SEASONS: ${configData?.SEASONS || 'false'}, // Set to true to enable seasonal decorations
            SEASON_REGION: '${configData?.SEASON_REGION || 'Europe'}' // Currently only 'Europe' is supported
        });
    `;

	try {
		// Create or update the config directory
		const configDir = path.join(process.cwd(), 'config');
		await fs.mkdir(configDir, { recursive: true });
		//console.log('Config directory created or already exists.');

		// Write private config file
		await fs.writeFile(path.join(configDir, 'private.ts'), privateConfigContent, 'utf-8');
		//console.log('Private configuration file created.');

		// Write public config file
		await fs.writeFile(path.join(configDir, 'public.ts'), publicConfigContent, 'utf-8');
		//console.log('Public configuration file created.');

		console.log('Configuration files created successfully!');
	} catch (error) {
		console.error('Error creating or updating configuration files:', error);
	}
}
