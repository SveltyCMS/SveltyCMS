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
 * provide descriptions and helper texts for the configuration fields.
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
	fields: { [key: string]: ConfigField<string | number | boolean | object> };
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
		},
		MULTI_TENANT: {
			type: 'boolean',
			default: false,
			helper: m.databaseConfig_MULTI_TENANT_helper(),
			icon: 'mdi:sitemap'
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

// --- NEW: Session Management Category ---
const sessionConfig: ConfigCategory = {
	description: 'Configure user session behavior, duration, and validation.',
	icon: 'mdi:account-clock',
	fields: {
		SESSION_CLEANUP_INTERVAL: {
			type: 'number',
			default: 60000,
			helper: 'How often expired sessions are removed from memory (in milliseconds).',
			icon: 'mdi:broom'
		},
		MAX_IN_MEMORY_SESSIONS: {
			type: 'number',
			default: 10000,
			helper: 'The maximum number of user sessions to hold in memory at one time.',
			icon: 'mdi:memory'
		},
		DB_VALIDATION_PROBABILITY: {
			type: 'number',
			default: 0.1,
			helper: 'The probability (from 0 to 1) of validating a session against the database on each request.',
			icon: 'mdi:dice-5'
		},
		SESSION_EXPIRATION_SECONDS: {
			type: 'number',
			default: 3600,
			helper: 'The duration in seconds until a user session automatically expires.',
			icon: 'mdi:timer-sand'
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
			icon: 'mdi:card-account-details'
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
			icon: 'mdi:toggle-switch'
		},
		REDIS_HOST: {
			type: 'string',
			default: 'localhost',
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
		},
		// --- ADDED: Secret Mapbox token ---
		SECRET_MAPBOX_API_TOKEN: {
			type: 'string',
			default: '',
			helper: 'Secret Mapbox API token for server-side use.',
			icon: 'mdi:key-chain-variant'
		}
	}
};

// --- NEW: Third-Party APIs Category ---
const apiConfig: ConfigCategory = {
	description: 'Configure tokens and settings for various third-party API integrations.',
	icon: 'mdi:api',
	fields: {
		TWITCH_TOKEN: {
			type: 'string',
			default: '',
			helper: 'API token for Twitch integration.',
			icon: 'mdi:twitch'
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

// --- NEW: Security Category ---
const securityConfig: ConfigCategory = {
	description: 'Manage security settings, roles, permissions, secret keys, and two-factor authentication.',
	icon: 'mdi:shield-lock',
	fields: {
		JWT_SECRET_KEY: {
			type: 'string',
			default: '',
			helper: 'The secret key for signing JWTs. Must be at least 32 characters long.',
			icon: 'mdi:key-variant'
		},
		USE_2FA: {
			type: 'boolean',
			default: false,
			helper: 'Enable Two-Factor Authentication globally for enhanced security.',
			icon: 'mdi:two-factor-authentication'
		},
		TWO_FACTOR_AUTH_SECRET: {
			type: 'string',
			default: '',
			helper: 'Secret key for 2FA token generation. Leave empty to auto-generate.',
			icon: 'mdi:key-plus'
		},
		TWO_FACTOR_AUTH_BACKUP_CODES_COUNT: {
			type: 'number',
			default: 10,
			helper: 'Number of backup codes to generate for 2FA recovery (1-50).',
			icon: 'mdi:backup-restore'
		},
		ROLES: {
			type: 'object',
			default: ['admin', 'editor'],
			helper: 'Define the user roles available in the system.',
			icon: 'mdi:account-group'
		},
		PERMISSIONS: {
			type: 'object',
			default: ['manage', 'edit', 'create'],
			helper: 'Define the permissions available in the system.',
			icon: 'mdi:shield-check'
		}
	}
};

// Private Config Categories
const privateConfigCategories = {
	database: databaseConfig,
	email: emailConfig,
	session: sessionConfig,
	security: securityConfig,
	google: googleConfig,
	redis: redisConfig,
	mapbox: mapboxConfig,
	api: apiConfig,
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
		SERVER_PORT: {
			type: 'number',
			default: 3000,
			helper: 'The port the main application server will run on.',
			icon: 'mdi:web-box'
		},
		BODY_SIZE_LIMIT: {
			type: 'number',
			default: 104857600,
			helper: m.systemConfig_BODY_SIZE_LIMIT_helper(),
			icon: 'mdi:weight'
		},
		// --- ADDED: More system settings ---
		MAX_FILE_SIZE: {
			type: 'number',
			default: 104857600,
			helper: 'The maximum size for a single file upload in bytes.',
			icon: 'mdi:file-upload'
		},
		EXTRACT_DATA_PATH: {
			type: 'string',
			default: './exports/data.json',
			helper: 'File path for exporting collection data if the feature is enabled.',
			icon: 'mdi:file-export'
		},
		USE_ARCHIVE_ON_DELETE: {
			type: 'boolean',
			default: true,
			helper: 'If enabled, deleted items are archived instead of being permanently removed.',
			icon: 'mdi:archive'
		},
		DEMO: {
			type: 'boolean',
			default: false,
			helper: 'Enable demo mode, which may restrict certain features.',
			icon: 'mdi:flask'
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
			type: 'object',
			default: ['en'],
			helper: m.languageConfig_AVAILABLE_CONTENT_LANGUAGE_helper(),
			icon: 'mdi:translate-variant'
		},
		BASE_LOCALE: {
			type: 'string',
			default: 'en',
			helper: 'Base locale for the CMS interface (from inlang configuration)',
			icon: 'mdi:earth'
		},
		LOCALES: {
			type: 'object',
			default: ['en'],
			helper: 'Available interface locales (from inlang configuration)',
			icon: 'mdi:web'
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

// --- NEW: Logging Category ---
const loggingConfig: ConfigCategory = {
	description: 'Configure log levels, rotation, and retention policies.',
	icon: 'mdi:math-log',
	fields: {
		LOG_LEVELS: {
			type: 'object',
			default: ['error', 'warn'],
			helper: "The logging levels to be active. (e.g., 'error', 'info', 'debug').",
			icon: 'mdi:format-list-bulleted-type'
		},
		LOG_RETENTION_DAYS: {
			type: 'number',
			default: 7,
			helper: 'The number of days to keep log files before deleting them.',
			icon: 'mdi:calendar-clock'
		},
		LOG_ROTATION_SIZE: {
			type: 'number',
			default: 5242880,
			helper: 'The maximum size of a log file in bytes before it is rotated.',
			icon: 'mdi:rotate-3d-variant'
		}
	}
};

// Public Config Categories
const publicConfigCategories = {
	system: systemConfig,
	language: languageConfig,
	media: mediaConfig,
	logging: loggingConfig
};

// Exports
export { privateConfigCategories, publicConfigCategories };
