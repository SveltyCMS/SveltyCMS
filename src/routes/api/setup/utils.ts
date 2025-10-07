/**
 * @file src/routes/api/setup/utils.ts
 * @description Shared utility functions for the setup API endpoints.
 */

import type { DatabaseConfig } from '@root/config/types';
import type { DatabaseResult, IDBAdapter } from '@src/databases/dbInterface';
import { logger } from '@utils/logger.svelte';
// import { safeParse } from 'valibot';
// import { databaseConfigSchema } from '@utils/setupValidationSchemas'; // TODO: Implement and export this schema

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

			return `${protocol}://${user}${config.host}${port}/${config.name}${queryParams}`;
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
						authSource: config.type === 'mongodb+srv' ? undefined : 'admin'
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

/**
 * Test database connection with performance metrics
 */
export async function testDatabaseConnection(config: DatabaseConfig): Promise<DatabaseResult<{ healthy: boolean; latency: number }>> {
	const correlationId = typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : (await import('crypto')).randomUUID();
	logger.info(`Testing database connection for ${config.type}`, { correlationId });

	try {
		const { dbAdapter } = await getSetupDatabaseAdapter(config);
		const startTime = Date.now();
		const healthResult = await dbAdapter.getConnectionHealth();
		const latency = Date.now() - startTime;

		if (!healthResult.success) {
			logger.error(`Connection health check failed: ${healthResult.error.message}`, { correlationId });
			return {
				success: false,
				message: 'Connection health check failed',
				error: {
					code: 'CONNECTION_FAILED',
					message: healthResult.error.message,
					details: healthResult.error.details
				}
			};
		}

		await dbAdapter.disconnect();
		logger.info(`Connection test successful, latency: ${latency}ms`, { correlationId });
		return {
			success: true,
			data: { healthy: true, latency },
			meta: { executionTime: latency }
		};
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : 'Unknown error';
		logger.error(`Connection test failed: ${errorMessage}`, { correlationId });
		return {
			success: false,
			message: 'Connection test failed',
			error: {
				code: 'CONNECTION_ERROR',
				message: errorMessage,
				details: err instanceof Error ? err.stack : undefined
			}
		};
	}
}
