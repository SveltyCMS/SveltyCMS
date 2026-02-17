/**
 * @file src/databases/postgresql/connection.ts
 * @description PostgreSQL connection management using postgres.js (porsager/postgres)
 *
 * Features:
 * - Connection pooling
 * - SSL support
 * - Connection testing
 * - Graceful shutdown
 */

import { logger } from '@utils/logger';
import postgres from 'postgres';

let sql: ReturnType<typeof postgres> | null = null;

export interface ConnectionConfig {
	database: string;
	host: string;
	password: string;
	port: number;
	ssl?: boolean | 'require' | 'prefer';
	user: string;
}

/**
 * Create and configure PostgreSQL connection
 */
export async function createConnection(config: ConnectionConfig): Promise<ReturnType<typeof postgres>> {
	if (sql) {
		logger.debug('Reusing existing PostgreSQL connection');
		return sql;
	}

	logger.info('Creating new PostgreSQL connection');

	sql = postgres({
		host: config.host,
		port: config.port,
		user: config.user,
		password: config.password,
		database: config.database,
		ssl: config.ssl === true || config.ssl === 'require' ? 'require' : undefined,
		max: 10, // Connection pool size
		idle_timeout: 60, // Idle connection timeout in seconds
		connect_timeout: 10, // Connection timeout in seconds
		onnotice: () => {}, // Suppress notice messages
		transform: {
			undefined: null // Transform undefined to null
		}
	});

	// Test the connection
	try {
		await sql`SELECT 1 AS test`;
		logger.info('PostgreSQL connection created successfully');
	} catch (error) {
		logger.error('Failed to create PostgreSQL connection:', error);
		throw error;
	}

	return sql;
}

/**
 * Get the current connection
 */
export function getConnection(): ReturnType<typeof postgres> | null {
	return sql;
}

/**
 * Close the connection
 */
export async function closeConnection(): Promise<void> {
	if (sql) {
		await sql.end();
		sql = null;
		logger.info('PostgreSQL connection closed');
	}
}

/**
 * Test database connection
 */
export async function testConnection(): Promise<{ success: boolean; latency: number }> {
	if (!sql) {
		return { success: false, latency: -1 };
	}

	try {
		const start = Date.now();
		await sql`SELECT 1 AS test`;
		const latency = Date.now() - start;
		return { success: true, latency };
	} catch (error) {
		logger.error('Connection test failed:', error);
		return { success: false, latency: -1 };
	}
}
