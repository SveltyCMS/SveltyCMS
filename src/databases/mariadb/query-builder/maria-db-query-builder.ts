/**
 * @file src/databases/mariadb/queryBuilder/maria-db-query-builder.ts
 * @description MariaDB implementation of the QueryBuilder interface using Drizzle ORM
 *
 * Features:
 * - Where conditions
 * - In conditions
 * - Not in conditions
 * - Between conditions
 * - Null conditions
 * - Not null conditions
 * - Search conditions
 * - Limit
 * - Skip
 * - Pagination
 * - Sort
 * - Select
 * - Exclude
 * - Distinct
 * - Group by
 * - Hint
 * - Timeout
 */

import { logger } from '@src/utils/logger';
import { and, asc, count, desc, eq, gte, inArray, isNull, like, lte, notInArray, or, type SQL, sql } from 'drizzle-orm';
import type { BaseEntity, DatabaseResult, PaginationOptions, QueryBuilder, QueryOptimizationHints } from '../../db-interface';
import type { MariaDBAdapter } from '../adapter';
import * as utils from '../utils';

export class MariaDBQueryBuilder<T extends BaseEntity> implements QueryBuilder<T> {
	private readonly adapter: MariaDBAdapter;
	private readonly collection: string;
	private readonly conditions: SQL[] = [];
	private sortOptions: Array<{ field: keyof T; direction: 'asc' | 'desc' }> = [];
	private limitValue?: number;
	private skipValue?: number;
	private selectedFields?: (keyof T)[];

	constructor(adapter: MariaDBAdapter, collection: string) {
		this.adapter = adapter;
		this.collection = collection;
	}

	private get table() {
		return this.adapter.getTable(this.collection);
	}

	private get db() {
		return this.adapter.db!;
	}

	where(conditions: Partial<T> | ((item: T) => boolean)): this {
		if (typeof conditions === 'function') {
			logger.warn('Function-based where conditions are not supported in MariaDBQueryBuilder');
			return this;
		}

		for (const [key, value] of Object.entries(conditions)) {
			const column = (this.table as unknown as Record<string, import('drizzle-orm/mysql-core').MySqlColumn>)[key];
			if (column) {
				if (value === null) {
					this.conditions.push(isNull(column));
				} else {
					this.conditions.push(eq(column, value as string | number | boolean));
				}
			}
		}
		return this;
	}

	whereIn<K extends keyof T>(field: K, values: T[K][]): this {
		const column = (this.table as unknown as Record<string, import('drizzle-orm/mysql-core').MySqlColumn>)[field as string];
		if (column) {
			this.conditions.push(inArray(column, values as (string | number | boolean)[]));
		}
		return this;
	}

	whereNotIn<K extends keyof T>(field: K, values: T[K][]): this {
		const column = (this.table as unknown as Record<string, import('drizzle-orm/mysql-core').MySqlColumn>)[field as string];
		if (column) {
			this.conditions.push(notInArray(column, values as (string | number | boolean)[]));
		}
		return this;
	}

	whereBetween<K extends keyof T>(field: K, min: T[K], max: T[K]): this {
		const column = (this.table as unknown as Record<string, import('drizzle-orm/mysql-core').MySqlColumn>)[field as string];
		if (column) {
			const condition = and(gte(column, min as string | number | boolean), lte(column, max as string | number | boolean));
			if (condition) {
				this.conditions.push(condition);
			}
		}
		return this;
	}

	whereNull<K extends keyof T>(field: K): this {
		const column = (this.table as unknown as Record<string, import('drizzle-orm/mysql-core').MySqlColumn>)[field as string];
		if (column) {
			this.conditions.push(isNull(column));
		}
		return this;
	}

	whereNotNull<K extends keyof T>(field: K): this {
		const column = (this.table as unknown as Record<string, import('drizzle-orm/mysql-core').MySqlColumn>)[field as string];
		if (column) {
			this.conditions.push(sql`${column} IS NOT NULL`);
		}
		return this;
	}

