/**
 * @file src/databases/mariadb/modules/themes/themes-module.ts
 * @description Themes management module for MariaDB
 *
 * Features:
 * - Get active theme
 * - Set default theme
 * - Install theme
 * - Uninstall theme
 * - Update theme
 * - Get all themes
 * - Store themes
 * - Get default theme
 */

import { isoDateStringToDate, nowISODateString } from '@src/utils/date-utils';
import { logger } from '@src/utils/logger';
import { eq } from 'drizzle-orm';
import type { DatabaseId, DatabaseResult, Theme } from '../../../db-interface';
import type { AdapterCore } from '../../adapter/adapter-core';
import * as schema from '../../schema';
import * as utils from '../../utils';

export class ThemesModule {
	private readonly core: AdapterCore;

	constructor(core: AdapterCore) {
		this.core = core;
	}

	private get db() {
		return this.core.db!;
	}

	async setupThemeModels(): Promise<void> {
		// No-op for SQL - tables created by migrations
		logger.debug('Theme models setup (no-op for SQL)');
	}

	async getActive(): Promise<DatabaseResult<Theme>> {
		return this.core.wrap(async () => {
			const [theme] = await this.db.select().from(schema.themes).where(eq(schema.themes.isActive, true)).limit(1);

			if (!theme) {
				throw utils.createDatabaseError('NOT_FOUND', 'No active theme');
			}

			return utils.convertDatesToISO(theme) as unknown as Theme;
		}, 'GET_ACTIVE_THEME_FAILED');
	}

	async setDefault(themeId: DatabaseId): Promise<DatabaseResult<void>> {
		return this.core.wrap(async () => {
			// Unset all defaults
			await this.db.update(schema.themes).set({ isDefault: false });

			// Set new default
			await this.db.update(schema.themes).set({ isDefault: true, isActive: true }).where(eq(schema.themes._id, themeId));
		}, 'SET_DEFAULT_THEME_FAILED');
	}

	async install(theme: Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<Theme>> {
		return this.core.wrap(async () => {
			const id = utils.generateId() as string;
			await this.db.insert(schema.themes).values({
				_id: id,
				...theme,
				config: theme.config as Record<string, unknown>,
				createdAt: isoDateStringToDate(nowISODateString()),
				updatedAt: isoDateStringToDate(nowISODateString())
			});

			const [inserted] = await this.db.select().from(schema.themes).where(eq(schema.themes._id, id));
			return utils.convertDatesToISO(inserted) as unknown as Theme;
		}, 'INSTALL_THEME_FAILED');
	}

	async uninstall(themeId: DatabaseId): Promise<DatabaseResult<void>> {
		return this.core.wrap(async () => {
			await this.db.delete(schema.themes).where(eq(schema.themes._id, themeId as string));
		}, 'UNINSTALL_THEME_FAILED');
	}

	async update(themeId: DatabaseId, theme: Partial<Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>>): Promise<DatabaseResult<Theme>> {
		return this.core.wrap(async () => {
			await this.db
				.update(schema.themes)
				.set({
					...(theme as Record<string, unknown>),
					config: theme.config as Record<string, unknown>,
					updatedAt: isoDateStringToDate(nowISODateString())
				})
				.where(eq(schema.themes._id, themeId as string));

			const [updated] = await this.db
				.select()
				.from(schema.themes)
				.where(eq(schema.themes._id, themeId as string));
			return utils.convertDatesToISO(updated) as unknown as Theme;
		}, 'UPDATE_THEME_FAILED');
	}

	async getAllThemes(): Promise<Theme[]> {
		if (!this.db) {
			return [];
		}
		try {
			const themes = await this.db.select().from(schema.themes);
			return utils.convertArrayDatesToISO(themes) as unknown as Theme[];
		} catch (error) {
			logger.error('Get all themes failed:', error);
			return [];
		}
	}

	async storeThemes(themes: Theme[]): Promise<void> {
		if (!this.db) {
			throw new Error('Database not connected');
		}
		try {
			for (const theme of themes) {
				const exists = await this.db.select().from(schema.themes).where(eq(schema.themes.name, theme.name)).limit(1);
				if (exists.length === 0) {
					await this.db.insert(schema.themes).values({
						_id: (theme._id || utils.generateId()) as string,
						name: theme.name,
						path: theme.path,
						isActive: theme.isActive,
						isDefault: theme.isDefault,
						config: theme.config as Record<string, unknown>,
						createdAt: isoDateStringToDate(nowISODateString()),
						updatedAt: isoDateStringToDate(nowISODateString())
					});
				}
			}
		} catch (error) {
			logger.error('Store themes failed:', error);
			throw error;
		}
	}

	async getDefaultTheme(_tenantId?: string): Promise<DatabaseResult<Theme | null>> {
		return this.core.wrap(async () => {
			const [theme] = await this.db.select().from(schema.themes).where(eq(schema.themes.isDefault, true)).limit(1);
			return theme ? (utils.convertDatesToISO(theme) as unknown as Theme) : null;
		}, 'GET_DEFAULT_THEME_FAILED');
	}

	async ensure(theme: Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>): Promise<Theme> {
		const exists = await this.db.select().from(schema.themes).where(eq(schema.themes.name, theme.name)).limit(1);
		if (exists.length > 0) {
			return utils.convertDatesToISO(exists[0]) as unknown as Theme;
		}
		const res = await this.install(theme);
		if (!res.success) {
			throw new Error(res.message);
		}
		return res.data;
	}
}
