/**
 * @file src/auth/drizzleAuth/drizzleMySQLAuthAdapter.ts
 * @description MySQL/MariaDB-specific authentication adapter using Drizzle ORM.
 *
 * This is a specialized authentication adapter for MySQL and MariaDB databases.
 * Currently re-exports the general DrizzleAuthAdapter which supports both MariaDB and PostgreSQL.
 */

import type { IDBAdapter } from '@src/databases/dbInterface';
import { DrizzleAuthAdapter } from '../drizzelDBAuth/drizzleAuthAdapter';

// Re-export the general adapter with a MySQL-specific name
export class DrizzleMySQLAuthAdapter extends DrizzleAuthAdapter {
	constructor(_dbAdapter: IDBAdapter) {
		super();
		// Any MySQL/MariaDB-specific initialization can go here
		// The _dbAdapter parameter is included for interface compatibility but not used yet
	}
}

// For convenience, also export as default
export default DrizzleMySQLAuthAdapter;
