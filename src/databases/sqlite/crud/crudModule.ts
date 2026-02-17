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

import { safeQuery } from '@src/utils/security/safeQuery';
import { count, eq, inArray } from 'drizzle-orm';
import type { BaseEntity, DatabaseId, DatabaseResult, QueryFilter } from '../../dbInterface';
import type { AdapterCore } from '../adapter/adapterCore';
import * as utils from '../utils';

export class CrudModule {
	private readonly core: AdapterCore;

	constructor(core: AdapterCore) {
		this.core = core;
	}

	private get db() {
		return (this.core as any).db;
	}

	/**
	 * Packs fields that don't exist in the physical table into a JSON 'data' blob.
	 * This is used for dynamic collections to support arbitrary fields without migrations.
	 */
	private packData(table: any, data: any): any {
		const result: any = {};
		const existingData = data.data || {};
		const jsonBlob: any = typeof existingData === 'string' ? JSON.parse(existingData) : { ...existingData };

		for (const [key, value] of Object.entries(data)) {
			if (key === 'data') {
				continue;
			}
			if (table[key]) {
				result[key] = value;
			} else {
				jsonBlob[key] = value;
			}
		}
		result.data = jsonBlob;
		return result;
	}

	/**
	 * Unpacks fields from the JSON 'data' blob back into the top-level object.
	 */
	private unpackData(row: any): any {
		if (!row) {
			return row;
		}
		const { data, ...rest } = row;
		const jsonBlob = data ? (typeof data === 'string' ? JSON.parse(data) : data) : {};
		// Result of convertDatesToISO is already applied before this is called or after
		return { ...jsonBlob, ...rest };
	}

	async findOne<T extends BaseEntity>(
		collection: string,
		query: QueryFilter<T>,
		options?: { fields?: (keyof T)[]; tenantId?: string | null }
	): Promise<DatabaseResult<T | null>> {
		return (this.core as any).wrap(async () => {
			const secureQuery = safeQuery(query, options?.tenantId);
			const table = (this.core as any).getTable(collection);
			const where = (this.core as any).mapQuery(table, secureQuery);
			const results = await this.db.select().from(table).where(where).limit(1);
			if (results.length === 0) {
				return null;
			}
			const row = utils.convertDatesToISO(results[0]);
			return this.unpackData(row) as T;
		}, 'CRUD_FIND_ONE_FAILED');
	}

	async findMany<T extends BaseEntity>(
		collection: string,
		query: QueryFilter<T>,
		options?: { limit?: number; offset?: number; fields?: (keyof T)[]; tenantId?: string | null }
	): Promise<DatabaseResult<T[]>> {
		return (this.core as any).wrap(async () => {
			const secureQuery = safeQuery(query, options?.tenantId);
			const table = (this.core as any).getTable(collection);
			const where = (this.core as any).mapQuery(table, secureQuery);
			let q = this.db.select().from(table).where(where);
			if (options?.limit) {
				q = q.limit(options.limit);
			}
			if (options?.offset) {
				q = q.offset(options.offset);
			}
			const results = await q;
			return utils.convertArrayDatesToISO(results).map((row) => this.unpackData(row)) as T[];
		}, 'CRUD_FIND_MANY_FAILED');
	}

	async findByIds<T extends BaseEntity>(
		collection: string,
		ids: DatabaseId[],
		options?: { fields?: (keyof T)[]; tenantId?: string | null }
	): Promise<DatabaseResult<T[]>> {
		return (this.core as any).wrap(async () => {
			const query = safeQuery({ _id: { $in: ids } } as any, options?.tenantId);
			const table = (this.core as any).getTable(collection);
			const where = (this.core as any).mapQuery(table, query);
			const results = await this.db.select().from(table).where(where);
			return utils.convertArrayDatesToISO(results).map((row) => this.unpackData(row)) as T[];
		}, 'CRUD_FIND_BY_IDS_FAILED');
	}

	async insert<T extends BaseEntity>(
		collection: string,
		data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>,
		tenantId?: string | null
	): Promise<DatabaseResult<T>> {
		return (this.core as any).wrap(async () => {
			const table = (this.core as any).getTable(collection);
			const id = (data as any)._id || utils.generateId();
			const now = new Date();
			const packed = this.packData(table, { ...data, _id: id, tenantId: tenantId || (data as any).tenantId, createdAt: now, updatedAt: now });

			await this.db.insert(table).values(packed);

			const result = await this.db.select().from(table).where(eq(table._id, id)).limit(1);
			const row = utils.convertDatesToISO(result[0]);
			return this.unpackData(row) as T;
		}, 'CRUD_INSERT_FAILED');
	}

	async update<T extends BaseEntity>(
		collection: string,
		id: DatabaseId,
		data: Partial<Omit<T, 'createdAt' | 'updatedAt'>>,
		tenantId?: string | null
	): Promise<DatabaseResult<T>> {
		return (this.core as any).wrap(async () => {
			const query = safeQuery({ _id: id } as any, tenantId);
			const table = (this.core as any).getTable(collection);
			const where = (this.core as any).mapQuery(table, query);
			const now = new Date();
			const packed = this.packData(table, { ...data, updatedAt: now });

			await this.db.update(table).set(packed).where(where);

			const result = await this.db.select().from(table).where(where).limit(1);
			const row = utils.convertDatesToISO(result[0]);
			return this.unpackData(row) as T;
		}, 'CRUD_UPDATE_FAILED');
	}

