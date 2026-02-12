/**
 * @file src/routes/setup/utils.ts
 * @description Core utility functions for the setup process, including database connection helpers,
 * adapter factories, and validation logic.
 *
 * This file is part of the SveltyCMS setup wizard and handles low-level setup operations
 * such as building connection strings and initializing database adapters during the setup phase.
 */

import type { DatabaseConfig } from '@src/databases/schemas';
import type { IDBAdapter } from '@src/databases/dbInterface';
import { logger } from '@utils/logger';
import { createClient } from 'redis';

/**
 * Database connection string builder for supported database types.
 * Currently supports: MongoDB (standard and Atlas SRV), MariaDB
 * Future support planned: PostgreSQL
 */
export function buildDatabaseConnectionString(config: DatabaseConfig): string {
	// Validate config
	switch (config.type) {
		case 'mongodb':
		case 'mongodb+srv': {
			const isSrv = config.type === 'mongodb+srv';
			const protocol = isSrv ? 'mongodb+srv' : 'mongodb';
			const port = isSrv || !config.port ? '' : `:${config.port}`;

			// Check if credentials are provided
			const hasCredentials = config.user && config.password;

			const user = hasCredentials ? `${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}@` : '';

			// For MongoDB Atlas (mongodb+srv), add standard query parameters
			// For regular MongoDB with auth, add authSource=admin
			// For localhost without auth, no query params needed
			let queryParams = '';
			if (isSrv && hasCredentials) {
				queryParams = '?retryWrites=true&w=majority';
			} else if (!isSrv && hasCredentials) {
				queryParams = '?authSource=admin';
			}

			const connectionString = `${protocol}://${user}${config.host}${port}/${config.name}${queryParams}`;

			// Logging happens in getSetupDatabaseAdapter with correlationId
			return connectionString;
		}
		case 'mariadb': {
			// MariaDB connection string
			const port = config.port ? `:${config.port}` : ':3306';
			const hasCredentials = config.user && config.password;
			const user = hasCredentials ? `${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}@` : '';

			const connectionString = `mysql://${user}${config.host}${port}/${config.name}`;

			return connectionString;
		}
		case 'postgresql': {
			// PostgreSQL connection string
			const port = config.port ? `:${config.port}` : ':5432';
			const hasCredentials = config.user && config.password;
			const user = hasCredentials ? `${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}@` : '';

			const connectionString = `postgresql://${user}${config.host}${port}/${config.name}`;

			return connectionString;
		}
		case 'sqlite': {
			// SQLite connection "string" (file path)
			// Ensure host is treated as directory and name as filename
			const path = config.host.endsWith('/') ? config.host : `${config.host}/`;
			return `${path}${config.name}`;
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
			// Mock success in TEST_MODE if host is 'mock-host' for UI audit purposes
			if (process.env.TEST_MODE === 'true' && config.host === 'mock-host') {
				logger.info('🛠️ Mocking DB connection for setup in TEST_MODE');
				const { MongoDBAdapter } = await import('@src/databases/mongodb/mongoDBAdapter');
				dbAdapter = new MongoDBAdapter() as unknown as IDBAdapter;

				// Mock the connect method to return success
				dbAdapter.connect = async () => ({ success: true, data: undefined });
				// Mock the auth setup to do nothing
				dbAdapter.auth.setupAuthModels = async () => {};

				return { dbAdapter, connectionString };
			}

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
		case 'mariadb': {
			// Mock success in TEST_MODE if host is 'mock-host' for UI audit purposes
			if (process.env.TEST_MODE === 'true' && config.host === 'mock-host') {
				logger.info('🛠️ Mocking MariaDB connection for setup in TEST_MODE');
				const { MariaDBAdapter } = await import('@src/databases/mariadb/mariadbAdapter');
				dbAdapter = new MariaDBAdapter() as unknown as IDBAdapter;

				// Mock the connect method to return success
				dbAdapter.connect = async () => ({ success: true, data: undefined });
				// Mock the auth setup to do nothing
				dbAdapter.auth.setupAuthModels = async () => {};

				return { dbAdapter, connectionString };
			}

			const { MariaDBAdapter } = await import('@src/databases/mariadb/mariadbAdapter');
			dbAdapter = new MariaDBAdapter() as unknown as IDBAdapter;

			const connectResult = await dbAdapter.connect(connectionString);
			if (!connectResult.success) {
				logger.error(`MariaDB connection failed: ${connectResult.error?.message}`, { correlationId });
				throw new Error(`Database connection failed: ${connectResult.error?.message}`);
			}

			break;
		}
		case 'postgresql': {
			// Mock success in TEST_MODE if host is 'mock-host' for UI audit purposes
			if (process.env.TEST_MODE === 'true' && config.host === 'mock-host') {
				logger.info('🛠️ Mocking PostgreSQL connection for setup in TEST_MODE');
				const { PostgreSQLAdapter } = await import('@src/databases/postgresql/postgresAdapter');
				dbAdapter = new PostgreSQLAdapter() as unknown as IDBAdapter;

				// Mock the connect method to return success
				dbAdapter.connect = async () => ({ success: true, data: undefined });
				// Mock the auth setup to do nothing
				dbAdapter.auth = { setupAuthModels: async () => {} } as IDBAdapter['auth'];

				return { dbAdapter, connectionString };
			}

			const { PostgreSQLAdapter } = await import('@src/databases/postgresql/postgresAdapter');
			dbAdapter = new PostgreSQLAdapter() as unknown as IDBAdapter;

			const connectResult = await dbAdapter.connect(connectionString);
			if (!connectResult.success) {
				logger.error(`PostgreSQL connection failed: ${connectResult.error?.message}`, { correlationId });
				throw new Error(`Database connection failed: ${connectResult.error?.message}`);
			}

			break;
		}
		case 'sqlite': {
			// Mock success in TEST_MODE if host is 'mock-host' for UI audit
			if (process.env.TEST_MODE === 'true' && config.host === 'mock-host') {
				logger.info('🛠️ Mocking SQLite connection for setup in TEST_MODE');
				// We'll create the folder/file in execution block below
				return {
					dbAdapter: {
						connect: async () => ({ success: true, data: undefined }),
						auth: { setupAuthModels: async () => {} }
					} as unknown as IDBAdapter,
					connectionString
				};
			}

			// For SQLite during setup, we'll try to import a minimal adapter if it exists
			// or just return a dummy if we are just testing connection in Wizard
			try {
				const { existsSync } = await import('fs');
				if (!existsSync(connectionString) && process.env.TEST_MODE !== 'true') {
					return {
						dbAdapter: null as any,
						connectionString,
						dbDoesNotExist: true,
						error: `SQLite database file "${connectionString}" does not exist. Create it now?`
					} as any;
				}

				const { SQLiteAdapter } = await import('@src/databases/sqlite/sqliteAdapter');
				dbAdapter = new SQLiteAdapter() as unknown as IDBAdapter;
				const connectResult = await dbAdapter.connect(connectionString);
				if (!connectResult.success) {
					throw new Error(connectResult.error?.message);
				}
			} catch (err: any) {
				logger.error(`SQLite connection failed: ${err.message}`, { correlationId });
				throw new Error(`SQLite Connection failed: ${err.message}`);
			}

			break;
		}
		default: {
			// TypeScript ensures exhaustive checking - this should never be reached
			const _exhaustiveCheck: never = config.type;
			logger.error(`Unsupported database type: ${_exhaustiveCheck}`, { correlationId });
			throw new Error(`Database type '${_exhaustiveCheck}' is not supported for setup. Supported types: mongodb, mongodb+srv, mariadb, postgresql`);
		}
	}

	// Initialize auth models with error handling
	try {
		// Ensure auth module is initialized before accessing it
		if (dbAdapter.ensureAuth) {
			await dbAdapter.ensureAuth();
		} else {
			// Fallback for adapters that might not implement ensureAuth (though they should)
			// or if it's already initialized.
			await dbAdapter.auth.setupAuthModels();
		}
	} catch (err) {
		logger.error(`Model initialization failed: ${err instanceof Error ? err.message : String(err)}`, { correlationId });
		await dbAdapter.disconnect();
		throw new Error(`Model initialization failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
	}

	logger.info(`✅ Successfully created and connected adapters for ${config.type}`, { correlationId });
	return { dbAdapter, connectionString };
}

/**
 * Probes for a local Redis server on port 6379.
 * Used to suggest performance optimizations to the user during setup.
 */
export async function checkRedis(): Promise<boolean> {
	const client = createClient({
		socket: {
			host: 'localhost',
			port: 6379,
			connectTimeout: 1000
		}
	});

	try {
		await client.connect();
		await client.ping();
		await client.quit();
		logger.info('🚀 Local Redis detected during setup probe');
		return true;
	} catch {
		// Redis not available - silent failure, it's just a probe
		return false;
	}
}
