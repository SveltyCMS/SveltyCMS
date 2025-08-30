/**
 * @file guiConfig.ts
 * @description This file defines and organizes configuration categories for a system's
 * graphical user interface (GUI). The configurations are grouped into private and
 * public categories, each containing fields with various settings, including database
 * connections, email settings, third-party service integrations, system properties,
 * language preferences, and media management.
 */

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
	description: 'Database connection and configuration settings',
	icon: 'mdi:database',
	fields: {
		DB_TYPE: {
			type: 'string',
			default: 'mongodb',
			helper: 'Type of database to use (mongodb or mariadb)',
			allowedValues: ['mongodb', 'mariadb'],
			icon: 'mdi:database'
		},
		DB_HOST: {
			type: 'string',
			default: 'localhost',
			helper: 'Database server hostname or IP address',
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
			helper: 'Name of the database to connect to',
			icon: 'mdi:database-edit'
		},
		DB_USER: {
			type: 'string',
			default: '',
			helper: 'Database username for authentication',
			icon: 'mdi:account'
		},
		DB_PASSWORD: {
			type: 'string',
			default: '',
			helper: 'Database password for authentication',
			icon: 'mdi:lock'
		},
		DB_RETRY_ATTEMPTS: {
			type: 'number',
			default: 5,
			helper: 'Number of connection retry attempts',
			icon: 'mdi:reload'
		},
		DB_RETRY_DELAY: {
			type: 'number',
			default: 5000,
			helper: 'Delay between retry attempts in milliseconds',
			icon: 'mdi:clock'
		},
		DB_POOL_SIZE: {
			type: 'number',
			default: 10,
			helper: 'Number of connections in the database connection pool',
			icon: 'mdi:pool'
		},
		MULTI_TENANT: {
			type: 'boolean',
			default: false,
			helper: 'Enable multi-tenant database support',
			icon: 'mdi:sitemap'
		}
	}
};

