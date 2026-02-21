/**
 * @file src/databases/postgresql/crud/crud-module.ts
 * @description CRUD operations module for PostgreSQL.
 *
 * Features:
 * - findOne
 * - findMany
 * - findByIds
 * - insert
 * - update
 * - delete
 * - upsert
 * - count
 * - exists
 * - insertMany
 */

import { count, eq, inArray } from 'drizzle-orm';
import type { BaseEntity, DatabaseId, DatabaseResult, QueryFilter } from '../../db-interface';
import type { AdapterCore } from '../adapter/adapter-core';
import * as utils from '../utils';
import { nowISODateString } from '@src/utils/date-utils';

export class CrudModule {
	private readonly core: AdapterCore;

	constructor(core: AdapterCore) {
		this.core = core;
	}

	private get db() {
		return this.core.db!;
	}

	async findOne<T extends BaseEntity>(
		collection: string,
		query: QueryFilter<T>,
		_options?: { fields?: (keyof T)[] }
	): Promise<DatabaseResult<T | null>> {
		return this.core.wrap(async () => {
			const table = this.core.getTable(collection);
			const where = this.core.mapQuery(table, query as Record<string, unknown>) as import('drizzle-orm').SQL | undefined;
			const results = await this.db
				.select()
				.from(table as unknown as import('drizzle-orm/pg-core').PgTable)
				.where(where)
				.limit(1);
			if (results.length === 0) {
				return null;
			}
			return utils.convertDatesToISO(results[0]) as T;
		}, 'CRUD_FIND_ONE_FAILED');
	}

	async findMany<T extends BaseEntity>(
		collection: string,
		query: QueryFilter<T>,
		options?: { limit?: number; offset?: number; fields?: (keyof T)[] }
	): Promise<DatabaseResult<T[]>> {
		return this.core.wrap(async () => {
			const table = this.core.getTable(collection);
			const where = this.core.mapQuery(table, query as Record<string, unknown>) as import('drizzle-orm').SQL | undefined;
			let q = this.db
				.select()
				.from(table as unknown as import('drizzle-orm/pg-core').PgTable)
				.where(where)
				.$dynamic();
			if (options?.limit) {
				q = q.limit(options.limit);
			}
			if (options?.offset) {
				q = q.offset(options.offset);
			}
			const results = await q;
			return utils.convertArrayDatesToISO(results) as T[];
		}, 'CRUD_FIND_MANY_FAILED');
	}

	async findByIds<T extends BaseEntity>(collection: string, ids: DatabaseId[], _options?: { fields?: (keyof T)[] }): Promise<DatabaseResult<T[]>> {
		return this.core.wrap(async () => {
			const table = this.core.getTable(collection);
			const results = await this.db
				.select()
				.from(table as unknown as import('drizzle-orm/pg-core').PgTable)
				.where(inArray((table as unknown as { _id: import('drizzle-orm/pg-core').PgColumn })._id, ids as string[]));
			return utils.convertArrayDatesToISO(results) as T[];
		}, 'CRUD_FIND_BY_IDS_FAILED');
	}

