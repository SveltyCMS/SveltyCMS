/**
 * @file tests/bun/helpers/db.ts
 * @description Database utilities for tests
 */

/**
 * Generate MongoDB connection URI from environment variables.
 * @param options - Configuration options
 * @returns MongoDB connection URI
 */
export function buildMongoURI(options: { dbName?: string; forceIPv4?: boolean } = {}): string {
	const dbName = options.dbName || process.env.DB_NAME || 'sveltycms_test';
	let host = process.env.DB_HOST || 'localhost';

	// Force IPv4 if requested (converts localhost to 127.0.0.1)
	if (options.forceIPv4 && host === 'localhost') {
		host = '127.0.0.1';
	}

	const port = process.env.DB_PORT || '27017';

	// Use existing MONGODB_URI if provided
	if (process.env.MONGODB_URI) {
		return process.env.MONGODB_URI;
	}

	// Build URI with or without credentials


	return process.env.DB_USER && process.env.DB_PASSWORD
		? `mongodb://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${host}:${port}/${dbName}?authSource=admin&directConnection=true`
		: `mongodb://${host}:${port}/${dbName}?directConnection=true`;
}
