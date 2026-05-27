/**
 * @file src/databases/mariadb/adapter/adapter-core.ts
 * @description
 * Core logic shared by MariaDB adapter modules.
 * Key functions include:
 * - Connection pool management and health monitoring.
 * - Drizzle ORM integration and schema mapping.
 * - Table resolution and alias management (e.g., snake_case to camelCase mapping).
 * - Standardized error wrapping and query transformation utilities.
 *
 * features:
 * - connection pool management
 * - drizzle-orm integration
 * - table/alias resolution
 * - standardized error handling
 * - performance telemetry
 */

import { logger } from '@utils/logger';
import { and, type Column, eq, isNull, type SQL } from 'drizzle-orm';
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import type { DatabaseCapabilities, DatabaseError, DatabaseResult } from '../../db-interface';
import * as schema from '../schema';
import * as utils from '../utils';

// Internal type for mysql2 pool to access statistics safely
interface InternalPool {
	pool?: {
		_allConnections: unknown[];
		_freeConnections: unknown[];
		_connectionQueue: unknown[];
		config?: {
			connectionLimit: number;
		};
	};
}

export class AdapterCore {
	public capabilities: DatabaseCapabilities = {
		supportsTransactions: true,
		supportsIndexing: true,
		supportsFullTextSearch: true,
		supportsAggregation: true,
		supportsStreaming: false,
		supportsPartitioning: true,
		maxBatchSize: 1000,
		maxQueryComplexity: 100
	};

	public pool: mysql.Pool | null = null;
	public db: MySql2Database<typeof schema> | null = null;
	public crud!: import('../crud/crud-module').CrudModule;
	public batch!: import('../operations/batch-module').BatchModule;
	protected connected = false;
	public collectionRegistry = new Map<string, unknown>();

	public getCapabilities(): DatabaseCapabilities {
		return this.capabilities;
	}

	public isConnected(): boolean {
		return this.connected;
	}

	async connect(connection: string | mysql.PoolOptions, _options?: unknown): Promise<DatabaseResult<void>> {
		try {
			if (typeof connection === 'string') {
				this.pool = mysql.createPool(connection);
			} else {
				this.pool = mysql.createPool(connection);
			}
			this.db = drizzle(this.pool, { schema, mode: 'default' });
			this.connected = true;
			logger.info('Connected to MariaDB');
			return { success: true, data: undefined };
		} catch (error) {
			this.connected = false;
			return this.handleError(error, 'CONNECTION_FAILED');
		}
	}

	async disconnect(): Promise<DatabaseResult<void>> {
		if (this.pool) {
			await this.pool.end();
			this.pool = null;
			this.db = null;
			this.connected = false;
			logger.info('Disconnected from MariaDB');
		}
		return { success: true, data: undefined };
	}

	public async waitForConnection?(): Promise<void> {
		if (this.connected) {
			return;
		}
		return new Promise((resolve) => {
			const interval = setInterval(() => {
				if (this.connected) {
					clearInterval(interval);
					resolve();
				}
			}, 100);
		});
	}

	async getConnectionHealth(): Promise<
		DatabaseResult<{
			healthy: boolean;
			latency: number;
			activeConnections: number;
		}>
	> {
		if (!(this.connected && this.pool)) {
			return {
				success: false,
				message: 'Database not connected',
				error: utils.createDatabaseError('NOT_CONNECTED', 'Database not connected')
			};
		}
		const start = Date.now();
		try {
			await this.pool.query('SELECT 1');
			const latency = Date.now() - start;
			const internalPool = (this.pool as unknown as InternalPool).pool;
			return {
				success: true,
				data: {
					healthy: true,
					latency,
					activeConnections: internalPool ? internalPool._allConnections.length : 0
				}
			};
		} catch (error) {
			return this.handleError(error, 'HEALTH_CHECK_FAILED');
		}
	}

