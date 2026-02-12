/**
 * @file src/databases/sqlite/adapter/adapterCore.ts
 * @description Core functionality for SQLite adapter (Connection, Drizzle instance) - Bun native
 */

import { eq, and, isNull } from 'drizzle-orm';
import type { DatabaseCapabilities, DatabaseResult, DatabaseError, CollectionModel } from '../../dbInterface';
import * as schema from '../schema';
import * as utils from '../utils';
import { logger } from '@src/utils/logger';

export class AdapterCore {
	protected db!: any;
	protected sqlite!: any;
	protected collectionRegistry = new Map<string, CollectionModel>();
	protected isConnectedBoolean: boolean = false;
	protected config: any;

	public getDrizzle() {
		return this.db;
	}

	public getClient() {
		return this.sqlite;
	}

	public isConnected(): boolean {
		return this.isConnectedBoolean;
	}

	public async connect(config: any): Promise<DatabaseResult<void>> {
		try {
			this.config = config;

			const path = await import('path');
			const fs = await import('fs');

			// Ensure directory exists
			const dbPath = typeof config === 'string' ? config : config.connectionString || config.filename || 'cms.db';
			const dbPathResolved = path.resolve(process.cwd(), dbPath);
			const dbDir = path.dirname(dbPathResolved);

			if (!fs.existsSync(dbDir) && dbDir !== '.') {
				fs.mkdirSync(dbDir, { recursive: true });
			}

			const isBun = typeof Bun !== 'undefined';

			if (isBun) {
				// Use dynamic import with string concatenation to avoid Node's static ESM loader errors
				const { Database } = await import('bun' + ':sqlite');
				this.sqlite = new Database(dbPathResolved);
				const drizzleModule = 'drizzle-orm/bun-sqlite';
				const { drizzle } = await import(/* @vite-ignore */ drizzleModule);
				this.db = drizzle(this.sqlite, { schema });

				// WAL mode for better performance/concurrency
				this.sqlite.exec('PRAGMA journal_mode = WAL;');
			} else {
				// Fallback to better-sqlite3 in Node.js (Vite dev)
				const betterSqliteModule = 'better-sqlite3';
				const Database = (await import(/* @vite-ignore */ betterSqliteModule)).default;
				this.sqlite = new Database(dbPathResolved);
				const drizzleModule = 'drizzle-orm/better-sqlite3';
				const { drizzle } = await import(/* @vite-ignore */ drizzleModule);
				this.db = drizzle(this.sqlite, { schema });

				// WAL mode
				this.sqlite.exec('PRAGMA journal_mode = WAL');
			}

			this.isConnectedBoolean = true;

			return { success: true, data: undefined };
		} catch (error) {
			return {
				success: false,
				message: 'Failed to connect to SQLite',
				error: utils.createDatabaseError('CONNECTION_FAILED', error instanceof Error ? error.message : String(error), error)
			};
		}
	}

	public async disconnect(): Promise<DatabaseResult<void>> {
		try {
			if (this.sqlite) {
				this.sqlite.close();
			}
			this.isConnectedBoolean = false;
			return { success: true, data: undefined };
		} catch (error) {
			return {
				success: false,
				message: 'Failed to disconnect',
				error: utils.createDatabaseError('DISCONNECT_FAILED', error instanceof Error ? error.message : String(error), error)
			};
		}
	}

	public async getConnectionHealth(): Promise<DatabaseResult<{ healthy: boolean; latency: number; activeConnections: number }>> {
		try {
			const start = performance.now();
			this.sqlite.query('SELECT 1').get();
			const latency = performance.now() - start;
			return {
				success: true,
				data: {
					healthy: true,
					latency,
					activeConnections: 1 // In-process
				}
			};
		} catch (error) {
			return {
				success: false,
				message: 'Health check failed',
				error: utils.createDatabaseError('HEALTH_CHECK_FAILED', error instanceof Error ? error.message : String(error), error)
			};
		}
	}

	public getCapabilities(): DatabaseCapabilities {
		return {
			supportsTransactions: true,
			supportsIndexing: true,
			supportsFullTextSearch: false, // Can be enabled
			supportsAggregation: true,
			supportsStreaming: true,
			supportsPartitioning: false,
			maxBatchSize: 1000,
			maxQueryComplexity: 100
		};
	}

	// Helper methods for modules

	public wrap<T>(fn: () => Promise<T>, code: string): Promise<DatabaseResult<T>> {
		if (!this.isConnectedBoolean) return Promise.resolve(this.notConnectedError());
		return fn()
			.then((data) => ({ success: true, data }) as DatabaseResult<T>)
			.catch((error) => this.handleError(error, code));
	}

	public handleError(error: unknown, code: string): DatabaseResult<any> {
		const message = error instanceof Error ? error.message : String(error);
		logger.error(`SQLite adapter error [${code}]:`, message);
		return {
			success: false,
			message,
			error: utils.createDatabaseError(code, message, error) as DatabaseError
		};
	}

	public notImplemented(method: string): DatabaseResult<any> {
		const message = `Method ${method} not yet implemented for SQLite adapter.`;
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
		if ((schema as any)[collection]) {
			return (schema as any)[collection];
		}
		const camelKey = this.snakeToCamel(collection);
		if ((schema as any)[camelKey]) {
			return (schema as any)[camelKey];
		}
		return schema.contentNodes;
	}

	public mapQuery(table: any, query: Record<string, any>): any {
		if (!query || Object.keys(query).length === 0) return undefined;

		const conditions: any[] = [];
		for (const [key, value] of Object.entries(query)) {
			if (key.startsWith('$')) continue;
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
