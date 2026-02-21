/**
 * @file src/databases/postgresql/query-builder/postgres-query-builder.ts
 * @description Query builder implementation for PostgreSQL
 */

import { and, asc, desc, gte, inArray, isNotNull, isNull, lte, or, sql, count as drizzleCount } from 'drizzle-orm';
import type { BaseEntity, DatabaseResult, PaginationOptions, QueryBuilder, QueryOptimizationHints } from '../../db-interface';
import type { AdapterCore } from '../adapter/adapter-core';

export class PostgresQueryBuilder<T extends BaseEntity> implements QueryBuilder<T> {
	private readonly core: AdapterCore;
	private readonly collection: string;
	private conditions: import('drizzle-orm').SQL[] = [];
	private limitValue?: number;
	private offsetValue?: number;
	private sorts: import('drizzle-orm').SQL[] = [];

	constructor(core: AdapterCore, collection: string) {
		this.core = core;
		this.collection = collection;
	}

	private get db() {
		return this.core.db!;
	}

	private get table() {
		return this.core.getTable(this.collection);
	}

	where(conditions: Partial<T> | ((item: T) => boolean)): this {
		if (typeof conditions === 'function') {
			throw new Error('Function-based where not supported in SQL');
		}
		const mapped = this.core.mapQuery(this.table, conditions as Record<string, unknown>) as import('drizzle-orm').SQL | undefined;
		if (mapped) {
			this.conditions.push(mapped);
		}
		return this;
	}

	whereIn<K extends keyof T>(field: K, values: T[K][]): this {
		const column = (this.table as unknown as Record<string, import('drizzle-orm/pg-core').PgColumn>)[field as string];
		if (column) {
			this.conditions.push(inArray(column, values as (string | number | boolean)[]));
		}
		return this;
	}

	whereNotIn<K extends keyof T>(field: K, values: T[K][]): this {
		const column = (this.table as unknown as Record<string, import('drizzle-orm/pg-core').PgColumn>)[field as string];
		if (column) {
			this.conditions.push(sql`${column} NOT IN ${values}`);
		}
		return this;
	}

	whereBetween<K extends keyof T>(field: K, min: T[K], max: T[K]): this {
		const column = (this.table as unknown as Record<string, import('drizzle-orm/pg-core').PgColumn>)[field as string];
		if (column) {
			const condition = and(gte(column, min as string | number | boolean), lte(column, max as string | number | boolean));
			if (condition) {
				this.conditions.push(condition);
			}
		}
		return this;
	}

	whereNull<K extends keyof T>(field: K): this {
		const column = (this.table as unknown as Record<string, import('drizzle-orm/pg-core').PgColumn>)[field as string];
		if (column) {
			this.conditions.push(isNull(column));
		}
		return this;
	}

	whereNotNull<K extends keyof T>(field: K): this {
		const column = (this.table as unknown as Record<string, import('drizzle-orm/pg-core').PgColumn>)[field as string];
		if (column) {
			this.conditions.push(isNotNull(column));
		}
		return this;
	}

	search(query: string, fields?: (keyof T)[]): this {
		if (!fields || fields.length === 0) {
			return this;
		}
		const searchConditions = fields
			.map((f) => {
				const column = (this.table as unknown as Record<string, import('drizzle-orm/pg-core').PgColumn>)[f as string];
				return column ? sql`${column} ILIKE ${'%' + query + '%'}` : null;
			})
			.filter((c): c is import('drizzle-orm').SQL => c !== null);
		if (searchConditions.length > 0) {
			const condition = or(...searchConditions);
			if (condition) {
				this.conditions.push(sql`(${condition})`);
			}
		}
		return this;
	}

	limit(value: number): this {
		this.limitValue = value;
		return this;
	}

	skip(value: number): this {
		this.offsetValue = value;
		return this;
	}

	sort<K extends keyof T>(field: K, direction: 'asc' | 'desc'): this {
		const column = (this.table as unknown as Record<string, import('drizzle-orm/pg-core').PgColumn>)[field as string];
		if (column) {
			this.sorts.push(direction === 'asc' ? asc(column) : desc(column));
		}
		return this;
	}

