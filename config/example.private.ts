import { createPrivateConfig } from './types';

/**
 * The PRIVAT configuration for the application,
 * if changes are made please rebuild/restart you instance
 */
export const privateEnv = createPrivateConfig({
	// Define the database connection
	DB_HOST: 'mongodb://localhost:27017/',
	DB_NAME: 'SvelteCMS',

	// Define the database username & password if required
	DB_USER: 'admin',
	DB_PASSWORD: 'admin',

	// Enable MongoDB network compression (optional should not be changed once set): Choose 'none', 'snappy', 'zlib', 'zstd'. See mongodb Network Compression
	DB_COMPRESSOR: 'none',

	// Define the SMTP server
	SMTP_HOST: ' ',
	SMTP_PORT: 465,
	SMTP_EMAIL: ' ',
	SMTP_PASSWORD: ' ',

	// Enable Redis for caching (optional). Set to `true` to enable
	USE_REDIS: false,

	// Enable Google OAuth (optional). Set to `true` to enable
	USE_GOOGLE_OAUTH: false,

	//Mapbox (optional). Set to `true` to enable
	USE_MAPBOX: false
});
