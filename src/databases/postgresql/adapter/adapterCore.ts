/**
 * @file src/databases/postgresql/adapter/adapterCore.ts
 * @description Core functionality shared across PostgreSQL adapter modules.
 *
 * Features:
 * - Connect to PostgreSQL
 * - Disconnect from PostgreSQL
 * - Wait for connection
 * - Get connection health
 */

import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, and } from 'drizzle-orm';
import postgres from 'postgres';
import type { DatabaseCapabilities, DatabaseResult, DatabaseError } from '../../dbInterface';
import * as schema from '../schema/index';
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

	public sql: ReturnType<typeof postgres> | null = null;
	public db: PostgresJsDatabase<typeof schema> | null = null;
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
			let options: any = {
				max: 10,
				connect_timeout: 10
			};

			if (typeof connection === 'string') {
				// Parse connection string manually to ensure correct parameters
				try {
					const url = new URL(connection);
					options = {
						...options,
						host: url.hostname,
						port: Number(url.port) || 5432,
						user: decodeURIComponent(url.username),
						password: decodeURIComponent(url.password),
						database: url.pathname.slice(1), // Remove leading slash
						ssl: url.searchParams.get('sslmode') === 'require' ? 'require' : undefined
					};
				} catch (e) {
					logger.warn('Failed to parse PostgreSQL connection string, falling back to raw string (might fail auth):', e);
					this.sql = postgres(connection);
					this.db = drizzle(this.sql, { schema });
					this.connected = true;
					logger.info('Connected to PostgreSQL (String Mode)');
					return { success: true, data: undefined };
				}
			} else {
				options = {
					...options,
					host: connection.host,
					port: connection.port,
					user: connection.user,
					password: connection.password,
					database: connection.database,
					ssl: connection.ssl === true || connection.ssl === 'require' ? 'require' : undefined
				};
			}

			this.sql = postgres(options);
			this.db = drizzle(this.sql, { schema });
			this.connected = true;
			logger.info('Connected to PostgreSQL');
			return { success: true, data: undefined };
		} catch (error) {
			this.connected = false;
			return this.handleError(error, 'CONNECTION_FAILED');
		}
	}

	async disconnect(): Promise<DatabaseResult<void>> {
		if (this.sql) {
			await this.sql.end();
			this.sql = null;
			this.db = null;
			this.connected = false;
			logger.info('Disconnected from PostgreSQL');
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
		if (!this.connected || !this.sql) {
			return {
				success: false,
				message: 'Database not connected',
				error: utils.createDatabaseError('NOT_CONNECTED', 'Database not connected')
			};
		}
		const start = Date.now();
		try {
			await this.sql`SELECT 1`;
			const latency = Date.now() - start;
			return {
				success: true,
				data: {
					healthy: true,
					latency,
					activeConnections: 0 // postgres.js doesn't expose this directly
				}
			};
		} catch (error) {
			return this.handleError(error, 'HEALTH_CHECK_FAILED');
		}
	}

	async getConnectionPoolStats(): Promise<DatabaseResult<import('../../dbInterface').ConnectionPoolStats>> {
		try {
			if (!this.sql) {
				return {
					success: false,
					message: 'Database connection not initialized',
					error: { code: 'CONNECTION_NOT_INITIALIZED', message: 'Connection not initialized' }
				};
			}

			// postgres.js manages connections internally
			return {
				success: true,
				data: { total: 10, active: 0, idle: 0, waiting: 0, avgConnectionTime: 0 }
			};
		} catch (error) {
			return { success: false, message: 'Failed to get PostgreSQL pool stats', error: { code: 'POOL_STATS_FAILED', message: String(error) } };
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
		logger.error(`PostgreSQL adapter error [${code}]:`, message);
		return {
			success: false,
			message,
			error: utils.createDatabaseError(code, message, error) as DatabaseError
		};
	}

	protected notImplemented(method: string): DatabaseResult<any> {
		const message = `Method ${method} not yet implemented for PostgreSQL adapter.`;
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

	public getTable(collection: string): any {
		if ((schema as any)[collection]) {
			return (schema as any)[collection];
		}
		// Fallback to contentNodes for dynamic collections
		return schema.contentNodes;
	}

	public mapQuery(table: any, query: Record<string, any>): any {
		if (!query || Object.keys(query).length === 0) return undefined;

		const conditions: any[] = [];
		for (const [key, value] of Object.entries(query)) {
			if (table[key]) {
				conditions.push(eq(table[key], value));
			}
		}

		if (conditions.length === 0) return undefined;
		return and(...conditions);
	}
}
