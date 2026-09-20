/**
 * @file packages/sveltycms-mongodb/src/index.ts
 * @description Published MongoDB adapter entry for SveltyCMS.
 *
 * Features:
 * - named export of MongoDBAdapter
 * - IDBAdapter contract types
 */

export { MongoDBAdapter } from "../../../src/databases/mongodb/mongo-db-adapter";
export type { IDBAdapter, IFtsAdapter } from "../../../src/databases/db-interface";
