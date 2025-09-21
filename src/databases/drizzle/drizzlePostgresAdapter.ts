/**
 * @file src/databases/drizzle/drizzlePostgresAdapter.ts
 * @description PostgreSQL-specific adapter using Drizzle ORM.
 *
 * This is a specialized adapter for PostgreSQL databases.
 * Currently re-exports the general DrizzleDBAdapter which supports both MariaDB and PostgreSQL.
 */

import { DrizzleDBAdapter } from './drizzleDBAdapter';

// Re-export the general adapter with a PostgreSQL-specific name
export class DrizzlePostgresAdapter extends DrizzleDBAdapter {
	constructor() {
		super();
		// Any PostgreSQL-specific initialization can go here
	}
}

// For convenience, also export as default
export default DrizzlePostgresAdapter;
