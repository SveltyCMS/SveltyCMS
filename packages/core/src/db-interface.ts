/**
 * @file packages/core/src/db-interface.ts
 * @description Sub-path export for @sveltycms/core/db-interface — the database-agnostic adapter contract.
 */

export type {
  IDBAdapter,
  DatabaseResult,
  PaginatedResult,
  FindOptions,
  BaseQueryOptions,
  EntityCreate,
  EntityUpdate,
  CacheOptions,
  DatabaseError,
  QueryMeta,
  ConnectionPoolOptions,
  ConnectionPoolStats,
  DatabaseCapabilities,
  PerformanceMetrics,
  Tenant,
  TenantQuota,
  TenantUsage,
} from "../../../src/databases/db-interface";
