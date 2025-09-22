/**
 * @file src/databases/themeManager.ts
 * @description Theme manager for the CMS, utilizing a database-agnostic interface and now multi-tenant aware.
 */
import { error } from '@sveltejs/kit';
import type { IDBAdapter, Theme } from './dbInterface';
import type { DatabaseId, ISODateString } from './types';

// System Logger
import { logger } from '@utils/logger.svelte';

/**
 * Fallback theme for when database is not available
 * This should match the theme that gets seeded during setup
 */
export const DEFAULT_THEME: Theme = {
	_id: '670e8b8c4d123456789abcde' as DatabaseId, // Matches the seeded theme ID
	name: 'SveltyCMSTheme',
	path: '/src/themes/SveltyCMS/SveltyCMSTheme.css',
	isActive: false,
	isDefault: true,
	config: {
		tailwindConfigPath: '',
		assetsPath: ''
	},
	createdAt: new Date().toISOString() as ISODateString,
	updatedAt: new Date().toISOString() as ISODateString
};

export class ThemeManager {
	private static instance: ThemeManager;
	private tenantThemes: Map<string, Theme> = new Map(); // Use a Map to store themes per tenant
	private db: IDBAdapter | null = null;
	private initialized: boolean = false;
	private defaultThemeCache: Theme | null = null;

	private constructor() {}

	public static getInstance(): ThemeManager {
		if (!ThemeManager.instance) {
			ThemeManager.instance = new ThemeManager();
		}
		return ThemeManager.instance;
	}

	public isInitialized(): boolean {
		return this.initialized;
	}

	public async initialize(db: IDBAdapter): Promise<void> {
		try {
			if (this.initialized) {
				return;
			}
			this.db = db;
			// No longer seed here - seeding is handled by the setup process
			// Just verify the database connection and theme availability
			await this.loadDefaultTheme();
			this.initialized = true;
			logger.info('ThemeManager initialized successfully.');
		} catch (err) {
			const message = `Error in ThemeManager.initialize: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	/**
	 * Load the default theme from database into cache
	 */
	private async loadDefaultTheme(): Promise<void> {
		if (!this.db) throw new Error('Database adapter not initialized.');

		try {
			// Get the active theme from database
			const activeThemeResult = await this.db.themes.getActive();

			if (activeThemeResult.success && activeThemeResult.data) {
				this.defaultThemeCache = activeThemeResult.data;
				logger.debug('Default theme loaded from database');
			} else {
				// If no active theme found, get all themes and use the default one
				const allThemes = await this.db.themes.getAllThemes();
				if (Array.isArray(allThemes) && allThemes.length > 0) {
					this.defaultThemeCache = allThemes.find((t) => t.isDefault) || allThemes[0];
					logger.debug('Using first available theme as default');
				} else {
					logger.warn('No themes found in database. Theme seeding may be needed.');
					this.defaultThemeCache = null;
				}
			}
		} catch (error) {
			logger.error('Failed to load default theme from database:', error);
			this.defaultThemeCache = null;
		}
	}

	/**
	 * Get fallback theme configuration from database settings
	 */
	private async getFallbackThemeFromSettings(): Promise<Theme | null> {
		if (!this.db?.systemPreferences) return null;

		try {
			const themeSettings = await this.db.systemPreferences.getMany(['DEFAULT_THEME_NAME', 'DEFAULT_THEME_PATH'], 'system');

			if (themeSettings.success && themeSettings.data) {
				const name = themeSettings.data.DEFAULT_THEME_NAME;
				const path = themeSettings.data.DEFAULT_THEME_PATH;

				if (name && path) {
					// Create a minimal theme object from settings
					return {
						_id: 'fallback' as DatabaseId, // Temporary ID
						name: String(name),
						path: String(path),
						isActive: false,
						isDefault: true,
						config: {
							tailwindConfigPath: '',
							assetsPath: ''
						},
						createdAt: new Date().toISOString() as ISODateString,
						updatedAt: new Date().toISOString() as ISODateString
					};
				}
			}
		} catch (error) {
			logger.debug('Could not load theme settings from database:', error);
		}

		return null;
	}

	public async getTheme(tenantId?: string): Promise<Theme> {
		if (!this.initialized || !this.db) {
			throw new Error('ThemeManager is not initialized.');
		}
		// TODO: Re-enable when multi-tenant config is available in database settings
		// Check if multi-tenant mode is enabled via database settings
		// const multiTenantSetting = await this.db.systemPreferences?.get('MULTI_TENANT', 'system');
		// if (multiTenantSetting?.success && multiTenantSetting.data && !tenantId) {
		// 	throw new Error('Tenant ID is required to get theme in multi-tenant mode.');
		// }

		const cacheKey = tenantId || 'global';
		if (this.tenantThemes.has(cacheKey)) {
			return this.tenantThemes.get(cacheKey)!;
		}

		// Try to get theme from database first
		let dbTheme: Theme | null = null;

		try {
			// If tenant-specific theme is requested, try to get it
			// For now, we'll use the active theme since tenant-specific themes
			// might need additional database schema
			const activeThemeResult = await this.db.themes.getActive();
			if (activeThemeResult.success && activeThemeResult.data) {
				dbTheme = activeThemeResult.data;
			}
		} catch (error) {
			logger.warn('Failed to get active theme from database:', error);
		}

		// If no theme from database, try cached default
		if (!dbTheme && this.defaultThemeCache) {
			dbTheme = this.defaultThemeCache;
		}

		// If still no theme, try fallback from settings
		if (!dbTheme) {
			dbTheme = await this.getFallbackThemeFromSettings();
		}

		// If we have a theme, cache it
		if (dbTheme) {
			this.tenantThemes.set(cacheKey, dbTheme);
			return dbTheme;
		}

		// Final fallback - use the compile-time DEFAULT_THEME to avoid hard failure
		logger.warn('No theme found in database or settings, using DEFAULT_THEME fallback.', { tenantId });
		this.tenantThemes.set(cacheKey, DEFAULT_THEME);
		return DEFAULT_THEME;
	}
	public async setTheme(theme: Theme, tenantId?: string): Promise<void> {
		try {
			if (!this.initialized || !this.db) {
				throw new Error('ThemeManager is not initialized.');
			}
			// TODO: Re-enable when multi-tenant config is available in database settings
			// Check if multi-tenant mode is enabled via database settings
			// const multiTenantSetting = await this.db.systemPreferences?.get('MULTI_TENANT', 'system');
			// if (multiTenantSetting?.success && multiTenantSetting.data && !tenantId) {
			// 	throw new Error('Tenant ID is required to set theme in multi-tenant mode.');
			// }

			// Use the proper database interface method to set default theme
			const setDefaultResult = await this.db.themes.setDefault(theme._id);

			if (!setDefaultResult.success) {
				throw new Error(setDefaultResult.error?.message || 'Failed to set theme as default');
			}

			// Update cache
			const cacheKey = tenantId || 'global';
			this.tenantThemes.set(cacheKey, theme);
			this.defaultThemeCache = theme;

			logger.info(`Theme updated to: ${theme.name}`, { tenantId });
		} catch (err) {
			const message = `Error in ThemeManager.setTheme: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { tenantId });
			throw error(500, message);
		}
	}
}
