/**
 * @file src/databases/sqlite/adapter/index.ts
 * @description Main SQLite adapter class.
 */

import type { IDBAdapter, DatabaseResult, BaseEntity, DatabaseTransaction, QueryBuilder } from '../../dbInterface';
import { AdapterCore } from './adapterCore';
import { CrudModule } from '../crud/crudModule';
import { AuthModule } from '../modules/auth/authModule';
import { ContentModule } from '../modules/content/contentModule';
import { MediaModule } from '../modules/media/mediaModule';
import { PreferencesModule } from '../modules/system/preferencesModule';
import { VirtualFoldersModule } from '../modules/system/virtualFoldersModule';
import { ThemesModule } from '../modules/themes/themesModule';
import { WidgetsModule } from '../modules/widgets/widgetsModule';
import { WebsiteTokensModule } from '../modules/website/tokensModule';
import { BatchModule } from '../operations/batchModule';
import { TransactionModule } from '../operations/transactionModule';
import { PerformanceModule } from '../performance/performanceModule';
import { CacheModule } from '../performance/cacheModule';
import { CollectionModule } from '../collection/collectionModule';
import { SQLiteQueryBuilder } from '../queryBuilder/SQLiteQueryBuilder';
import * as utils from '../utils';

export class SQLiteAdapter extends AdapterCore implements IDBAdapter {
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

	public async connect(connection: any, _options?: any): Promise<DatabaseResult<void>> {
		const result = await super.connect(connection);
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

	public queryBuilder = <T extends BaseEntity>(collection: string): QueryBuilder<T> => {
		return new SQLiteQueryBuilder<T>(this, collection);
	};

	public transaction = async <T>(
		fn: (transaction: DatabaseTransaction) => Promise<DatabaseResult<T>>,
		options?: { isolationLevel?: 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE' }
	): Promise<DatabaseResult<T>> => {
		return this.transactionModule.execute(fn, options);
	};

	// Global CRUD data methods
	getCollectionData = async (
		collection: string,
		options?: { limit?: number; offset?: number; includeMetadata?: boolean; fields?: string[] }
	): Promise<DatabaseResult<{ data: any[]; metadata?: { totalCount: number; schema?: unknown; indexes?: string[] } }>> => {
		return (this as any).wrap(async () => {
			const res = await this.crud.findMany(collection, {}, options as any);
			if (!res.success) throw new Error(res.message);
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
		return (this as any).wrap(async () => {
			const results: Record<string, any[]> = {};
			for (const name of collectionNames) {
				const res = await this.getCollectionData(name, { limit: options?.limit, fields: options?.fields });
				if (res.success) results[name] = res.data.data;
			}
			return results;
		}, 'GET_MULTIPLE_COLLECTION_DATA_FAILED');
	};
}
