/**
 * @file packages/sveltycms-mariadb/src/index.ts
 * @description Published MariaDB adapter entry for SveltyCMS.
 *
 * Features:
 * - named export of MariaDBAdapter
 * - IDBAdapter contract types
 */

export { MariaDBAdapter } from "../../../src/databases/mariadb/mariadb-adapter";
export type { IDBAdapter, IFtsAdapter } from "../../../src/databases/db-interface";
