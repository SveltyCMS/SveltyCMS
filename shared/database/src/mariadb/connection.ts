/**
 * @file shared/database/src/mariadb/connection.ts
 * @description MariaDB connection pool management using mysql2
 */

import mysql from 'mysql2/promise';
import { logger } from '@shared/utils/logger';

let pool: mysql.Pool | null = null;

export interface ConnectionConfig {
	host: string;
	port: number;
	user: string;
	password: string;
	database: string;
}

/**
 * Create and configure connection pool
 */
export async function createConnectionPool(config: ConnectionConfig): Promise<mysql.Pool> {
	if (pool) {
		logger.debug('Reusing existing connection pool');
		return pool;
	}

	logger.info('Creating new MariaDB connection pool');

	pool = mysql.createPool({
		host: config.host,
		port: config.port,
		user: config.user,
		password: config.password,
		database: config.database,
		waitForConnections: true,
		connectionLimit: 10,
		maxIdle: 10,
		idleTimeout: 60000,
		queueLimit: 0,
		enableKeepAlive: true,
		keepAliveInitialDelay: 0
	});

	// Test the connection
	try {
		const connection = await pool.getConnection();
		await connection.ping();
		connection.release();
		logger.info('MariaDB connection pool created successfully');
	} catch (error) {
		logger.error('Failed to create MariaDB connection pool:', error);
		throw error;
	}

	return pool;
}

/**
 * Get the current connection pool
 */
export function getConnectionPool(): mysql.Pool | null {
	return pool;
}

/**
 * Close the connection pool
 */
export async function closeConnectionPool(): Promise<void> {
	if (pool) {
		await pool.end();
		pool = null;
		logger.info('MariaDB connection pool closed');
	}
}

/**
 * Test database connection
 */
export async function testConnection(): Promise<{ success: boolean; latency: number }> {
	if (!pool) {
		return { success: false, latency: -1 };
	}

	try {
		const start = Date.now();
		const connection = await pool.getConnection();
		await connection.ping();
		connection.release();
		const latency = Date.now() - start;
		return { success: true, latency };
	} catch (error) {
		logger.error('Connection test failed:', error);
		return { success: false, latency: -1 };
	}
}
