/**
 * @file src/lib/config.server.ts
 * @description Production-grade configuration service following SvelteKit best practices
 *
 * This service provides:
 * - Type-safe access to essential environment variables
 * - Database-driven configuration with in-memory caching
 * - Proper separation of public/private settings
 * - SvelteKit-style API for configuration access
 * - Production-ready error handling and validation
 * - Integration with new modular hooks system
 */

import { essentialEnv, validateEssentialEnv } from './env.server';
import { getPublicSetting, getPrivateSetting, loadSettings } from './settings.server';
import type { PublicSettings, PrivateSettings } from './settings.server';

// Production-grade configuration service
export class ConfigService {
	private static instance: ConfigService;
	private cache: Map<string, any> = new Map();
	private cacheExpiry: Map<string, number> = new Map();
	private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
	private initialized = false;
	private setupMode = false;

	private constructor() {}

	static getInstance(): ConfigService {
		if (!ConfigService.instance) {
			ConfigService.instance = new ConfigService();
		}
		return ConfigService.instance;
	}

	/**
	 * Initialize the configuration service
	 */
	async initialize(): Promise<void> {
		if (this.initialized) return;

		try {
			// Check if we're in setup mode (no environment variables yet)
			const isSetupMode = !essentialEnv.DB_HOST || !essentialEnv.JWT_SECRET_KEY || !essentialEnv.ENCRYPTION_KEY;

			if (isSetupMode) {
				this.setupMode = true;
				this.initialized = true;
				return;
			}

			// Validate essential environment variables
			validateEssentialEnv();

			// Load settings from database
			await loadSettings();

			this.initialized = true;
			this.setupMode = false;
		} catch (error) {
			console.error('Failed to initialize configuration service:', error);
			this.setupMode = true;
			this.initialized = true;
		}
	}

	/**
	 * Check if we're in setup mode
	 */
	isSetupMode(): boolean {
		return this.setupMode;
	}

	/**
	 * Essential environment variables (real SvelteKit pattern)
	 */
	get env() {
		return essentialEnv;
	}

	/**
	 * Get a public setting (client-accessible)
	 */
	async getPublic<K extends keyof PublicSettings>(key: K): Promise<PublicSettings[K]> {
		await this.ensureInitialized();
		return this.getCachedOrFetch(`public:${key}`, () => getPublicSetting(key)) as Promise<PublicSettings[K]>;
	}

	/**
	 * Get a private setting (server-only)
	 */
	async getPrivate<K extends keyof PrivateSettings>(key: K): Promise<PrivateSettings[K]> {
		await this.ensureInitialized();
		return this.getCachedOrFetch(`private:${key}`, () => getPrivateSetting(key)) as Promise<PrivateSettings[K]>;
	}

	/**
	 * Get all public settings
	 */
	async getAllPublic(): Promise<PublicSettings> {
		await this.ensureInitialized();
		return this.getCachedOrFetch('public:all', () => {
			const settings: PublicSettings = {};
			const keys: (keyof PublicSettings)[] = [
				'SETUP_COMPLETED',
				'HOST_DEV',
				'HOST_PROD',
				'SITE_NAME',
				'PASSWORD_LENGTH',
				'DEFAULT_CONTENT_LANGUAGE',
				'AVAILABLE_CONTENT_LANGUAGES',
				'BASE_LOCALE',
				'LOCALES',
				'MEDIA_FOLDER',
				'MAX_FILE_SIZE',
				'BODY_SIZE_LIMIT',
				'DEMO',
				'SEASONS',
				'USE_MAPBOX',
				'MAPBOX_API_TOKEN'
			];

			for (const key of keys) {
				settings[key] = getPublicSetting(key);
			}

			return settings;
		});
	}

	/**
	 * Get all private settings
	 */
	async getAllPrivate(): Promise<PrivateSettings> {
		await this.ensureInitialized();
		return this.getCachedOrFetch('private:all', () => {
			const settings: PrivateSettings = {};
			const keys: (keyof PrivateSettings)[] = [
				'USE_REDIS',
				'REDIS_HOST',
				'REDIS_PORT',
				'REDIS_PASSWORD',
				'LOG_LEVELS',
				'LOG_RETENTION_DAYS',
				'LOG_ROTATION_SIZE',
				'USE_GOOGLE_OAUTH',
				'GOOGLE_CLIENT_ID',
				'GOOGLE_CLIENT_SECRET',
				'GOOGLE_API_KEY',
				'TWITCH_TOKEN',
				'SECRET_MAPBOX_API_TOKEN',
				'MULTI_TENANT',
				'SMTP_HOST',
				'SMTP_PORT',
				'SMTP_EMAIL',
				'SMTP_PASSWORD',
				'SESSION_CLEANUP_INTERVAL',
				'MAX_IN_MEMORY_SESSIONS',
				'DB_VALIDATION_PROBABILITY',
				'SESSION_EXPIRATION_SECONDS',
				'SERVER_PORT',
				'ROLES',
				'PERMISSIONS'
			];

			for (const key of keys) {
				settings[key] = getPrivateSetting(key);
			}

			return settings;
		});
	}

