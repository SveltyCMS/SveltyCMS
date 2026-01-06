/**
 * @file src/databases/mariadb/operations/batchModule.ts
 * @description Batch operations module for MariaDB
 *
 * Features:
 * - Execute batch operations
 * - Bulk insert
 * - Bulk update
 * - Bulk delete
 * - Bulk upsert
 */

import { eq, inArray } from 'drizzle-orm';
import type { BaseEntity, DatabaseId, DatabaseResult, DatabaseError, BatchOperation, BatchResult } from '../../dbInterface';
import { AdapterCore } from '../adapter/adapterCore';
import * as utils from '../utils';

export class BatchModule {
	private core: AdapterCore;

	constructor(core: AdapterCore) {
		this.core = core;
	}

	private get db() {
		return (this.core as any).db;
	}

	private get crud() {
		return (this.core as any).crud;
	}

	async execute<T>(operations: BatchOperation<T>[]): Promise<DatabaseResult<BatchResult<T>>> {
		return (this.core as any).wrap(async () => {
			const results: Array<DatabaseResult<T>> = [];
			let totalProcessed = 0;
			const errors: DatabaseError[] = [];

			for (const op of operations) {
				try {
					let res: DatabaseResult<any>;
					switch (op.operation) {
						case 'insert':
							res = await this.crud.insert(op.collection, op.data as any);
							break;
						case 'update':
							if (!op.id) throw new Error('ID required for update operation');
							res = await this.crud.update(op.collection, op.id, op.data as any);
							break;
						case 'delete':
							if (!op.id) throw new Error('ID required for delete operation');
							res = await this.crud.delete(op.collection, op.id);
							break;
						case 'upsert':
							if (!op.query || !op.data) throw new Error('Query and data required for upsert operation');
							res = await this.crud.upsert(op.collection, op.query as any, op.data as any);
							break;
						default:
							throw new Error(`Unsupported batch operation: ${op.operation}`);
					}

					results.push(res);
					if (res.success) {
						totalProcessed++;
					} else {
						errors.push(res.error!);
					}
				} catch (error) {
					const dbError = utils.createDatabaseError('BATCH_OP_FAILED', error instanceof Error ? error.message : String(error), error);
					results.push({ success: false, message: dbError.message, error: dbError });
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
		return (this.core as any).wrap(async () => {
			const table = (this.core as any).getTable(collection);
			let modifiedCount = 0;
			for (const update of updates) {
				const result = await this.db
					.update(table)
					.set({ ...update.data, updatedAt: new Date() } as any)
					.where(eq(table._id, update.id));
				modifiedCount += result[0].affectedRows;
			}
			return { modifiedCount };
		}, 'BULK_UPDATE_FAILED');
	}

	async bulkDelete(collection: string, ids: DatabaseId[]): Promise<DatabaseResult<{ deletedCount: number }>> {
		return (this.core as any).wrap(async () => {
			const table = (this.core as any).getTable(collection);
			const result = await this.db.delete(table).where(inArray(table._id, ids));
			return { deletedCount: result[0].affectedRows };
		}, 'BULK_DELETE_FAILED');
	}

	async bulkUpsert<T extends BaseEntity>(collection: string, items: Array<Partial<T> & { id?: DatabaseId }>): Promise<DatabaseResult<T[]>> {
		const mappedItems = items.map((item) => ({
			query: { _id: item.id } as any,
			data: item as any
		}));
		return this.crud.upsertMany(collection, mappedItems) as any;
	}
}
