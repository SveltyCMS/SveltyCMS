/**
 * @file src/databases/sqlite/adapter/index.ts
 * @description Main SQLite adapter class.
 *
 * Features:
 * - CRUD operations
 * - Transactions
 * - Query builder
 * - Migrations
 * - Multi-tenancy
 */

import { eq } from 'drizzle-orm';
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
import { SQLiteQueryBuilder } from '../query-builder/sq-lite-query-builder';
import * as schema from '../schema';
import * as utils from '../utils';
import { AdapterCore } from './adapter-core';

export class SQLiteAdapter extends AdapterCore implements IDBAdapter {
	public readonly tenants = {
		create: async (tenant: Omit<Tenant, '_id' | 'createdAt' | 'updatedAt'> & { _id?: DatabaseId }): Promise<DatabaseResult<Tenant>> => {
			return this.wrap(async () => {
				const id = (tenant._id || utils.generateId()) as string;
				const now = new Date();
				const values: typeof schema.tenants.$inferInsert = {
					...tenant,
					_id: id,
					createdAt: now,
					updatedAt: now
				};
				await this.db.insert(schema.tenants).values(values);
				const [result] = await this.db.select().from(schema.tenants).where(eq(schema.tenants._id, id));
				return result as unknown as Tenant;
			}, 'TENANT_CREATE_FAILED');
		},
		getById: async (tenantId: DatabaseId): Promise<DatabaseResult<Tenant | null>> => {
			return this.wrap(async () => {
				const [result] = await this.db
					.select()
					.from(schema.tenants)
					.where(eq(schema.tenants._id, tenantId as string));
				return (result as unknown as Tenant) || null;
			}, 'TENANT_GET_FAILED');
		},
		update: async (tenantId: DatabaseId, data: Partial<Omit<Tenant, 'createdAt' | 'updatedAt'>>): Promise<DatabaseResult<Tenant>> => {
			return this.wrap(async () => {
				const now = new Date();
				await this.db
					.update(schema.tenants)
					.set({ ...data, updatedAt: now } as typeof schema.tenants.$inferInsert)
					.where(eq(schema.tenants._id, tenantId as string));
				const [result] = await this.db
					.select()
					.from(schema.tenants)
					.where(eq(schema.tenants._id, tenantId as string));
				return result as unknown as Tenant;
			}, 'TENANT_UPDATE_FAILED');
		},
		delete: async (tenantId: DatabaseId): Promise<DatabaseResult<void>> => {
			return this.wrap(async () => {
				await this.db.delete(schema.tenants).where(eq(schema.tenants._id, tenantId as string));
			}, 'TENANT_DELETE_FAILED');
		},
		list: async (options?: PaginationOption): Promise<DatabaseResult<Tenant[]>> => {
			return this.wrap(async () => {
				let q = this.db.select().from(schema.tenants).$dynamic();
				if (options?.limit) {
					q = q.limit(options.limit);
				}
				if (options?.offset) {
					q = q.offset(options.offset);
				}
				const results = await q;
				return results as unknown as Tenant[];
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

	public async ensureAuth(): Promise<void> {
		// Check if roles exist
		const existingRoles = await this.db.select().from(schema.roles).limit(1);
		if (existingRoles.length > 0) {
			return;
		}

		const now = new Date();
		const rolesPayload: (typeof schema.roles.$inferInsert)[] = [
			{
				_id: 'admin',
				name: 'Administrator',
				description: 'Administrator with full access',
				isAdmin: true,
				permissions: [],
				icon: 'bi:shield-lock-fill',
				color: '#ff3e00',
				createdAt: now,
				updatedAt: now
			},
			{
				_id: 'developer',
				name: 'Developer',
				description: 'Developer with access to most features',
				isAdmin: false,
				permissions: [
					'collection:create',
					'collection:read',
					'collection:update',
					'collection:delete',
					'user:read',
					'user:create',
					'user:update',
					'content:create',
					'content:read',
					'content:update',
					'content:delete',
					'content:publish',
					'media:upload',
					'media:read',
					'media:update',
					'media:delete'
				],
				icon: 'bi:code-slash',
				color: '#007bff',
				createdAt: now,
				updatedAt: now
			},
			{
				_id: 'editor',
				name: 'Editor',
				description: 'Editor with access to content',
				isAdmin: false,
				permissions: [
					'content:create',
					'content:read',
					'content:update',
					'content:delete',
					'content:publish',
					'media:upload',
					'media:read',
					'media:update'
				],
				icon: 'bi:pencil-fill',
				color: '#28a745',
				createdAt: now,
				updatedAt: now
			},
			{
				_id: 'user',
				name: 'User',
				description: 'Standard user',
				isAdmin: false,
				permissions: ['content:read'],
				icon: 'bi:person-fill',
				color: '#6c757d',
				createdAt: now,
				updatedAt: now
			}
		];

		await this.db.insert(schema.roles).values(rolesPayload);
	}

	public async ensureSystem(): Promise<void> {
		// SQLite modules are pre-initialized in constructor
		// We can add system settings seeding here if needed in the future
		return Promise.resolve();
	}

	async connect(connection: string | { connectionString?: string; filename?: string }, options?: unknown): Promise<DatabaseResult<void>>;
	async connect(poolOptions?: import('../../db-interface').ConnectionPoolOptions): Promise<DatabaseResult<void>>;
	public async connect(connectionOrOptions?: any, _options?: unknown): Promise<DatabaseResult<void>> {
		const result = await super.connect(connectionOrOptions as string | { connectionString?: string; filename?: string });
		if (result.success && this.sqlite) {
			const { runMigrations } = await import('../migrations');
			const migrationResult = await runMigrations(this.sqlite);
			if (!migrationResult.success) {
				return {
					success: false,
					message: 'Migration failed',
					error: this.utils.createDatabaseError('MIGRATION_FAILED', migrationResult.error || 'Unknown migration error')
				};
			}
		}
		return result;
	}

	public async clearDatabase(): Promise<DatabaseResult<void>> {
		// SQLite-specific cleanup: Drop all tables
		return this.wrap(async () => {
			// Disable foreign keys to allow dropping tables in any order
			this.sqlite.exec('PRAGMA foreign_keys = OFF;');

			// Support both Bun (query) and Node/better-sqlite3 (prepare)
			let tables: { name: string }[];
			if (this.sqlite.query) {
				tables = this.sqlite.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';").all() as { name: string }[];
			} else if (this.sqlite.prepare) {
				tables = this.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';").all() as { name: string }[];
			} else {
				throw new Error('SQLite adapter: Neither query() nor prepare() methods found on connection object.');
			}

			for (const { name } of tables) {
				this.sqlite.exec(`DELETE FROM "${name}";`);
				try {
					this.sqlite.exec(`DELETE FROM sqlite_sequence WHERE name='${name}';`);
				} catch (_e) {
					// Ignore if sqlite_sequence doesn't exist or table not tracked
				}
			}

			this.sqlite.exec('PRAGMA foreign_keys = ON;');
		}, 'CLEAR_DATABASE_FAILED');
	}

	public queryBuilder = <T extends BaseEntity>(collection: string): QueryBuilder<T> => {
		return new SQLiteQueryBuilder<T>(this, collection);
	};

	public transaction = async <T>(
		fn: (transaction: DatabaseTransaction) => Promise<DatabaseResult<T>>,
		options?: {
			isolationLevel?: 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';
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
