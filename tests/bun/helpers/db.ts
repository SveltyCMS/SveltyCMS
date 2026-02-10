/**
 * @file tests/bun/helpers/db.ts
 * @description Database utilities for tests
 */

import { buildDatabaseConnectionString } from '@src/routes/setup/utils';
import type { DatabaseConfig } from '@src/databases/schemas';

/**
 * Generate MongoDB connection URI from environment variables for tests.
 * Wraps buildDatabaseConnectionString and adds test-specific options.
 * @param options - Configuration options
 * @returns MongoDB connection URI
 */
export function buildMongoURI(options: { dbName?: string; forceIPv4?: boolean } = {}): string {
	// Use existing MONGODB_URI if provided
	if (process.env.MONGODB_URI) {
		return process.env.MONGODB_URI;
	}

	let host = process.env.DB_HOST || 'localhost';

	// Force IPv4 if requested (converts localhost to 127.0.0.1)
	if (options.forceIPv4 && host === 'localhost') {
		host = '127.0.0.1';
	}

	const config: DatabaseConfig = {
		type: 'mongodb',
		host,
		port: process.env.DB_PORT || '27017',
		name: options.dbName || process.env.DB_NAME || 'sveltycms_test',
		user: process.env.DB_USER || '',
		password: process.env.DB_PASSWORD || ''
	};

	const uri = buildDatabaseConnectionString(config);

	// Add directConnection=true for test stability
	return uri.includes('?')
		? `${uri}&directConnection=true`
		: `${uri}?directConnection=true`;
}
