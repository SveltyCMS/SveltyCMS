/**
 * @file src/databases/mongodb/methods/crudMethods.ts
 * @description Generic, reusable CRUD operations for any MongoDB collection.
 *
 * Responsibility: ALL generic CRUD operations for any collection/model.
 *
 * This module provides:
 * - findOne, findMany, findByIds
 * - insert, update, upsert
 * - delete, deleteMany
 * - count, exists
 * - aggregate (for complex queries)
 * - Batch operations (upsertMany)
 *
 * Does NOT handle:
 * - Schema/model creation (use collectionMethods.ts)
 * - CMS-specific logic (use contentMethods.ts)
 * - Business rules or validation (handled by callers)
 *
 * This class is designed to be instantiated once per collection/model,
 * providing a clean, type-safe interface for all data operations.
 */

import { type Model, type PipelineStage, type UpdateQuery, mongo } from 'mongoose';
import type { BaseEntity, DatabaseId, DatabaseResult, QueryFilter } from '../../dbInterface';
import { createDatabaseError, generateId, processDates } from './mongoDBUtils';
import { nowISODateString } from '@utils/dateUtils';

/**
 * MongoCrudMethods provides generic CRUD operations for a Mongoose model.
 *
 * Each instance is tied to a specific model and provides all standard
 * database operations in a consistent, error-handled manner.
 *
 * @template T - The entity type (must extend BaseEntity)
 */

export class MongoCrudMethods<T extends BaseEntity> {
	public readonly model: Model<T>;

	constructor(model: Model<T>) {
		this.model = model;
	}

	async findOne(query: QueryFilter<T>, options: { fields?: (keyof T)[] } = {}): Promise<DatabaseResult<T | null>> {
		try {
			const result = await this.model.findOne(query, options.fields?.join(' ')).lean().exec();
			if (!result) return { success: true, data: null };
			return { success: true, data: processDates(result) as T };
		} catch (error) {
			return {
				success: false,
				message: `Failed to find document in ${this.model.modelName}`,
				error: createDatabaseError(error, 'FIND_ONE_ERROR', `Failed to find document in ${this.model.modelName}`)
			};
		}
	}

	async findById(id: DatabaseId): Promise<DatabaseResult<T | null>> {
		try {
			const result = await this.model.findById(id).lean().exec();
			if (!result) return { success: true, data: null };
			return { success: true, data: processDates(result) as T };
		} catch (error) {
			return {
				success: false,
				message: `Failed to find document by ID in ${this.model.modelName}`,
				error: createDatabaseError(error, 'FIND_BY_ID_ERROR', `Failed to find document by ID in ${this.model.modelName}`)
			};
		}
	}

	async findByIds(ids: DatabaseId[]): Promise<DatabaseResult<T[]>> {
		try {
			const results = await this.model
				.find({ _id: { $in: ids } } as QueryFilter<T>)
				.lean()
				.exec();
			return { success: true, data: processDates(results) as T[] };
		} catch (error) {
			return {
				success: false,
				message: `Failed to find documents by IDs in ${this.model.modelName}`,
				error: createDatabaseError(error, 'FIND_BY_IDS_ERROR', `Failed to find documents by IDs in ${this.model.modelName}`)
			};
		}
	}

	async findMany(
		query: QueryFilter<T>,
		options: { limit?: number; skip?: number; sort?: { [key: string]: 'asc' | 'desc' | 1 | -1 }; fields?: (keyof T)[] } = {}
	): Promise<DatabaseResult<T[]>> {
		try {
			const results = await this.model
				.find(query, options.fields?.join(' '))
				.sort(options.sort || {})
				.skip(options.skip ?? 0)
				.limit(options.limit ?? 0)
				.lean()
				.exec();
			return { success: true, data: processDates(results) as T[] };
		} catch (error) {
			return {
				success: false,
				message: `Failed to find documents in ${this.model.modelName}`,
				error: createDatabaseError(error, 'FIND_MANY_ERROR', `Failed to find documents in ${this.model.modelName}`)
			};
		}
	}

