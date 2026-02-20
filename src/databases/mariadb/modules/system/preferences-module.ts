/**
 * @file src/databases/mariadb/modules/system/preferences-module.ts
 * @description System preferences module for MariaDB
 *
 * Features:
 * - Get preference
 * - Get preferences
 * - Set preference
 * - Set preferences
 * - Delete preference
 * - Delete preferences
 * - Clear preferences
 */

import { and, eq, inArray } from 'drizzle-orm';
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
		return (this.core as any).db;
	}

	async get<T>(key: string, scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<T | null>> {
		return (this.core as any).wrap(async () => {
			const conditions: any[] = [eq(schema.systemPreferences.key, key)];
			if (scope) {
				conditions.push(eq(schema.systemPreferences.scope, scope));
			}
			if (userId) {
				conditions.push(eq(schema.systemPreferences.userId, userId));
			}

			const [result] = await this.db
				.select()
				.from(schema.systemPreferences)
				.where(and(...conditions))
				.limit(1);

			if (!result) {
				return null;
			}
			return utils.parseJsonField<T>(result.value, null as T);
		}, 'GET_PREFERENCE_FAILED');
	}

	async getMany<T>(keys: string[], scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<Record<string, T>>> {
		return (this.core as any).wrap(async () => {
			const conditions: any[] = [inArray(schema.systemPreferences.key, keys)];
			if (scope) {
				conditions.push(eq(schema.systemPreferences.scope, scope));
			}
			if (userId) {
				conditions.push(eq(schema.systemPreferences.userId, userId));
			}

			const results = await this.db
				.select()
				.from(schema.systemPreferences)
				.where(and(...conditions));

			const prefs: Record<string, T> = {};
			for (const result of results) {
				prefs[result.key] = utils.parseJsonField<T>(result.value, null as T);
			}

			return prefs;
		}, 'GET_PREFERENCES_FAILED');
	}

	async getByCategory<T>(category: string, scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<Record<string, T>>> {
		return (this.core as any).wrap(async () => {
			const conditions: any[] = [eq(schema.systemPreferences.visibility, category)];
			if (scope) {
				conditions.push(eq(schema.systemPreferences.scope, scope));
			}
			if (userId) {
				conditions.push(eq(schema.systemPreferences.userId, userId));
			}

			const results = await this.db
				.select()
				.from(schema.systemPreferences)
				.where(and(...conditions));

			const prefs: Record<string, T> = {};
			for (const result of results) {
				prefs[result.key] = utils.parseJsonField<T>(result.value, null as T);
			}

			return prefs;
		}, 'GET_BY_CATEGORY_FAILED');
	}

	async set<T>(key: string, value: T, scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<void>> {
		return (this.core as any).wrap(async () => {
			const exists = await this.db.select().from(schema.systemPreferences).where(eq(schema.systemPreferences.key, key)).limit(1);

			if (exists.length > 0) {
				await this.db
					.update(schema.systemPreferences)
					.set({ value: value as any, updatedAt: new Date() })
					.where(eq(schema.systemPreferences.key, key));
			} else {
				await this.db.insert(schema.systemPreferences).values({
					_id: utils.generateId(),
					key,
					value: value as any,
					scope: scope || 'system',
					userId: userId || null,
					visibility: 'private',
					createdAt: new Date(),
					updatedAt: new Date()
				});
			}
		}, 'SET_PREFERENCE_FAILED');
	}

	async setMany<T>(
		preferences: Array<{
			key: string;
			value: T;
			scope?: 'user' | 'system';
			userId?: DatabaseId;
		}>
	): Promise<DatabaseResult<void>> {
		return (this.core as any).wrap(async () => {
			for (const pref of preferences) {
				const result = await this.set(pref.key, pref.value, pref.scope, pref.userId);
				if (!result.success) {
					throw new Error(`Failed to set preference ${pref.key}: ${result.message}`);
				}
			}
		}, 'SET_PREFERENCES_FAILED');
	}

	async delete(key: string, scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<void>> {
		return (this.core as any).wrap(async () => {
			const conditions: any[] = [eq(schema.systemPreferences.key, key)];
			if (scope) {
				conditions.push(eq(schema.systemPreferences.scope, scope));
			}
			if (userId) {
				conditions.push(eq(schema.systemPreferences.userId, userId));
			}

			await this.db.delete(schema.systemPreferences).where(and(...conditions));
		}, 'DELETE_PREFERENCE_FAILED');
	}

	async deleteMany(keys: string[], scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<void>> {
		return (this.core as any).wrap(async () => {
			const conditions: any[] = [];
			if (keys.length > 0) {
				conditions.push(inArray(schema.systemPreferences.key, keys));
			}
			if (scope) {
				conditions.push(eq(schema.systemPreferences.scope, scope));
			}
			if (userId) {
				conditions.push(eq(schema.systemPreferences.userId, userId));
			}

			const q = this.db.delete(schema.systemPreferences);
			if (conditions.length > 0) {
				await q.where(and(...conditions));
			} else {
				await q;
			}
		}, 'DELETE_PREFERENCES_FAILED');
	}

	async clear(scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<void>> {
		return (this.core as any).wrap(async () => {
			const conditions: any[] = [];
			if (scope) {
				conditions.push(eq(schema.systemPreferences.scope, scope));
			}
			if (userId) {
				conditions.push(eq(schema.systemPreferences.userId, userId));
			}

			const q = this.db.delete(schema.systemPreferences);
			if (conditions.length > 0) {
				await q.where(and(...conditions));
			} else {
				await q;
			}
		}, 'CLEAR_PREFERENCES_FAILED');
	}
}
