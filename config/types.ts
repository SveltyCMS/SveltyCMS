/**
 * @file config/types.ts
 * @description Configuration prompts for the Application section
 */

import type { AvailableLanguageTag } from '@src/paraglide/runtime';
import type { Role, Permission } from '@src/auth/types'; // Import Role and Permission types from the centralized types file

/**
 * The PRIVAT configuration for the application,
 */
export const createPrivateConfig = (arg: {
	// Define the database type (Default: 'mongodb')
	DB_TYPE: 'mongodb' | 'mariadb';

	/**
	 * Define the database connection:
	 * Use local a Database via "MongoDB Compass" or "Docker MongoDB"
	 * or online via "MongoDB Atlas" as mongodb+srv://
	 */
	DB_HOST: string; // Database Host
	DB_PORT: number; // Database Port
	DB_NAME: string; // Database Name
	DB_USER: string; // Database User
	DB_PASSWORD: string; // Database Password
	DB_RETRY_ATTEMPTS?: number; // Database Retry Attempts
	DB_RETRY_DELAY?: number; // Database Retry Delay
	DB_POOL_SIZE?: number; // Database Pool Size

	// SMTP config - See https://nodemailer.com
	SMTP_HOST?: string; // SMTP Host
	SMTP_PORT?: number; // SMTP Port
	SMTP_EMAIL?: string; // SMTP Email
	SMTP_PASSWORD?: string; // SMTP Password
	SERVER_PORT?: number; // Server Port

	// Google OAuth - See https://developers.google.com/identity/protocols/oauth2/web-server
	USE_GOOGLE_OAUTH: boolean; // Enable Google OAuth. Set to `true` to enable
	GOOGLE_CLIENT_ID?: string; // Google Client ID
	GOOGLE_CLIENT_SECRET?: string; // Google Client Secret

	// Redis config - See https://redis.io/documentation
	USE_REDIS: boolean; // Enable Redis for caching by setting to true
	REDIS_HOST?: string; // The hostname or IP address of your Redis server.
	REDIS_PORT?: number; // The port number of your Redis server.
	REDIS_PASSWORD?: string; // The password for your Redis server (if any).

	// Session configuration
	SESSION_CLEANUP_INTERVAL?: number; // Session Cleanup Interval
	MAX_IN_MEMORY_SESSIONS?: number; // Max In Memory Sessions
	DB_VALIDATION_PROBABILITY?: number; // DB Validation Probability
	SESSION_EXPIRATION_SECONDS?: number; // Session Expiration Seconds

	// Mapbox config  - See https://docs.mapbox.com/
	USE_MAPBOX: boolean; // Enable Mapbox. Set to `true` to enable
	MAPBOX_API_TOKEN?: string; // Public Mapbox API Token
	SECRET_MAPBOX_API_TOKEN?: string; // Secret Mapbox API Token

	// Google API for map & youtube - See https://developers.google.com/maps/documentation/javascript/get-api-key
	GOOGLE_API_KEY?: string;

	// TWITCH_TOKEN - See https://dev.twitch.tv/docs/authentication/
	TWITCH_TOKEN?: string;

	// TIKTOK_TOKEN - See https://dev.tiktok.com/docs/
	USE_TIKTOK?: boolean;
	TIKTOK_TOKEN?: string;

	// Large Language Model API configurations
	LLM_APIS?: {
		[key: string]: {
			enabled: boolean; // Flag to enable/disable this LLM API
			apiKey: string; // API key for authentication
			model?: string; // Model name or type (e.g., 'gpt-4' for ChatGPT, 'claude' for Claude, etc.)
			baseUrl?: string; // Base URL for the LLM API endpoint
		};
	};

	// Roles and Permissions
	ROLES: Role[];
	PERMISSIONS: Permission[];

	// Secret key for signing and verifying JSON Web Tokens (JWTs)
	JWT_SECRET_KEY?: string;
}) => arg;

/**
 * The PUBLIC configuration for the application,
 */

type MediaOutputFormatQuality = {
	format: 'original' | 'jpg' | 'webp' | 'avif';
	quality: number;
};

// Define supported season regions
type SeasonRegion = 'Western_Europe' | 'South_Asia' | 'East_Asia';

export const createPublicConfig = <const C, S extends AvailableLanguageTag, const V extends { [key: string]: number }>(arg: {
	// Define you hostname where you site is running
	HOST_DEV: string; // Hostname for development eg. http://localhost:5173
	HOST_PROD: string; // Hostname for production eg. 'mywebsite.com'

	// The name of the site that this CMS should get.
	SITE_NAME: string; // Site Name

	// Password Length ( default 8)
	PASSWORD_LENGTH?: number | 8;

	// Content Language
	DEFAULT_CONTENT_LANGUAGE: C; // Default Content Language
	AVAILABLE_CONTENT_LANGUAGES: C[]; // Available Content Languages

	// System Language
	AVAILABLE_SYSTEM_LANGUAGES: S[]; // Available System Languages
	DEFAULT_SYSTEM_LANGUAGE: NoInfer<S>; // Default System Language

	// Media Folder where the site's media files will be stored.
	MEDIA_FOLDER: string;

	/**
	 * Determines how media files are saved on the server.
	 * Options are: 'original', 'webp', or 'avif'.
	 * 'original' saves the file in its original format.
	 * 'webp' and 'avif' save the file in an optimized format using the respective codec.
	 */

	MEDIA_OUTPUT_FORMAT_QUALITY: MediaOutputFormatQuality;

	// Media Server URL
	MEDIASERVER_URL?: string;

	// The sizes of images that the site will generate. eg. { sm: 600, md: 900, lg: 1200 }
	IMAGE_SIZES: V;

	// MAX_FILE_SIZE:
	MAX_FILE_SIZE?: number;

	//Define body size limit for your Uploads eg. 100mb
	BODY_SIZE_LIMIT?: number;

	// Define path to extract data
	EXTRACT_DATA_PATH?: string;

	// Seasons Icons for login page. Set to `true` to enable
	SEASONS?: boolean;
	SEASON_REGION?: SeasonRegion; // Restricted to Western_Europe, South_Asia, or East_Asia

	// Github VERSION synchronization to display updated
	PKG_VERSION?: string;

	// Log Level (default: 'error') (Options: Options: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'none')
	LOG_LEVELS: ('fatal' | 'error' | 'warn' | 'debug' | 'info' | 'trace' | 'none')[];

	// New: Number of days to retain log files (default: 2 days)
	LOG_RETENTION_DAYS?: number;

	// New: Max log file size before rotation in bytes (default: 5MB)
	LOG_ROTATION_SIZE?: number;

	// DEMO Mode
	DEMO?: boolean;
}) => arg;
type NoInfer<T> = [T][T extends unknown ? 0 : never];
