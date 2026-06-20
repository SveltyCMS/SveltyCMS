/**
 * @file src/databases/mariadb/utils.ts
 * @description MariaDB specific utility functions, mostly re-exporting from relational-utils.
 */

export * from "../core/relational-utils";

import type { PaginationOptions, PaginatedResult } from "../db-interface";
import { createPagination as baseCreatePagination } from "../core/relational-utils";

/**
 * Re-export createPagination with explicit types for MariaDB
 */
export function createPagination<T>(items: T[], options: PaginationOptions): PaginatedResult<T> {
  return baseCreatePagination(items, options);
}

/**
 * Tenant filter helpers are now centralized in core/relational-utils.ts for all SQL adapters.
 * Re-export the canonical versions (and a compat shim for the old signature if any external code used the weak one).
 */
export {
  applyTenantFilter,
  applyTenantFilterToObject,
  getEffectiveTenantId,
  getTenantCondition,
  shouldBypassTenantCheck,
  applyTenantFilterToMongoQuery as applyTenantFilterMongo,
} from "../core/relational-utils";

/**
 * Compatibility shim for the previous (unused/weak) per-adapter signature.
 * New code should import { applyTenantFilterToObject } from the central utils.
 */
export function applyTenantFilterCompat<T extends Record<string, unknown>>(
  conditions: T,
  tenantId?: string | null,
): T & { tenantId?: string | null } {
  if (tenantId !== undefined && tenantId !== "global") {
    return { ...conditions, tenantId } as any;
  }
  return conditions;
}
