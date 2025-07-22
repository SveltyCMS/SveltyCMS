/**
 * @file guiConfig.ts
 * @description This file defines and organizes configuration categories for a system's
 * graphical user interface (GUI). The configurations are grouped into private and
 * public categories, each containing fields with various settings, including database
 * connections, email settings, third-party service integrations, system properties,
 * language preferences, and media management.
 *
 * @imports
 * - m: A collection of localized messages imported from '@src/paraglide/messages' used to
 *   provide descriptions and helper texts for the configuration fields.
 *
 * @interfaces
 * - ConfigField<T>: A generic interface representing a configuration field,
 *   including its type, default value, helper text, optional allowed values, and an icon.
 * - ConfigCategory: An interface representing a configuration category that contains a
 *   description, an icon, and a collection of configuration fields.
 *
 * @configurations
 * - databaseConfig: Configuration settings related to the database, including type, host,
 *   port, credentials, retry logic, and connection pooling.
 * - emailConfig: Configuration settings for SMTP email services, including host, port,
 *   and authentication details.
 * - googleConfig: Configuration settings for Google OAuth and API integration.
 * - redisConfig: Configuration settings for Redis, including host, port, and authentication.
 * - mapboxConfig: Configuration settings for Mapbox API integration.
 * - tiktokConfig: Configuration settings for TikTok integration.
 * - llmConfig: Configuration settings for LLM integration.
 * - systemConfig: System-wide settings, including site name, server hosts, body size
 *   limits, password strength, and seasonal features.
 * - languageConfig: Language-related settings, including default and available content
 *   and system languages.
 * - mediaConfig: Media management settings, including image sizes, media folder paths,
 *   output format quality, and media server URL.
 *
 * @exports
 * - privateConfigCategories: An object containing private configuration categories like
 *   database, email, and third-party service integrations.
 * - publicConfigCategories: An object containing public configuration categories like
 *   system, language, and media settings.
 */

// ParaglideJS
import * as m from '@src/paraglide/messages';

// Config fields
interface ConfigField<T> {
	type: T;
	default: T;
	helper: string;
	allowedValues?: T[];
	icon: string;
}
// Config categories
interface ConfigCategory {
	description: string;
	icon: string;
	fields: { [key: string]: ConfigField<string | number | boolean> };
}

const databaseConfig: ConfigCategory = {
	description: m.databaseConfig_description(),
	icon: 'mdi:database',
	fields: {
		DB_TYPE: {
			type: 'string',
			default: 'mongodb',
			helper: m.databaseConfig_DB_Type_helper(),
			allowedValues: ['mongodb', 'mariadb'],
			icon: 'mdi:database'
		},
		DB_HOST: {
			type: 'string',
			default: 'localhost',
			helper: m.databaseConfig_DB_HOST_helper(),
			icon: 'mdi:server-network'
		},
		DB_PORT: {
			type: 'number',
			default: 27017,
			helper: 'Default MongoDB port: 27017, Default MariaDB port: 3306',
			icon: 'mdi:port'
		},
		DB_NAME: {
			type: 'string',
			default: '',
			helper: m.databaseConfig_DB_NAME_helper(),
			icon: 'mdi:database-edit'
		},
		DB_USER: {
			type: 'string',
			default: '',
			helper: m.databaseConfig_DB_USER_helper(),
			icon: 'mdi:account'
		},
		DB_PASSWORD: {
			type: 'string',
			default: '',
			helper: m.databaseConfig_DB_PASSWORD_helper(),
			icon: 'mdi:lock'
		},
		DB_RETRY_ATTEMPTS: {
			type: 'number',
			default: 5,
			helper: m.databaseConfig_DB_RETRY_ATTEMPTS_helper(),
			icon: 'mdi:reload'
		},
		DB_RETRY_DELAY: {
			type: 'number',
			default: 5000,
			helper: m.databaseConfig_DB_RETRY_DELAY_helper(),
			icon: 'mdi:clock'
		},
		DB_POOL_SIZE: {
			type: 'number',
			default: 10,
			helper: m.databaseConfig_DB_POOL_SIZE_helper(),
			icon: 'mdi:pool'
		}
	}
};

