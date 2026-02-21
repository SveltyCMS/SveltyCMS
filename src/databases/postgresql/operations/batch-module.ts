/**
 * @file src/databases/postgresql/operations/batch-module.ts
 * @description Batch operations module for PostgreSQL
 */

import { inArray } from 'drizzle-orm';
import type { BaseEntity, BatchOperation, BatchResult, DatabaseId, DatabaseResult } from '../../db-interface';
import type { AdapterCore } from '../adapter/adapter-core';

export class BatchModule {
	private readonly core: AdapterCore;

	constructor(core: AdapterCore) {
		this.core = core;
	}

	private get db() {
		return this.core.db!;
	}

	async execute<T>(operations: BatchOperation<T>[]): Promise<DatabaseResult<BatchResult<T>>> {
		return this.core.wrap(async () => {
			const results: DatabaseResult<T>[] = [];
			for (const op of operations) {
				let res: DatabaseResult<T | void>;
				switch (op.operation) {
					case 'insert':
						res = await this.core.crud.insert(op.collection, op.data as Omit<T & BaseEntity, '_id' | 'createdAt' | 'updatedAt'>);
						break;
					case 'update':
						res = await this.core.crud.update(
							op.collection,
							op.id as DatabaseId,
							op.data as Partial<Omit<T & BaseEntity, 'createdAt' | 'updatedAt'>>
						);
						break;
					case 'delete':
						res = (await this.core.crud.delete(op.collection, op.id as DatabaseId)) as unknown as DatabaseResult<void>;
						break;
					case 'upsert':
						res = (await this.core.crud.upsert(
							op.collection,
							op.query || {},
							op.data as Omit<T & BaseEntity, '_id' | 'createdAt' | 'updatedAt'>
						)) as unknown as DatabaseResult<T>;
						break;
					default:
						res = {
							success: false,
							message: `Unknown operation: ${op.operation}`,
							error: { code: 'UNKNOWN_OPERATION', message: `Unknown operation: ${op.operation}` }
						};
				}
				results.push(res as DatabaseResult<T>);
			}
			return {
				success: results.every((r) => r.success),
				results,
				totalProcessed: operations.length,
				errors: results.filter((r) => !r.success).map((r) => (r as Extract<DatabaseResult<T>, { success: false }>).error)
			};
		}, 'BATCH_EXECUTE_FAILED');
	}

	async bulkInsert<T extends BaseEntity>(collection: string, items: Omit<T, '_id' | 'createdAt' | 'updatedAt'>[]): Promise<DatabaseResult<T[]>> {
		return this.core.crud.insertMany<T>(collection, items);
	}

	async bulkUpdate<T extends BaseEntity>(
		collection: string,
		updates: Array<{ id: DatabaseId; data: Partial<T> }>
	): Promise<DatabaseResult<{ modifiedCount: number }>> {
		return this.core.wrap(async () => {
			let modifiedCount = 0;
			for (const update of updates) {
				const res = await this.core.crud.update(collection, update.id, update.data as Partial<Omit<T, 'createdAt' | 'updatedAt'>>);
				if (res.success) {
					modifiedCount++;
				}
			}
			return { modifiedCount };
		}, 'BULK_UPDATE_FAILED');
	}

	async bulkDelete(collection: string, ids: DatabaseId[]): Promise<DatabaseResult<{ deletedCount: number }>> {
		return this.core.wrap(async () => {
			const table = this.core.getTable(collection);
			const results = await this.db
				.delete(table as unknown as import('drizzle-orm/pg-core').PgTable)
				.where(inArray((table as unknown as { _id: import('drizzle-orm/pg-core').PgColumn })._id, ids as string[]))
				.returning();
			return { deletedCount: results.length };
		}, 'BULK_DELETE_FAILED');
	}

	async bulkUpsert<T extends BaseEntity>(collection: string, items: Array<Partial<T> & { id?: DatabaseId }>): Promise<DatabaseResult<T[]>> {
		return this.core.wrap(async () => {
			const results: T[] = [];
			for (const item of items) {
				const query = { _id: item.id || (item as unknown as { _id: DatabaseId })._id } as unknown as import('../../db-interface').QueryFilter<T>;
				const res = await this.core.crud.upsert(collection, query, item as unknown as Omit<T, '_id' | 'createdAt' | 'updatedAt'>);
				if (res.success) {
					results.push(res.data as T);
				}
			}
			return results;
		}, 'BULK_UPSERT_FAILED');
	}
}
