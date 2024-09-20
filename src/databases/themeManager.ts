/**
 * @file src/databases/themeManager.ts
 * @description Theme manager for the CMS, utilizing a database-agnostic interface.
 */

import type { Theme } from './dbInterface';
import type { dbInterface } from './dbInterface';

// System Logs
import logger from '@src/utils/logger';

// Default theme
export const DEFAULT_THEME: Theme = {
	name: 'SveltyCMSTheme',
	path: '/src/themes/SveltyCMS/SveltyCMSTheme.css',
	isDefault: true,
	createdAt: Math.floor(Date.now() / 1000),
	updatedAt: Math.floor(Date.now() / 1000)
};

class ThemeManager {
	private static instance: ThemeManager;
	private currentTheme: Theme | null = null;
	private db: dbInterface | null = null;
	private initialized: boolean = false;

	private constructor() {}

	/**
	 * Get the singleton instance of ThemeManager.
	 */
	public static getInstance(): ThemeManager {
		if (!ThemeManager.instance) {
			ThemeManager.instance = new ThemeManager();
		}
		return ThemeManager.instance;
	}

	/**
	 * Initialize the theme manager with a database adapter.
	 * @param db - The database adapter implementing dbInterface.
	 */
	public async initialize(db: dbInterface): Promise<void> {
		if (this.initialized) {
			logger.warn('ThemeManager is already initialized.');
			return;
		}

		this.db = db;
		await this.loadDefaultTheme();
		this.initialized = true;
		logger.info('ThemeManager initialized successfully.');
	}

	/**
	 * Load the default theme from the database or use the fallback.
	 */
	private async loadDefaultTheme(): Promise<void> {
		if (!this.db) {
			throw new Error('Database adapter not initialized. Call initialize() first.');
		}

		try {
			logger.debug('Attempting to load default theme from database...');
			const dbTheme = await this.db.getDefaultTheme();

			if (dbTheme && typeof dbTheme === 'object' && 'name' in dbTheme) {
				this.currentTheme = dbTheme as Theme;
				logger.info(`Loaded default theme from database: ${this.currentTheme.name}`);
			} else {
				logger.warn('No valid default theme found in database. Using fallback.');
				this.currentTheme = DEFAULT_THEME;
				await this.db.saveTheme(this.currentTheme);
				logger.info('Fallback theme saved to database.');
			}
		} catch (error) {
			logger.error('Error loading default theme:', error);
			this.currentTheme = DEFAULT_THEME;
			logger.info('Using fallback theme due to error.');
		}

		if (!this.currentTheme) {
			logger.error('Failed to set a current theme. This should never happen.');
			this.currentTheme = DEFAULT_THEME;
		}
	}

	/**
	 * Get the current active theme.
	 * @returns The current theme or DEFAULT_THEME if not set.
	 */
	public getTheme(): Theme {
		if (!this.initialized) {
			logger.warn('ThemeManager is not initialized. Call initialize() first.');
		}
		return this.currentTheme || DEFAULT_THEME;
	}

	/**
	 * Update the current theme.
	 * @param theme - The new theme to set as active.
	 */
	public async setTheme(theme: Theme): Promise<void> {
		if (!this.initialized || !this.db) {
			throw new Error('ThemeManager is not initialized. Call initialize() first.');
		}

		try {
			await this.db.saveTheme(theme);
			this.currentTheme = theme;
			logger.info(`Theme updated to: ${theme.name}`);
		} catch (error) {
			logger.error('Error setting new theme:', error);
			throw error;
		}
	}
}

export { ThemeManager };
