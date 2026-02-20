/**
 * @file src/databases/postgresql/postgres-adapter.ts
 * @description PostgreSQL adapter entry point. Re-exports the modularized adapter implementation.
 */

import { PostgreSQLAdapter } from './adapter/index';

export { PostgreSQLAdapter };
export default PostgreSQLAdapter;
