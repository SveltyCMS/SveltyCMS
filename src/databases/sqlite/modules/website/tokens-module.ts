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
import { nowISODateString } from '@src/utils/date-utils';

export class WebsiteTokensModule {
	private readonly core: AdapterCore;

	constructor(core: AdapterCore) {
		this.core = core;
	}

	private get db() {
		return (this.core as any).db;
	}

	async create(token: Omit<WebsiteToken, '_id' | 'createdAt'>): Promise<DatabaseResult<WebsiteToken>> {
		return (this.core as any).wrap(async () => {
			const id = utils.generateId();
			const now = nowISODateString();
			await this.db.insert(schema.websiteTokens).values({
				...token,
				_id: id,
				createdAt: now,
				updatedAt: now
			} as any);
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
		return (this.core as any).wrap(async () => {
			let q: any = this.db.select().from(schema.websiteTokens);

			if (options.sort) {
				const order = options.order === 'desc' ? desc : asc;
				if ((schema.websiteTokens as any)[options.sort]) {
					q = q.orderBy(order((schema.websiteTokens as any)[options.sort]));
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
			const [countResult] = await this.db.select({ count: sql`count(*)` }).from(schema.websiteTokens);
			const total = (countResult as any).count;

			return {
				data: utils.convertArrayDatesToISO(results) as unknown as WebsiteToken[],
				total: Number(total)
			};
		}, 'GET_WEBSITE_TOKENS_FAILED');
	}

	async getByName(name: string): Promise<DatabaseResult<WebsiteToken | null>> {
		return (this.core as any).wrap(async () => {
			const [result] = await this.db.select().from(schema.websiteTokens).where(eq(schema.websiteTokens.name, name)).limit(1);
			return result ? (utils.convertDatesToISO(result) as unknown as WebsiteToken) : null;
		}, 'GET_WEBSITE_TOKEN_BY_NAME_FAILED');
	}

	async delete(tokenId: DatabaseId): Promise<DatabaseResult<void>> {
		return (this.core as any).wrap(async () => {
			await this.db.delete(schema.websiteTokens).where(eq(schema.websiteTokens._id, tokenId));
		}, 'DELETE_WEBSITE_TOKEN_FAILED');
	}
}
