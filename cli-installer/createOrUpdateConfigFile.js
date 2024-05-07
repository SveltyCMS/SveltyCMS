import fs from 'fs/promises';
import pathModule from 'path'; // Renamed to avoid naming conflict

// Create or Update Config File
export async function createOrUpdateConfigFile(answers) {
	// Private configuration content
	const privateConfigContent = `
         /**
         * Do not Edit as the file will be overwritten by Cli Installer !!!
         * Rather use 'npm installer' to start the installer
         *
         * The PRIVAT configuration for the application,
         */

        import { createPrivateConfig } from './types';

        export const privateEnv = createPrivateConfig({
            // Define the database connection
            DB_HOST: '${answers.DB_HOST || ''}',
            DB_NAME: '${answers.DB_NAME || ''}',

            // Define the database username & password if required
            DB_USER: '${answers.DB_USER || ''}',
            DB_PASSWORD: '${answers.DB_PASSWORD || ''}',

            // Enable MongoDB network compression (optional should not be changed once set): Choose 'none', 'snappy', 'zlib', 'zstd'. See mongodb Network Compression
            DB_COMPRESSOR: '${answers.DB_COMPRESSOR || ''}',

            // Define the SMTP server for email sending
            SMTP_HOST: '${answers.SMTP_HOST || ''}',
            SMTP_PORT: ${answers.SMTP_PORT || ''},
            SMTP_EMAIL: '${answers.SMTP_EMAIL || ''}',
            SMTP_PASSWORD: '${answers.SMTP_PASSWORD || ''}',

            // Enable Redis Caching (optional - Not yet implemented).
            USE_REDIS: '${answers.USE_REDIS || 'false'}', // Set to \`true\` to enable
            REDIS_HOST: '${answers.REDIS_HOST || ''}', // The hostname or IP address of your Redis server.
            REDIS_PORT: '${answers.REDIS_PORT || ''}', // The port number of your Redis server.
            REDIS_PASSWORD: '${answers.REDIS_PASSWORD || ''}', // The password for your Redis server (if any).

            // Enable Google OAuth (optional - Not yet implemented).
            USE_GOOGLE_OAUTH: '${answers.USE_GOOGLE_OAUTH || 'false'}', // Set to \`true\` to enable
            GOOGLE_CLIENT_ID: '${answers.GOOGLE_CLIENT_ID || ''}', // Google Client ID
            GOOGLE_CLIENT_SECRET: '${answers.GOOGLE_CLIENT_SECRET || ''}', // Google Client Secret

            // Google API for map & youtube (optional).
            GOOGLE_API_KEY: '${answers.GOOGLE_API_KEY || ''}', // Google API Key

            // Mapbox (optional).
            USE_MAPBOX: '${answers.USE_MAPBOX || 'false'}', // Set to \`true\` to enable,
            MAPBOX_API_TOKEN: '${answers.MAPBOX_API_TOKEN || ''}', // Mapbox API Token

            // TIKTOK_TOKEN (optional)
            TIKTOK_TOKEN: '${answers.TIKTOK_TOKEN || ''}',

            // OpenAI - Chat GPT - to be added to Lexical - See https://beta.openai.com/docs/api-reference/authentication
            VITE_OPEN_AI_KEY: '${answers.VITE_OPEN_AI_KEY || ''}'
        });
    `;

	// Public configuration content
	const publicConfigContent = `
         /**
         * Do not Edit as the file will be overwritten by Cli Installer !!!
         * Rather use 'npm installer' to start the installer
         *
         * The PUBLIC configuration for the application,
         */
    
        import { createPublicConfig } from './types';

        export const publicEnv = createPublicConfig({
            // The name of the site that this CMS should get.  (default: 'SveltyCMS')
            SITE_NAME: '${answers.SITE_NAME || 'SveltyCMS'}',

            // The default language for the site. (default: 'en')
            DEFAULT_CONTENT_LANGUAGE: '${answers.DEFAULT_CONTENT_LANGUAGE || 'en'}',

            // The available languages for the site. (default: 'en', 'de')
            AVAILABLE_CONTENT_LANGUAGES: ['${answers.AVAILABLE_CONTENT_LANGUAGES || 'en'}'],

            // The default language for the user interface.  (default: 'en')
            DEFAULT_SYSTEM_LANGUAGE: '${answers.DEFAULT_SYSTEM_LANGUAGE || 'en'}',

            // The available languages for the user interface. Restrict if Required (default: all).
            AVAILABLE_SYSTEM_LANGUAGES: [
                '${answers.AVAILABLE_SYSTEM_LANGUAGES || 'en'}'
            ],

            // The sizes of images that the site will generate. (default: 'sm: 600, md: 900, lg: 1200')
            IMAGE_SIZES: { sm: ${answers.IMAGE_SIZES?.sm || 600}, md: ${answers.IMAGE_SIZES?.md || 900}, lg: ${answers.IMAGE_SIZES?.lg || 1200} } as const,

            // The folder where the site's media files will be stored. (default: 'mediaFiles')
            MEDIA_FOLDER: '${answers.MEDIA_FOLDER || 'mediaFiles'}',

            // Media Format & Quality how image are saved on the server.
            MEDIA_OUTPUT_FORMAT_QUALITY: {
                format:  '${answers.MEDIA_OUTPUT_FORMAT || 'original'}', // 'original' or 'avif', 'webp' (default: original)
                quality: ${answers.MEDIA_OUTPUT_QUALITY || 80} // quality between 0 and 100 (default: 80)
            } as const,

            // The URL of the media server (default: '' = localhost)
            // Example External Storage -  MEDIASERVER_URL: 'https://my-server.com/'
            MEDIASERVER_URL: '${answers.MEDIASERVER_URL || ''}',

            // Defines body size limit (default: 100mb)
            BODY_SIZE_LIMIT: '${answers.BODY_SIZE_LIMIT || '104857600'}',

            // Define you hostname where you site is running in development/production
            HOST_DEV: '${answers.HOST_DEV || 'http://localhost:5173'}',
            HOST_PROD: '${answers.HOST_PROD || 'https://yourdomain.de'}',

            // Overwrite the default Password strength (default 8)
            PASSWORD_STRENGTH: '${answers.PASSWORD_STRENGTH || '8'}',

            // Seasons/Events for login page (default: false)
            SEASONS: '${answers.SEASONS || 'false'}', // Set to true to enable seasonal decorations
            SEASON_REGION: '${answers.SEASON_REGION || 'Europe'}' // Currently only 'Europe' is supported
        });
    `;

	try {
		// Create or update the config directory
		const configDir = pathModule.join(process.cwd(), 'config'); // Changed 'path' to 'pathModule'
		await fs.mkdir(configDir, { recursive: true });

		// Write private config file
		await fs.writeFile(pathModule.join(configDir, 'private.ts'), privateConfigContent, 'utf-8'); // Changed 'path' to 'pathModule'

		// Write public config file
		await fs.writeFile(pathModule.join(configDir, 'public.ts'), publicConfigContent, 'utf-8'); // Changed 'path' to 'pathModule'

		console.log('Configuration files created successfully!');
	} catch (error) {
		console.error('Error creating or updating configuration files:', error);
	}
}
