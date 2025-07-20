/** 
@file cli-installer/configuration.js
@description Configuration prompts for the installer

### Features
- Displays a note about the configuration
- Displays existing configuration (password hidden)
- Prompts for configuration using grouped options
*/

const REQUIRED_FIELDS = {
	database: 'DB_HOST',
	email: 'SMTP_HOST'
};

// Check if a configuration section has meaningful configuration
function hasCustomConfiguration(sectionKey, configData) {
	// Special cases for sections with specific logic
	switch (sectionKey) {
		case 'system': {
			// System is configured if JWT secret exists or any critical system values are set
			const hasJwtSecret = configData.JWT_SECRET_KEY && configData.JWT_SECRET_KEY.length >= 32;
			const hasSiteName = configData.SITE_NAME && configData.SITE_NAME !== 'SveltyCMS';
			const hasCustomHosts =
				(configData.HOST_DEV && configData.HOST_DEV !== 'http://localhost:5173') ||
				(configData.HOST_PROD && !configData.HOST_PROD.includes('example.com'));
			const hasLogging = configData.LOG_LEVELS && configData.LOG_LEVELS.length > 0;
			const hasArchiving = configData.USE_ARCHIVE_ON_DELETE !== undefined;
			const hasDataExport = !!configData.EXTRACT_DATA_PATH;

			return hasJwtSecret || hasSiteName || hasCustomHosts || hasLogging || hasArchiving || hasDataExport;
		}

		case 'redis':
			// Redis is configured if USE_REDIS is enabled
			return configData.USE_REDIS === true;

		case 'google':
			// Google is configured if OAuth is enabled or API key exists
			return configData.USE_GOOGLE_OAUTH === true || !!configData.GOOGLE_API_KEY;

		case 'mapbox':
			// Mapbox is configured if enabled
			return configData.USE_MAPBOX === true;

		case 'tiktok':
			// TikTok is configured if enabled
			return configData.USE_TIKTOK === true;

		case 'media':
			// Media is configured if folder is set or file size limits are configured
			return !!(configData.MEDIA_FOLDER || configData.MAX_FILE_SIZE || configData.BODY_SIZE_LIMIT);

		case 'language':
			// Language is configured if non-default languages are set
			const hasContentLang = configData.DEFAULT_CONTENT_LANGUAGE && configData.DEFAULT_CONTENT_LANGUAGE !== 'en';
			const hasSystemLang = configData.DEFAULT_SYSTEM_LANGUAGE && configData.DEFAULT_SYSTEM_LANGUAGE !== 'en';
			const hasAvailableLangs =
				(configData.AVAILABLE_CONTENT_LANGUAGES && configData.AVAILABLE_CONTENT_LANGUAGES.length > 1) ||
				(configData.AVAILABLE_SYSTEM_LANGUAGES && configData.AVAILABLE_SYSTEM_LANGUAGES.length > 1);

			return hasContentLang || hasSystemLang || hasAvailableLangs;

		case 'llm':
			// LLM is configured if LLM_APIS object has any keys
			return configData.LLM_APIS && Object.keys(configData.LLM_APIS).length > 0;

		default:
			// For other sections, return false as they're handled above
			return false;
	}
}

export { hasCustomConfiguration };
