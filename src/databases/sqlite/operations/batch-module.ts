/**
 * @file src/databases/sqlite/operations/batch-module.ts
 * @description Batch operations module for SQLite
 *
 * Features:
 * - Execute batch operations
 * - Bulk insert
 * - Bulk update
 * - Bulk delete
 * - Bulk upsert
 */

import { isoDateStringToDate, nowISODateString } from '@src/utils/date-utils';
import { eq, inArray } from 'drizzle-orm';
import type { BaseEntity, BatchOperation, BatchResult, DatabaseError, DatabaseId, DatabaseResult } from '../../db-interface';
import type { AdapterCore } from '../adapter/adapter-core';
import * as utils from '../utils';

export class BatchModule {
	private readonly core: AdapterCore;

	constructor(core: AdapterCore) {
		this.core = core;
	}

	private get db() {
		return this.core.db!;
	}

	private get crud() {
		return this.core.crud;
	}

	async execute<T>(operations: BatchOperation<T>[]): Promise<DatabaseResult<BatchResult<T>>> {
		return this.core.wrap(async () => {
			const results: DatabaseResult<T>[] = [];
			let totalProcessed = 0;
			const errors: DatabaseError[] = [];

			for (const op of operations) {
				try {
					let res: DatabaseResult<T | void>;
					switch (op.operation) {
						case 'insert':
							res = await this.crud.insert(op.collection, op.data as Omit<T & BaseEntity, '_id' | 'createdAt' | 'updatedAt'>);
							break;
						case 'update':
							if (!op.id) {
								throw new Error('ID required for update operation');
							}
							res = await this.crud.update(op.collection, op.id, op.data as Partial<Omit<T & BaseEntity, '_id' | 'createdAt' | 'updatedAt'>>);
							break;
						case 'delete':
							if (!op.id) {
								throw new Error('ID required for delete operation');
							}
							res = await this.crud.delete(op.collection, op.id);
							break;
						case 'upsert':
							if (!(op.query && op.data)) {
								throw new Error('Query and data required for upsert operation');
							}
							res = await this.crud.upsert(
								op.collection,
								op.query as import('../../db-interface').QueryFilter<T & BaseEntity>,
								op.data as Omit<T & BaseEntity, '_id' | 'createdAt' | 'updatedAt'>
							);
							break;
						default:
							throw new Error(`Unsupported batch operation: ${op.operation}`);
					}

					results.push(res as DatabaseResult<T>);
					if (res.success) {
						totalProcessed++;
					} else {
						errors.push(res.error!);
					}
				} catch (error) {
					const dbError = utils.createDatabaseError('BATCH_OP_FAILED', error instanceof Error ? error.message : String(error), error);
					results.push({
						success: false,
						message: dbError.message,
						error: dbError
					});
					errors.push(dbError);
				}
			}

			return {
				success: errors.length === 0,
				results,
				totalProcessed,
				errors
			};
		}, 'BATCH_EXECUTE_FAILED');
	}

	async bulkInsert<T extends BaseEntity>(collection: string, items: Omit<T, '_id' | 'createdAt' | 'updatedAt'>[]): Promise<DatabaseResult<T[]>> {
		return this.crud.insertMany(collection, items);
	}

	async bulkUpdate<T extends BaseEntity>(
		collection: string,
		updates: Array<{ id: DatabaseId; data: Partial<T> }>
	): Promise<DatabaseResult<{ modifiedCount: number }>> {
		return this.core.wrap(async () => {
			const table = this.core.getTable(collection);
			let modifiedCount = 0;
			for (const update of updates) {
				const result = await this.db
					.update(table as any)
					.set({ ...update.data, updatedAt: isoDateStringToDate(nowISODateString()) } as unknown as Record<string, unknown>)
					.where(eq((table as any)._id, update.id as string));
				modifiedCount += (result as unknown as { changes: number }).changes;
			}
			return { modifiedCount };
		}, 'BULK_UPDATE_FAILED');
	}

	async bulkDelete(collection: string, ids: DatabaseId[]): Promise<DatabaseResult<{ deletedCount: number }>> {
		return this.core.wrap(async () => {
			const table = this.core.getTable(collection);
			const result = await this.db.delete(table as any).where(inArray((table as any)._id, ids as string[]));
			return { deletedCount: (result as unknown as { changes: number }).changes };
		}, 'BULK_DELETE_FAILED');
	}

	async bulkUpsert<T extends BaseEntity>(collection: string, items: Array<Partial<T> & { id?: DatabaseId }>): Promise<DatabaseResult<T[]>> {
		const mappedItems = items.map((item) => ({
			query: { _id: item.id } as unknown as import('../../db-interface').QueryFilter<T>,
			data: item as unknown as Omit<T, '_id' | 'createdAt' | 'updatedAt'>
		}));
		return this.crud.upsertMany<T>(collection, mappedItems) as unknown as DatabaseResult<T[]>;
	}
}
