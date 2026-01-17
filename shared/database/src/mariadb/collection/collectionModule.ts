/**
 * @file shared/database/src/mariadb/collection/collectionModule.ts
 * @description Dynamic collection management module for MariaDB
 *
 * Features:
 * - Create collection
 * - Update collection
 * - Delete collection
 */

import type { CollectionModel } from '../../dbInterface';
import type { Schema } from '@cms-types/content';
import { AdapterCore } from '../adapter/adapterCore';

export class CollectionModule {
	private core: AdapterCore;

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
		if (model) return model;

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
		if (!id) throw new Error('Schema must have an _id');

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
}
