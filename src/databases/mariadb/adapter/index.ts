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
import { MariaDBQueryBuilder } from '../query-builder/maria-db-query-builder';
import * as schema from '../schema';
import * as utils from '../utils';
import { AdapterCore } from './adapter-core';

export class MariaDBAdapter extends AdapterCore implements IDBAdapter {
	public readonly system: import('../../db-interface').ISystemAdapter;
	public readonly monitoring: import('../../db-interface').IMonitoringAdapter;
	public readonly crud: CrudModule;
	public readonly auth: AuthModule;
	public readonly content: ContentModule;
	public readonly media: MediaModule;
	public readonly batch: BatchModule;
	public readonly collection: CollectionModule;
	public readonly utils = utils;
	private readonly transactionModule: TransactionModule;

	constructor() {
		super();
		this.crud = new CrudModule(this);
		this.auth = new AuthModule(this);
		this.content = new ContentModule(this);
		this.media = new MediaModule(this);
		this.collection = new CollectionModule(this);
		this.batch = new BatchModule(this);
		this.transactionModule = new TransactionModule(this);

		// Initialize nested adapters
		this.system = {
			preferences: new PreferencesModule(this),
			virtualFolder: new VirtualFoldersModule(this),
			themes: new ThemesModule(this),
			widgets: new WidgetsModule(this),
			websiteTokens: new WebsiteTokensModule(this),
			tenants: {
				create: async (tenant) =>
					this.wrap(async () => {
						const id = (tenant._id || utils.generateId()) as string;
						const now = new Date();
						const values: typeof schema.tenants.$inferInsert = {
							...tenant,
							_id: id,
							createdAt: now,
							updatedAt: now
						};
						await this.pool!.query(
							`INSERT INTO tenants (_id, name, ownerId, status, plan, quota, \`usage\`, settings, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
							[
								id,
								values.name,
								values.ownerId,
								values.status,
								values.plan,
								JSON.stringify(values.quota),
								JSON.stringify(values.usage),
								JSON.stringify(values.settings),
								now,
								now
							]
						);
						const [rows] = await this.pool!.query('SELECT * FROM tenants WHERE _id = ?', [id]);
						const result = (rows as Record<string, unknown>[])[0];
						return utils.parseJsonField(result, ['quota', 'usage', 'settings']) as unknown as Tenant;
					}, 'TENANT_CREATE_FAILED'),
				getById: async (tenantId: DatabaseId) =>
					this.wrap(async () => {
						const [rows] = await this.pool!.query('SELECT * FROM tenants WHERE _id = ?', [tenantId as string]);
						const result = (rows as Record<string, unknown>[])[0];
						if (!result) return null;
						return utils.parseJsonField(result, ['quota', 'usage', 'settings']) as unknown as Tenant;
					}, 'TENANT_GET_FAILED'),
				update: async (tenantId: DatabaseId, data: any) =>
					this.wrap(async () => {
						const now = new Date();
						const setClauses: string[] = ['updatedAt = ?'];
						const values: unknown[] = [now];
						for (const [key, value] of Object.entries(data)) {
							if (key === '_id') continue;
							setClauses.push(`\`${key}\` = ?`);
							values.push(['quota', 'usage', 'settings'].includes(key) ? JSON.stringify(value) : value);
						}
						values.push(tenantId as string);
						await this.pool!.query(`UPDATE tenants SET ${setClauses.join(', ')} WHERE _id = ?`, values);
						const [rows] = await this.pool!.query('SELECT * FROM tenants WHERE _id = ?', [tenantId as string]);
						const result = (rows as Record<string, unknown>[])[0];
						return utils.parseJsonField(result, ['quota', 'usage', 'settings']) as unknown as Tenant;
					}, 'TENANT_UPDATE_FAILED'),
				delete: async (tenantId: DatabaseId) =>
					this.wrap(async () => {
						await this.pool!.query('DELETE FROM tenants WHERE _id = ?', [tenantId as string]);
					}, 'TENANT_DELETE_FAILED'),
				list: async (options?: PaginationOption) =>
					this.wrap(async () => {
						let query = 'SELECT * FROM tenants';
						const params: unknown[] = [];
						if (options?.limit) {
							query += ' LIMIT ?';
							params.push(options.limit);
						}
						if (options?.offset) {
							query += ' OFFSET ?';
							params.push(options.offset);
						}
						const [rows] = await this.pool!.query(query, params);
						return (rows as Record<string, unknown>[]).map((r) => utils.parseJsonField(r, ['quota', 'usage', 'settings'])) as unknown as Tenant[];
					}, 'TENANT_LIST_FAILED')
			}
		};

