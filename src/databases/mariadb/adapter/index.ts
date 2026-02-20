/**
 * @file src/databases/mariadb/adapter/index.ts
 * @description Main MariaDB adapter class that composes feature modules and entry point.
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

import type { BaseEntity, DatabaseResult, DatabaseTransaction, IDBAdapter, QueryBuilder } from '../../db-interface';
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
import { MariaDBQueryBuilder } from '../query-builder/maria-db-query-builder';
import * as utils from '../utils';
import { AdapterCore } from './adapter-core';

export class MariaDBAdapter extends AdapterCore implements IDBAdapter {
	public readonly tenants = {
		create: async () => {
			throw new Error('Not implemented');
		},
		getById: async () => {
			throw new Error('Not implemented');
		},
		update: async () => {
			throw new Error('Not implemented');
		},
		delete: async () => {
			throw new Error('Not implemented');
		},
		list: async () => {
			throw new Error('Not implemented');
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

	async connect(connection: string | import('mysql2/promise').PoolOptions, options?: unknown): Promise<DatabaseResult<void>>;
	async connect(poolOptions?: import('../../db-interface').ConnectionPoolOptions): Promise<DatabaseResult<void>>;
	public async connect(
		connectionOrOptions?: string | import('mysql2/promise').PoolOptions | import('../../db-interface').ConnectionPoolOptions,
		options?: unknown
	): Promise<DatabaseResult<void>> {
		const result = await super.connect(connectionOrOptions as any, options);
		if (result.success && this.pool) {
			const { runMigrations } = await import('../migrations');
			const migrationResult = await runMigrations(this.pool);
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
		return this.wrap(async () => {
			if (!this.pool) {
				throw new Error('Not connected');
			}
			// Get all tables
			const [rows] = await this.pool.query('SHOW TABLES');
			const tables = (rows as any[]).map((row: any) => Object.values(row)[0]);

			if (tables.length > 0) {
				await this.pool.query('SET FOREIGN_KEY_CHECKS = 0');
				for (const table of tables) {
					await this.pool.query(`DROP TABLE IF EXISTS \`${table}\``);
				}
				await this.pool.query('SET FOREIGN_KEY_CHECKS = 1');
			}
		}, 'CLEAR_DATABASE_FAILED');
	}

	public queryBuilder = <T extends BaseEntity>(collection: string): QueryBuilder<T> => {
		return new MariaDBQueryBuilder<T>(this, collection);
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
			data: any[];
			metadata?: { totalCount: number; schema?: unknown; indexes?: string[] };
		}>
	> => {
		return this.wrap(async () => {
			const res = await this.crud.findMany(collection, {}, options as any);
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
	): Promise<DatabaseResult<Record<string, any[]>>> => {
		return this.wrap(async () => {
			const results: Record<string, any[]> = {};
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

export * from './adapter-core';
export * from './adapter-types';
