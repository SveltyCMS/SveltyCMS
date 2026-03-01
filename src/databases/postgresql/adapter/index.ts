/**
 * @file src/databases/postgresql/adapter/index.ts
 * @description Main PostgreSQL adapter class that composes feature modules and entry point.
 *
 * Features:
 * - CRUD operations
 * - Authentication
 * - Content management
 * - Media management
 * - System preferences
 * - Virtual folders
 * - Themes
 * - Widgets
 * - Website tokens
 * - Batch operations
 * - Transactions
 * - Performance monitoring
 * - Cache management
 * - Collection management
 * - Query builder
 */

import { sql } from 'drizzle-orm';
import type {
	BaseEntity,
	DatabaseId,
	DatabaseResult,
	DatabaseTransaction,
	IDBAdapter,
	PaginationOption,
	QueryBuilder,
	Tenant
} from '../../db-interface';
import { CollectionModule } from '../collection/collection-module';
import { CrudModule } from '../crud/crud-module';
import { runMigrations } from '../migrations';
import { AuthModule } from '../modules/auth/auth-module';
import { ContentModule } from '../modules/content/content-module';
import { MediaModule } from '../modules/media/media-module';
import { PreferencesModule } from '../modules/system/preferences-module';
import { VirtualFoldersModule } from '../modules/system/virtual-folders-module';
import { ThemesModule } from '../modules/themes/themes-module';
import { WebsiteTokensModule } from '../modules/website/tokens-module';
import { WidgetsModule } from '../modules/widgets/widgets-module';
import { BatchModule } from '../operations/batch-module';
import { TransactionModule } from '../operations/transaction-module';
import { CacheModule } from '../performance/cache-module';
import { PerformanceModule } from '../performance/performance-module';
import { PostgresQueryBuilder } from '../query-builder/postgres-query-builder';
import * as utils from '../utils';
import { AdapterCore } from './adapter-core';

export class PostgreSQLAdapter extends AdapterCore implements IDBAdapter {
	public readonly tenants = {
		create: async (tenant: Omit<Tenant, '_id' | 'createdAt' | 'updatedAt'> & { _id?: DatabaseId }): Promise<DatabaseResult<Tenant>> => {
			return this.wrap(async () => {
				const id = (tenant._id || utils.generateId()) as string;
				const now = new Date();
				const result = await this.sql!`
					INSERT INTO tenants (_id, name, "ownerId", status, plan, quota, usage, settings, "createdAt", "updatedAt")
					VALUES (${id}, ${tenant.name}, ${tenant.ownerId}, ${tenant.status || 'active'}, ${tenant.plan || 'free'},
						${JSON.stringify(tenant.quota || {})}::json, ${JSON.stringify(tenant.usage || {})}::json,
						${JSON.stringify(tenant.settings || {})}::json, ${now}, ${now})
					RETURNING *`;
				return result[0] as unknown as Tenant;
			}, 'TENANT_CREATE_FAILED');
		},
		getById: async (tenantId: DatabaseId): Promise<DatabaseResult<Tenant | null>> => {
			return this.wrap(async () => {
				const result = await this.sql!`SELECT * FROM tenants WHERE _id = ${tenantId as string}`;
				return (result[0] as unknown as Tenant) || null;
			}, 'TENANT_GET_FAILED');
		},
		update: async (tenantId: DatabaseId, data: Partial<Omit<Tenant, 'createdAt' | 'updatedAt'>>): Promise<DatabaseResult<Tenant>> => {
			return this.wrap(async () => {
				const now = new Date();
				const setClauses: string[] = ['"updatedAt" = $1'];
				const values: unknown[] = [now];
				let paramIdx = 2;
				for (const [key, value] of Object.entries(data)) {
					if (key === '_id') continue;
					const quotedKey = key.includes(/[A-Z]/.test(key) ? '"' : '') ? `"${key}"` : key;
					if (['quota', 'usage', 'settings'].includes(key)) {
						setClauses.push(`${quotedKey} = $${paramIdx}::json`);
						values.push(JSON.stringify(value));
					} else {
						setClauses.push(`${quotedKey} = $${paramIdx}`);
						values.push(value);
					}
					paramIdx++;
				}
				values.push(tenantId as string);
				// Use simple query approach
				await this.sql!.unsafe(`UPDATE tenants SET ${setClauses.join(', ')} WHERE _id = $${paramIdx}`, values as never[]);
				const result = await this.sql!`SELECT * FROM tenants WHERE _id = ${tenantId as string}`;
				return result[0] as unknown as Tenant;
			}, 'TENANT_UPDATE_FAILED');
		},
		delete: async (tenantId: DatabaseId): Promise<DatabaseResult<void>> => {
			return this.wrap(async () => {
				await this.sql!`DELETE FROM tenants WHERE _id = ${tenantId as string}`;
			}, 'TENANT_DELETE_FAILED');
		},
		list: async (options?: PaginationOption): Promise<DatabaseResult<Tenant[]>> => {
			return this.wrap(async () => {
				let query = 'SELECT * FROM tenants';
				const params: unknown[] = [];
				let paramIdx = 1;
				if (options?.limit) {
					query += ` LIMIT $${paramIdx}`;
					params.push(options.limit);
					paramIdx++;
				}
				if (options?.offset) {
					query += ` OFFSET $${paramIdx}`;
					params.push(options.offset);
				}
				const result = await this.sql!.unsafe(query, params as never[]);
				return result as unknown as Tenant[];
			}, 'TENANT_LIST_FAILED');
		}
	};
	public readonly crud: CrudModule;
	public readonly auth: AuthModule;
	public readonly content: ContentModule;
	public readonly media: MediaModule;
	public readonly systemPreferences: PreferencesModule;
	public readonly systemVirtualFolder: VirtualFoldersModule;
	public readonly themes: ThemesModule;
	public readonly widgets: WidgetsModule;
	public readonly websiteTokens: WebsiteTokensModule;
	public readonly batch: BatchModule;
	private readonly transactionModule: TransactionModule;
	public readonly performance: PerformanceModule;
	public readonly cache: CacheModule;
	public readonly collection: CollectionModule;
	public readonly utils = utils;