const emailConfig: ConfigCategory = {
	description: m.emailConfig_Description(),
	icon: 'mdi:email',
	fields: {
		SMTP_HOST: {
			type: 'string',
			default: '',
			helper: m.emailConfig_SMTP_HOST_helper(),
			icon: 'mdi:server'
		},
		SMTP_PORT: {
			type: 'number',
			default: 587,
			helper: m.emailConfig_SMTP_PORT_helper(),
			icon: 'mdi:port'
		},
		SMTP_EMAIL: {
			type: 'string',
			default: '',
			helper: m.emailConfig_SMTP_EMAIL_helper(),
			icon: 'mdi:email'
		},
		SMTP_PASSWORD: {
			type: 'string',
			default: '',
			helper: m.emailConfig_SMTP_PASSWORD_helper(),
			icon: 'mdi:lock'
		}
	}
};

const googleConfig: ConfigCategory = {
	description: m.googleConfig_Description(),
	icon: 'mdi:google',
	fields: {
		USE_GOOGLE_OAUTH: {
			type: 'boolean',
			default: false,
			helper: m.googleConfig_GOOGLE_OAUTH_helper(),
			icon: 'mdi:google'
		},
		GOOGLE_CLIENT_ID: {
			type: 'string',
			default: '',
			helper: m.googleConfig_GOOGLE_CIENT_ID_helper(),
			icon: 'mdi:client'
		},
		GOOGLE_CLIENT_SECRET: {
			type: 'string',
			default: '',
			helper: m.googleConfig_GOOGLE_CLIENT_SECRET_helper(),
			icon: 'mdi:lock'
		},
		GOOGLE_API_KEY: {
			type: 'string',
			default: '',
			helper: m.googleConfig_GOOGLE_API_KEY_helper(),
			icon: 'mdi:key'
		}
	}
};

const redisConfig: ConfigCategory = {
	description: m.redisConfig_Description(),
	icon: 'mdi:server-network',
	fields: {
		USE_REDIS: {
			type: 'boolean',
			default: false,
			helper: m.redisConfig_USE_REDIS_helper(),
			icon: 'mdi:database'
		},
		REDIS_HOST: {
			type: 'string',
			default: '',
			helper: m.redisConfig_REDIS_HOST_helper(),
			icon: 'mdi:server-network'
		},
		REDIS_PORT: {
			type: 'number',
			default: 6379,
			helper: m.redisConfig_REDIS_PORT_helper(),
			icon: 'mdi:port'
		},
		REDIS_PASSWORD: {
			type: 'string',
			default: '',
			helper: m.redisConfig_REDIS_PASSWORD_helper(),
			icon: 'mdi:lock'
		}
	}
};

const mapboxConfig: ConfigCategory = {
	description: m.mapboxConfig_Description(),
	icon: 'mdi:map-marker',
	fields: {
		USE_MAPBOX: {
			type: 'boolean',
			default: false,
			helper: m.mapboxConfig_USE_MAPBOX_helper(),
			icon: 'mdi:map'
		},
		MAPBOX_API_TOKEN: {
			type: 'string',
			default: '',
			helper: m.mapboxConfig_MAPBOX_API_TOKEN_helper(),
			icon: 'mdi:key'
		}
	}
};

const tiktokConfig: ConfigCategory = {
	description: m.tiktokConfig_Description(),
	icon: 'ic:baseline-tiktok',
	fields: {
		USE_TIKTOK: {
			type: 'boolean',
			default: false,
			helper: m.tiktokConfig_USE_TIKTOK_helper(),
			icon: 'ic:baseline-tiktok'
		},
		TIKTOK_TOKEN: {
			type: 'string',
			default: '',
			helper: m.tiktokConfig_TIKTOK_TOKEN_helper(),
			icon: 'mdi:key'
		}
	}
};

const llmConfig: ConfigCategory = {
	description: m.llmConfig_description(),
	icon: 'mdi:robot',
	fields: {
		USE_LLM: {
			type: 'boolean',
			default: false,
			helper: m.llmConfig_useLLM(),
			icon: 'mdi:toggle-switch'
		},
		LLM_PROVIDER: {
			type: 'string',
			default: '',
			helper: m.llmConfig_llmProvider(),
			icon: 'mdi:domain'
		},
		LLM_API_KEY: {
			type: 'string',
			default: '',
			helper: m.llmConfig_apiKey(),
			icon: 'mdi:key'
		}
	}
};

