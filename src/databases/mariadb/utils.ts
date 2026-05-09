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
 * Apply tenant filter to WHERE conditions
 */
export function applyTenantFilter<T extends Record<string, unknown>>(
  conditions: T,
  tenantId?: string | null,
): T & { tenantId?: string | null } {
  if (tenantId) {
    return { ...conditions, tenantId };
  }
  return conditions;
}
