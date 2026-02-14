/**
 * @file src/databases/mariadb/modules/website/tokensModule.ts
 * @description Website tokens module for MariaDB
 *
 * Features:
 * - Create token
 * - Get all tokens
 * - Get token by ID
 * - Update token
 * - Delete token
 */

import { eq, desc, asc, sql } from 'drizzle-orm';
import type { WebsiteToken, DatabaseId, DatabaseResult } from '../../../dbInterface';
import { AdapterCore } from '../../adapter/adapterCore';
import * as schema from '../../schema';
import * as utils from '../../utils';

export class WebsiteTokensModule {
	private core: AdapterCore;

	constructor(core: AdapterCore) {
		this.core = core;
	}

	private get db() {
		return (this.core as any).db;
	}

	private mapToken(dbToken: any): WebsiteToken {
		const token = utils.convertDatesToISO(dbToken) as any;
		return {
			...token,
			permissions: utils.parseJsonField<string[]>(token.permissions, [])
		} as unknown as WebsiteToken;
	}

	async create(token: Omit<WebsiteToken, '_id' | 'createdAt'>): Promise<DatabaseResult<WebsiteToken>> {
		return (this.core as any).wrap(async () => {
			const id = utils.generateId();
			const now = new Date();
			// Convert ISO string dates to Date objects for Drizzle datetime columns
			// Truncate milliseconds since MariaDB DATETIME has second precision
			const rawExpires = (token as any).expiresAt ? new Date((token as any).expiresAt) : null;
			const expiresAt = rawExpires ? new Date(Math.floor(rawExpires.getTime() / 1000) * 1000) : null;
			await this.db.insert(schema.websiteTokens).values({
				...token,
				_id: id,
				expiresAt,
				createdAt: now,
				updatedAt: now
			} as any);
			const [result] = await this.db.select().from(schema.websiteTokens).where(eq(schema.websiteTokens._id, id)).limit(1);
			return this.mapToken(result);
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

			if (options.limit) q = q.limit(options.limit);
			if (options.skip) q = q.offset(options.skip);

			const results = await q;
			// total count
			const [countResult] = await this.db.select({ count: sql`count(*)` }).from(schema.websiteTokens);
			const total = (countResult as any).count;

			return {
				data: results.map((r: any) => this.mapToken(r)),
				total: Number(total)
			};
		}, 'GET_WEBSITE_TOKENS_FAILED');
	}

	async getByName(name: string): Promise<DatabaseResult<WebsiteToken | null>> {
		return (this.core as any).wrap(async () => {
			const [result] = await this.db.select().from(schema.websiteTokens).where(eq(schema.websiteTokens.name, name)).limit(1);
			return result ? this.mapToken(result) : null;
		}, 'GET_WEBSITE_TOKEN_BY_NAME_FAILED');
	}

	async delete(tokenId: DatabaseId): Promise<DatabaseResult<void>> {
		return (this.core as any).wrap(async () => {
			await this.db.delete(schema.websiteTokens).where(eq(schema.websiteTokens._id, tokenId));
		}, 'DELETE_WEBSITE_TOKEN_FAILED');
	}
}