	async delete(collection: string, id: DatabaseId, tenantId?: string | null): Promise<DatabaseResult<void>> {
		return (this.core as any).wrap(async () => {
			const query = safeQuery({ _id: id } as any, tenantId);
			const table = (this.core as any).getTable(collection);
			const where = (this.core as any).mapQuery(table, query);
			await this.db.delete(table).where(where);
		}, 'CRUD_DELETE_FAILED');
	}

	async upsert<T extends BaseEntity>(
		collection: string,
		query: QueryFilter<T>,
		data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>,
		tenantId?: string | null
	): Promise<DatabaseResult<T>> {
		return (this.core as any).wrap(async () => {
			const secureQuery = safeQuery(query, tenantId);
			const table = (this.core as any).getTable(collection);
			const where = (this.core as any).mapQuery(table, secureQuery);
			const existing = await this.db.select().from(table).where(where).limit(1);
			if (existing.length > 0) {
				const res = await this.update<T>(collection, existing[0]._id, data as any, tenantId);
				if (!res.success) {
					throw res.error;
				}
				return res.data;
			}
			const res = await this.insert<T>(collection, data, tenantId);
			if (!res.success) {
				throw res.error;
			}
			return res.data;
		}, 'CRUD_UPSERT_FAILED');
	}

	async count<T extends BaseEntity>(collection: string, query: QueryFilter<T> = {}, tenantId?: string | null): Promise<DatabaseResult<number>> {
		return (this.core as any).wrap(async () => {
			const secureQuery = safeQuery(query, tenantId);
			const table = (this.core as any).getTable(collection);
			const where = (this.core as any).mapQuery(table, secureQuery);
			const [result] = await this.db.select({ count: count() }).from(table).where(where);
			return Number(result.count);
		}, 'CRUD_COUNT_FAILED');
	}

	async exists<T extends BaseEntity>(collection: string, query: QueryFilter<T>, tenantId?: string | null): Promise<DatabaseResult<boolean>> {
		return (this.core as any).wrap(async () => {
			const res = await this.count(collection, query, tenantId);
			if (!res.success) {
				throw res.error;
			}
			return (res.data ?? 0) > 0;
		}, 'CRUD_EXISTS_FAILED');
	}

	async insertMany<T extends BaseEntity>(
		collection: string,
		data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>[],
		tenantId?: string | null
	): Promise<DatabaseResult<T[]>> {
		return (this.core as any).wrap(async () => {
			if (data.length === 0) {
				return [];
			}
			const table = (this.core as any).getTable(collection);
			const now = new Date();
			const values = data.map((d) => {
				const id = (d as any)._id || utils.generateId();
				return this.packData(table, { ...d, _id: id, tenantId: tenantId || (d as any).tenantId, createdAt: now, updatedAt: now });
			}) as any[];

			await this.db.insert(table).values(values);

			const ids = values.map((v) => v._id);
			const results = await this.db.select().from(table).where(inArray(table._id, ids));
			return utils.convertArrayDatesToISO(results).map((row) => this.unpackData(row)) as T[];
		}, 'CRUD_INSERT_MANY_FAILED');
	}

	async updateMany<T extends BaseEntity>(
		collection: string,
		query: QueryFilter<T>,
		data: Partial<Omit<T, 'createdAt' | 'updatedAt'>>,
		tenantId?: string | null
	): Promise<DatabaseResult<{ modifiedCount: number }>> {
		return (this.core as any).wrap(async () => {
			const secureQuery = safeQuery(query, tenantId);
			const table = (this.core as any).getTable(collection);
			const where = (this.core as any).mapQuery(table, secureQuery);
			const now = new Date();
			const result = await this.db
				.update(table)
				.set({ ...data, updatedAt: now } as any)
				.where(where);
			return { modifiedCount: result.changes };
		}, 'CRUD_UPDATE_MANY_FAILED');
	}

	async deleteMany(collection: string, query: QueryFilter<BaseEntity>, tenantId?: string | null): Promise<DatabaseResult<{ deletedCount: number }>> {
		return (this.core as any).wrap(async () => {
			const secureQuery = safeQuery(query, tenantId);
			const table = (this.core as any).getTable(collection);
			const where = (this.core as any).mapQuery(table, secureQuery);
			const result = await this.db.delete(table).where(where);
			return { deletedCount: result.changes };
		}, 'CRUD_DELETE_MANY_FAILED');
	}

	async upsertMany<T extends BaseEntity>(
		collection: string,
		items: Array<{ query: QueryFilter<T>; data: Omit<T, '_id' | 'createdAt' | 'updatedAt'> }>,
		tenantId?: string | null
	): Promise<DatabaseResult<{ upsertedCount: number; modifiedCount: number }>> {
		return (this.core as any).wrap(async () => {
			let upsertedCount = 0;
			let modifiedCount = 0;
			for (const item of items) {
				const existing = await this.findOne(collection, item.query, { tenantId });
				if (existing.success && existing.data) {
					await this.update(collection, existing.data._id, item.data as any, tenantId);
					modifiedCount++;
				} else {
					await this.insert(collection, item.data, tenantId);
					upsertedCount++;
				}
			}
			return { upsertedCount, modifiedCount };
		}, 'CRUD_UPSERT_MANY_FAILED');
	}

	async aggregate<_T extends BaseEntity, R = any>(_collection: string, _pipeline: any[], _tenantId?: string | null): Promise<DatabaseResult<R[]>> {
		return (this.core as any).notImplemented('crud.aggregate');
	}
}
