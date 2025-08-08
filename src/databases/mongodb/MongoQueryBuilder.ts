/**
 * @file src/databases/mongodb/MongoQueryBuilder.ts
 * @description MongoDB implementation of the QueryBuilder interface
 *
 * This class provides a fluent interface for building MongoDB queries with support for:
 * - Filtering with MongoDB query operators
 * - Sorting with multiple fields
 * - Pagination with skip/limit
 * - Field projection
 * - Distinct queries
 * - Count operations
 *
 * The builder translates the database-agnostic QueryBuilder interface into MongoDB-specific
 * query operations while maintaining type safety and performance.
 */

import type { Model } from 'mongoose';
import type { QueryBuilder, DatabaseResult, PaginationOptions, BaseEntity, QueryOptimizationHints, QueryMeta, DatabaseError } from '../dbInterface';

// System Logger
import { logger } from '@utils/logger.svelte';

export class MongoQueryBuilder<T extends BaseEntity> implements QueryBuilder<T> {
	private model: Model<T>;
	private query: Record<string, unknown> = {};
	private sortOptions: Record<string, 1 | -1> = {};
	private limitValue?: number;
	private skipValue?: number;
	private projectionFields?: Record<string, boolean>;
	private distinctField?: keyof T;
	private paginationOptions?: PaginationOptions;
	private optimizationHints?: QueryOptimizationHints;
	private timeoutMs?: number;
	private selectedFields?: (keyof T)[];
	private excludedFields?: (keyof T)[];
	private searchQuery?: { query: string; fields?: (keyof T)[] };
	private inConditions: Array<{ field: keyof T; values: unknown[] }> = [];
	private notInConditions: Array<{ field: keyof T; values: unknown[] }> = [];
	private betweenConditions: Array<{ field: keyof T; min: unknown; max: unknown }> = [];
	private nullConditions: Array<{ field: keyof T; isNull: boolean }> = [];
	private groupByField?: keyof T;
	private multiSortOptions: Array<{ field: keyof T; direction: 'asc' | 'desc' }> = [];

	constructor(model: Model<T>) {
		this.model = model;
	}

	where(conditions: Partial<T> | ((item: T) => boolean)): this {
		if (typeof conditions === 'function') {
			// For function-based conditions, we need to convert to MongoDB query
			// This is a simplified approach - for complex functions, consider using aggregation
			logger.warn('Function-based where conditions have limited MongoDB support');
			return this;
		}
		// Merge conditions into the existing query
		this.query = { ...this.query, ...conditions };
		return this;
	}

	whereIn<K extends keyof T>(field: K, values: T[K][]): this {
		this.inConditions.push({ field, values });
		return this;
	}

	whereNotIn<K extends keyof T>(field: K, values: T[K][]): this {
		this.notInConditions.push({ field, values });
		return this;
	}

	whereBetween<K extends keyof T>(field: K, min: T[K], max: T[K]): this {
		this.betweenConditions.push({ field, min, max });
		return this;
	}

	whereNull<K extends keyof T>(field: K): this {
		this.nullConditions.push({ field, isNull: true });
		return this;
	}

	whereNotNull<K extends keyof T>(field: K): this {
		this.nullConditions.push({ field, isNull: false });
		return this;
	}

	search(query: string, fields?: (keyof T)[]): this {
		this.searchQuery = { query, fields };
		return this;
	}

	limit(value: number): this {
		this.limitValue = value;
		return this;
	}

	skip(value: number): this {
		this.skipValue = value;
		return this;
	}

	sort<K extends keyof T>(field: K, direction: 'asc' | 'desc'): this {
		this.sortOptions[field as string] = direction === 'asc' ? 1 : -1;
		return this;
	}

	orderBy<K extends keyof T>(sorts: Array<{ field: K; direction: 'asc' | 'desc' }>): this {
		this.multiSortOptions = sorts;
		// Also update sortOptions for backward compatibility
		sorts.forEach(({ field, direction }) => {
			this.sortOptions[field as string] = direction === 'asc' ? 1 : -1;
		});
		return this;
	}

	select<K extends keyof T>(fields: K[]): this {
		this.selectedFields = fields;
		return this;
	}

	exclude<K extends keyof T>(fields: K[]): this {
		this.excludedFields = fields;
		return this;
	}

	project<K extends keyof T>(fields: Partial<Record<K, boolean>>): this {
		this.projectionFields = fields;
		return this;
	}

