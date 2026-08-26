/**
 * @file src/services/local-cms/types.ts
 * @description Common types for LocalCMS SDK namespaces.
 */

import type { DatabaseId } from "@src/databases/db-interface";
import type { CollectionMap } from "@src/content/types";
import type { PublicationFilter } from "@src/utils/security/publication-policy";

export interface LocalApiOptions {
  user?: any;
  tenantId?: DatabaseId | null;
  permanent?: boolean;
  bypassCache?: boolean;
  bypassRequestCache?: boolean;
  system?: boolean;
  skipValidation?: boolean;
  disableErrors?: boolean;
  populate?: string[];
  publicationFilter?: PublicationFilter | string;
  /** Passed through to session creation for device deduplication. */
  sessionMeta?: { userAgent?: string; deviceId?: string; ipAddress?: string };
  /**
   * Allow role / isAdmin / roleIds / permissions on updateUserAttributes.
   * Default false — privilege escalation fail-closed at Auth + adapter layers.
   */
  allowPrivilegeEscalation?: boolean;
  /** Forwarded to adapter when multi-tenant id-only updates are required. */
  bypassTenantCheck?: boolean;
  /**
   * Skip post-write side effects (outbox, workflow init, plugin afterSave, L2 cache fan-out).
   * L1 request cache is still cleared. Used by bulk seed / high-throughput write paths.
   */
  skipSideEffects?: boolean;
}

export interface TokenOptions extends LocalApiOptions {
  page?: number;
  limit?: number;
  sort?: string;
  order?: "asc" | "desc";
}

/**
 * Type-safe proxy for collection operations.
 */
export type CollectionProxy = {
  [K in keyof CollectionMap]: {
    find(options?: any): Promise<any>;
    findById(id: string, options?: any): Promise<any>;
    create(data: Partial<CollectionMap[K]>, options?: any): Promise<any>;
    update(id: string, data: Partial<CollectionMap[K]>, options?: any): Promise<any>;
    delete(id: string, options?: any): Promise<any>;
    queryBuilder(options?: any): any;
  };
};
