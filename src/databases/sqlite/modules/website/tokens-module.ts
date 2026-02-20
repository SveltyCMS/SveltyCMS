/**
 * @file src/databases/mariadb/modules/website/tokens-module.ts
 * @description Website tokens module for MariaDB
 *
 * Features:
 * - Create token
 * - Get all tokens
 * - Get token by ID
 * - Update token
 * - Delete token
 */

import { asc, desc, eq, sql } from 'drizzle-orm';
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
		return this.core.db;
	}

	async create(token: Omit<WebsiteToken, '_id' | 'createdAt'>): Promise<DatabaseResult<WebsiteToken>> {
		return this.core.wrap(async () => {
			const id = utils.generateId();
			const now = isoDateStringToDate(nowISODateString());
			// expiresAt might be ISODateString in token object
			const expiresAt = token.expiresAt ? isoDateStringToDate(token.expiresAt) : null;
			await this.db.insert(schema.websiteTokens).values({
				...token,
				_id: id,
				expiresAt,
				createdAt: now,
				updatedAt: now
			} as typeof schema.websiteTokens.$inferInsert);
			const [result] = await this.db.select().from(schema.websiteTokens).where(eq(schema.websiteTokens._id, id)).limit(1);
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
				const order = options.order === 'desc' ? desc : asc;
				const column = (schema.websiteTokens as unknown as Record<string, import('drizzle-orm/sqlite-core').SQLiteColumn>)[options.sort];
				if (column) {
					q = q.orderBy(order(column));
				}
			}

			if (options.limit) {
				q = q.limit(options.limit);
			}
			if (options.skip) {
				q = q.offset(options.skip);
			}

			const results = await q;
			// total count
			const [countResult] = await this.db.select({ count: sql<number>`count(*)` }).from(schema.websiteTokens);
			const total = countResult.count;

			return {
				data: utils.convertArrayDatesToISO(results) as unknown as WebsiteToken[],
				total: Number(total)
			};
		}, 'GET_WEBSITE_TOKENS_FAILED');
	}

	async getByName(name: string): Promise<DatabaseResult<WebsiteToken | null>> {
		return this.core.wrap(async () => {
			const [result] = await this.db.select().from(schema.websiteTokens).where(eq(schema.websiteTokens.name, name)).limit(1);
			return result ? (utils.convertDatesToISO(result) as unknown as WebsiteToken) : null;
		}, 'GET_WEBSITE_TOKEN_BY_NAME_FAILED');
	}

	async delete(tokenId: DatabaseId): Promise<DatabaseResult<void>> {
		return this.core.wrap(async () => {
			await this.db.delete(schema.websiteTokens).where(eq(schema.websiteTokens._id, tokenId));
		}, 'DELETE_WEBSITE_TOKEN_FAILED');
	}
}
