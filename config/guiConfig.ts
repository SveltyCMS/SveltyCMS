// ParaglideJS
import * as m from '@src/paraglide/messages';

// Config fields
interface ConfigField<T> {
	type: T;
	default: any;
	helper: string;
	allowedValues?: any[];
	icon: string;
}
// Config categories
interface ConfigCategory {
	description: string;
	icon: string;
	fields: { [key: string]: ConfigField<any> };
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

const openaiConfig: ConfigCategory = {
	description: m.openaiConfig_Description(),
	icon: 'mdi:robot',
	fields: {
		USE_OPEN_AI: {
			type: 'boolean',
			default: false,
			helper: m.openaiConfig_USE_OPEN_AI_helper(),
			icon: 'mdi:robot'
		},
		VITE_OPEN_AI_KEY: {
			type: 'string',
			default: '',
			helper: m.openaiConfig_OPEN_AI_KEY_helper(),
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
	openai: openaiConfig
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
		PASSWORD_STRENGTH: {
			type: 'number',
			default: 8,
			helper: m.systemConfig_PASSWORD_STRENGHT_helper(),
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
			default: 'Europe',
			helper: m.systemConfig_SEASON_REGION_helper(),
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
		DEFAULT_SYSTEM_LANGUAGE: {
			type: 'string',
			default: 'en',
			helper: m.languageConfig_DEFAULT_SYSTEM_LANGUAGE_helper(),
			icon: 'mdi:translate'
		},
		AVAILABLE_SYSTEM_LANGUAGES: {
			type: 'array',
			default: ['en'],
			helper: m.languageConfig_AVAILABLE_SYSTEM_LANGUAGE_helper(),
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