	distinct<K extends keyof T>(field?: K): this {
		if (field) {
			this.distinctField = field;
		}
		return this;
	}

	groupBy<K extends keyof T>(field: K): this {
		this.groupByField = field;
		return this;
	}

	hint(hints: QueryOptimizationHints): this {
		this.optimizationHints = hints;
		return this;
	}

	timeout(milliseconds: number): this {
		this.timeoutMs = milliseconds;
		return this;
	}

	paginate(options: PaginationOptions): this {
		this.paginationOptions = options;
		if (options.page && options.pageSize) {
			this.skipValue = (options.page - 1) * options.pageSize;
			this.limitValue = options.pageSize;
		}
		if (options.sortField && options.sortDirection) {
			this.sortOptions[options.sortField] = options.sortDirection === 'asc' ? 1 : -1;
		}
		return this;
	}

	private buildQuery(): Record<string, unknown> {
		const finalQuery = { ...this.query };

		// Apply whereIn conditions
		this.inConditions.forEach(({ field, values }) => {
			finalQuery[field as string] = { $in: values };
		});

		// Apply whereNotIn conditions
		this.notInConditions.forEach(({ field, values }) => {
			finalQuery[field as string] = { $nin: values };
		});

		// Apply whereBetween conditions
		this.betweenConditions.forEach(({ field, min, max }) => {
			finalQuery[field as string] = { $gte: min, $lte: max };
		});

		// Apply null/not null conditions
		this.nullConditions.forEach(({ field, isNull }) => {
			if (isNull) {
				finalQuery[field as string] = { $eq: null };
			} else {
				finalQuery[field as string] = { $ne: null };
			}
		});

		// Apply text search
		if (this.searchQuery) {
			if (this.searchQuery.fields && this.searchQuery.fields.length > 0) {
				// Field-specific search using regex
				const searchConditions = this.searchQuery.fields.map((field) => ({
					[field as string]: { $regex: this.searchQuery!.query, $options: 'i' }
				}));
				finalQuery.$or = searchConditions;
			} else {
				// Full text search if available
				finalQuery.$text = { $search: this.searchQuery.query };
			}
		}

		return finalQuery;
	}

	private buildProjection(): Record<string, number> | undefined {
		if (this.selectedFields?.length) {
			const projection: Record<string, number> = {};
			this.selectedFields.forEach((field) => {
				projection[field as string] = 1;
			});
			return projection;
		}

		if (this.excludedFields?.length) {
			const projection: Record<string, number> = {};
			this.excludedFields.forEach((field) => {
				projection[field as string] = 0;
			});
			return projection;
		}

		return this.projectionFields as Record<string, number> | undefined;
	}

	private createDatabaseError(error: unknown, code: string, message: string): DatabaseError {
		logger.error(`${code}: ${message}`, error);
		return {
			code,
			message,
			details: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined
		};
	}

	private buildQueryMeta(startTime: number): QueryMeta {
		const executionTime = Date.now() - startTime;
		return {
			executionTime,
			cached: false // MongoDB doesn't provide direct cache info
			// Note: MongoDB doesn't easily provide recordsExamined and indexesUsed without explain()
			// Consider using explain() for detailed performance metrics in development
		};
	}

	async count(): Promise<DatabaseResult<number>> {
		const startTime = Date.now();
		try {
			const query = this.buildQuery();
			const count = await this.model.countDocuments(query);
			const meta = this.buildQueryMeta(startTime);
			return { success: true, data: count, meta };
		} catch (error) {
			return {
				success: false,
				error: this.createDatabaseError(error, 'QUERY_COUNT_ERROR', 'Failed to count documents')
			};
		}
	}

	async exists(): Promise<DatabaseResult<boolean>> {
		const startTime = Date.now();
		try {
			const query = this.buildQuery();
			const count = await this.model.countDocuments(query).limit(1);
			const meta = this.buildQueryMeta(startTime);
			return { success: true, data: count > 0, meta };
		} catch (error) {
			return {
				success: false,
				error: this.createDatabaseError(error, 'QUERY_EXISTS_ERROR', 'Failed to check document existence')
			};
		}
	}