	constructor() {
		super();
		this.crud = new CrudModule(this);
		this.auth = new AuthModule(this);
		this.content = new ContentModule(this);
		this.media = new MediaModule(this);
		this.systemPreferences = new PreferencesModule(this);
		this.systemVirtualFolder = new VirtualFoldersModule(this);
		this.themes = new ThemesModule(this);
		this.widgets = new WidgetsModule(this);
		this.websiteTokens = new WebsiteTokensModule(this);
		this.batch = new BatchModule(this);
		this.transactionModule = new TransactionModule(this);
		this.performance = new PerformanceModule(this);
		this.cache = new CacheModule(this);
		this.collection = new CollectionModule(this);
	}

	async connect(connection: string | Record<string, unknown>, options?: unknown): Promise<DatabaseResult<void>>;
	async connect(poolOptions?: import('../../db-interface').ConnectionPoolOptions): Promise<DatabaseResult<void>>;
	public async connect(
		connectionOrOptions?: string | import('../../db-interface').ConnectionPoolOptions,
		options?: unknown
	): Promise<DatabaseResult<void>> {
		const result = await super.connect(connectionOrOptions as string | Record<string, unknown>, options);
		if (result.success && this.sql) {
			const migrationResult = await runMigrations(this.sql);
			if (!migrationResult.success) {
				return {
					success: false,
					message: 'Migration failed',
					error: { code: 'MIGRATION_FAILED', message: migrationResult.error || 'Unknown migration error' }
				};
			}
		}
		return result;
	}

	public async clearDatabase(): Promise<DatabaseResult<void>> {
		return this.wrap(async () => {
			if (!this.db) {
				throw new Error('Not connected');
			}
			// PostgreSQL cleanup: DROP SCHEMA public CASCADE and recreate it
			await this.db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE;`);
			await this.db.execute(sql`CREATE SCHEMA public;`);
			await this.db.execute(sql`GRANT ALL ON SCHEMA public TO public;`);
		}, 'CLEAR_DATABASE_FAILED');
	}

	/**
	 * Cleanup expired sessions and tokens (TTL-equivalent for SQL databases).
	 * MongoDB handles this automatically via TTL indexes; SQL databases need manual cleanup.
	 */
	public async cleanupExpiredData(): Promise<DatabaseResult<{ sessions: number; tokens: number }>> {
		return this.wrap(async () => {
			const sessionResult = await this.sql!`DELETE FROM auth_sessions WHERE expires < CURRENT_TIMESTAMP`;
			const tokenResult = await this.sql!`
				DELETE FROM auth_tokens WHERE (expires < CURRENT_TIMESTAMP)
				OR (consumed = TRUE AND "updatedAt" < CURRENT_TIMESTAMP - INTERVAL '24 hours')`;
			return {
				sessions: sessionResult.count,
				tokens: tokenResult.count
			};
		}, 'CLEANUP_EXPIRED_DATA_FAILED');
	}

	public queryBuilder = <T extends BaseEntity>(collection: string): QueryBuilder<T> => {
		return new PostgresQueryBuilder<T>(this, collection);
	};

	public transaction = async <T>(
		fn: (transaction: DatabaseTransaction) => Promise<DatabaseResult<T>>,
		options?: {
			isolationLevel?: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable';
		}
	): Promise<DatabaseResult<T>> => {
		return this.transactionModule.execute(fn, options);
	};

	// Global CRUD data methods
	getCollectionData = async (
		collection: string,
		options?: {
			limit?: number;
			offset?: number;
			includeMetadata?: boolean;
			fields?: string[];
		}
	): Promise<
		DatabaseResult<{
			data: unknown[];
			metadata?: { totalCount: number; schema?: unknown; indexes?: string[] };
		}>
	> => {
		return this.wrap(async () => {
			const res = await this.crud.findMany<BaseEntity>(collection, {}, options as Record<string, unknown>);
			if (!res.success) {
				throw new Error(res.message);
			}
			return {
				data: res.data ?? [],
				metadata: options?.includeMetadata ? { totalCount: res.data?.length ?? 0 } : undefined
			};
		}, 'GET_COLLECTION_DATA_FAILED');
	};

	getMultipleCollectionData = async (
		collectionNames: string[],
		options?: { limit?: number; fields?: string[] }
	): Promise<DatabaseResult<Record<string, unknown[]>>> => {
		return this.wrap(async () => {
			const results: Record<string, unknown[]> = {};
			for (const name of collectionNames) {
				const res = await this.getCollectionData(name, {
					limit: options?.limit,
					fields: options?.fields
				});
				if (res.success) {
					results[name] = res.data.data;
				}
			}
			return results;
		}, 'GET_MULTIPLE_COLLECTION_DATA_FAILED');
	};
}
