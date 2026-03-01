/**
 * @file src/databases/mariadb/crud/crud-module.ts
 * @description CRUD operations module for MariaDB.
 */

import { nowISODateString } from '@src/utils/date-utils';
import { safeQuery } from '@src/utils/security/safe-query';
import { count, eq, inArray } from 'drizzle-orm';
import type { BaseEntity, DatabaseId, DatabaseResult, QueryFilter, EntityCreate, EntityUpdate } from '../../db-interface';
import type { AdapterCore } from '../adapter/adapter-core';
import * as utils from '../utils';

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
		options?: { fields?: (keyof T)[]; tenantId?: string | null; bypassTenantCheck?: boolean }
	): Promise<DatabaseResult<T | null>> {
		return this.core.wrap(async () => {
			const secureQuery = safeQuery(query, options?.tenantId, { bypassTenantCheck: options?.bypassTenantCheck });
			const table = this.core.getTable(collection);
			const where = this.core.mapQuery(table, secureQuery as Record<string, unknown>) as import('drizzle-orm').SQL | undefined;
			const results = await this.db
				.select()
				.from(table as unknown as import('drizzle-orm/mysql-core').MySqlTable)
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
		options?: {
			limit?: number;
			offset?: number;
			fields?: (keyof T)[];
			tenantId?: string | null;
			bypassTenantCheck?: boolean;
		}
	): Promise<DatabaseResult<T[]>> {
		return this.core.wrap(async () => {
			const secureQuery = safeQuery(query, options?.tenantId, { bypassTenantCheck: options?.bypassTenantCheck });
			const table = this.core.getTable(collection);
			const where = this.core.mapQuery(table, secureQuery as Record<string, unknown>) as import('drizzle-orm').SQL | undefined;
			let q = this.db
				.select()
				.from(table as unknown as import('drizzle-orm/mysql-core').MySqlTable)
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

	async findByIds<T extends BaseEntity>(
		collection: string,
		ids: DatabaseId[],
		options?: { fields?: (keyof T)[]; tenantId?: string | null; bypassTenantCheck?: boolean }
	): Promise<DatabaseResult<T[]>> {
		return this.core.wrap(async () => {
			const query = safeQuery({ _id: { $in: ids } } as unknown as QueryFilter<T>, options?.tenantId, {
				bypassTenantCheck: options?.bypassTenantCheck
			});
			const table = this.core.getTable(collection);
			const where = this.core.mapQuery(table, query as Record<string, unknown>) as import('drizzle-orm').SQL | undefined;
			const results = await this.db
				.select()
				.from(table as unknown as import('drizzle-orm/mysql-core').MySqlTable)
				.where(where);
			return utils.convertArrayDatesToISO(results) as T[];
		}, 'CRUD_FIND_BY_IDS_FAILED');
	}

	async insert<T extends BaseEntity>(
		collection: string,
		data: EntityCreate<T>,
		tenantId?: string | null,
		_bypassTenantCheck?: boolean
	): Promise<DatabaseResult<T>> {
		return this.core.wrap(async () => {
			const table = this.core.getTable(collection);
			const id = (data as Partial<T>)._id || (utils.generateId() as DatabaseId);
			const now = nowISODateString();
			const values = {
				...data,
				_id: id,
				tenantId: tenantId || (data as any).tenantId,
				createdAt: now,
				updatedAt: now
			};
			await this.db.insert(table as unknown as import('drizzle-orm/mysql-core').MySqlTable).values(values as unknown as Record<string, unknown>);

			// Reload to get the inserted record
			const result = await this.db
				.select()
				.from(table as unknown as import('drizzle-orm/mysql-core').MySqlTable)
				.where(eq((table as unknown as { _id: import('drizzle-orm/mysql-core').MySqlColumn })._id, id as string))
				.limit(1);
			return utils.convertDatesToISO(result[0] as Record<string, unknown>) as T;
		}, 'CRUD_INSERT_FAILED');
	}

	async update<T extends BaseEntity>(
		collection: string,
		id: DatabaseId,
		data: EntityUpdate<T>,
		tenantId?: string | null,
		bypassTenantCheck?: boolean
	): Promise<DatabaseResult<T>> {
		return this.core.wrap(async () => {
			const secureQuery = safeQuery({ _id: id } as unknown as QueryFilter<T>, tenantId, { bypassTenantCheck });
			const table = this.core.getTable(collection);
			const where = this.core.mapQuery(table, secureQuery as Record<string, unknown>) as import('drizzle-orm').SQL | undefined;
			const now = nowISODateString();
			await this.db
				.update(table as unknown as import('drizzle-orm/mysql-core').MySqlTable)
				.set({ ...data, updatedAt: now } as unknown as Record<string, unknown>)
				.where(where);

			// Reload to get the updated record
			const result = await this.db
				.select()
				.from(table as unknown as import('drizzle-orm/mysql-core').MySqlTable)
				.where(where)
				.limit(1);
			return utils.convertDatesToISO(result[0] as Record<string, unknown>) as T;
		}, 'CRUD_UPDATE_FAILED');
	}

	async delete(collection: string, id: DatabaseId, tenantId?: string | null, bypassTenantCheck?: boolean): Promise<DatabaseResult<void>> {
		return this.core.wrap(async () => {
			const query = safeQuery({ _id: id } as unknown as QueryFilter<BaseEntity>, tenantId, { bypassTenantCheck });
			const table = this.core.getTable(collection);
			const where = this.core.mapQuery(table, query as Record<string, unknown>) as import('drizzle-orm').SQL | undefined;
			await this.db.delete(table as unknown as import('drizzle-orm/mysql-core').MySqlTable).where(where);
		}, 'CRUD_DELETE_FAILED');
	}

	async upsert<T extends BaseEntity>(
		collection: string,
		query: QueryFilter<T>,
		data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>,
		tenantId?: string | null,
		bypassTenantCheck?: boolean
	): Promise<DatabaseResult<T>> {
		return this.core.wrap(async () => {
			const secureQuery = safeQuery(query, tenantId, { bypassTenantCheck });
			const table = this.core.getTable(collection);
			const where = this.core.mapQuery(table, secureQuery as Record<string, unknown>) as import('drizzle-orm').SQL | undefined;
			const existing = await this.db
				.select()
				.from(table as unknown as import('drizzle-orm/mysql-core').MySqlTable)
				.where(where)
				.limit(1);
			if (existing.length > 0) {
				const res = await this.update<T>(
					collection,
					(existing[0] as unknown as { _id: string })._id as unknown as DatabaseId,
					data as Partial<T>,
					tenantId,
					bypassTenantCheck
				);
				if (!res.success) {
					throw res.error;
				}
				return res.data;
			}
			const res = await this.insert<T>(collection, data, tenantId, bypassTenantCheck);
			if (!res.success) {
				throw res.error;
			}
			return res.data;
		}, 'CRUD_UPSERT_FAILED');
	}

	async count<T extends BaseEntity>(
		collection: string,
		query: QueryFilter<T> = {},
		tenantId?: string | null,
		bypassTenantCheck?: boolean
	): Promise<DatabaseResult<number>> {
		return this.core.wrap(async () => {
			const secureQuery = safeQuery(query, tenantId, { bypassTenantCheck });
			const table = this.core.getTable(collection);
			const where = this.core.mapQuery(table, secureQuery as Record<string, unknown>) as import('drizzle-orm').SQL | undefined;
			const [result] = await this.db
				.select({ count: count() })
				.from(table as unknown as import('drizzle-orm/mysql-core').MySqlTable)
				.where(where);
			return Number((result as unknown as { count: number }).count);
		}, 'CRUD_COUNT_FAILED');
	}

	async exists<T extends BaseEntity>(
		collection: string,
		query: QueryFilter<T>,
		tenantId?: string | null,
		bypassTenantCheck?: boolean
	): Promise<DatabaseResult<boolean>> {
		return this.core.wrap(async () => {
			const res = await this.count(collection, query, tenantId, bypassTenantCheck);
			if (!res.success) {
				throw res.error;
			}
			return (res.data ?? 0) > 0;
		}, 'CRUD_EXISTS_FAILED');
	}

	async insertMany<T extends BaseEntity>(
		collection: string,
		data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>[],
		tenantId?: string | null,
		_bypassTenantCheck?: boolean
	): Promise<DatabaseResult<T[]>> {
		return this.core.wrap(async () => {
			if (data.length === 0) {
				return [];
			}
			const table = this.core.getTable(collection);
			const now = nowISODateString();
			const values = data.map((d) => ({
				...d,
				_id: utils.generateId() as DatabaseId,
				tenantId: tenantId || (d as any).tenantId,
				createdAt: now,
				updatedAt: now
			}));
			await this.db.insert(table as unknown as import('drizzle-orm/mysql-core').MySqlTable).values(values as unknown as Record<string, unknown>[]);

			const ids = values.map((v) => v._id as string);
			const results = await this.db
				.select()
				.from(table as unknown as import('drizzle-orm/mysql-core').MySqlTable)
				.where(inArray((table as unknown as { _id: import('drizzle-orm/mysql-core').MySqlColumn })._id, ids));
			return utils.convertArrayDatesToISO(results as Record<string, unknown>[]).map((row) => row) as unknown as T[];
		}, 'CRUD_INSERT_MANY_FAILED');
	}

	async updateMany<T extends BaseEntity>(
		collection: string,
		query: QueryFilter<T>,
		data: EntityUpdate<T>,
		tenantId?: string | null,
		bypassTenantCheck?: boolean
	): Promise<DatabaseResult<{ modifiedCount: number }>> {
		return this.core.wrap(async () => {
			const table = this.core.getTable(collection);
			const secureQuery = safeQuery(query, tenantId, { bypassTenantCheck });
			const where = this.core.mapQuery(table, secureQuery as Record<string, unknown>) as import('drizzle-orm').SQL | undefined;
			const now = nowISODateString();
			const [result] = await this.db
				.update(table as unknown as import('drizzle-orm/mysql-core').MySqlTable)
				.set({ ...data, updatedAt: now } as unknown as Record<string, unknown>)
				.where(where);
			return { modifiedCount: (result as unknown as { affectedRows: number }).affectedRows };
		}, 'CRUD_UPDATE_MANY_FAILED');
	}

	async deleteMany(
		collection: string,
		query: QueryFilter<BaseEntity>,
		tenantId?: string | null,
		bypassTenantCheck?: boolean
	): Promise<DatabaseResult<{ deletedCount: number }>> {
		return this.core.wrap(async () => {
			const table = this.core.getTable(collection);
			const secureQuery = safeQuery(query, tenantId, { bypassTenantCheck });
			const where = this.core.mapQuery(table, secureQuery as Record<string, unknown>) as import('drizzle-orm').SQL | undefined;
			const [result] = await this.db.delete(table as unknown as import('drizzle-orm/mysql-core').MySqlTable).where(where);
			return { deletedCount: (result as unknown as { affectedRows: number }).affectedRows };
		}, 'CRUD_DELETE_MANY_FAILED');
	}

	async upsertMany<T extends BaseEntity>(
		collection: string,
		items: Array<{
			query: QueryFilter<T>;
			data: EntityCreate<T>;
		}>,
		tenantId?: string | null,
		bypassTenantCheck?: boolean
	): Promise<DatabaseResult<{ upsertedCount: number; modifiedCount: number }>> {
		return this.core.wrap(async () => {
			let upsertedCount = 0;
			let modifiedCount = 0;
			for (const item of items) {
				const existing = await this.findOne(collection, item.query, { tenantId, bypassTenantCheck });
				if (existing.success && existing.data) {
					await this.update(collection, existing.data._id, item.data as Partial<T>, tenantId, bypassTenantCheck);
					modifiedCount++;
				} else {
					await this.insert(collection, item.data, tenantId, bypassTenantCheck);
					upsertedCount++;
				}
			}
			return { upsertedCount, modifiedCount };
		}, 'CRUD_UPSERT_MANY_FAILED');
	}

	async aggregate<R = unknown>(
		collection: string,
		_pipeline: unknown[],
		_tenantId?: string | null,
		_bypassTenantCheck?: boolean
	): Promise<DatabaseResult<R[]>> {
		return this.core.notImplemented(`crud.aggregate for ${collection}`);
	}
}
