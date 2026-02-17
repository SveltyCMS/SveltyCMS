/**
 * @file src/databases/mariadb/collection/collectionModule.ts
 * @description Dynamic collection management module for MariaDB
 *
 * Features:
 * - Create collection
 * - Update collection
 * - Delete collection
 */

import type { Schema } from '@src/content/types';
import type { CollectionModel, DatabaseResult } from '../../dbInterface';
import type { AdapterCore } from '../adapter/adapterCore';

export class CollectionModule {
	private readonly core: AdapterCore;

	constructor(core: AdapterCore) {
		this.core = core;
	}

	private get crud() {
		return (this.core as any).crud;
	}

	private get collectionRegistry() {
		return (this.core as any).collectionRegistry;
	}

	async getModel(id: string): Promise<CollectionModel> {
		const model = this.collectionRegistry.get(id);
		if (model) {
			return model;
		}

		return {
			findOne: async (query) => {
				const res = await this.crud.findOne(id, query as any);
				return res.success ? (res.data as any) : null;
			},
			aggregate: async (pipeline) => {
				const res = await this.crud.aggregate(id, pipeline);
				return res.success ? (res.data as any[]) : [];
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
			const client = (this.core as any).getClient();
			if (client) {
				if (typeof client.exec === 'function') {
					client.exec(sql);
				} else if (typeof client.run === 'function') {
					client.run(sql);
				}
			}
		} catch (error) {
			console.error(`Failed to create physical table ${tableName}:`, error);
			// Continue anyway, it might fail later during CRUD but we don't want to crash the whole adapter init
		}

		const wrappedModel: CollectionModel = {
			findOne: async (query) => {
				const res = await this.crud.findOne(id, query as any);
				return res.success ? (res.data as any) : null;
			},
			aggregate: async (pipeline) => {
				const res = await this.crud.aggregate(id, pipeline);
				return res.success ? (res.data as any[]) : [];
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
		return (this.core as any).notImplemented('getSchema');
	}

	async listSchemas(): Promise<DatabaseResult<Schema[]>> {
		return (this.core as any).notImplemented('listSchemas');
	}
}
