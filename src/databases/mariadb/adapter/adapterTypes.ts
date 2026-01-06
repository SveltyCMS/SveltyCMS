/**
 * @file src/databases/mariadb/adapter/adapterTypes.ts
 * @description Internal types for the MariaDB adapter and its modules.
 */

import type { MySql2Database } from 'drizzle-orm/mysql2';
import type * as schema from '../schema';

export interface MariaDBConnection {
	db: MySql2Database<typeof schema>;
	pool: any;
}
