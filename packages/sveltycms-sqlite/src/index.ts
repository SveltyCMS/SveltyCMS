/**
 * @file packages/sveltycms-sqlite/src/index.ts
 * @description Published SQLite adapter entry for SveltyCMS.
 *
 * Re-exports the in-tree SQLite adapter so the npm package tracks the CMS
 * implementation (no dual engine). Consumers of create-sveltycms continue to
 * load adapters via `src/databases/db-init.ts`.
 *
 * Features:
 * - named export of SQLiteAdapter
 * - IDBAdapter contract types
 */

export { SQLiteAdapter } from "../../../src/databases/sqlite/sqlite-adapter";
export type { IDBAdapter, IFtsAdapter } from "../../../src/databases/db-interface";
