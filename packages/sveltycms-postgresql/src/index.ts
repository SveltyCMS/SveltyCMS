/**
 * @file packages/sveltycms-postgresql/src/index.ts
 * @description Published PostgreSQL adapter entry for SveltyCMS.
 *
 * Features:
 * - named export of PostgreSQLAdapter
 * - IDBAdapter contract types
 */

export { PostgreSQLAdapter } from "../../../src/databases/postgresql/postgres-adapter";
export type { IDBAdapter, IFtsAdapter } from "../../../src/databases/db-interface";
