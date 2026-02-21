/**
 * @file src/databases/postgresql/collection/collection-module.ts
 * @description Collection management module for PostgreSQL
 */

import { logger } from '@utils/logger';
import { sql } from 'drizzle-orm';
import type { CollectionModel, DatabaseResult, Schema } from '../../db-interface';
import type { AdapterCore } from '../adapter/adapter-core';

export class CollectionModule {
	private readonly core: AdapterCore;

	constructor(core: AdapterCore) {
		this.core = core;
	}

	private get db() {
		return this.core.db!;
	}

	async getModel(id: string): Promise<CollectionModel> {
		return {
			findOne: async (query: Record<string, unknown>) => {
				const table = this.core.getTable(id);
				const where = this.core.mapQuery(table, query) as import('drizzle-orm').SQL | undefined;
				const [result] =
					(await this.db
						.select()
						.from(table as unknown as import('drizzle-orm/pg-core').PgTable)
						.where(where)
						.limit(1)) ?? [];
				return result as Record<string, unknown> | null;
			},
			aggregate: async (_pipeline: Record<string, unknown>[]) => {
				throw new Error('Aggregate not yet implemented for PostgreSQL collection module');
			}
		};
	}

	async createModel(_schema: Schema, _force?: boolean): Promise<void> {
		logger.info(`PostgreSQL createModel: Using existing tables for ${_schema.name}`);
	}

	async updateModel(_schema: Schema): Promise<void> {
		logger.info(`PostgreSQL updateModel: Using existing tables for ${_schema.name}`);
	}

	async deleteModel(_id: string): Promise<void> {
		logger.info(`PostgreSQL deleteModel: Removing reference for ${_id}`);
	}

	async getSchema(collectionName: string): Promise<DatabaseResult<Schema | null>> {
		return this.core.wrap(async () => {
			const [result] = await this.db.execute(
				sql`SELECT "collectionDef" FROM "system_content_structure" WHERE "name" = ${collectionName} AND "nodeType" = 'collection' LIMIT 1`
			);
			if (!result) {
				return null;
			}
			return (result as unknown as { collectionDef: Schema }).collectionDef;
		}, 'GET_SCHEMA_FAILED');
	}

	async listSchemas(): Promise<DatabaseResult<Schema[]>> {
		return this.core.wrap(async () => {
			const results = await this.db.execute(sql`SELECT "collectionDef" FROM "system_content_structure" WHERE "nodeType" = 'collection'`);
			return (results as unknown as { collectionDef: Schema }[]).map((r) => r.collectionDef).filter(Boolean);
		}, 'LIST_SCHEMAS_FAILED');
	}
}
