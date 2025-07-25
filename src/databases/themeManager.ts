/**
 * @file src/databases/themeManager.ts
 * @description Theme manager for the CMS, utilizing a database-agnostic interface and now multi-tenant aware.
 */
import type { Theme } from './dbInterface';
import type { dbInterface } from './dbInterface';
import { error } from '@sveltejs/kit';
import { privateEnv } from '@root/config/private';

// System Logger
import { logger } from '@utils/logger.svelte';

// Default theme
export const DEFAULT_THEME: Theme = {
	_id: '62f2d6fd1234567890abcdef', // A valid 24-character hex string
	name: 'SveltyCMSTheme',
	path: '/src/themes/SveltyCMS/SveltyCMSTheme.css',
	isDefault: true,
	createdAt: new Date(),
	updatedAt: new Date()
};

export class ThemeManager {
	private static instance: ThemeManager;
	private tenantThemes: Map<string, Theme> = new Map(); // Use a Map to store themes per tenant
	private db: dbInterface | null = null;
	private initialized: boolean = false;

	private constructor() {}

	public static getInstance(): ThemeManager {
		if (!ThemeManager.instance) {
			ThemeManager.instance = new ThemeManager();
		}
		return ThemeManager.instance;
	}

	public async initialize(db: dbInterface): Promise<void> {
		try {
			if (this.initialized) {
				return;
			}
			this.db = db; // Initial load is now just a seeding step, not loading a specific theme into memory
			await this.seedDefaultTheme();
			this.initialized = true;
			logger.info('ThemeManager initialized successfully.');
		} catch (err) {
			const message = `Error in ThemeManager.initialize: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	} // Seed a global default theme if none exist

	private async seedDefaultTheme(): Promise<void> {
		if (!this.db) throw new Error('Database adapter not initialized.');
		const themes = await this.db.themes.getAllThemes(); // This checks for any theme globally
		if (!Array.isArray(themes) || themes.length === 0) {
			logger.info('No themes found in database. Seeding default theme.');
			await this.db.themes.storeThemes([DEFAULT_THEME]);
		}
	} // Get the current theme for a specific tenant

	public async getTheme(tenantId?: string): Promise<Theme> {
		if (!this.initialized || !this.db) {
			throw new Error('ThemeManager is not initialized.');
		}
		if (privateEnv.MULTI_TENANT && !tenantId) {
			throw new Error('Tenant ID is required to get theme in multi-tenant mode.');
		}

		const cacheKey = tenantId || 'global';
		if (this.tenantThemes.has(cacheKey)) {
			return this.tenantThemes.get(cacheKey)!;
		}

		// If not cached, fetch from DB
		const dbTheme = await this.db.getDefaultTheme(tenantId);
		if (dbTheme) {
			this.tenantThemes.set(cacheKey, dbTheme);
			return dbTheme;
		}

		// Fallback to the global default theme if no tenant-specific theme is set
		logger.warn('No default theme found for tenant, using global fallback.', { tenantId });
		return DEFAULT_THEME;
	} // Update the current theme for a specific tenant

	public async setTheme(theme: Theme, tenantId?: string): Promise<void> {
		try {
			if (!this.initialized || !this.db) {
				throw new Error('ThemeManager is not initialized.');
			}
			if (privateEnv.MULTI_TENANT && !tenantId) {
				throw new Error('Tenant ID is required to set theme in multi-tenant mode.');
			} // The `storeThemes` might need to be tenant-aware if themes can be customized per tenant
			// await this.db.storeThemes([theme], tenantId);

			await this.db.setDefaultTheme(theme.name, tenantId);
			const cacheKey = tenantId || 'global';
			this.tenantThemes.set(cacheKey, theme);
			logger.info(`Theme updated to: ${theme.name}`, { tenantId });
		} catch (err) {
			const message = `Error in ThemeManager.setTheme: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { tenantId });
			throw error(500, message);
		}
	}
}
