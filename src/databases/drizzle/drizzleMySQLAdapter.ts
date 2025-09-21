/**
 * @file src/databases/drizzle/drizzleMySQLAdapter.ts
 * @description MySQL/MariaDB-specific adapter using Drizzle ORM.
 *
 * This is a specialized adapter for MySQL and MariaDB databases.
 * Currently re-exports the general DrizzleDBAdapter which supports both MariaDB and PostgreSQL.
 */

import { DrizzleDBAdapter } from './drizzleDBAdapter';

// Re-export the general adapter with a MySQL-specific name
export class DrizzleMySQLAdapter extends DrizzleDBAdapter {
	constructor() {
		super();
		// Any MySQL/MariaDB-specific initialization can go here
	}
}

// For convenience, also export as default
export default DrizzleMySQLAdapter;
