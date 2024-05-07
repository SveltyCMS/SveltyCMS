/**
 * Do not Edit as the file will be overwritten by Cli Installer !!!
 * Rather use 'npm installer' to start the installer
 *
 * The PUBLIC configuration for the application,
 */

import { createPublicConfig } from './types';

export const publicEnv = createPublicConfig({
	// The name of the site that this CMS should get.  (default: 'SveltyCMS')
	SITE_NAME: 'SveltyCMS',

	// The default language for the site. (default: 'en')
	DEFAULT_CONTENT_LANGUAGE: 'en',

	// The available languages for the site. (default: 'en', 'de')
	AVAILABLE_CONTENT_LANGUAGES: ['en', 'de'],

	// The default language for the user interface.  (default: 'en')
	DEFAULT_SYSTEM_LANGUAGE: 'en',

	// The available languages for the user interface. Restrict if Required (default: all).
	AVAILABLE_SYSTEM_LANGUAGES: [
		'en', // english (remains first)
		'da', // danish
		'de', // german
		'es', // spanish
		'fi', // finnish
		'fr', // french
		'hi', // hindi
		'it', // italian
		'ja', // japanese
		'ka', // georgian
		'ne', // nepali
		'nl', // dutch
		'no', // norwegian
		'pl', // polish
		'pt', // portuguese
		'sl', // slovenian
		'sr', // serbian
		'sv', // swedish
		'tr', // turkish
		'ur', // urdu
		'zh' // chinese
	],

	// The sizes of images that the site will generate. (default: 'sm: 600, md: 900, lg: 1200')
	IMAGE_SIZES: { sm: 600, md: 900, lg: 1200 } as const,

	// The folder where the site's media files will be stored. (default: 'mediaFiles')
	MEDIA_FOLDER: 'mediaFiles',

	// Media Format & Quality how image are saved on the server.
	MEDIA_OUTPUT_FORMAT_QUALITY: {
		format: 'original', // 'original' or 'avif', 'webp' (default: original)
		quality: 80 // quality between 0 and 100 (default: 80)
	} as const,

	// The URL of the media server (default: '' = localhost)
	// Example External Storage -  MEDIASERVER_URL: 'https://my-server.com/'
	MEDIASERVER_URL: '',

	// Defines body size limit (default: 100mb)
	BODY_SIZE_LIMIT: 104857600,

	// Define you hostname where you site is running in development/production
	HOST_DEV: 'http://localhost:5173',
	HOST_PROD: 'https://yourdomain.de',

	// Overwrite the default Password strength (default 8)
	PASSWORD_STRENGTH: 8,

	// Seasons/Events for login page (default: false)
	SEASONS: false, // Set to true to enable seasonal decorations
	SEASON_REGION: 'Europe' // Currently only 'Europe' is supported
});
