/**
 * @file src/routes/api/setup/utils.ts
 * @description Shared utility functions for the setup API endpoints.
 */

import type { DatabaseConfig } from '@src/databases/schemas';
import type { IDBAdapter } from '@src/databases/dbInterface';
import { logger } from '@utils/logger.svelte';

/**
 * Database connection string builder for supported database types.
 * Currently supports: MongoDB (standard and Atlas SRV)
 * Future support planned: PostgreSQL, MySQL, MariaDB via Drizzle ORM
 */
export function buildDatabaseConnectionString(config: DatabaseConfig): string {
	// Validate config
	switch (config.type) {
		case 'mongodb':
		case 'mongodb+srv': {
			const isSrv = config.type === 'mongodb+srv';
			const protocol = isSrv ? 'mongodb+srv' : 'mongodb';
			const port = isSrv || !config.port ? '' : `:${config.port}`;

			// Check if this is localhost without auth
			const isLocalhost = config.host === 'localhost' || config.host === '127.0.0.1';
			const hasCredentials = config.user && config.password;

			const user = hasCredentials ? `${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}@` : '';

			// For MongoDB Atlas (mongodb+srv), add standard query parameters
			// For regular MongoDB with auth, add authSource=admin
			// For localhost without auth, no query params needed
			let queryParams = '';
			if (isSrv && hasCredentials) {
				queryParams = '?retryWrites=true&w=majority';
			} else if (!isSrv && hasCredentials && !isLocalhost) {
				queryParams = '?authSource=admin';
			}

			const connectionString = `${protocol}://${user}${config.host}${port}/${config.name}${queryParams}`;

			// Enhanced logging for Atlas connections
			if (isSrv) {
				logger.info('🌐 Building MongoDB Atlas (SRV) connection string', {
					host: config.host,
					database: config.name,
					hasCredentials,
					user: config.user || 'none'
				});
			} else {
				logger.info('🔧 Building MongoDB connection string', {
					host: config.host,
					port: config.port || '27017',
					database: config.name,
					hasCredentials,
					isLocalhost
				});
			}

			return connectionString;
		}
		default: {
			// TypeScript ensures exhaustive checking - this should never be reached
			// but provides a helpful message if the schema is extended without updating this function
			const _exhaustiveCheck: never = config.type;
			throw new Error(`Unsupported database type: ${_exhaustiveCheck}`);
		}
	}
}

/**
 * A centralized factory function to get a temporary, connected database adapter
 * for setup operations. This is the core of the refactor.
 */

export async function getSetupDatabaseAdapter(config: DatabaseConfig): Promise<{
	dbAdapter: IDBAdapter;
	connectionString: string;
}> {
	const correlationId = typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : (await import('crypto')).randomUUID();
	logger.info(`Creating setup database adapter for ${config.type}`, { correlationId });

	const connectionString = buildDatabaseConnectionString(config);
	logger.info(`Connection string built for ${config.type}`, {
		correlationId,
		host: config.host,
		port: config.port,
		name: config.name,
		hasUser: !!config.user,
		hasPassword: !!config.password,
		// Only log sanitized connection string (without password)
		connectionStringPreview: connectionString.replace(/:[^:@]+@/, ':***@')
	});

	let dbAdapter: IDBAdapter;

	switch (config.type) {
		case 'mongodb':
		case 'mongodb+srv': {
			const { MongoDBAdapter } = await import('@src/databases/mongodb/mongoDBAdapter');
			dbAdapter = new MongoDBAdapter() as unknown as IDBAdapter;

			// Prepare connection options for MongoDB
			const connectionOptions = {
				serverSelectionTimeoutMS: 15000,
				socketTimeoutMS: 45000,
				maxPoolSize: 10,
				retryWrites: true,
				...(config.user &&
					config.password && {
						user: config.user,
						pass: config.password,
						dbName: config.name,
						// Always use 'admin' as authSource for both MongoDB and Atlas
						// MongoDB Atlas stores user accounts in the admin database by default
						authSource: 'admin'
					})
			};

			const connectResult = await dbAdapter.connect(connectionString, connectionOptions);
			if (!connectResult.success) {
				logger.error(`MongoDB connection failed: ${connectResult.error.message}`, { correlationId });
				throw new Error(`Database connection failed: ${connectResult.error.message}`);
			}

			break;
		}
		default: {
			// TypeScript ensures exhaustive checking - this should never be reached
			const _exhaustiveCheck: never = config.type;
			logger.error(`Unsupported database type: ${_exhaustiveCheck}`, { correlationId });
			throw new Error(`Database type '${_exhaustiveCheck}' is not supported for setup. Only MongoDB is currently supported.`);
		}
	}

	// Initialize auth models with error handling
	try {
		await dbAdapter.auth.setupAuthModels();
	} catch (err) {
		logger.error(`Model initialization failed: ${err instanceof Error ? err.message : String(err)}`, { correlationId });
		await dbAdapter.disconnect();
		throw new Error(`Model initialization failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
	}

	logger.info(`✅ Successfully created and connected adapters for ${config.type}`, { correlationId });
	return { dbAdapter, connectionString };
}