	async insert(data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<T>> {
		try {
			const doc = {
				...data,
				_id: generateId(),
				createdAt: nowISODateString(),
				updatedAt: nowISODateString()
			} as unknown as T;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = (await this.model.create(doc as any)) as any;
			return { success: true, data: result.toObject() as T };
		} catch (error) {
			if (error instanceof mongo.MongoServerError && error.code === 11000) {
				return {
					success: false,
					message: 'A document with the same unique key already exists.',
					error: createDatabaseError(error, 'DUPLICATE_KEY_ERROR', 'A document with the same unique key already exists.')
				};
			}
			return {
				success: false,
				message: `Failed to insert document into ${this.model.modelName}`,
				error: createDatabaseError(error, 'INSERT_ERROR', `Failed to insert document into ${this.model.modelName}`)
			};
		}
	}

	async insertMany(data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>[]): Promise<DatabaseResult<T[]>> {
		try {
			const docs = data.map((d) => ({
				...d,
				_id: generateId(),
				createdAt: nowISODateString(),
				updatedAt: nowISODateString()
			}));
			const result = await this.model.insertMany(docs);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return { success: true, data: result.map((doc: any) => doc.toObject()) };
		} catch (error) {
			return {
				success: false,
				message: `Failed to insert many documents into ${this.model.modelName}`,
				error: createDatabaseError(error, 'INSERT_MANY_ERROR', `Failed to insert many documents into ${this.model.modelName}`)
			};
		}
	}

	async update(id: DatabaseId, data: UpdateQuery<T>): Promise<DatabaseResult<T | null>> {
		try {
			const updateData = {
				...(data as object),
				updatedAt: nowISODateString()
			};
			const result = await this.model.findByIdAndUpdate(id, { $set: updateData }, { new: true }).lean().exec();

			if (!result) return { success: true, data: null };
			return { success: true, data: processDates(result) as T };
		} catch (error) {
			return {
				success: false,
				message: `Failed to update document ${id} in ${this.model.modelName}`,
				error: createDatabaseError(error, 'UPDATE_ERROR', `Failed to update document ${id} in ${this.model.modelName}`)
			};
		}
	}

	async upsert(query: QueryFilter<T>, data: Omit<T, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<T>> {
		try {
			const result = await this.model
				.findOneAndUpdate(
					query,
					{
						$set: { ...data, updatedAt: nowISODateString() },
						$setOnInsert: { _id: generateId(), createdAt: nowISODateString() }
					},
					{ new: true, upsert: true, runValidators: true }
				)
				.lean()
				.exec();
			return { success: true, data: processDates(result) as T };
		} catch (error) {
			return {
				success: false,
				message: `Failed to upsert document in ${this.model.modelName}`,
				error: createDatabaseError(error, 'UPSERT_ERROR', `Failed to upsert document in ${this.model.modelName}`)
			};
		}
	}

	async delete(id: DatabaseId): Promise<DatabaseResult<boolean>> {
		try {
			const result = await this.model.deleteOne({ _id: id } as QueryFilter<T>);
			return { success: true, data: result.deletedCount > 0 };
		} catch (error) {
			return {
				success: false,
				message: `Failed to delete document ${id} from ${this.model.modelName}`,
				error: createDatabaseError(error, 'DELETE_ERROR', `Failed to delete document ${id} from ${this.model.modelName}`)
			};
		}
	}

	async updateMany(query: QueryFilter<T>, data: UpdateQuery<T>): Promise<DatabaseResult<{ modifiedCount: number; matchedCount: number }>> {
		try {
			const updateData = {
				...(data as object),
				updatedAt: nowISODateString()
			};
			const result = await this.model.updateMany(query, { $set: updateData });
			return {
				success: true,
				data: {
					modifiedCount: result.modifiedCount,
					matchedCount: result.matchedCount
				}
			};
		} catch (error) {
			return {
				success: false,
				message: `Failed to update multiple documents in ${this.model.modelName}`,
				error: createDatabaseError(error, 'UPDATE_MANY_ERROR', `Failed to update multiple documents in ${this.model.modelName}`)
			};
		}
	}

	async deleteMany(query: QueryFilter<T>): Promise<DatabaseResult<{ deletedCount: number }>> {
		try {
			const result = await this.model.deleteMany(query);
			return { success: true, data: { deletedCount: result.deletedCount } };
		} catch (error) {
			return {
				success: false,
				message: `Failed to delete documents from ${this.model.modelName}`,
				error: createDatabaseError(error, 'DELETE_MANY_ERROR', `Failed to delete documents from ${this.model.modelName}`)
			};
		}
	}

	async upsertMany(
		items: Array<{ query: QueryFilter<T>; data: Omit<T, '_id' | 'createdAt' | 'updatedAt'> }>
	): Promise<DatabaseResult<{ upsertedCount: number; modifiedCount: number }>> {
		try {
			if (items.length === 0) return { success: true, data: { upsertedCount: 0, modifiedCount: 0 } };

			const now = nowISODateString();
			const operations = items.map((item) => ({
				updateOne: {
					filter: item.query as any,
					update: {
						$set: { ...item.data, updatedAt: now },
						$setOnInsert: { _id: generateId(), createdAt: now }
					},
					upsert: true
				}
			}));

			const result = await this.model.bulkWrite(operations as any);
			return {
				success: true,
				data: {
					upsertedCount: result.upsertedCount,
					modifiedCount: result.modifiedCount
				}
			};
		} catch (error) {
			return {
				success: false,
				message: `Failed to upsert documents in ${this.model.modelName}`,
				error: createDatabaseError(error, 'UPSERT_MANY_ERROR', `Failed to upsert documents in ${this.model.modelName}`)
			};
		}
	}

	async count(query: QueryFilter<T> = {}): Promise<DatabaseResult<number>> {
		try {
			const count = await this.model.countDocuments(query);
			return { success: true, data: count };
		} catch (error) {
			return {
				success: false,
				message: `Failed to count documents in ${this.model.modelName}`,
				error: createDatabaseError(error, 'COUNT_ERROR', `Failed to count documents in ${this.model.modelName}`)
			};
		}
	}

	/**
	 * Checks if a document exists matching the given query.
	 * Uses findOne with _id projection instead of exists() for faster execution.
	 * MongoDB stops scanning as soon as it finds the first match, and projection reduces network overhead.
	 */
	async exists(query: QueryFilter<T>): Promise<DatabaseResult<boolean>> {
		try {
			// Use findOne with projection for optimal performance
			// Only fetches _id field, minimizing data transfer
			const doc = await this.model.findOne(query, { _id: 1 }).lean().exec();
			return { success: true, data: !!doc };
		} catch (error) {
			return {
				success: false,
				message: `Failed to check for document existence in ${this.model.modelName}`,
				error: createDatabaseError(error, 'EXISTS_ERROR', `Failed to check for document existence in ${this.model.modelName}`)
			};
		}
	}

	async aggregate<R>(pipeline: PipelineStage[]): Promise<DatabaseResult<R[]>> {
		try {
			const result = await this.model.aggregate<R>(pipeline).exec();
			return { success: true, data: result };
		} catch (error) {
			return {
				success: false,
				message: `Aggregation failed in ${this.model.modelName}`,
				error: createDatabaseError(error, 'AGGREGATION_ERROR', `Aggregation failed in ${this.model.modelName}`)
			};
		}
	}
}
