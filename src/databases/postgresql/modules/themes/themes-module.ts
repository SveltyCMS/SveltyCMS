/**
 * @file src/databases/postgresql/modules/themes/themes-module.ts
 * @description Theme management module for PostgreSQL
 */

import { eq } from 'drizzle-orm';
import type { DatabaseId, DatabaseResult, Theme } from '../../../db-interface';
import type { AdapterCore } from '../../adapter/adapter-core';
import * as schema from '../../schema';
import * as utils from '../../utils';
import { isoDateStringToDate, nowISODateString } from '@src/utils/date-utils';

export class ThemesModule {
	private readonly core: AdapterCore;

	constructor(core: AdapterCore) {
		this.core = core;
	}

	private get db() {
		return this.core.db!;
	}

	async setupThemeModels(): Promise<void> {
		// No-op for SQL
	}

	async getActive(): Promise<DatabaseResult<Theme>> {
		return this.core.wrap(async () => {
			const [result] = await this.db.select().from(schema.themes).where(eq(schema.themes.isActive, true)).limit(1);
			if (!result) {
				throw new Error('No active theme found');
			}
			return utils.convertDatesToISO(result) as unknown as Theme;
		}, 'GET_ACTIVE_THEME_FAILED');
	}

	async setDefault(themeId: DatabaseId): Promise<DatabaseResult<void>> {
		return this.core.wrap(async () => {
			await this.db.update(schema.themes).set({ isDefault: false });
			await this.db
				.update(schema.themes)
				.set({ isDefault: true })
				.where(eq(schema.themes._id, themeId as string));
		}, 'SET_DEFAULT_THEME_FAILED');
	}

	async install(theme: Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<Theme>> {
		return this.core.wrap(async () => {
			const id = utils.generateId();
			const now = isoDateStringToDate(nowISODateString());
			const [result] = await this.db
				.insert(schema.themes)
				.values({
					...theme,
					_id: id,
					createdAt: now,
					updatedAt: now
				} as typeof schema.themes.$inferInsert)
				.returning();
			return utils.convertDatesToISO(result) as unknown as Theme;
		}, 'INSTALL_THEME_FAILED');
	}

	async uninstall(themeId: DatabaseId): Promise<DatabaseResult<void>> {
		return this.core.wrap(async () => {
			await this.db.delete(schema.themes).where(eq(schema.themes._id, themeId as string));
		}, 'UNINSTALL_THEME_FAILED');
	}

	async update(themeId: DatabaseId, theme: Partial<Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>>): Promise<DatabaseResult<Theme>> {
		return this.core.wrap(async () => {
			const [result] = await this.db
				.update(schema.themes)
				.set({ ...theme, updatedAt: isoDateStringToDate(nowISODateString()) })
				.where(eq(schema.themes._id, themeId as string))
				.returning();
			return utils.convertDatesToISO(result) as unknown as Theme;
		}, 'UPDATE_THEME_FAILED');
	}

	async getAllThemes(): Promise<Theme[]> {
		if (!this.db) {
			return [];
		}
		try {
			const results = await this.db.select().from(schema.themes);
			return utils.convertArrayDatesToISO(results) as unknown as Theme[];
		} catch (_error) {
			return [];
		}
	}

	async storeThemes(themes: Theme[]): Promise<void> {
		if (!this.db || themes.length === 0) {
			return;
		}
		const now = isoDateStringToDate(nowISODateString());
		const values = themes.map((t) => ({
			...t,
			createdAt: t.createdAt ? new Date(t.createdAt) : now,
			updatedAt: t.updatedAt ? new Date(t.updatedAt) : now
		}));
		await this.db
			.insert(schema.themes)
			.values(values as (typeof schema.themes.$inferInsert)[])
			.onConflictDoNothing();
	}

	async ensure(theme: Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>): Promise<Theme> {
		const [existing] = await this.db.select().from(schema.themes).where(eq(schema.themes.name, theme.name)).limit(1);
		if (existing) {
			return utils.convertDatesToISO(existing) as unknown as Theme;
		}
		const res = await this.install(theme);
		if (!res.success) {
			throw res.error;
		}
		return res.data;
	}

	async getDefaultTheme(_tenantId?: string): Promise<DatabaseResult<Theme | null>> {
		return this.core.wrap(async () => {
			const [result] = await this.db.select().from(schema.themes).where(eq(schema.themes.isDefault, true)).limit(1);
			return result ? (utils.convertDatesToISO(result) as unknown as Theme) : null;
		}, 'GET_DEFAULT_THEME_FAILED');
	}
}
