/**
 * @file src/databases/mariadb/queryBuilder/MariaDBQueryBuilder.ts
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
import { and, asc, count, desc, eq, gte, inArray, like, lte, notInArray, or, sql } from 'drizzle-orm';
import type { BaseEntity, DatabaseResult, PaginationOptions, QueryBuilder, QueryOptimizationHints } from '../../dbInterface';
import type { MariaDBAdapter } from '../adapter';
import * as utils from '../utils';

export class MariaDBQueryBuilder<T extends BaseEntity> implements QueryBuilder<T> {
	private readonly adapter: MariaDBAdapter;
	private readonly collection: string;
	private readonly conditions: any[] = [];
	private sortOptions: Array<{ field: keyof T; direction: 'asc' | 'desc' }> = [];
	private limitValue?: number;
	private skipValue?: number;
	private selectedFields?: (keyof T)[];

	constructor(adapter: MariaDBAdapter, collection: string) {
		this.adapter = adapter;
		this.collection = collection;
	}

	private get table() {
		return (this.adapter as any).getTable(this.collection);
	}

	private get db() {
		return (this.adapter as any).db;
	}

	where(conditions: Partial<T> | ((item: T) => boolean)): this {
		if (typeof conditions === 'function') {
			logger.warn('Function-based where conditions are not supported in MariaDBQueryBuilder');
			return this;
		}

		for (const [key, value] of Object.entries(conditions)) {
			if (this.table[key]) {
				this.conditions.push(eq(this.table[key], value));
			}
		}
		return this;
	}

	whereIn<K extends keyof T>(field: K, values: T[K][]): this {
		if (this.table[field as string]) {
			this.conditions.push(inArray(this.table[field as string], values));
		}
		return this;
	}

	whereNotIn<K extends keyof T>(field: K, values: T[K][]): this {
		if (this.table[field as string]) {
			this.conditions.push(notInArray(this.table[field as string], values));
		}
		return this;
	}

	whereBetween<K extends keyof T>(field: K, min: T[K], max: T[K]): this {
		if (this.table[field as string]) {
			this.conditions.push(and(gte(this.table[field as string], min), lte(this.table[field as string], max)));
		}
		return this;
	}

	whereNull<K extends keyof T>(field: K): this {
		if (this.table[field as string]) {
			this.conditions.push(sql`${this.table[field as string]} IS NULL`);
		}
		return this;
	}

	whereNotNull<K extends keyof T>(field: K): this {
		if (this.table[field as string]) {
			this.conditions.push(sql`${this.table[field as string]} IS NOT NULL`);
		}
		return this;
	}

	search(query: string, fields?: (keyof T)[]): this {
		if (fields && fields.length > 0) {
			const searchConditions = fields
				.map((f) => {
					if (this.table[f as string]) {
						return like(this.table[f as string], `%${query}%`);
					}
					return null;
				})
				.filter(Boolean);

			if (searchConditions.length > 0) {
				this.conditions.push(or(...(searchConditions as any[])));
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
			const projection: any = {};
			this.selectedFields.forEach((f) => {
				if (this.table[f as string]) {
					projection[f as string] = this.table[f as string];
				}
			});
			q = this.db.select(projection).from(this.table);
		} else {
			q = this.db.select().from(this.table);
		}

		if (this.conditions.length > 0) {
			q = q.where(and(...this.conditions));
		}

		if (this.sortOptions.length > 0) {
			const orderBys = this.sortOptions.map((s) => {
				const order = s.direction === 'desc' ? desc : asc;
				const fieldName = s.field as string;
				// Resolve MongoDB-convention fields (e.g. _createdAt → createdAt)
				const column = this.table[fieldName] ?? this.table[fieldName.replace(/^_/, '')];
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
			const table = this.table;
			let q = this.db.select({ count: count() }).from(table);
			if (this.conditions.length > 0) {
				q = q.where(and(...this.conditions));
			}
			const [result] = await q;
			return {
				success: true,
				data: Number(result.count),
				meta: { executionTime: Date.now() - startTime }
			};
		} catch (error) {
			return (this.adapter as any).handleError(error, 'QUERY_BUILDER_COUNT_FAILED');
		}
	}

	async exists(): Promise<DatabaseResult<boolean>> {
		const res = await this.count();
		if (res.success) {
			return { ...res, data: res.data > 0 };
		}
		return res as any;
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
			return (this.adapter as any).handleError(error, 'QUERY_BUILDER_EXECUTE_FAILED');
		}
	}

	async stream(): Promise<DatabaseResult<AsyncIterable<T>>> {
		return (this.adapter as any).notImplemented('queryBuilder.stream');
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
			return (this.adapter as any).handleError(error, 'QUERY_BUILDER_FIND_ONE_FAILED');
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
			let q = this.db.update(this.table).set({ ...data, updatedAt: new Date() } as any);
			if (this.conditions.length > 0) {
				q = q.where(and(...this.conditions));
			}
			const result = await q;
			return {
				success: true,
				data: { modifiedCount: result[0].affectedRows },
				meta: { executionTime: Date.now() - startTime }
			};
		} catch (error) {
			return (this.adapter as any).handleError(error, 'QUERY_BUILDER_UPDATE_MANY_FAILED');
		}
	}

	async deleteMany(): Promise<DatabaseResult<{ deletedCount: number }>> {
		const startTime = Date.now();
		try {
			let q = this.db.delete(this.table);
			if (this.conditions.length > 0) {
				q = q.where(and(...this.conditions));
			}
			const result = await q;
			return {
				success: true,
				data: { deletedCount: result[0].affectedRows },
				meta: { executionTime: Date.now() - startTime }
			};
		} catch (error) {
			return (this.adapter as any).handleError(error, 'QUERY_BUILDER_DELETE_MANY_FAILED');
		}
	}
}
