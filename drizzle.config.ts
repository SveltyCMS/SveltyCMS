/**
 * @file drizzle.config.ts
 * @description Drizzle Kit configuration for MariaDB migrations
 */

import type { Config } from 'drizzle-kit';

export default {
	schema: './src/databases/mariadb/schema/index.ts',
	out: './src/databases/mariadb/migrations',
	dialect: 'mysql',
	dbCredentials: {
		host: process.env.DB_HOST || 'localhost',
		port: Number(process.env.DB_PORT) || 3306,
		user: process.env.DB_USER || 'root',
		password: process.env.DB_PASSWORD || '',
		database: process.env.DB_NAME || 'sveltycms'
	}
} satisfies Config;
