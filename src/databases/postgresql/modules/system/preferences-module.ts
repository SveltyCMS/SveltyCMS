/**
 * @file src/databases/postgresql/modules/system/preferences-module.ts
 * @description System preferences module for PostgreSQL
 */

import { isoDateStringToDate, nowISODateString } from '@src/utils/date-utils';
import { eq, inArray } from 'drizzle-orm';
import type { DatabaseId, DatabaseResult } from '../../../db-interface';
import type { AdapterCore } from '../../adapter/adapter-core';
import * as schema from '../../schema';
import * as utils from '../../utils';

export class PreferencesModule {
	private readonly core: AdapterCore;

	constructor(core: AdapterCore) {
		this.core = core;
	}

	private get db() {
		return this.core.db!;
	}

	async get<T>(key: string, _scope?: 'user' | 'system', _userId?: DatabaseId): Promise<DatabaseResult<T | null>> {
		return this.core.wrap(async () => {
			const [result] = await this.db.select().from(schema.systemPreferences).where(eq(schema.systemPreferences.key, key)).limit(1);
			return (result?.value as T) ?? null;
		}, 'GET_PREFERENCE_FAILED');
	}

	async getByCategory<T>(category: string, _scope?: 'user' | 'system', _userId?: DatabaseId): Promise<DatabaseResult<Record<string, T>>> {
		return this.core.wrap(async () => {
			const results = await this.db.select().from(schema.systemPreferences).where(eq(schema.systemPreferences.category, category));
			const map: Record<string, T> = {};
			results.forEach((r) => {
				map[r.key] = r.value as T;
			});
			return map;
		}, 'GET_PREFERENCES_BY_CATEGORY_FAILED');
	}

	async set<T>(key: string, value: T, _scope?: 'user' | 'system', _userId?: DatabaseId, category?: string): Promise<DatabaseResult<void>> {
		return this.core.wrap(async () => {
			const now = isoDateStringToDate(nowISODateString());
			await this.db
				.insert(schema.systemPreferences)
				.values({
					_id: utils.generateId(),
					key,
					value,
					category: category || 'general',
					createdAt: now,
					updatedAt: now
				})
				.onConflictDoUpdate({
					target: schema.systemPreferences.key,
					set: { value, updatedAt: now }
				});
		}, 'SET_PREFERENCE_FAILED');
	}

	async delete(key: string, _scope?: 'user' | 'system', _userId?: DatabaseId): Promise<DatabaseResult<void>> {
		return this.core.wrap(async () => {
			await this.db.delete(schema.systemPreferences).where(eq(schema.systemPreferences.key, key));
		}, 'DELETE_PREFERENCE_FAILED');
	}

	async getMany<T>(keys: string[], _scope?: 'user' | 'system', _userId?: DatabaseId): Promise<DatabaseResult<Record<string, T>>> {
		return this.core.wrap(async () => {
			if (!keys || keys.length === 0) {
				return {};
			}
			const results = await this.db.select().from(schema.systemPreferences).where(inArray(schema.systemPreferences.key, keys));
			const map: Record<string, T> = {};
			results.forEach((r) => {
				map[r.key] = r.value as T;
			});
			return map;
		}, 'GET_MANY_PREFERENCES_FAILED');
	}

	async setMany<T>(
		preferences: Array<{
			key: string;
			value: T;
			scope?: 'user' | 'system';
			userId?: DatabaseId;
			category?: string;
		}>
	): Promise<DatabaseResult<void>> {
		return this.core.wrap(async () => {
			for (const pref of preferences) {
				await this.set(pref.key, pref.value, pref.scope, pref.userId, pref.category);
			}
		}, 'SET_MANY_PREFERENCES_FAILED');
	}

	async deleteMany(keys: string[], _scope?: 'user' | 'system', _userId?: DatabaseId): Promise<DatabaseResult<void>> {
		return this.core.wrap(async () => {
			if (!keys || keys.length === 0) {
				return;
			}
			await this.db.delete(schema.systemPreferences).where(inArray(schema.systemPreferences.key, keys));
		}, 'DELETE_MANY_PREFERENCES_FAILED');
	}

	async clear(_scope?: 'user' | 'system', _userId?: DatabaseId): Promise<DatabaseResult<void>> {
		return this.core.wrap(async () => {
			await this.db.delete(schema.systemPreferences);
		}, 'CLEAR_PREFERENCES_FAILED');
	}
}
