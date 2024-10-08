/**
 * @file src/databases/themeManager.ts
 * @description Theme manager for the CMS, utilizing a database-agnostic interface.
 */
import type { Theme } from './dbInterface';
import type { dbInterface } from './dbInterface';
import { error } from '@sveltejs/kit';

// System Logger
import { logger } from '@utils/logger';

// Default theme
export const DEFAULT_THEME: Theme = {
	_id: '62f2d6fd1234567890abcdef', // A valid 24-character hex string
	name: 'SveltyCMSTheme',
	path: '/src/themes/SveltyCMS/SveltyCMSTheme.css',
	isDefault: true,
	createdAt: Math.floor(Date.now() / 1000),
	updatedAt: Math.floor(Date.now() / 1000)
};

export class ThemeManager {
	private static instance: ThemeManager;
	private currentTheme: Theme | null = null;
	private db: dbInterface | null = null;
	private initialized: boolean = false;

	private constructor() {}

	// Get the singleton instance of ThemeManager
	public static getInstance(): ThemeManager {
		if (!ThemeManager.instance) {
			ThemeManager.instance = new ThemeManager();
		}
		return ThemeManager.instance;
	}

	// Initialize the ThemeManager with a database adapter
	public async initialize(db: dbInterface): Promise<void> {
		try {
			if (this.initialized) {
				logger.warn('ThemeManager is already initialized.');
				return;
			}

			this.db = db;
			await this.loadDefaultTheme();
			this.initialized = true;
			logger.info('ThemeManager initialized successfully.');
		} catch (err) {
			const message = `Error in ThemeManager.initialize: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Load default theme from database or use fallback
	private async loadDefaultTheme(): Promise<void> {
		try {
			if (!this.db) {
				throw new Error('Database adapter not initialized. Call initialize() first.');
			}

			logger.debug('Attempting to load default theme from database...');
			const dbTheme = await this.db.getDefaultTheme();

			if (dbTheme && typeof dbTheme === 'object' && 'name' in dbTheme) {
				this.currentTheme = dbTheme as Theme;
				logger.info(`Loaded default theme from database: ${this.currentTheme.name}`);
			} else {
				logger.warn('No valid default theme found in database. Using fallback.');
				this.currentTheme = DEFAULT_THEME;
				await this.db.storeThemes([this.currentTheme]);
				logger.info('Fallback theme saved to database.');
			}

			if (!this.currentTheme) {
				logger.error('Failed to set a current theme. This should never happen.');
				this.currentTheme = DEFAULT_THEME;
			}
		} catch (err) {
			const message = `Error in ThemeManager.loadDefaultTheme: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			this.currentTheme = DEFAULT_THEME;
			logger.info('Using fallback theme due to error.');
			try {
				await this.db!.storeThemes([this.currentTheme]);
				logger.info('Fallback theme saved to database.');
			} catch (saveErr) {
				const saveMessage = `Error saving fallback theme: ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`;
				logger.error(saveMessage);
			}
		}
	}

	// Get the current theme as a serialized object
	public getTheme(): Theme {
		if (!this.initialized) {
			const message = 'ThemeManager is not initialized. Call initialize() first.';
			logger.warn(message);
		}
		return this.currentTheme || DEFAULT_THEME;
	}

	// Update the current theme
	public async setTheme(theme: Theme): Promise<void> {
		try {
			if (!this.initialized || !this.db) {
				throw new Error('ThemeManager is not initialized. Call initialize() first.');
			}

			await this.db.storeThemes([theme]);
			this.currentTheme = theme;
			logger.info(`Theme updated to: ${theme.name}`);
		} catch (err) {
			const message = `Error in ThemeManager.setTheme: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}
}
