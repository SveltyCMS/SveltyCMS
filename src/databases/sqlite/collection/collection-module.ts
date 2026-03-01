/**
 * @file src/databases/mariadb/collection/collection-module.ts
 * @description Dynamic collection management module for MariaDB
 *
 * Features:
 * - Create collection
 * - Update collection
 * - Delete collection
 */

import type { Schema } from '@src/content/types';
import type { CollectionModel, DatabaseResult } from '../../db-interface';
import type { AdapterCore } from '../adapter/adapter-core';

export class CollectionModule {
	private readonly core: AdapterCore;

	constructor(core: AdapterCore) {
		this.core = core;
	}

	private get crud() {
		return this.core.crud;
	}

	private get collectionRegistry() {
		return this.core.collectionRegistry;
	}

	async getModel(id: string): Promise<CollectionModel> {
		const model = this.collectionRegistry.get(id);
		if (model) {
			return model;
		}

		return {
			findOne: async <R = unknown>(query: Record<string, unknown>) => {
				const res = await this.crud.findOne<any>(id, query as import('../../db-interface').QueryFilter<Record<string, unknown>>);
				return res.success ? (res.data as R) : null;
			},
			aggregate: async <R = unknown>(pipeline: Record<string, unknown>[]) => {
				const res = await this.crud.aggregate<R>(id, pipeline);
				return res.success ? res.data : [];
			}
		};
	}

	async createModel(schemaData: Schema): Promise<void> {
		const id = schemaData._id;
		if (!id) {
			throw new Error('Schema must have an _id');
		}

		const tableName = `collection_${id}`;

		try {
			// Ensure physical table exists in SQLite
			const sql = `
				CREATE TABLE IF NOT EXISTS "${tableName}" (
					"_id" TEXT PRIMARY KEY,
					"tenantId" TEXT,
					"data" TEXT NOT NULL DEFAULT '{}',
					"status" TEXT NOT NULL DEFAULT 'draft',
					"createdAt" INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
					"updatedAt" INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
				);
			`;
			const client = this.core.getClient();
			if (client) {
				if (typeof client.exec === 'function') {
					client.exec(sql);
				} else if (typeof client.query === 'function') {
					client.query(sql);
				}
			}
		} catch (error) {
			console.error(`Failed to create physical table ${tableName}:`, error);
			// Continue anyway, it might fail later during CRUD but we don't want to crash the whole adapter init
		}

		const wrappedModel: CollectionModel = {
			findOne: async <R = unknown>(query: Record<string, unknown>) => {
				const res = await this.crud.findOne<any>(id, query as import('../../db-interface').QueryFilter<Record<string, unknown>>);
				return res.success ? (res.data as R) : null;
			},
			aggregate: async <R = unknown>(pipeline: Record<string, unknown>[]) => {
				const res = await this.crud.aggregate<R>(id, pipeline);
				return res.success ? res.data : [];
			}
		};
		this.collectionRegistry.set(id, wrappedModel);
	}

	async updateModel(schemaData: Schema): Promise<void> {
		await this.createModel(schemaData);
	}

	async deleteModel(id: string): Promise<void> {
		this.collectionRegistry.delete(id);
	}

	async getSchema(_collectionName: string): Promise<DatabaseResult<Schema | null>> {
		return this.core.notImplemented('getSchema');
	}

	async listSchemas(): Promise<DatabaseResult<Schema[]>> {
		return this.core.notImplemented('listSchemas');
	}
}
