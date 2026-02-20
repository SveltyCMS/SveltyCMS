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
		return this.core.collectionRegistry as Map<string, CollectionModel>;
	}

	async getModel(id: string): Promise<CollectionModel> {
		const model = this.collectionRegistry.get(id);
		if (model) {
			return model;
		}

		return {
			findOne: async (query: Record<string, unknown>) => {
				const res = await this.crud.findOne<any>(id, query);
				return res.success ? (res.data as Record<string, unknown>) : null;
			},
			aggregate: async (pipeline: unknown[]) => {
				const res = await this.crud.aggregate<Record<string, unknown>>(id, pipeline);
				return res.success ? res.data : [];
			}
		};
	}

	async createModel(schemaData: Schema): Promise<void> {
		const id = schemaData._id;
		if (!id) {
			throw new Error('Schema must have an _id');
		}

		const wrappedModel: CollectionModel = {
			findOne: async (query: Record<string, unknown>) => {
				const res = await this.crud.findOne<any>(id, query);
				return res.success ? (res.data as Record<string, unknown>) : null;
			},
			aggregate: async (pipeline: unknown[]) => {
				const res = await this.crud.aggregate<Record<string, unknown>>(id, pipeline);
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
