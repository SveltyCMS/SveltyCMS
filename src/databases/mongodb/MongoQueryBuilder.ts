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
import type { QueryBuilder, DatabaseResult, PaginationOptions, BaseEntity } from '../dbInterface';

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

	constructor(model: Model<T>) {
		this.model = model;
	}

	where(conditions: Partial<T>): this {
		// Merge conditions into the existing query
		this.query = { ...this.query, ...conditions };
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

	async count(): Promise<DatabaseResult<number>> {
		try {
			const count = await this.model.countDocuments(this.query);
			return { success: true, data: count };
		} catch (error) {
			logger.error(`MongoDB count query failed: ${error.message}`);
			return {
				success: false,
				error: {
					code: 'QUERY_COUNT_ERROR',
					message: 'Failed to count documents',
					details: error
				}
			};
		}
	}

	async execute(): Promise<DatabaseResult<T[]>> {
		try {
			let mongoQuery = this.model.find(this.query);

			// Apply sorting
			if (Object.keys(this.sortOptions).length > 0) {
				mongoQuery = mongoQuery.sort(this.sortOptions);
			}

			// Apply field projection
			if (this.projectionFields) {
				mongoQuery = mongoQuery.select(this.projectionFields);
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
				const distinctValues = await this.model.distinct(this.distinctField as string, this.query);
				return { success: true, data: distinctValues as T[] };
			}

			// Execute the query
			const results = await mongoQuery.lean().exec();

			// Convert MongoDB dates to ISO strings for consistency
			const processedResults = results.map((doc) => ({
				...doc,
				createdAt: doc.createdAt?.toISOString?.() || doc.createdAt,
				updatedAt: doc.updatedAt?.toISOString?.() || doc.updatedAt
			})) as T[];

			return { success: true, data: processedResults };
		} catch (error) {
			logger.error(`MongoDB query execution failed: ${error.message}`);
			return {
				success: false,
				error: {
					code: 'QUERY_EXECUTION_ERROR',
					message: 'Failed to execute query',
					details: error
				}
			};
		}
	}

	async findOne(): Promise<DatabaseResult<T | null>> {
		try {
			let mongoQuery = this.model.findOne(this.query);

			// Apply field projection
			if (this.projectionFields) {
				mongoQuery = mongoQuery.select(this.projectionFields);
			}

			// Apply sorting (for consistent results when multiple docs match)
			if (Object.keys(this.sortOptions).length > 0) {
				mongoQuery = mongoQuery.sort(this.sortOptions);
			}

			const result = await mongoQuery.lean().exec();

			if (!result) {
				return { success: true, data: null };
			}

			// Convert MongoDB dates to ISO strings for consistency
			const processedResult = {
				...result,
				createdAt: result.createdAt?.toISOString?.() || result.createdAt,
				updatedAt: result.updatedAt?.toISOString?.() || result.updatedAt
			} as T;

			return { success: true, data: processedResult };
		} catch (error) {
			logger.error(`MongoDB findOne query failed: ${error.message}`);
			return {
				success: false,
				error: {
					code: 'QUERY_FINDONE_ERROR',
					message: 'Failed to find document',
					details: error
				}
			};
		}
	}
}