const emailConfig: ConfigCategory = {
	description: 'Email server configuration for sending notifications',
	icon: 'mdi:email',
	fields: {
		SMTP_HOST: {
			type: 'string',
			default: '',
			helper: 'SMTP server hostname (e.g., smtp.gmail.com)',
			icon: 'mdi:server'
		},
		SMTP_PORT: {
			type: 'number',
			default: 587,
			helper: 'SMTP server port (587 for TLS, 465 for SSL)',
			icon: 'mdi:port'
		},
		SMTP_EMAIL: {
			type: 'string',
			default: '',
			helper: 'Email address used for sending notifications',
			icon: 'mdi:email'
		},
		SMTP_PASSWORD: {
			type: 'string',
			default: '',
			helper: 'Password for the email account',
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
	description: 'Google OAuth and API configuration',
	icon: 'mdi:google',
	fields: {
		USE_GOOGLE_OAUTH: {
			type: 'boolean',
			default: false,
			helper: 'Enable Google OAuth authentication',
			icon: 'mdi:google'
		},
		GOOGLE_CLIENT_ID: {
			type: 'string',
			default: '',
			helper: 'Google OAuth client ID from Google Cloud Console',
			icon: 'mdi:card-account-details'
		},
		GOOGLE_CLIENT_SECRET: {
			type: 'string',
			default: '',
			helper: 'Google OAuth client secret from Google Cloud Console',
			icon: 'mdi:lock'
		},
		GOOGLE_API_KEY: {
			type: 'string',
			default: '',
			helper: 'Google API key for additional Google services',
			icon: 'mdi:key'
		}
	}
};

const redisConfig: ConfigCategory = {
	description: 'Redis cache and session storage configuration',
	icon: 'mdi:server-network',
	fields: {
		USE_REDIS: {
			type: 'boolean',
			default: false,
			helper: 'Enable Redis for caching and session storage',
			icon: 'mdi:toggle-switch'
		},
		REDIS_HOST: {
			type: 'string',
			default: 'localhost',
			helper: 'Redis server hostname or IP address',
			icon: 'mdi:server-network'
		},
		REDIS_PORT: {
			type: 'number',
			default: 6379,
			helper: 'Redis server port (default: 6379)',
			icon: 'mdi:port'
		},
		REDIS_PASSWORD: {
			type: 'string',
			default: '',
			helper: 'Redis server password (if authentication is enabled)',
			icon: 'mdi:lock'
		}
	}
};

const mapboxConfig: ConfigCategory = {
	description: 'Mapbox mapping service configuration',
	icon: 'mdi:map-marker',
	fields: {
		USE_MAPBOX: {
			type: 'boolean',
			default: false,
			helper: 'Enable Mapbox mapping services',
			icon: 'mdi:map'
		},
		MAPBOX_API_TOKEN: {
			type: 'string',
			default: '',
			helper: 'Mapbox API token for client-side mapping',
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
	description: 'TikTok API integration configuration',
	icon: 'ic:baseline-tiktok',
	fields: {
		USE_TIKTOK: {
			type: 'boolean',
			default: false,
			helper: 'Enable TikTok API integration',
			icon: 'ic:baseline-tiktok'
		},
		TIKTOK_TOKEN: {
			type: 'string',
			default: '',
			helper: 'TikTok API access token',
			icon: 'mdi:key'
		}
	}
};

const llmConfig: ConfigCategory = {
	description: 'Large Language Model (LLM) configuration',
	icon: 'mdi:robot',
	fields: {
		USE_LLM: {
			type: 'boolean',
			default: false,
			helper: 'Enable Large Language Model integration',
			icon: 'mdi:toggle-switch'
		},
		LLM_PROVIDER: {
			type: 'string',
			default: '',
			helper: 'Provider for the Large Language Model (e.g., OpenAI, Anthropic)',
			icon: 'mdi:domain'
		},
		LLM_API_KEY: {
			type: 'string',
			default: '',
			helper: 'API key for the Large Language Model provider',
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
	description: 'System-wide configuration settings',
	icon: 'mdi:cog',
	fields: {
		SITE_NAME: {
			type: 'string',
			default: 'SveltyCMS',
			helper: 'The name of your website or application',
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
			helper: 'Maximum size of request body in bytes (100MB default)',
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
			helper: 'Development server host URL',
			icon: 'mdi:lan-connect'
		},
		HOST_PROD: {
			type: 'string',
			default: 'https://yourdomain.de',
			helper: 'Production server host URL',
			icon: 'mdi:lan-disconnect'
		},
		PASSWORD_LENGTH: {
			type: 'number',
			default: 8,
			helper: 'Minimum password length requirement',
			icon: 'mdi:lock'
		},
		SEASONS: {
			type: 'boolean',
			default: false,
			helper: 'Enable seasonal content features',
			icon: 'mdi:calendar'
		},
		SEASON_REGION: {
			type: 'string',
			default: 'Western_Europe',
			helper: 'Geographic region for seasonal content',
			allowedValues: ['Western_Europe', 'South_Asia', 'East_Asia'],
			icon: 'mdi:earth'
		}
	}
};

const languageConfig: ConfigCategory = {
	description: 'Language and localization settings',
	icon: 'mdi:translate',
	fields: {
		DEFAULT_CONTENT_LANGUAGE: {
			type: 'string',
			default: 'en',
			helper: 'Default language for content creation',
			icon: 'mdi:translate'
		},
		AVAILABLE_CONTENT_LANGUAGES: {
			type: 'object',
			default: ['en'],
			helper: 'List of available languages for content',
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
	description: 'Media file management and processing settings',
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
			helper: 'Folder path for storing media files',
			icon: 'mdi:folder'
		},
		MEDIA_OUTPUT_FORMAT_QUALITY: {
			type: 'object',
			default: { format: 'original', quality: 80 },
			helper: 'Output format and quality settings for media processing',
			icon: 'mdi:quality-high'
		},
		MEDIASERVER_URL: {
			type: 'string',
			default: '',
			helper: 'URL for the media server (if using external media hosting)',
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
