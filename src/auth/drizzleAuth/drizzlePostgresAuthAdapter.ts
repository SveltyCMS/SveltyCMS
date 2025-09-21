/**
 * @file src/auth/drizzleAuth/drizzlePostgresAuthAdapter.ts
 * @description PostgreSQL-specific authentication adapter using Drizzle ORM.
 *
 * This is a specialized authentication adapter for PostgreSQL databases.
 * Currently re-exports the general DrizzleAuthAdapter which supports both MariaDB and PostgreSQL.
 */

import { DrizzleAuthAdapter } from '../drizzelDBAuth/drizzleAuthAdapter';

// Re-export the general adapter with a PostgreSQL-specific name
export class DrizzlePostgresAuthAdapter extends DrizzleAuthAdapter {
	constructor() {
		// Constructor for PostgreSQL auth adapter
		super();
		// Any PostgreSQL-specific initialization can go here
		// The _dbAdapter parameter is included for interface compatibility but not used yet
	}
}

// For convenience, also export as default
export default DrizzlePostgresAuthAdapter;