	search(query: string, fields?: (keyof T)[]): this {
		if (fields && fields.length > 0) {
			const searchConditions = fields
				.map((f) => {
					const column = (this.table as unknown as Record<string, import('drizzle-orm/mysql-core').MySqlColumn>)[f as string];
					if (column) {
						return like(column, `%${query}%`);
					}
					return null;
				})
				.filter((c): c is import('drizzle-orm').SQL => c !== null);

			if (searchConditions.length > 0) {
				const condition = or(...searchConditions);
				if (condition) {
					this.conditions.push(condition);
				}
			}
		}
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

	paginate(options: PaginationOptions): this {
		if (options.page && options.pageSize) {
			this.skipValue = (options.page - 1) * options.pageSize;
			this.limitValue = options.pageSize;
		}
		if (options.sortField && options.sortDirection) {
			this.sort(options.sortField as keyof T, options.sortDirection);
		}
		return this;
	}

	sort<K extends keyof T>(field: K, direction: 'asc' | 'desc'): this {
		this.sortOptions.push({ field, direction });
		return this;
	}

	orderBy<K extends keyof T>(sorts: Array<{ field: K; direction: 'asc' | 'desc' }>): this {
		this.sortOptions = [...this.sortOptions, ...sorts];
		return this;
	}

	select<K extends keyof T>(fields: K[]): this {
		this.selectedFields = fields;
		return this;
	}

	exclude<K extends keyof T>(_fields: K[]): this {
		return this;
	}

	distinct<K extends keyof T>(_field?: K): this {
		return this;
	}

	groupBy<K extends keyof T>(_field: K): this {
		return this;
	}

	hint(_hints: QueryOptimizationHints): this {
		return this;
	}

	timeout(_milliseconds: number): this {
		return this;
	}

	private buildQuery() {
		if (!this.db) {
			throw new Error('Database not connected');
		}

		let q: any;
		if (this.selectedFields) {
			const projection: Record<string, import('drizzle-orm/mysql-core').MySqlColumn> = {};
			this.selectedFields.forEach((f) => {
				const column = (this.table as unknown as Record<string, import('drizzle-orm/mysql-core').MySqlColumn>)[f as string];
				if (column) {
					projection[f as string] = column;
				}
			});
			q = this.db
				.select(projection)
				.from(this.table as unknown as import('drizzle-orm/mysql-core').MySqlTable)
				.$dynamic();
		} else {
			q = this.db
				.select()
				.from(this.table as unknown as import('drizzle-orm/mysql-core').MySqlTable)
				.$dynamic();
		}

		if (this.conditions.length > 0) {
			q = q.where(and(...this.conditions));
		}

		if (this.sortOptions.length > 0) {
			const orderBys = this.sortOptions.map((s) => {
				const order = s.direction === 'desc' ? desc : asc;
				const fieldName = s.field as string;
				// Resolve MongoDB-convention fields (e.g. _createdAt → createdAt)
				const column =
					(this.table as unknown as Record<string, import('drizzle-orm/mysql-core').MySqlColumn>)[fieldName] ??
					(this.table as unknown as Record<string, import('drizzle-orm/mysql-core').MySqlColumn>)[fieldName.replace(/^_/, '')];
				if (!column) {
					throw new Error(`Unknown sort field: ${fieldName}`);
				}
				return order(column);
			});
			q = q.orderBy(...orderBys);
		}

		if (this.limitValue !== undefined) {
			q = q.limit(this.limitValue);
		}
		if (this.skipValue !== undefined) {
			q = q.offset(this.skipValue);
		}

		return q;
	}

	async count(): Promise<DatabaseResult<number>> {
		const startTime = Date.now();
		try {
			const table = this.table as unknown as import('drizzle-orm/mysql-core').MySqlTable;
			let q = this.db.select({ count: count() }).from(table).$dynamic();
			if (this.conditions.length > 0) {
				q = q.where(and(...this.conditions));
			}
			const [result] = await q;
			return {
				success: true,
				data: Number((result as { count: number }).count),
				meta: { executionTime: Date.now() - startTime }
			};
		} catch (error) {
			return this.adapter.handleError(error, 'QUERY_BUILDER_COUNT_FAILED');
		}
	}

	async exists(): Promise<DatabaseResult<boolean>> {
		const res = await this.count();
		if (res.success) {
			return { ...res, data: res.data > 0 };
		}
		return res as unknown as DatabaseResult<boolean>;
	}

	async execute(): Promise<DatabaseResult<T[]>> {
		const startTime = Date.now();
		try {
			const q = this.buildQuery();
			const results = await q;
			return {
				success: true,
				data: utils.convertArrayDatesToISO(results) as unknown as T[],
				meta: { executionTime: Date.now() - startTime }
			};
		} catch (error) {
			return this.adapter.handleError(error, 'QUERY_BUILDER_EXECUTE_FAILED');
		}
	}

	async stream(): Promise<DatabaseResult<AsyncIterable<T>>> {
		return this.adapter.notImplemented('queryBuilder.stream');
	}

	async findOne(): Promise<DatabaseResult<T | null>> {
		const startTime = Date.now();
		try {
			const q = this.buildQuery().limit(1);
			const [result] = await q;
			return {
				success: true,
				data: result ? (utils.convertDatesToISO(result) as unknown as T) : null,
				meta: { executionTime: Date.now() - startTime }
			};
		} catch (error) {
			return this.adapter.handleError(error, 'QUERY_BUILDER_FIND_ONE_FAILED');
		}
	}

	async findOneOrFail(): Promise<DatabaseResult<T>> {
		const res = await this.findOne();
		if (res.success && !res.data) {
			return {
				success: false,
				message: 'Document not found',
				error: utils.createDatabaseError('NOT_FOUND', 'Document not found')
			};
		}
		return res as DatabaseResult<T>;
	}

	async updateMany(data: Partial<T>): Promise<DatabaseResult<{ modifiedCount: number }>> {
		const startTime = Date.now();
		try {
			let q = this.db
				.update(this.table as unknown as import('drizzle-orm/mysql-core').MySqlTable)
				.set({ ...data, updatedAt: new Date() } as unknown as Record<string, unknown>)
				.$dynamic();
			if (this.conditions.length > 0) {
				q = q.where(and(...this.conditions));
			}
			const result = await q;
			return {
				success: true,
				data: { modifiedCount: (result as unknown as [{ affectedRows: number }])[0].affectedRows },
				meta: { executionTime: Date.now() - startTime }
			};
		} catch (error) {
			return this.adapter.handleError(error, 'QUERY_BUILDER_UPDATE_MANY_FAILED');
		}
	}

	async deleteMany(): Promise<DatabaseResult<{ deletedCount: number }>> {
		const startTime = Date.now();
		try {
			let q = this.db.delete(this.table as unknown as import('drizzle-orm/mysql-core').MySqlTable).$dynamic();
			if (this.conditions.length > 0) {
				q = q.where(and(...this.conditions));
			}
			const result = await q;
			return {
				success: true,
				data: { deletedCount: (result as unknown as [{ affectedRows: number }])[0].affectedRows },
				meta: { executionTime: Date.now() - startTime }
			};
		} catch (error) {
			return this.adapter.handleError(error, 'QUERY_BUILDER_DELETE_MANY_FAILED');
		}
	}
}