	async execute(): Promise<DatabaseResult<T[]>> {
		const startTime = Date.now();
		try {
			const query = this.buildQuery();
			let mongoQuery = this.model.find(query);

			// Apply optimization hints
			if (this.optimizationHints) {
				if (this.optimizationHints.useIndex?.length) {
					mongoQuery = mongoQuery.hint(this.optimizationHints.useIndex[0]);
				}
				if (this.optimizationHints.maxExecutionTime) {
					mongoQuery = mongoQuery.maxTimeMS(this.optimizationHints.maxExecutionTime);
				}
				if (this.optimizationHints.batchSize) {
					mongoQuery = mongoQuery.batchSize(this.optimizationHints.batchSize);
				}
			}

			// Apply timeout
			if (this.timeoutMs) {
				mongoQuery = mongoQuery.maxTimeMS(this.timeoutMs);
			}

			// Apply sorting (prioritize multi-sort over single sort)
			if (this.multiSortOptions.length > 0) {
				const sortObj: Record<string, 1 | -1> = {};
				this.multiSortOptions.forEach(({ field, direction }) => {
					sortObj[field as string] = direction === 'asc' ? 1 : -1;
				});
				mongoQuery = mongoQuery.sort(sortObj);
			} else if (Object.keys(this.sortOptions).length > 0) {
				mongoQuery = mongoQuery.sort(this.sortOptions);
			}

			// Apply field projection
			const projection = this.buildProjection();
			if (projection) {
				mongoQuery = mongoQuery.select(projection);
			}

			// Apply skip/limit
			if (this.skipValue !== undefined) {
				mongoQuery = mongoQuery.skip(this.skipValue);
			}
			if (this.limitValue !== undefined) {
				mongoQuery = mongoQuery.limit(this.limitValue);
			}

			// Handle distinct queries
			if (this.distinctField) {
				const distinctValues = await this.model.distinct(this.distinctField as string, query);
				const meta = this.buildQueryMeta(startTime);
				return { success: true, data: distinctValues as T[], meta };
			}

			// Handle group by queries using aggregation
			if (this.groupByField) {
				const pipeline = [{ $match: query }, { $group: { _id: `$${this.groupByField as string}`, items: { $push: '$$ROOT' } } }];
				const results = await this.model.aggregate(pipeline);
				const flatResults = results.flatMap((group) => group.items);
				const meta = this.buildQueryMeta(startTime);
				return { success: true, data: flatResults as T[], meta };
			}

			// Execute the query with lean() for better performance
			const results = await mongoQuery.lean().exec();

			// Convert MongoDB dates to ISO strings for consistency
			const processedResults = results.map((doc) => ({
				...doc,
				createdAt: doc.createdAt?.toISOString?.() || doc.createdAt,
				updatedAt: doc.updatedAt?.toISOString?.() || doc.updatedAt
			})) as T[];

			const meta = this.buildQueryMeta(startTime);
			return { success: true, data: processedResults, meta };
		} catch (error) {
			return {
				success: false,
				error: this.createDatabaseError(error, 'QUERY_EXECUTION_ERROR', 'Failed to execute query')
			};
		}
	}

	async stream(): Promise<DatabaseResult<AsyncIterable<T>>> {
		const startTime = Date.now();
		try {
			const query = this.buildQuery();
			let mongoQuery = this.model.find(query);

			// Apply optimization hints for streaming
			if (this.optimizationHints) {
				if (this.optimizationHints.batchSize) {
					mongoQuery = mongoQuery.batchSize(this.optimizationHints.batchSize);
				}
				if (this.optimizationHints.maxExecutionTime) {
					mongoQuery = mongoQuery.maxTimeMS(this.optimizationHints.maxExecutionTime);
				}
			}

			// Apply sorting
			if (this.multiSortOptions.length > 0) {
				const sortObj: Record<string, 1 | -1> = {};
				this.multiSortOptions.forEach(({ field, direction }) => {
					sortObj[field as string] = direction === 'asc' ? 1 : -1;
				});
				mongoQuery = mongoQuery.sort(sortObj);
			} else if (Object.keys(this.sortOptions).length > 0) {
				mongoQuery = mongoQuery.sort(this.sortOptions);
			}

			// Apply field projection
			const projection = this.buildProjection();
			if (projection) {
				mongoQuery = mongoQuery.select(projection);
			}

			// Create async iterable from cursor
			const cursor = mongoQuery.lean().cursor();
			const asyncIterable = {
				async *[Symbol.asyncIterator]() {
					try {
						for await (const doc of cursor) {
							// Convert MongoDB dates to ISO strings for consistency
							const processedDoc = {
								...doc,
								createdAt: doc.createdAt?.toISOString?.() || doc.createdAt,
								updatedAt: doc.updatedAt?.toISOString?.() || doc.updatedAt
							} as T;
							yield processedDoc;
						}
					} catch (error) {
						logger.error(`Stream iteration failed: ${error.message}`);
						throw error;
					}
				}
			};

			const meta = this.buildQueryMeta(startTime);
			return { success: true, data: asyncIterable, meta };
		} catch (error) {
			return {
				success: false,
				error: this.createDatabaseError(error, 'QUERY_STREAM_ERROR', 'Failed to create query stream')
			};
		}
	}