// Private Config Categories
const privateConfigCategories = {
	database: databaseConfig,
	email: emailConfig,
	google: googleConfig,
	redis: redisConfig,
	mapbox: mapboxConfig,
	tiktok: tiktokConfig,
	llm: llmConfig
};

const systemConfig: ConfigCategory = {
	description: m.systemConfig_Description(),
	icon: 'mdi:cog',
	fields: {
		SITE_NAME: {
			type: 'string',
			default: 'SveltyCMS',
			helper: m.systemConfig_SITE_NAME_helper(),
			icon: 'mdi:web'
		},
		BODY_SIZE_LIMIT: {
			type: 'number',
			default: 104857600,
			helper: m.systemConfig_BODY_SIZE_LIMIT_helper(),
			icon: 'mdi:weight'
		},
		HOST_DEV: {
			type: 'string',
			default: 'http://localhost:5173',
			helper: m.systemConfig_HOST_DEV_helper(),
			icon: 'mdi:lan-connect'
		},
		HOST_PROD: {
			type: 'string',
			default: 'https://yourdomain.de',
			helper: m.systemConfig_HOST_PROD_helper(),
			icon: 'mdi:lan-disconnect'
		},
		PASSWORD_LENGTH: {
			type: 'number',
			default: 8,
			helper: m.systemConfig_PASSWORD_LENGHT_helper(),
			icon: 'mdi:lock'
		},
		SEASONS: {
			type: 'boolean',
			default: false,
			helper: m.systemConfig_USE_SEASON_helper(),
			icon: 'mdi:calendar'
		},
		SEASON_REGION: {
			type: 'string',
			default: 'Western_Europe',
			helper: m.systemConfig_SEASON_REGION_helper(),
			allowedValues: ['Western_Europe', 'South_Asia', 'East_Asia'],
			icon: 'mdi:earth'
		}
	}
};

const languageConfig: ConfigCategory = {
	description: m.languageConfig_Description(),
	icon: 'mdi:translate',
	fields: {
		DEFAULT_CONTENT_LANGUAGE: {
			type: 'string',
			default: 'en',
			helper: m.languageConfig_DEFAULT_CONTENT_LANGUAGE_helper(),
			icon: 'mdi:translate'
		},
		AVAILABLE_CONTENT_LANGUAGES: {
			type: 'array',
			default: ['en'],
			helper: m.languageConfig_AVAILABLE_CONTENT_LANGUAGE_helper(),
			icon: 'mdi:translate'
		},
		BASE_LOCALE: {
			type: 'string',
			default: 'en',
			helper: 'Base locale for the CMS interface (from inlang configuration)',
			icon: 'mdi:translate'
		},
		LOCALES: {
			type: 'array',
			default: ['en'],
			helper: 'Available interface locales (from inlang configuration)',
			icon: 'mdi:translate'
		}
	}
};

const mediaConfig: ConfigCategory = {
	description: m.mediaConfig_Description(),
	icon: 'mdi:image',
	fields: {
		IMAGE_SIZES: {
			type: 'object',
			default: { sm: 600, md: 900, lg: 1200 },
			helper: 'The sizes of images that the site will generate. (default: {sm: 600, md: 900, lg: 1200})',
			icon: 'mdi:image-size-select-actual'
		},
		MEDIA_FOLDER: {
			type: 'string',
			default: 'mediaFiles',
			helper: m.mediaConfig_MEDIA_FOLDER_helper(),
			icon: 'mdi:folder'
		},
		MEDIA_OUTPUT_FORMAT_QUALITY: {
			type: 'object',
			default: { format: 'original', quality: 80 },
			helper: m.mediaConfig_MEDIA_OUTPUT_FORMAT_QUALITY_helper(),
			icon: 'mdi:quality-high'
		},
		MEDIASERVER_URL: {
			type: 'string',
			default: '',
			helper: m.mediaConfig_MEDIASERVER_URL_helper(),
			icon: 'mdi:server'
		}
	}
};

// Public Config Categories
const publicConfigCategories = {
	system: systemConfig,
	language: languageConfig,
	media: mediaConfig
};

// Exports
export { privateConfigCategories, publicConfigCategories };
