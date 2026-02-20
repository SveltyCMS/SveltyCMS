/**
 * @file src/databases/sqlite/adapter/adapterCore.ts
 * @description Core functionality for SQLite adapter (Connection, Drizzle instance) - Bun native
 */

import { logger } from '@src/utils/logger';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { CollectionModel, DatabaseCapabilities, DatabaseError, DatabaseResult } from '../../db-interface';
import * as schema from '../schema';
import * as utils from '../utils';

// Runtime-specific global declaration (Bun detection)
declare const Bun: any;

export class AdapterCore {
	protected db!: any;
	protected sqlite!: any;
	protected collectionRegistry = new Map<string, CollectionModel>();
	protected dynamicTables = new Map<string, any>();
	protected isConnectedBoolean = false;
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

			const path = await import('node:path');
			const fs = await import('node:fs');

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
				// and Vite's build time analysis warnigns
				const bunSqlite = 'bun:sqlite';
				const { Database } = await import(/* @vite-ignore */ bunSqlite);
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

	public async getConnectionHealth(): Promise<
		DatabaseResult<{
			healthy: boolean;
			latency: number;
			activeConnections: number;
		}>
	> {
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
		if (!this.isConnectedBoolean) {
			return Promise.resolve(this.notConnectedError());
		}
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
		// 1. Static schema tables
		if ((schema as any)[collection]) {
			return (schema as any)[collection];
		}
		const camelKey = this.snakeToCamel(collection);
		if ((schema as any)[camelKey]) {
			return (schema as any)[camelKey];
		}

		// 2. Dynamic collection tables (UUID-based or Name-based)
		// We use a prefix to distinguish them from static tables
		if (this.dynamicTables.has(collection)) {
			return this.dynamicTables.get(collection);
		}

		// If it looks like a UUID or is a known collection name that isn't a static table,
		// we return a dynamic table definition
		if (/^[a-f0-9]{32,36}$/i.test(collection) || collection.startsWith('collection_')) {
			const tableId = collection.startsWith('collection_') ? collection : `collection_${collection}`;
			const dynamicTable = this.createDynamicTableDefinition(tableId);
			this.dynamicTables.set(collection, dynamicTable);
			return dynamicTable;
		}

		return schema.contentNodes;
	}

	/**
	 * Creates a Drizzle table definition for a dynamic collection at runtime.
	 * All dynamic collections sharing a common relational structure for flexibility.
	 */
	private createDynamicTableDefinition(tableName: string) {
		return sqliteTable(tableName, {
			_id: text('_id', { length: 36 }).primaryKey(),
			tenantId: text('tenantId', { length: 36 }),
			data: text('data', { mode: 'json' }).notNull().default('{}'),
			status: text('status', { length: 50 }).notNull().default('draft'),
			createdAt: integer('createdAt', { mode: 'timestamp_ms' })
				.notNull()
				.default(sql`(strftime('%s', 'now') * 1000)`),
			updatedAt: integer('updatedAt', { mode: 'timestamp_ms' })
				.notNull()
				.default(sql`(strftime('%s', 'now') * 1000)`)
		});
	}

	public mapQuery(table: any, query: Record<string, any>): any {
		if (!query || Object.keys(query).length === 0) {
			return undefined;
		}

		const conditions: any[] = [];
		for (const [key, value] of Object.entries(query)) {
			if (key.startsWith('$')) {
				continue;
			}
			if (table[key]) {
				if (value === null || value === undefined) {
					conditions.push(isNull(table[key]));
				} else {
					conditions.push(eq(table[key], value));
				}
			}
		}

		if (conditions.length === 0) {
			return undefined;
		}
		// console.log(`[AdapterCore] Mapping query:`, JSON.stringify(query), '-> Conditions:', conditions.length);
		return and(...conditions);
	}
}
