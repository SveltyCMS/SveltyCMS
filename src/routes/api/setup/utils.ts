/**
 * @file src/routes/api/setup/utils.ts
 * @description Shared utility functions for the setup API endpoints.
 */

import type { DatabaseConfig } from '@root/config/types';
import type { authDBInterface } from '@src/auth/authDBInterface';
import type { DatabaseResult, IDBAdapter } from '@src/databases/dbInterface';
import { logger } from '@utils/logger.svelte';
// import { safeParse } from 'valibot';
// import { databaseConfigSchema } from '@utils/setupValidationSchemas'; // TODO: Implement and export this schema

// Database connection string, robust for different SQL dialects
export function buildDatabaseConnectionString(config: DatabaseConfig): string {
	// Validate config
	switch (config.type) {
		case 'mongodb':
		case 'mongodb+srv': {
			const isSrv = config.type === 'mongodb+srv';
			const protocol = isSrv ? 'mongodb+srv' : 'mongodb';
			const port = isSrv || !config.port ? '' : `:${config.port}`;
			const user = config.user && config.password ? `${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}@` : '';
			return `${protocol}://${user}${config.host}${port}/${config.name}`;
		}
		case 'postgresql': {
			const user = config.user ? encodeURIComponent(config.user) : '';
			const password = config.password ? `:${encodeURIComponent(config.password)}` : '';
			const port = config.port || 5432;
			return `postgresql://${user}${password}@${config.host}:${port}/${config.name}`;
		}
		case 'mysql':
		case 'mariadb': {
			const user = config.user ? encodeURIComponent(config.user) : '';
			const password = config.password ? `:${encodeURIComponent(config.password)}` : '';
			const port = config.port || 3306;
			return `mysql://${user}${password}@${config.host}:${port}/${config.name}`;
		}
		default:
			throw new Error(`Unsupported database type for connection string: ${config.type}`);
	}
}

/**
 * A centralized factory function to get a temporary, connected database adapter
 * for setup operations. This is the core of the refactor.
 */

export async function getSetupDatabaseAdapter(config: DatabaseConfig): Promise<{
	dbAdapter: IDBAdapter;
	authAdapter: authDBInterface;
	connectionString: string;
}> {
	const correlationId = typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : (await import('crypto')).randomUUID();
	logger.info(`Creating setup database adapter for ${config.type}`, { correlationId });

	const connectionString = buildDatabaseConnectionString(config);
	let dbAdapter: IDBAdapter;
	let authAdapter: authDBInterface;

	switch (config.type) {
		case 'mongodb':
		case 'mongodb+srv': {
			// Use UserAdapter as the main MongoDB auth adapter
			const { MongoDBAdapter } = await import('@src/databases/mongodb/mongoDBAdapter');
			const { UserAdapter } = await import('@src/auth/mongoDBAuth/userAdapter');
			dbAdapter = new MongoDBAdapter();
			const connectResult = await dbAdapter.connect(connectionString);
			if (!connectResult.success) {
				logger.error(`MongoDB connection failed: ${connectResult.error.message}`, { correlationId });
				throw new Error(`Database connection failed: ${connectResult.error.message}`);
			}
			authAdapter = new UserAdapter(dbAdapter); // Pass dbAdapter directly
			break;
		}
		case 'postgresql': {
			// TODO: Implement DrizzlePostgresAdapter and DrizzlePostgresAuthAdapter
			// @ts-expect-error: Module may not exist yet
			const { DrizzlePostgresAdapter } = await import('@src/databases/drizzle/drizzlePostgresAdapter');
			// @ts-expect-error: Module may not exist yet
			const { DrizzlePostgresAuthAdapter } = await import('@src/auth/drizzleAuth/drizzlePostgresAuthAdapter');
			dbAdapter = new DrizzlePostgresAdapter();
			const connectResult = await dbAdapter.connect(connectionString);
			if (!connectResult.success) {
				logger.error(`PostgreSQL connection failed: ${connectResult.error.message}`, { correlationId });
				throw new Error(`Database connection failed: ${connectResult.error.message}`);
			}
			// @ts-expect-error: Adapter may not exist yet
			authAdapter = new DrizzlePostgresAuthAdapter(dbAdapter);
			break;
		}
		case 'mysql':
		case 'mariadb': {
			// TODO: Implement DrizzleMySQLAdapter and DrizzleMySQLAuthAdapter
			// @ts-expect-error: Module may not exist yet
			const { DrizzleMySQLAdapter } = await import('@src/databases/drizzle/drizzleMySQLAdapter');
			// @ts-expect-error: Module may not exist yet
			const { DrizzleMySQLAuthAdapter } = await import('@src/auth/drizzleAuth/drizzleMySQLAuthAdapter');
			dbAdapter = new DrizzleMySQLAdapter();
			const connectResult = await dbAdapter.connect(connectionString);
			if (!connectResult.success) {
				logger.error(`MySQL connection failed: ${connectResult.error.message}`, { correlationId });
				throw new Error(`Database connection failed: ${connectResult.error.message}`);
			}
			// @ts-expect-error: Adapter may not exist yet
			authAdapter = new DrizzleMySQLAuthAdapter(dbAdapter);
			break;
		}
		default:
			logger.error(`Unsupported database type: ${config.type}`, { correlationId });
			throw new Error(`Database type '${config.type}' is not supported for setup.`);
	}

	// Initialize auth and system models with error handling
	try {
		await Promise.all([dbAdapter.auth.setupAuthModels(), dbAdapter.system.setupSystemModels()]);
	} catch (err) {
		logger.error(`Model initialization failed: ${err instanceof Error ? err.message : String(err)}`, { correlationId });
		await dbAdapter.disconnect();
		throw new Error(`Model initialization failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
	}

	logger.info(`✅ Successfully created and connected adapters for ${config.type}`, { correlationId });
	return { dbAdapter, authAdapter, connectionString };
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
