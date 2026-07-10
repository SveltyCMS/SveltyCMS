/**
 * @file src/plugins/unified-data-hub/types.ts
 * @description Type definitions for the Unified Data Hub federation plugin.
 *
 * Features:
 * - Connector capability matrix
 * - Virtual read request/result contracts
 * - Federation error codes
 */

import type { BaseEntity, DatabaseId } from "@databases/db-interface";

export type ConnectorType = "postgres" | "mariadb" | "sqlite" | "mongodb" | "rest";

export type ConnectorHealth = "ok" | "degraded" | "down" | "unknown";

export type ConnectorCapabilities = {
  filterPushdown: boolean;
  sortPushdown: boolean;
  joinable: false | "same-source-only";
  maxPageSize: number;
  supportsTransactions: boolean;
  staleness: "real-time" | "poll" | "cache";
  ttlSeconds?: number;
  /** When true, connector supports create/update/delete for mapped virtual collections */
  writable: boolean;
};

export interface ConnectorRecord extends BaseEntity {
  _id: DatabaseId;
  tenantId: DatabaseId;
  name: string;
  type: ConnectorType;
  enabled: boolean;
  /** Public config — host, port, basePath (no secrets) */
  config: Record<string, unknown>;
  /** Server-only credentials — never sent to client */
  credentials?: Record<string, unknown>;
  allowedHosts?: string[];
  capabilities: ConnectorCapabilities;
  health: ConnectorHealth;
  lastHealthCheck?: string;
  lastError?: string;
}

export interface VirtualFieldMapping {
  name: string;
  label: string;
  sourceField: string;
  type: string;
}

/** Same-source virtual relation (v1.5 Phase B) */
export interface VirtualRelation {
  name: string;
  targetSlug: string;
  localField: string;
  foreignField: string;
}

export interface VirtualCollectionRecord extends BaseEntity {
  _id: DatabaseId;
  tenantId: DatabaseId;
  name: string;
  slug: string;
  connectorId: string;
  source: {
    table?: string;
    endpoint?: string;
    schema?: string;
    platform?: string;
    /** MongoDB collection name */
    collection?: string;
  };
  fields: VirtualFieldMapping[];
  relations?: VirtualRelation[];
  permissions?: { read?: string[]; write?: string[] };
  enabled: boolean;
}

export interface VirtualReadRequest {
  collectionId: string;
  tenantId: string;
  filter?: Record<string, unknown>;
  sort?: { field: string; direction: "asc" | "desc" };
  limit?: number;
  offset?: number;
  select?: string[];
  user?: { _id?: string; role?: string; isAdmin?: boolean };
}

export interface FederatedRow {
  _id: string;
  _source: { connectorId: string; sourceKey: string };
  /** Nested same-source join results keyed by relation name (v1.5) */
  _relations?: Record<string, FederatedRow | null>;
  [field: string]: unknown;
}

export interface VirtualReadResult {
  data: FederatedRow[];
  total?: number;
  meta: {
    connectorId: string;
    staleness: "real-time" | "cache";
    cachedAt?: string;
    clamped?: boolean;
    included?: string[];
    stitchWarning?: boolean;
    nearBudget?: boolean;
    warningCode?: "NONE" | "HIGH_KEY_COUNT" | "NEAR_BUDGET";
    joinKeyCount?: number;
    joinBudget?: number;
    decomposition?: {
      version: string;
      crossSource: boolean;
      subExpressionCount: number;
      mergeStrategy: string;
      cursorModel: string;
    };
    nextCursor?: string;
    cursorOffset?: number;
  };
}

export type VirtualWriteOperation = "create" | "update" | "delete";

export interface VirtualWriteRequest {
  collectionId: string;
  tenantId: string;
  operation: VirtualWriteOperation;
  entryId?: string;
  data?: Record<string, unknown>;
  user?: { _id?: string; role?: string; isAdmin?: boolean };
}

export interface VirtualWriteResult {
  data: FederatedRow | null;
  meta: {
    connectorId: string;
    operation: VirtualWriteOperation;
    sourceKey?: string;
  };
}

export interface VirtualCollectionWriteOptions {
  tenantId?: string | DatabaseId | null;
  user?: { _id?: string; role?: string; isAdmin?: boolean };
  data?: Record<string, unknown>;
}

export type FederationErrorCode =
  | "FEDERATION_JOIN_NOT_SUPPORTED"
  | "FEDERATION_JOIN_BUDGET_EXCEEDED"
  | "FEDERATION_HYBRID_QUERY_NOT_SUPPORTED"
  | "CONNECTOR_CAPABILITY_EXCEEDED"
  | "CONNECTOR_NOT_FOUND"
  | "COLLECTION_NOT_FOUND"
  | "CONNECTOR_DISABLED"
  | "PERMISSION_DENIED"
  | "LICENSE_REQUIRED"
  | "LICENSE_TIER_LIMIT"
  | "SSRF_HOST_DENIED"
  | "CONNECTOR_QUERY_FAILED"
  | "CONNECTOR_CIRCUIT_OPEN"
  | "CONNECTOR_WRITE_NOT_SUPPORTED"
  | "CONNECTOR_WRITE_FAILED"
  | "VIRTUAL_ENTRY_NOT_FOUND";

export class FederationError extends Error {
  constructor(
    public readonly code: FederationErrorCode,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "FederationError";
  }
}

export interface VirtualCollectionReadOptions {
  tenantId?: string | DatabaseId | null;
  user?: { _id?: string; role?: string; isAdmin?: boolean };
  filter?: Record<string, unknown>;
  sort?: { field: string; direction: "asc" | "desc" };
  limit?: number;
  offset?: number;
  select?: string[];
  bypassCache?: boolean;
  /** Same-source relation names to expand (v1.5 Phase B) */
  include?: string[];
  /** Per-source opaque cursor (v3 stable); takes precedence over offset */
  cursor?: string;
}
