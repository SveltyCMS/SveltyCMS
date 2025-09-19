/**
 * @file src/routes/api/setup/utils.ts
 * @description Shared utility functions for the setup API endpoints.
 */

import type { DatabaseConfig } from '@root/config/types';
import type { IDBAdapter as DatabaseAdapter } from '@src/databases/dbInterface';
import { logger } from '@utils/logger.svelte';

// Database connection string, robust for different SQL dialects
export function buildDatabaseConnectionString(config: DatabaseConfig): string {
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
			const user = encodeURIComponent(config.user);
			const password = encodeURIComponent(config.password);
			return `postgresql://${user}:${password}@${config.host}:${config.port}/${config.name}`;
		}
		case 'mysql':
		case 'mariadb': {
			const user = encodeURIComponent(config.user);
			const password = encodeURIComponent(config.password);
			// Drizzle Kit uses mysql:// protocol for both
			return `mysql://${user}:${password}@${config.host}:${config.port}/${config.name}`;
		}
		default:
			throw new Error(`Unsupported database type for connection string: ${config.type}`);
	}
}

/**
 * A centralized factory function to get a temporary, connected database adapter
 * for setup operations. This is the core of the refactor.
 */
export async function getSetupDatabaseAdapter(config: DatabaseConfig): Promise<{ adapter: DatabaseAdapter; connectionString: string }> {
	const connectionString = buildDatabaseConnectionString(config);
	let adapter: DatabaseAdapter;

	// Dynamically import the correct adapter based on config type
	switch (config.type) {
		case 'mongodb':
		case 'mongodb+srv': {
			const { MongoDBAdapter } = await import('@src/databases/mongodb/mongoDBAdapter');
			adapter = new MongoDBAdapter();
			break;
		}
		// Add cases for other adapters as you implement them
		// case 'postgresql': {
		// 	const { DrizzlePostgresAdapter } = await import('@src/databases/drizzle/drizzlePostgresAdapter');
		// 	adapter = new DrizzlePostgresAdapter();
		// 	break;
		// }
		default:
			throw new Error(`Database type '${config.type}' is not supported for setup.`);
	}

	// Connect the adapter with sensible options for the chosen engine
	let connectResult;
	if (config.type === 'mongodb' || config.type === 'mongodb+srv') {
		const isSrv = config.type === 'mongodb+srv';
		const options = {
			user: config.user || undefined,
			pass: config.password || undefined,
			dbName: config.name,
			authSource: isSrv ? 'admin' : 'admin',
			retryWrites: true,
			serverSelectionTimeoutMS: 15000,
			maxPoolSize: 1,
			...(isSrv ? { ssl: true, sslValidate: true } : {})
		};
		connectResult = await adapter.connect(connectionString, options);
	} else {
		connectResult = await adapter.connect(connectionString);
	}
	if (!connectResult.success) {
		throw new Error(`Database connection failed: ${connectResult.error?.message || 'Unknown connection error'}`);
	}

	logger.info(`✅ Successfully created and connected temporary adapter for ${config.type}`);
	return { adapter, connectionString };
}