		this.monitoring = {
			performance: new PerformanceModule(this),
			cache: new CacheModule(this),
			getConnectionPoolStats: async () =>
				this.wrap(async () => {
					if (!this.pool) return { total: 0, active: 0, idle: 0, waiting: 0, avgConnectionTime: 0 };
					return {
						total: (this.pool as any)._allConnections?.length || 10,
						active: (this.pool as any)._allConnections?.length - (this.pool as any)._freeConnections?.length || 0,
						idle: (this.pool as any)._freeConnections?.length || 0,
						waiting: (this.pool as any)._connectionQueue?.length || 0,
						avgConnectionTime: 0
					};
				}, 'POOL_STATS_FAILED')
		};
	}

	async connect(connection: string | import('mysql2/promise').PoolOptions, options?: unknown): Promise<DatabaseResult<void>>;
	async connect(poolOptions?: import('../../db-interface').ConnectionPoolOptions): Promise<DatabaseResult<void>>;
	public async connect(
		connectionOrOptions?: string | import('mysql2/promise').PoolOptions | import('../../db-interface').ConnectionPoolOptions,
		options?: unknown
	): Promise<DatabaseResult<void>> {
		const result = await super.connect(connectionOrOptions as string | import('mysql2/promise').PoolOptions, options);
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
			const tables = (rows as Record<string, string>[]).map((row) => Object.values(row)[0]);

			if (tables.length > 0) {
				await this.pool.query('SET FOREIGN_KEY_CHECKS = 0');
				for (const table of tables) {
					await this.pool.query(`DROP TABLE IF EXISTS \`${table}\``);
				}
				await this.pool.query('SET FOREIGN_KEY_CHECKS = 1');
			}
		}, 'CLEAR_DATABASE_FAILED');
	}

	/**
	 * Cleanup expired sessions and tokens (TTL-equivalent for SQL databases).
	 * MongoDB handles this automatically via TTL indexes; SQL databases need manual cleanup.
	 * @returns Number of rows cleaned up
	 */
	public async cleanupExpiredData(): Promise<DatabaseResult<{ sessions: number; tokens: number }>> {
		return this.wrap(async () => {
			if (!this.pool) throw new Error('Not connected');
			const [sessionResult] = await this.pool.query('DELETE FROM auth_sessions WHERE expires < NOW()');
			const [tokenResult] = await this.pool.query(
				'DELETE FROM auth_tokens WHERE (expires < NOW()) OR (consumed = TRUE AND updatedAt < DATE_SUB(NOW(), INTERVAL 24 HOUR))'
			);
			const sessions = (sessionResult as { affectedRows?: number }).affectedRows || 0;
			const tokens = (tokenResult as { affectedRows?: number }).affectedRows || 0;
			return { sessions, tokens };
		}, 'CLEANUP_EXPIRED_DATA_FAILED');
	}

	public queryBuilder = <T extends BaseEntity>(collection: string): QueryBuilder<T> => {
		return new MariaDBQueryBuilder<T>(this, collection);
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
			const res = await this.crud.findMany<BaseEntity>(collection, {}, options as { limit?: number; offset?: number; fields?: never[] });
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

export * from './adapter-core';
export * from './adapter-types';
