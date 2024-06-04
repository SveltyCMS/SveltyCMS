import { createPublicConfig } from './types';

/**
 * The PUBLIC configuration for the application,
 * if changes are made please rebuild/restart you instance
 */
export const publicEnv = createPublicConfig({
	// The name of the site that this CMS should get.
	SITE_NAME: 'SveltyCMS',

	// The default language for the site.
	DEFAULT_CONTENT_LANGUAGE: 'en',

	// The available languages for the site.
	AVAILABLE_CONTENT_LANGUAGES: ['en', 'de'],

	// The default language for the user interface.
	DEFAULT_SYSTEM_LANGUAGE: 'en',

	// The available languages for the user interface. Many languages are supported.
	AVAILABLE_SYSTEM_LANGUAGES: ['en', 'de', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'hi', 'ka', 'sr', 'tr', 'ur'],

	// The sizes of images that the site will generate.
	IMAGE_SIZES: { sm: 600, md: 900, lg: 1200 },

	// The folder where the site's media files will be stored.
	MEDIA_FOLDER: 'mediaFiles',

	// his setting determines how media files are saved on the server.
	MEDIA_OUTPUT_FORMAT: 'original',

	// Define body size limit to 100MB
	BODY_SIZE_LIMIT: 104857600,

	// Define you hostname where you site is running
	HOST_DEV: 'http://localhost:5173',
	HOST_PROD: 'https://yourdomain.de'
});
