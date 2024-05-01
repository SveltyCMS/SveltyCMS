import type { AvailableLanguageTag } from '../src/paraglide/runtime';

/**
 * The PRIVAT configuration for the application,
 */
export const createPrivateConfig = (arg: {
	/**
	 * Define the database connection:
	 * Use local a Database via "MongoDB Compass" or "Docker MongoDB"
	 * or online via "MongoDB Atlas" as mongodb+srv://
	 */
	DB_HOST: string; // Database Host
	DB_NAME: string; // Database Name
	DB_USER: string; // Database User
	DB_PASSWORD: string; // Database Password
	DB_COMPRESSOR?: string; // See https://docs.mongodb.com/manual/reference/network-compression/

	// SMTP config - See https://nodemailer.com
	SMTP_HOST?: string; // SMTP Host
	SMTP_PORT?: number; // SMTP Port
	SMTP_EMAIL?: string; // SMTP Email
	SMTP_PASSWORD?: string; // SMTP Password
	SERVER_PORT?: number; // Server Port

	// Google OAuth - See https://developers.google.com/identity/protocols/oauth2/web-server
	USE_GOOGLE_OAUTH: boolean; //  Enable Google OAuth. Set to `true` to enable
	GOOGLE_CLIENT_ID?: string; // Google Client ID
	GOOGLE_CLIENT_SECRET?: string; // Google Client Secret

	// Redis config - See https://redis.io/documentation
	USE_REDIS: boolean; // Enable Redis for caching by setting to true
	REDIS_HOST?: string; // The hostname or IP address of your Redis server.
	REDIS_PORT?: number; // The port number of your Redis server.
	REDIS_PASSWORD?: string; // The password for your Redis server (if any).

	// Mapbox config  - See https://docs.mapbox.com/
	USE_MAPBOX: boolean; // Enable Mapbox. Set to `true` to enable
	MAPBOX_API_TOKEN?: string; // Public Mapbox API Token
	SECRET_MAPBOX_API_TOKEN?: string; // Secret Mapbox API Token

	// Google API for map & youtube - See https://developers.google.com/maps/documentation/javascript/get-api-key
	GOOGLE_API_KEY?: string;

	// TWITCH_TOKEN - See https://dev.twitch.tv/docs/authentication/
	TWITCH_TOKEN?: string;

	// TIKTOK_TOKEN - See https://dev.tiktok.com/docs/
	TIKTOK_TOKEN?: string;

	// OpenAI - Chat GPT - to be added to Lexical - See https://beta.openai.com/docs/api-reference/authentication
	VITE_OPEN_AI_KEY?: string;
}) => arg;

/**
 * The PUBLIC configuration for the application,
 */

type MediaOutputFormatQuality = {
	format: 'original' | 'jpg' | 'webp' | 'avif';
	quality: number;
};

export const createPublicConfig = <const C, S extends AvailableLanguageTag, const V extends { [key: string]: number }>(arg: {
	// Define you hostname where you site is running
	HOST_DEV: string; // Hostname for development eg. http://localhost:5173
	HOST_PROD: string; // Hostname for production eg. 'mywebsite.com'

	// The name of the site that this CMS should get.
	SITE_NAME: string; // Site Name

	// Password Strength ( default 8)
	PASSWORD_STRENGTH?: number | 8;

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

	//Define body size limit for your Uploads eg. 100mb
	BODY_SIZE_LIMIT?: number;

	// Seasons Icons for login page. Set to `true` to enable
	SEASONS?: boolean;
	SEASON_REGION?: string;

	// Github VERSION synchronization to display updated
	PKG_VERSION?: string;
}) => arg;
type NoInfer<T> = [T][T extends any ? 0 : never];
