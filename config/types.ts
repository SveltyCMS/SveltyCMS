import type { AvailableLanguageTag } from '../src/paraglide/runtime';

/**
 * The PRIVAT configuration for the application,
 */
export const createPrivateConfig = (arg: {
	DB_TYPE: 'mongodb' | 'mariadb';
	DB_HOST: string;
	DB_NAME: string;
	DB_USER: string;
	DB_PASSWORD: string;
	DB_RETRY_ATTEMPTS?: number;
	DB_RETRY_DELAY?: number;
	DB_POOL_SIZE?: number;
	SMTP_HOST?: string;
	SMTP_PORT?: number;
	SMTP_EMAIL?: string;
	SMTP_PASSWORD?: string;
	SERVER_PORT?: number;
	USE_GOOGLE_OAUTH: boolean;
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
	USE_REDIS: boolean;
	REDIS_HOST?: string;
	REDIS_PORT?: number;
	REDIS_PASSWORD?: string;
	USE_MAPBOX: boolean;
	MAPBOX_API_TOKEN?: string;
	SECRET_MAPBOX_API_TOKEN?: string;
	GOOGLE_API_KEY?: string;
	TWITCH_TOKEN?: string;
	USE_TIKTOK?: boolean;
	TIKTOK_TOKEN?: string;
	USE_OPEN_AI?: boolean;
	VITE_OPEN_AI_KEY?: string;
}) => arg;

export const privateConfigCategories = {
	database: ['DB_TYPE', 'DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_RETRY_ATTEMPTS', 'DB_RETRY_DELAY', 'DB_POOL_SIZE'],
	email: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_EMAIL', 'SMTP_PASSWORD'],
	google: ['USE_GOOGLE_OAUTH', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_API_KEY'],
	redis: ['USE_REDIS', 'REDIS_HOST', 'REDIS_PORT', 'REDIS_PASSWORD'],
	mapbox: ['USE_MAPBOX', 'MAPBOX_API_TOKEN'],
	tiktok: ['USE_TIKTOK', 'TIKTOK_TOKEN'],
	openai: ['USE_OPEN_AI', 'VITE_OPEN_AI_KEY']
};

/**
 * The PUBLIC configuration for the application,
 */

type MediaOutputFormatQuality = {
	format: 'original' | 'jpg' | 'webp' | 'avif';
	quality: number;
};

export const createPublicConfig = <const C, S extends AvailableLanguageTag, const V extends { [key: string]: number }>(arg: {
	HOST_DEV: string;
	HOST_PROD: string;
	SITE_NAME: string;
	PASSWORD_STRENGTH?: number | 8;
	DEFAULT_CONTENT_LANGUAGE: C;
	AVAILABLE_CONTENT_LANGUAGES: C[];
	AVAILABLE_SYSTEM_LANGUAGES: S[];
	DEFAULT_SYSTEM_LANGUAGE: NoInfer<S>;
	MEDIA_FOLDER: string;
	MEDIA_OUTPUT_FORMAT_QUALITY: MediaOutputFormatQuality;
	MEDIASERVER_URL?: string;
	IMAGE_SIZES: V;
	BODY_SIZE_LIMIT?: number;
	SEASONS?: boolean;
	SEASON_REGION?: string;
	PKG_VERSION?: string;
}) => arg;

export const publicConfigCategories = {
	site: [
		'SITE_NAME',
		'DEFAULT_CONTENT_LANGUAGE',
		'AVAILABLE_CONTENT_LANGUAGES',
		'DEFAULT_SYSTEM_LANGUAGE',
		'AVAILABLE_SYSTEM_LANGUAGES',
		'IMAGE_SIZES',
		'MEDIA_FOLDER',
		'MEDIA_OUTPUT_FORMAT_QUALITY',
		'MEDIASERVER_URL',
		'BODY_SIZE_LIMIT',
		'HOST_DEV',
		'HOST_PROD',
		'PASSWORD_STRENGTH',
		'SEASONS',
		'SEASON_REGION'
	]
};

type NoInfer<T> = [T][T extends any ? 0 : never];
