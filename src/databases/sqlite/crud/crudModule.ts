/**
 * @file src/databases/mariadb/crud/crudModule.ts
 * @description CRUD operations module for MariaDB.
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

import { eq, inArray, count } from 'drizzle-orm';
import type { BaseEntity, DatabaseId, DatabaseResult, QueryFilter } from '../../dbInterface';
import { AdapterCore } from '../adapter/adapterCore';
import * as utils from '../utils';

export class CrudModule {
	private core: AdapterCore;

	constructor(core: AdapterCore) {
		this.core = core;
	}

	private get db() {
		return (this.core as any).db;
	}

	async findOne<T extends BaseEntity>(
		collection: string,
		query: QueryFilter<T>,
		_options?: { fields?: (keyof T)[] }
	): Promise<DatabaseResult<T | null>> {
		return (this.core as any).wrap(async () => {
			const table = (this.core as any).getTable(collection);
			const where = (this.core as any).mapQuery(table, query);
			const results = await this.db.select().from(table).where(where).limit(1);
			if (results.length === 0) return null;
			return utils.convertDatesToISO(results[0]) as T;
		}, 'CRUD_FIND_ONE_FAILED');
	}

	async findMany<T extends BaseEntity>(
		collection: string,
		query: QueryFilter<T>,
		options?: { limit?: number; offset?: number; fields?: (keyof T)[] }
	): Promise<DatabaseResult<T[]>> {
		return (this.core as any).wrap(async () => {
			const table = (this.core as any).getTable(collection);
			const where = (this.core as any).mapQuery(table, query);
			let q = this.db.select().from(table).where(where);
			if (options?.limit) q = q.limit(options.limit);
			if (options?.offset) q = q.offset(options.offset);
			const results = await q;
			return utils.convertArrayDatesToISO(results) as T[];
		}, 'CRUD_FIND_MANY_FAILED');
	}

	async findByIds<T extends BaseEntity>(collection: string, ids: DatabaseId[], _options?: { fields?: (keyof T)[] }): Promise<DatabaseResult<T[]>> {
		return (this.core as any).wrap(async () => {
			const table = (this.core as any).getTable(collection);
			const results = await this.db.select().from(table).where(inArray(table._id, ids));
			return utils.convertArrayDatesToISO(results) as T[];
		}, 'CRUD_FIND_BY_IDS_FAILED');
	}

	async insert<T extends BaseEntity>(collection: string, data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<T>> {
		return (this.core as any).wrap(async () => {
			const table = (this.core as any).getTable(collection);
			const id = (data as any)._id || utils.generateId();
			const now = new Date();
			const values = { ...data, _id: id, createdAt: now, updatedAt: now } as any;
			await this.db.insert(table).values(values);
			const result = await this.db.select().from(table).where(eq(table._id, id)).limit(1);
			return utils.convertDatesToISO(result[0]) as T;
		}, 'CRUD_INSERT_FAILED');
	}

	async update<T extends BaseEntity>(
		collection: string,
		id: DatabaseId,
		data: Partial<Omit<T, 'createdAt' | 'updatedAt'>>
	): Promise<DatabaseResult<T>> {
		return (this.core as any).wrap(async () => {
			const table = (this.core as any).getTable(collection);
			const now = new Date();
			await this.db
				.update(table)
				.set({ ...data, updatedAt: now } as any)
				.where(eq(table._id, id));
			const result = await this.db.select().from(table).where(eq(table._id, id)).limit(1);
			return utils.convertDatesToISO(result[0]) as T;
		}, 'CRUD_UPDATE_FAILED');
	}

	async delete(collection: string, id: DatabaseId): Promise<DatabaseResult<void>> {
		return (this.core as any).wrap(async () => {
			const table = (this.core as any).getTable(collection);
			await this.db.delete(table).where(eq(table._id, id));
		}, 'CRUD_DELETE_FAILED');
	}

	async upsert<T extends BaseEntity>(
		collection: string,
		query: QueryFilter<T>,
		data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>
	): Promise<DatabaseResult<T>> {
		return (this.core as any).wrap(async () => {
			const table = (this.core as any).getTable(collection);
			const where = (this.core as any).mapQuery(table, query);
			const existing = await this.db.select().from(table).where(where).limit(1);
			if (existing.length > 0) {
				const res = await this.update<T>(collection, existing[0]._id, data as any);
				if (!res.success) throw res.error;
				return res.data;
			} else {
				const res = await this.insert<T>(collection, data);
				if (!res.success) throw res.error;
				return res.data;
			}
		}, 'CRUD_UPSERT_FAILED');
	}

	async count<T extends BaseEntity>(collection: string, query: QueryFilter<T> = {}): Promise<DatabaseResult<number>> {
		return (this.core as any).wrap(async () => {
			const table = (this.core as any).getTable(collection);
			const where = (this.core as any).mapQuery(table, query);
			const [result] = await this.db.select({ count: count() }).from(table).where(where);
			return Number(result.count);
		}, 'CRUD_COUNT_FAILED');
	}

	async exists<T extends BaseEntity>(collection: string, query: QueryFilter<T>): Promise<DatabaseResult<boolean>> {
		return (this.core as any).wrap(async () => {
			const res = await this.count(collection, query);
			if (!res.success) throw res.error;
			return (res.data ?? 0) > 0;
		}, 'CRUD_EXISTS_FAILED');
	}

	async insertMany<T extends BaseEntity>(collection: string, data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>[]): Promise<DatabaseResult<T[]>> {
		return (this.core as any).wrap(async () => {
			if (data.length === 0) return [];
			const table = (this.core as any).getTable(collection);
			const now = new Date();
			const values = data.map((d) => ({
				...d,
				_id: utils.generateId(),
				createdAt: now,
				updatedAt: now
			})) as any[];
			await this.db.insert(table).values(values);
			const ids = values.map((v) => v._id);
			const results = await this.db.select().from(table).where(inArray(table._id, ids));
			return utils.convertArrayDatesToISO(results) as T[];
		}, 'CRUD_INSERT_MANY_FAILED');
	}

	async updateMany<T extends BaseEntity>(
		collection: string,
		query: QueryFilter<T>,
		data: Partial<Omit<T, 'createdAt' | 'updatedAt'>>
	): Promise<DatabaseResult<{ modifiedCount: number }>> {
		return (this.core as any).wrap(async () => {
			const table = (this.core as any).getTable(collection);
			const where = (this.core as any).mapQuery(table, query);
			const now = new Date();
			const result = await this.db
				.update(table)
				.set({ ...data, updatedAt: now } as any)
				.where(where);
			return { modifiedCount: result.changes };
		}, 'CRUD_UPDATE_MANY_FAILED');
	}

	async deleteMany(collection: string, query: QueryFilter<BaseEntity>): Promise<DatabaseResult<{ deletedCount: number }>> {
		return (this.core as any).wrap(async () => {
			const table = (this.core as any).getTable(collection);
			const where = (this.core as any).mapQuery(table, query);
			const result = await this.db.delete(table).where(where);
			return { deletedCount: result.changes };
		}, 'CRUD_DELETE_MANY_FAILED');
	}

	async upsertMany<T extends BaseEntity>(
		collection: string,
		items: Array<{ query: QueryFilter<T>; data: Omit<T, '_id' | 'createdAt' | 'updatedAt'> }>
	): Promise<DatabaseResult<{ upsertedCount: number; modifiedCount: number }>> {
		return (this.core as any).wrap(async () => {
			let upsertedCount = 0;
			let modifiedCount = 0;
			for (const item of items) {
				const existing = await this.findOne(collection, item.query);
				if (existing.success && existing.data) {
					await this.update(collection, existing.data._id, item.data as any);
					modifiedCount++;
				} else {
					await this.insert(collection, item.data);
					upsertedCount++;
				}
			}
			return { upsertedCount, modifiedCount };
		}, 'CRUD_UPSERT_MANY_FAILED');
	}

	async aggregate<_T extends BaseEntity, R = any>(_collection: string, _pipeline: any[]): Promise<DatabaseResult<R[]>> {
		return (this.core as any).notImplemented('crud.aggregate');
	}
}
