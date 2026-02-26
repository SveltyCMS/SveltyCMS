/**
 * @file src/databases/mariadb/adapter/adapter-types.ts
 * @description
 * Internal types for the MariaDB adapter services.
 * Defines connection structures and shared module interfaces.
 *
 * features:
 * - internal typing
 * - connection management types
 */

import type { MySql2Database } from 'drizzle-orm/mysql2';
import type mysql from 'mysql2/promise';
import type * as schema from '../schema';

export interface MariaDBConnection {
	db: MySql2Database<typeof schema>;
	pool: mysql.Pool;
}
