/**
 * Do not Edit as the file will be overwritten by Cli Installer !!!
 *
 * The PRIVAT configuration for the application,
 */

import { createPrivateConfig } from './types';

export const privateEnv = createPrivateConfig({
	// Define the database type (Default: 'mongodb')
	DB_TYPE: 'mongodb',

	// Define the database connection
	DB_HOST: 'mongodb://localhost:27017/',
	DB_NAME: 'SvelteCMS',

	// Define the database username & password if required
	DB_USER: 'admin',
	DB_PASSWORD: 'admin',

	// Define the database retry settings
	DB_RETRY_ATTEMPTS: 3, // Database Retry Attempts
	DB_RETRY_DELAY: 3000, // Database Retry Delay
	DB_POOL_SIZE: 5, // Database Pool Size

	// Define the SMTP server for email sending
	SMTP_HOST: '',
	SMTP_PORT: 465,
	SMTP_EMAIL: '',
	SMTP_PASSWORD: '',

	// Enable Redis Caching (optional - Not yet implemented).
	USE_REDIS: false, // Set to `true` to enable
	REDIS_HOST: 'localhost', // The hostname or IP address of your Redis server.
	REDIS_PORT: 6379, // The port number of your Redis server.
	REDIS_PASSWORD: '', // The password for your Redis server (if any).

	// Enable Google OAuth (optional - Not yet implemented).
	USE_GOOGLE_OAUTH: false, // Set to `true` to enable
	GOOGLE_CLIENT_ID: '', // Google Client ID
	GOOGLE_CLIENT_SECRET: '', // Google Client Secret

	// Google API for map & youtube (optional).
	GOOGLE_API_KEY: '', // Google API Key

	// Mapbox (optional).
	USE_MAPBOX: false, // Set to `true` to enable,
	MAPBOX_API_TOKEN: '', // Mapbox API Token

	// TIKTOK_TOKEN (optional)
	TIKTOK_TOKEN: '',

	// OpenAI - Chat GPT - to be added to Lexical - See https://beta.openai.com/docs/api-reference/authentication
	VITE_OPEN_AI_KEY: ''
});
