/**
 * @file src/databases/postgresql/modules/website/tokens-module.ts
 * @description Website tokens management module for PostgreSQL
 */

import { eq, count, desc, asc } from 'drizzle-orm';
import type { DatabaseId, DatabaseResult, WebsiteToken } from '../../../db-interface';
import type { AdapterCore } from '../../adapter/adapter-core';
import * as schema from '../../schema';
import * as utils from '../../utils';
import { isoDateStringToDate, nowISODateString } from '@src/utils/date-utils';

export class WebsiteTokensModule {
	private readonly core: AdapterCore;

	constructor(core: AdapterCore) {
		this.core = core;
	}

	private get db() {
		return this.core.db!;
	}

	async create(token: Omit<WebsiteToken, '_id' | 'createdAt'>): Promise<DatabaseResult<WebsiteToken>> {
		return this.core.wrap(async () => {
			const id = utils.generateId();
			const now = isoDateStringToDate(nowISODateString());
			const [result] = await this.db
				.insert(schema.websiteTokens)
				.values({
					...token,
					_id: id,
					createdAt: now,
					updatedAt: now
				} as typeof schema.websiteTokens.$inferInsert)
				.returning();
			return utils.convertDatesToISO(result) as unknown as WebsiteToken;
		}, 'CREATE_WEBSITE_TOKEN_FAILED');
	}

	async getAll(options: {
		limit?: number;
		skip?: number;
		sort?: string;
		order?: string;
	}): Promise<DatabaseResult<{ data: WebsiteToken[]; total: number }>> {
		return this.core.wrap(async () => {
			let q = this.db.select().from(schema.websiteTokens).$dynamic();

			if (options.sort) {
				const orderFn = options.order === 'desc' ? desc : asc;
				const column = (schema.websiteTokens as unknown as Record<string, import('drizzle-orm').Column>)[options.sort];
				if (column) {
					q = q.orderBy(orderFn(column));
				}
			}

			if (options.limit) {
				q = q.limit(options.limit);
			}
			if (options.skip) {
				q = q.offset(options.skip);
			}

			const results = await q;
			const [totalResult] = await this.db.select({ value: count() }).from(schema.websiteTokens);

			return {
				data: utils.convertArrayDatesToISO(results) as unknown as WebsiteToken[],
				total: Number(totalResult.value)
			};
		}, 'GET_ALL_WEBSITE_TOKENS_FAILED');
	}

	async getByName(name: string): Promise<DatabaseResult<WebsiteToken | null>> {
		return this.core.wrap(async () => {
			const [result] = await this.db.select().from(schema.websiteTokens).where(eq(schema.websiteTokens.name, name)).limit(1);
			return result ? (utils.convertDatesToISO(result) as unknown as WebsiteToken) : null;
		}, 'GET_WEBSITE_TOKEN_BY_NAME_FAILED');
	}

	async delete(tokenId: DatabaseId): Promise<DatabaseResult<void>> {
		return this.core.wrap(async () => {
			await this.db.delete(schema.websiteTokens).where(eq(schema.websiteTokens._id, tokenId as string));
		}, 'DELETE_WEBSITE_TOKEN_FAILED');
	}
}
