/**
 * @file shared/utils/src/database.ts
 * @description Database-related utilities for connection and configuration
 *
 * ### Features
 * - Support for MongoDB (standard and Atlas SRV)
 * - Support for MariaDB
 * - Structured logging
 */

import type { DatabaseConfig } from '@shared/database/schemas';

/**
 * Database connection string builder for supported database types.
 * Currently supports: MongoDB (standard and Atlas SRV), MariaDB
 */
export function buildDatabaseConnectionString(config: DatabaseConfig): string {
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
			let queryParams = '';
			if (isSrv && hasCredentials) {
				queryParams = '?retryWrites=true&w=majority';
			} else if (!isSrv && hasCredentials) {
				queryParams = '?authSource=admin';
			}

			return `${protocol}://${user}${config.host}${port}/${config.name}${queryParams}`;
		}
		case 'mariadb': {
			// MariaDB connection string
			const port = config.port ? `:${config.port}` : ':3306';
			const hasCredentials = config.user && config.password;
			const user = hasCredentials ? `${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}@` : '';

			return `mysql://${user}${config.host}${port}/${config.name}`;
		}
		default: {
			const _exhaustiveCheck: never = config.type;
			throw new Error(`Unsupported database type: ${_exhaustiveCheck}`);
		}
	}
}