	orderBy<K extends keyof T>(sorts: Array<{ field: K; direction: 'asc' | 'desc' }>): this {
		for (const s of sorts) {
			this.sort(s.field, s.direction);
		}
		return this;
	}

	select<K extends keyof T>(_fields: K[]): this {
		return this;
	}

	exclude<K extends keyof T>(_fields: K[]): this {
		return this; // Not easily supported in Drizzle without explicit select
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

	paginate(options: PaginationOptions): this {
		if (options.page && options.pageSize) {
			this.limit(options.pageSize);
			this.skip((options.page - 1) * options.pageSize);
		}
		if (options.sortField && options.sortDirection) {
			this.sort(options.sortField as keyof T, options.sortDirection);
		}
		return this;
	}

	async execute(): Promise<DatabaseResult<T[]>> {
		return this.core.wrap(async () => {
			let q = this.db
				.select()
				.from(this.table as unknown as import('drizzle-orm/pg-core').PgTable)
				.$dynamic();
			if (this.conditions.length > 0) {
				q = q.where(and(...this.conditions));
			}
			if (this.sorts.length > 0) {
				q = q.orderBy(...this.sorts);
			}
			if (this.limitValue !== undefined) {
				q = q.limit(this.limitValue);
			}
			if (this.offsetValue !== undefined) {
				q = q.offset(this.offsetValue);
			}
			const results = await q;
			return results as unknown as T[];
		}, 'QUERY_EXECUTION_FAILED');
	}

	async count(): Promise<DatabaseResult<number>> {
		return this.core.wrap(async () => {
			let q = this.db
				.select({ value: drizzleCount() })
				.from(this.table as unknown as import('drizzle-orm/pg-core').PgTable)
				.$dynamic();
			if (this.conditions.length > 0) {
				q = q.where(and(...this.conditions));
			}
			const [result] = await q;
			return Number(result.value);
		}, 'QUERY_COUNT_FAILED');
	}

	async exists(): Promise<DatabaseResult<boolean>> {
		const res = await this.count();
		if (res.success) {
			return { success: true, data: res.data > 0 };
		}
		return res as unknown as DatabaseResult<boolean>;
	}

	async findOne(): Promise<DatabaseResult<T | null>> {
		const res = await this.limit(1).execute();
		if (res.success) {
			return { success: true, data: res.data[0] || null };
		}
		return res as unknown as DatabaseResult<T | null>;
	}

	async findOneOrFail(): Promise<DatabaseResult<T>> {
		const res = await this.findOne();
		if (res.success && !res.data) {
			return { success: false, message: 'Document not found', error: { code: 'NOT_FOUND', message: 'Document not found' } };
		}
		return res as DatabaseResult<T>;
	}

	async stream(): Promise<DatabaseResult<AsyncIterable<T>>> {
		return this.core.notImplemented('queryBuilder.stream');
	}

	async updateMany(data: Partial<T>): Promise<DatabaseResult<{ modifiedCount: number }>> {
		return this.core.wrap(async () => {
			let q = this.db
				.update(this.table as unknown as import('drizzle-orm/pg-core').PgTable)
				.set(data as Record<string, unknown>)
				.$dynamic();
			if (this.conditions.length > 0) {
				q = q.where(and(...this.conditions));
			}
			const results = await q.returning();
			return { modifiedCount: results.length };
		}, 'QUERY_UPDATE_MANY_FAILED');
	}

	async deleteMany(): Promise<DatabaseResult<{ deletedCount: number }>> {
		return this.core.wrap(async () => {
			let q = this.db.delete(this.table as unknown as import('drizzle-orm/pg-core').PgTable).$dynamic();
			if (this.conditions.length > 0) {
				q = q.where(and(...this.conditions));
			}
			const results = await q.returning();
			return { deletedCount: results.length };
		}, 'QUERY_DELETE_MANY_FAILED');
	}
}
