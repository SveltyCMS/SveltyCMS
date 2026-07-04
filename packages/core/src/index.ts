/**
 * @file packages/core/src/index.ts
 * @description
 * Barrel export for @sveltycms/core — the public API surface of the SveltyCMS engine.
 *
 * Re-exports:
 * - LocalCMS SDK (zero-latency server bridge)
 * - DB Adapter interface (IDBAdapter) and related types
 * - Core error handling (AppError)
 * - Core CMS types (DatabaseId, ISODateString, ContentNode, Schema, etc.)
 * - Auth types (User, Session, Token, ApiKey, Role)
 *
 * @packageDocumentation
 */

// ── SDK ──────────────────────────────────────────────────────────────
export { LocalCMS } from "../../../src/services/sdk";

// ── Core Types ───────────────────────────────────────────────────────
export type {
  DatabaseId,
  ISODateString,
  ContentNode,
  Schema,
  BaseEntity,
  WebsiteToken,
} from "../../../src/content/types";

// ── Auth Types ───────────────────────────────────────────────────────
export type { User, Session, Token, ApiKey, Role } from "../../../src/databases/auth/types";

// ── DB Interface Types ───────────────────────────────────────────────
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

// ── Errors ───────────────────────────────────────────────────────────
export { AppError } from "../../../src/utils/error-handling";
