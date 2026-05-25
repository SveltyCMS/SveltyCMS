/**
 * @file packages/core/src/index.ts
 * @description Barrel export for @sveltycms/core — re-exports from the main src/ directory.
 *
 * ### Features:
 * - LocalCMS SDK (zero-latency internal bridge)
 * - Database adapter interface (IDBAdapter)
 * - Auth types (User, Role, Session, Token, RolePermissions)
 * - Content types (ContentNode, Schema, FieldInstance, BaseEntity, etc.)
 */

// ── LocalCMS SDK ────────────────────────────────────────────────────────────
export { LocalCMS } from "../../../src/services/sdk/index.js";

// ── Database Adapter Interface ───────────────────────────────────────────────
export type { IDBAdapter } from "../../../src/databases/db-interface.js";

// ── Auth Types ───────────────────────────────────────────────────────────────
export type {
  User,
  Role,
  Session,
  Token,
  RolePermissions,
} from "../../../src/databases/auth/types.js";

// ── Content Types ────────────────────────────────────────────────────────────
export type {
  ContentNode,
  Schema,
  FieldInstance,
  BaseEntity,
  ISODateString,
  DatabaseId,
  CollectionEntry,
  RevisionData,
  MinimalSchema,
  FieldDefinition,
  StatusType,
  Translation,
  WidgetFieldPermissions,
} from "../../../src/content/types.js";
