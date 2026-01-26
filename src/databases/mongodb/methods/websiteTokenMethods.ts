/**
 * @file src/databases/mongodb/methods/websiteTokenMethods.ts
 * @description Generic, reusable CRUD operations for WebsiteToken collection.
 *
 * Responsibility: ALL generic CRUD operations for WebsiteToken model.
 *
 * Features:
 * - findOne, findMany, findByIds
 * - insert, update, upsert
 * - delete, deleteMany
 * - count, exists
 * - aggregate (for complex queries)
 * - Batch operations (upsertMany)
 */

import type { Model } from 'mongoose';
import type { DatabaseId, DatabaseResult, WebsiteToken } from '../../dbInterface';
import { MongoCrudMethods } from './crudMethods';

export class MongoWebsiteTokenMethods {
	private readonly crud: MongoCrudMethods<WebsiteToken>;

	constructor(websiteTokenModel: Model<WebsiteToken>) {
		this.crud = new MongoCrudMethods(websiteTokenModel);
	}

	async create(token: Omit<WebsiteToken, '_id' | 'createdAt'>): Promise<DatabaseResult<WebsiteToken>> {
		return this.crud.insert(token as WebsiteToken);
	}

	async getAll(options: {
		limit?: number;
		skip?: number;
		sort?: string;
		order?: string;
		filter?: any;
	}): Promise<DatabaseResult<{ data: WebsiteToken[]; total: number }>> {
		const sort = options.sort && options.order ? { [options.sort]: options.order as 'asc' | 'desc' | 1 | -1 } : {};

		const [dataRes, totalRes] = await Promise.all([
			this.crud.findMany(options.filter || {}, { limit: options.limit, skip: options.skip, sort }),
			this.crud.count(options.filter || {})
		]);

		if (!dataRes.success) return dataRes as any;
		if (!totalRes.success) return totalRes as any;

		return {
			success: true,
			data: { data: dataRes.data, total: totalRes.data }
		};
	}

	async delete(tokenId: DatabaseId): Promise<DatabaseResult<boolean>> {
		return this.crud.delete(tokenId);
	}

	async getByName(name: string): Promise<DatabaseResult<WebsiteToken | null>> {
		return this.crud.findOne({ name });
	}
}