	async findOne(): Promise<DatabaseResult<T | null>> {
		const startTime = Date.now();
		try {
			const query = this.buildQuery();
			let mongoQuery = this.model.findOne(query);

			// Apply optimization hints
			if (this.optimizationHints) {
				if (this.optimizationHints.maxExecutionTime) {
					mongoQuery = mongoQuery.maxTimeMS(this.optimizationHints.maxExecutionTime);
				}
			}

			// Apply timeout
			if (this.timeoutMs) {
				mongoQuery = mongoQuery.maxTimeMS(this.timeoutMs);
			}

			// Apply field projection
			const projection = this.buildProjection();
			if (projection) {
				mongoQuery = mongoQuery.select(projection);
			}

			// Apply sorting (for consistent results when multiple docs match)
			if (this.multiSortOptions.length > 0) {
				const sortObj: Record<string, 1 | -1> = {};
				this.multiSortOptions.forEach(({ field, direction }) => {
					sortObj[field as string] = direction === 'asc' ? 1 : -1;
				});
				mongoQuery = mongoQuery.sort(sortObj);
			} else if (Object.keys(this.sortOptions).length > 0) {
				mongoQuery = mongoQuery.sort(this.sortOptions);
			}

			const result = await mongoQuery.lean().exec();

			if (!result) {
				const meta = this.buildQueryMeta(startTime);
				return { success: true, data: null, meta };
			}

			// Convert MongoDB dates to ISO strings for consistency
			const processedResult = {
				...result,
				createdAt: result.createdAt?.toISOString?.() || result.createdAt,
				updatedAt: result.updatedAt?.toISOString?.() || result.updatedAt
			} as T;

			const meta = this.buildQueryMeta(startTime);
			return { success: true, data: processedResult, meta };
		} catch (error) {
			return {
				success: false,
				error: this.createDatabaseError(error, 'QUERY_FINDONE_ERROR', 'Failed to find document')
			};
		}
	}

	async findOneOrFail(): Promise<DatabaseResult<T>> {
		const result = await this.findOne();
		if (!result.success) {
			return result as DatabaseResult<T>;
		}
		if (result.data === null) {
			return {
				success: false,
				error: this.createDatabaseError(new Error('Document not found'), 'DOCUMENT_NOT_FOUND', 'Required document not found')
			};
		}
		return { success: true, data: result.data, meta: result.meta };
	}

	async updateMany(data: Partial<T>): Promise<DatabaseResult<{ modifiedCount: number }>> {
		const startTime = Date.now();
		try {
			const query = this.buildQuery();
			const updateData = {
				...data,
				updatedAt: new Date().toISOString()
			};
			const result = await this.model.updateMany(query, updateData);
			const meta = this.buildQueryMeta(startTime);
			return {
				success: true,
				data: { modifiedCount: result.modifiedCount || 0 },
				meta
			};
		} catch (error) {
			return {
				success: false,
				error: this.createDatabaseError(error, 'QUERY_UPDATE_MANY_ERROR', 'Failed to update documents')
			};
		}
	}

	async deleteMany(): Promise<DatabaseResult<{ deletedCount: number }>> {
		const startTime = Date.now();
		try {
			const query = this.buildQuery();
			const result = await this.model.deleteMany(query);
			const meta = this.buildQueryMeta(startTime);
			return {
				success: true,
				data: { deletedCount: result.deletedCount || 0 },
				meta
			};
		} catch (error) {
			return {
				success: false,
				error: this.createDatabaseError(error, 'QUERY_DELETE_MANY_ERROR', 'Failed to delete documents')
			};
		}
	}
}
