/**
 * @file src/databases/mariadb/adapter/adapterCore.ts
 * @description Core functionality shared across MariaDB adapter modules.
 *
 * Features:
 * - Connect to MariaDB
 * - Disconnect from MariaDB
 * - Wait for connection
 * - Get connection health
 *
 */

import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import { eq, and, isNull } from 'drizzle-orm';
import mysql from 'mysql2/promise';
import type { DatabaseCapabilities, DatabaseResult, DatabaseError } from '../../dbInterface';
import * as schema from '../schema';
import * as utils from '../utils';
import { logger } from '@utils/logger';

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
	protected connected = false;
	public collectionRegistry = new Map<string, any>();

	public getCapabilities(): DatabaseCapabilities {
		return this.capabilities;
	}

	public isConnected(): boolean {
		return this.connected;
	}

	async connect(connection: any, _options?: any): Promise<DatabaseResult<void>> {
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
		if (this.connected) return;
		return new Promise((resolve) => {
			const interval = setInterval(() => {
				if (this.connected) {
					clearInterval(interval);
					resolve();
				}
			}, 100);
		});
	}

	async getConnectionHealth(): Promise<DatabaseResult<{ healthy: boolean; latency: number; activeConnections: number }>> {
		if (!this.connected || !this.pool) {
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
			const poolInfo = (this.pool as any).pool;
			return {
				success: true,
				data: {
					healthy: true,
					latency,
					activeConnections: poolInfo ? poolInfo._allConnections.length : 0
				}
			};
		} catch (error) {
			return this.handleError(error, 'HEALTH_CHECK_FAILED');
		}
	}

	// Get MariaDB connection pool statistics
	async getConnectionPoolStats(): Promise<DatabaseResult<import('../../dbInterface').ConnectionPoolStats>> {
		try {
			if (!this.pool) {
				return { success: false, message: 'Database pool not initialized', error: { code: 'POOL_NOT_INITIALIZED', message: 'Pool not initialized' } };
			}

			// Access internal pool stats for mysql2 driver
			const pool = (this.pool as any).pool;

			if (!pool) {
				return {
					success: true,
					data: { total: 10, active: 0, idle: 0, waiting: 0, avgConnectionTime: 0 }
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
			return { success: false, message: 'Failed to get MariaDB pool stats', error: { code: 'POOL_STATS_FAILED', message: String(error) } };
		}
	}

	protected wrap<T>(fn: () => Promise<T>, code: string): Promise<DatabaseResult<T>> {
		if (!this.db) return Promise.resolve(this.notConnectedError());
		try {
			return fn()
				.then((data) => ({ success: true, data }) as DatabaseResult<T>)
				.catch((error) => this.handleError(error, code));
		} catch (error) {
			return Promise.resolve(this.handleError(error, code));
		}
	}

	protected handleError(error: unknown, code: string): DatabaseResult<any> {
		const message = error instanceof Error ? error.message : String(error);
		logger.error(`MariaDB adapter error [${code}]:`, message);
		return {
			success: false,
			message,
			error: utils.createDatabaseError(code, message, error) as DatabaseError
		};
	}

	protected notImplemented(method: string): DatabaseResult<any> {
		const message = `Method ${method} not yet implemented for MariaDB adapter.`;
		logger.warn(message);
		return {
			success: false,
			message,
			error: utils.createDatabaseError('NOT_IMPLEMENTED', message) as DatabaseError
		};
	}

	protected notConnectedError(): DatabaseResult<any> {
		return {
			success: false,
			message: 'Database not connected',
			error: utils.createDatabaseError('NOT_CONNECTED', 'Database connection not established') as DatabaseError
		};
	}

	private snakeToCamel(str: string): string {
		return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
	}

	public getTable(collection: string): any {
		// Direct lookup (already camelCase, e.g., 'mediaItems')
		if ((schema as any)[collection]) {
			return (schema as any)[collection];
		}
		// Convert snake_case to camelCase (e.g., 'media_items' → 'mediaItems')
		const camelKey = this.snakeToCamel(collection);
		if ((schema as any)[camelKey]) {
			return (schema as any)[camelKey];
		}
		// Throw for unknown tables so errors are properly reported
		throw new Error(`Unknown table: ${collection}`);
	}

	public mapQuery(table: any, query: Record<string, any>): any {
		if (!query || Object.keys(query).length === 0) return undefined;

		const conditions: any[] = [];
		for (const [key, value] of Object.entries(query)) {
			if (key.startsWith('$')) continue; // Skip MongoDB operators
			if (table[key]) {
				if (value === null) {
					conditions.push(isNull(table[key]));
				} else {
					conditions.push(eq(table[key], value));
				}
			}
		}

		if (conditions.length === 0) return undefined;
		return and(...conditions);
	}
}