	// Get MariaDB connection pool statistics
	async getConnectionPoolStats(): Promise<DatabaseResult<import('../../db-interface').ConnectionPoolStats>> {
		try {
			if (!this.pool) {
				return {
					success: false,
					message: 'Database pool not initialized',
					error: {
						code: 'POOL_NOT_INITIALIZED',
						message: 'Pool not initialized'
					}
				};
			}

			// Access internal pool stats for mysql2 driver
			const pool = (this.pool as unknown as InternalPool).pool;

			if (!pool) {
				return {
					success: true,
					data: {
						total: 10,
						active: 0,
						idle: 0,
						waiting: 0,
						avgConnectionTime: 0
					}
				};
			}

			return {
				success: true,
				data: {
					total: pool.config?.connectionLimit || 10,
					active: pool._allConnections?.length || 0,
					idle: pool._freeConnections?.length || 0,
					waiting: pool._connectionQueue?.length || 0,
					avgConnectionTime: 0
				}
			};
		} catch (error) {
			return {
				success: false,
				message: 'Failed to get MariaDB pool stats',
				error: { code: 'POOL_STATS_FAILED', message: String(error) }
			};
		}
	}

	public async wrap<T>(fn: () => Promise<T>, code: string): Promise<DatabaseResult<T>> {
		if (!this.db) {
			return Promise.resolve(this.notConnectedError<T>());
		}
		try {
			return fn()
				.then((data) => ({ success: true, data }) as DatabaseResult<T>)
				.catch((error) => this.handleError<T>(error, code));
		} catch (error) {
			return Promise.resolve(this.handleError<T>(error, code));
		}
	}

	public handleError<T>(error: unknown, code: string): DatabaseResult<T> {
		const message = error instanceof Error ? error.message : String(error);
		logger.error(`MariaDB adapter error [${code}]:`, message);
		return {
			success: false,
			message,
			error: utils.createDatabaseError(code, message, error) as DatabaseError
		};
	}

	public notImplemented<T>(method: string): DatabaseResult<T> {
		const message = `Method ${method} not yet implemented for MariaDB adapter.`;
		logger.warn(message);
		return {
			success: false,
			message,
			error: utils.createDatabaseError('NOT_IMPLEMENTED', message) as DatabaseError
		};
	}

	public notConnectedError<T>(): DatabaseResult<T> {
		return {
			success: false,
			message: 'Database not connected',
			error: utils.createDatabaseError('NOT_CONNECTED', 'Database connection not established') as DatabaseError
		};
	}

	private snakeToCamel(str: string): string {
		return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
	}

	// Common short aliases used by API routes and resolvers
	private static TABLE_ALIASES: Record<string, string> = {
		media: 'mediaItems',
		MediaItem: 'mediaItems',
		collections: 'contentNodes',
		preferences: 'systemPreferences',
		tokens: 'authTokens',
		sessions: 'authSessions',
		users: 'authUsers'
	};

	public getTable(collection: string): Record<string, unknown> {
		const schemaAny = schema as unknown as Record<string, Record<string, unknown>>;
		// Direct lookup (already camelCase, e.g., 'mediaItems')
		if (schemaAny[collection]) {
			return schemaAny[collection];
		}
		// Convert snake_case to camelCase (e.g., 'media_items' → 'mediaItems')
		const camelKey = this.snakeToCamel(collection);
		if (schemaAny[camelKey]) {
			return schemaAny[camelKey];
		}
		// Check common aliases (e.g., 'media' → 'mediaItems')
		const alias = AdapterCore.TABLE_ALIASES[collection];
		if (alias && schemaAny[alias]) {
			return schemaAny[alias];
		}
		// Dynamic collection tables map to contentNodes
		if (collection.startsWith('collection_')) {
			return schema.contentNodes as unknown as Record<string, unknown>;
		}
		// Throw for truly unknown tables
		throw new Error(`Unknown table: ${collection}`);
	}

	public mapQuery(table: Record<string, unknown>, query: Record<string, unknown>): unknown {
		if (!query || Object.keys(query).length === 0) {
			return undefined;
		}

		const conditions: SQL[] = [];
		for (const [key, value] of Object.entries(query)) {
			if (key.startsWith('$')) {
				continue; // Skip MongoDB operators
			}
			const column = table[key] as Column;
			if (column) {
				if (value === null) {
					conditions.push(isNull(column));
				} else {
					conditions.push(eq(column, value as string | number | boolean));
				}
			}
		}

		if (conditions.length === 0) {
			return undefined;
		}
		return and(...conditions);
	}
}
