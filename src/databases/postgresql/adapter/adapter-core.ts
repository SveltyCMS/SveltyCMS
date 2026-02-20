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

import { logger } from '@utils/logger';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { DatabaseCapabilities, DatabaseError, DatabaseResult } from '../../db-interface';
import * as schema from '../schema/index';
import * as utils from '../utils';

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

	async connect(connection: string | Record<string, unknown>, _options?: unknown): Promise<DatabaseResult<void>> {
		try {
			let options: Record<string, unknown> = {
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
		if (!(this.connected && this.sql)) {
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

	public async getConnectionPoolStats(): Promise<DatabaseResult<import('../../db-interface').ConnectionPoolStats>> {
		try {
			if (!this.sql) {
				return {
					success: false,
					message: 'Database connection not initialized',
					error: {
						code: 'CONNECTION_NOT_INITIALIZED',
						message: 'Connection not initialized'
					}
				};
			}

			// postgres.js manages connections internally
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
		} catch (error) {
			return {
				success: false,
				message: 'Failed to get PostgreSQL pool stats',
				error: { code: 'POOL_STATS_FAILED', message: String(error) }
			};
		}
	}

	public wrap<T>(fn: () => Promise<T>, code: string): Promise<DatabaseResult<T>> {
		if (!this.db) {
			return Promise.resolve(this.notConnectedError());
		}
		try {
			return fn()
				.then((data) => ({ success: true, data }) as DatabaseResult<T>)
				.catch((error) => this.handleError(error, code));
		} catch (error) {
			return Promise.resolve(this.handleError(error, code));
		}
	}

	public handleError<T>(error: unknown, code: string): DatabaseResult<T> {
		const message = error instanceof Error ? error.message : String(error);
		logger.error(`PostgreSQL adapter error [${code}]:`, message);
		return {
			success: false,
			message,
			error: utils.createDatabaseError(code, message, error) as DatabaseError
		};
	}

	public notImplemented<T>(method: string): DatabaseResult<T> {
		const message = `Method ${method} not yet implemented for PostgreSQL adapter.`;
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

		const conditions: import('drizzle-orm').SQL[] = [];
		for (const [key, value] of Object.entries(query)) {
			if (key.startsWith('$')) {
				continue; // Skip MongoDB operators
			}
			const column = table[key] as import('drizzle-orm').Column;
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