	async insert<T extends BaseEntity>(collection: string, data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<T>> {
		return this.core.wrap(async () => {
			const table = this.core.getTable(collection);
			const id = (data as Partial<T>)._id || (utils.generateId() as DatabaseId);
			const now = nowISODateString();
			const values = {
				...data,
				_id: id,
				createdAt: now,
				updatedAt: now
			};
			const [result] = await this.db
				.insert(table as unknown as import('drizzle-orm/pg-core').PgTable)
				.values(values as unknown as Record<string, unknown>)
				.returning();
			return utils.convertDatesToISO(result as Record<string, unknown>) as T;
		}, 'CRUD_INSERT_FAILED');
	}

	async update<T extends BaseEntity>(
		collection: string,
		id: DatabaseId,
		data: Partial<Omit<T, 'createdAt' | 'updatedAt'>>
	): Promise<DatabaseResult<T>> {
		return this.core.wrap(async () => {
			const table = this.core.getTable(collection);
			const now = nowISODateString();
			const [result] = await this.db
				.update(table as unknown as import('drizzle-orm/pg-core').PgTable)
				.set({ ...data, updatedAt: now } as unknown as Record<string, unknown>)
				.where(eq((table as unknown as { _id: import('drizzle-orm/pg-core').PgColumn })._id, id as string))
				.returning();
			return utils.convertDatesToISO(result as Record<string, unknown>) as T;
		}, 'CRUD_UPDATE_FAILED');
	}

	async delete(collection: string, id: DatabaseId): Promise<DatabaseResult<void>> {
		return this.core.wrap(async () => {
			const table = this.core.getTable(collection);
			await this.db
				.delete(table as unknown as import('drizzle-orm/pg-core').PgTable)
				.where(eq((table as unknown as { _id: import('drizzle-orm/pg-core').PgColumn })._id, id as string));
		}, 'CRUD_DELETE_FAILED');
	}

	async upsert<T extends BaseEntity>(
		collection: string,
		query: QueryFilter<T>,
		data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>
	): Promise<DatabaseResult<T>> {
		return this.core.wrap(async () => {
			const table = this.core.getTable(collection);
			const where = this.core.mapQuery(table, query as Record<string, unknown>) as import('drizzle-orm').SQL | undefined;
			const existing = await this.db
				.select()
				.from(table as unknown as import('drizzle-orm/pg-core').PgTable)
				.where(where)
				.limit(1);
			if (existing.length > 0) {
				const res = await this.update<T>(collection, (existing[0] as unknown as { _id: string })._id as unknown as DatabaseId, data as Partial<T>);
				if (!res.success) {
					throw res.error;
				}
				return res.data;
			}
			const res = await this.insert<T>(collection, data);
			if (!res.success) {
				throw res.error;
			}
			return res.data;
		}, 'CRUD_UPSERT_FAILED');
	}

	async count<T extends BaseEntity>(collection: string, query: QueryFilter<T> = {}): Promise<DatabaseResult<number>> {
		return this.core.wrap(async () => {
			const table = this.core.getTable(collection);
			const where = this.core.mapQuery(table, query as Record<string, unknown>) as import('drizzle-orm').SQL | undefined;
			const [result] = await this.db
				.select({ count: count() })
				.from(table as unknown as import('drizzle-orm/pg-core').PgTable)
				.where(where);
			return Number((result as { count: number }).count);
		}, 'CRUD_COUNT_FAILED');
	}

	async exists<T extends BaseEntity>(collection: string, query: QueryFilter<T>): Promise<DatabaseResult<boolean>> {
		return this.core.wrap(async () => {
			const res = await this.count(collection, query);
			if (!res.success) {
				throw res.error;
			}
			return (res.data ?? 0) > 0;
		}, 'CRUD_EXISTS_FAILED');
	}

	async insertMany<T extends BaseEntity>(collection: string, data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>[]): Promise<DatabaseResult<T[]>> {
		return this.core.wrap(async () => {
			if (data.length === 0) {
				return [];
			}
			const table = this.core.getTable(collection);
			const now = nowISODateString();
			const values = data.map((d) => ({
				...d,
				_id: utils.generateId() as DatabaseId,
				createdAt: now,
				updatedAt: now
			}));
			const results = await this.db
				.insert(table as unknown as import('drizzle-orm/pg-core').PgTable)
				.values(values as unknown as Record<string, unknown>[])
				.returning();
			return utils.convertArrayDatesToISO(results) as unknown as T[];
		}, 'CRUD_INSERT_MANY_FAILED');
	}

	async updateMany<T extends BaseEntity>(
		collection: string,
		query: QueryFilter<T>,
		data: Partial<Omit<T, 'createdAt' | 'updatedAt'>>
	): Promise<DatabaseResult<{ modifiedCount: number }>> {
		return this.core.wrap(async () => {
			const table = this.core.getTable(collection);
			const where = this.core.mapQuery(table, query as Record<string, unknown>) as import('drizzle-orm').SQL | undefined;
			const now = nowISODateString();
			const results = await this.db
				.update(table as unknown as import('drizzle-orm/pg-core').PgTable)
				.set({ ...data, updatedAt: now } as unknown as Record<string, unknown>)
				.where(where)
				.returning();
			return { modifiedCount: results.length };
		}, 'CRUD_UPDATE_MANY_FAILED');
	}

	async deleteMany(collection: string, query: QueryFilter<BaseEntity>): Promise<DatabaseResult<{ deletedCount: number }>> {
		return this.core.wrap(async () => {
			const table = this.core.getTable(collection);
			const where = this.core.mapQuery(table, query as Record<string, unknown>) as import('drizzle-orm').SQL | undefined;
			const results = await this.db
				.delete(table as unknown as import('drizzle-orm/pg-core').PgTable)
				.where(where)
				.returning();
			return { deletedCount: results.length };
		}, 'CRUD_DELETE_MANY_FAILED');
	}

	async upsertMany<T extends BaseEntity>(
		collection: string,
		items: Array<{
			query: QueryFilter<T>;
			data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>;
		}>
	): Promise<DatabaseResult<{ upsertedCount: number; modifiedCount: number }>> {
		return this.core.wrap(async () => {
			let upsertedCount = 0;
			let modifiedCount = 0;
			for (const item of items) {
				const existing = await this.findOne(collection, item.query);
				if (existing.success && existing.data) {
					await this.update(collection, existing.data._id, item.data as Partial<T>);
					modifiedCount++;
				} else {
					await this.insert(collection, item.data);
					upsertedCount++;
				}
			}
			return { upsertedCount, modifiedCount };
		}, 'CRUD_UPSERT_MANY_FAILED');
	}

	async aggregate<R = unknown>(collection: string, _pipeline: unknown[]): Promise<DatabaseResult<R[]>> {
		return this.core.notImplemented(`crud.aggregate for ${collection}`);
	}
}
