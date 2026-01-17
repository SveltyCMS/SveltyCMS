import { error } from '@sveltejs/kit';
import { d as dateToISODateString } from './dateUtils.js';
import { logger } from './logger.js';
const DEFAULT_THEME = {
	_id: '670e8b8c4d123456789abcde',
	// Matches the seeded theme ID
	path: '',
	// Default path
	name: 'SveltyCMSTheme',
	isActive: false,
	isDefault: true,
	config: {
		tailwindConfigPath: '',
		assetsPath: ''
	},
	createdAt: dateToISODateString(/* @__PURE__ */ new Date()),
	updatedAt: dateToISODateString(/* @__PURE__ */ new Date())
};
class ThemeManager {
	static instance;
	themeCache = /* @__PURE__ */ new Map();
	// Single cache for all themes
	db = null;
	initialized = false;
	constructor() {}
	static getInstance() {
		if (!ThemeManager.instance) {
			ThemeManager.instance = new ThemeManager();
		}
		return ThemeManager.instance;
	}
	isInitialized() {
		return this.initialized;
	}
	async initialize(db) {
		if (this.initialized) {
			logger.debug('ThemeManager already initialized, skipping.');
			return;
		}
		try {
			this.db = db;
			await this.loadAndCacheDefaultTheme();
			this.initialized = true;
		} catch (err) {
			const message = `Error in ThemeManager.initialize: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}
	/**
	 * Load the default theme from database and cache it
	 */
	async loadAndCacheDefaultTheme() {
		if (!this.db) throw new Error('Database adapter not initialized.');
		try {
			const allThemes = await this.db.themes.getAllThemes();
			if (!Array.isArray(allThemes) || allThemes.length === 0) {
				logger.warn('No themes found in database. Using DEFAULT_THEME fallback.');
				this.themeCache.set('global', DEFAULT_THEME);
				return;
			}
			const defaultTheme = allThemes.find((t) => t.isActive) || allThemes.find((t) => t.isDefault) || allThemes[0];
			this.themeCache.set('global', defaultTheme);
			logger.debug(`Default theme cached: ${defaultTheme.name}`);
		} catch (err) {
			logger.error('Failed to load themes from database:', err);
			this.themeCache.set('global', DEFAULT_THEME);
		}
	}
	async getTheme(tenantId) {
		if (!this.initialized || !this.db) {
			throw new Error('ThemeManager is not initialized.');
		}
		const cacheKey = tenantId || 'global';
		if (this.themeCache.has(cacheKey)) {
			return this.themeCache.get(cacheKey);
		}
		if (tenantId) {
			logger.debug(`No tenant-specific theme for ${tenantId}, using global theme`);
			const globalTheme = this.themeCache.get('global');
			if (globalTheme) {
				return globalTheme;
			}
		}
		logger.warn('No cached theme found, using DEFAULT_THEME fallback.');
		return DEFAULT_THEME;
	}
	async setTheme(theme, tenantId) {
		if (!this.initialized || !this.db) {
			throw new Error('ThemeManager is not initialized.');
		}
		try {
			const setDefaultResult = await this.db.themes.setDefault(theme._id);
			if (!setDefaultResult.success) {
				throw new Error(setDefaultResult.error?.message || 'Failed to set theme as default');
			}
			const cacheKey = tenantId || 'global';
			this.themeCache.set(cacheKey, theme);
			logger.info(`Theme updated to: ${theme.name}`, { tenantId: tenantId || 'global' });
		} catch (err) {
			const message = `Error in ThemeManager.setTheme: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { tenantId });
			throw error(500, message);
		}
	}
	/**
	 * Clear cache and reload themes from database
	 */
	async refresh() {
		if (!this.initialized || !this.db) {
			throw new Error('ThemeManager is not initialized.');
		}
		this.themeCache.clear();
		await this.loadAndCacheDefaultTheme();
		logger.debug('ThemeManager cache refreshed.');
	}
}
export { DEFAULT_THEME as D, ThemeManager as T };
//# sourceMappingURL=themeManager.js.map