	/**
	 * Invalidate cache when settings change
	 */
	invalidateCache(): void {
		this.cache.clear();
		this.cacheExpiry.clear();
	}

	/**
	 * Refresh settings from database
	 */
	async refresh(): Promise<void> {
		await loadSettings();
		this.invalidateCache();
	}

	/**
	 * Check if service is initialized
	 */
	isInitialized(): boolean {
		return this.initialized;
	}

	/**
	 * Force reinitialization (useful when config files change)
	 */
	async forceReinitialize(): Promise<void> {
		this.initialized = false;
		this.setupMode = false;
		this.cache.clear();
		this.cacheExpiry.clear();
		await this.initialize();
	}

	private async ensureInitialized(): Promise<void> {
		if (!this.initialized) {
			await this.initialize();
		}
	}

	private async getCachedOrFetch<T>(key: string, fetcher: () => T | Promise<T>): Promise<T> {
		const now = Date.now();
		const expiry = this.cacheExpiry.get(key) || 0;

		if (this.cache.has(key) && now < expiry) {
			return this.cache.get(key);
		}

		const value = await fetcher();
		this.cache.set(key, value);
		this.cacheExpiry.set(key, now + this.CACHE_TTL);

		return value;
	}
}

// Singleton instance
export const config = ConfigService.getInstance();

// Convenience functions for common settings
export const getSiteName = () => config.getPublic('SITE_NAME');
export const getBaseLocale = () => config.getPublic('BASE_LOCALE');
export const getLocales = () => config.getPublic('LOCALES');
export const getDefaultLanguage = () => config.getPublic('DEFAULT_CONTENT_LANGUAGE');
export const getAvailableLanguages = () => config.getPublic('AVAILABLE_CONTENT_LANGUAGES');
export const getMaxFileSize = () => config.getPublic('MAX_FILE_SIZE');
export const getBodySizeLimit = () => config.getPublic('BODY_SIZE_LIMIT');
export const getPasswordLength = () => config.getPublic('PASSWORD_LENGTH');
export const isDemoMode = () => config.getPublic('DEMO');
export const isSeasonsEnabled = () => config.getPublic('SEASONS');
export const isSetupCompleted = () => config.getPublic('SETUP_COMPLETED');
export const isMapboxEnabled = () => config.getPublic('USE_MAPBOX');
export const getMapboxToken = () => config.getPublic('MAPBOX_API_TOKEN');

// Private settings convenience functions
export const getGoogleApiKey = () => config.getPrivate('GOOGLE_API_KEY');
export const getTwitchToken = () => config.getPrivate('TWITCH_TOKEN');
export const getSecretMapboxToken = () => config.getPrivate('SECRET_MAPBOX_API_TOKEN');
export const getGoogleClientId = () => config.getPrivate('GOOGLE_CLIENT_ID');
export const getGoogleClientSecret = () => config.getPrivate('GOOGLE_CLIENT_SECRET');
export const isGoogleOAuthEnabled = () => config.getPrivate('USE_GOOGLE_OAUTH');
export const isMultiTenant = () => config.getPrivate('MULTI_TENANT');
export const getSmtpHost = () => config.getPrivate('SMTP_HOST');
export const getSmtpPort = () => config.getPrivate('SMTP_PORT');
export const getSmtpEmail = () => config.getPrivate('SMTP_EMAIL');
export const getSmtpPassword = () => config.getPrivate('SMTP_PASSWORD');
export const isRedisEnabled = () => config.getPrivate('USE_REDIS');
export const getRedisHost = () => config.getPrivate('REDIS_HOST');
export const getRedisPort = () => config.getPrivate('REDIS_PORT');
export const getRedisPassword = () => config.getPrivate('REDIS_PASSWORD');

// Integration with new modular hooks system
export const getConfigForHooks = () => ({
	config,
	isSetupMode: () => config.isSetupMode(),
	getPublic: config.getPublic.bind(config),
	getPrivate: config.getPrivate.bind(config),
	initialize: config.initialize.bind(config)
});
