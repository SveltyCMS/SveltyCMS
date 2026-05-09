/**
 * @file src/databases/postgresql/utils.ts
 * @description PostgreSQL specific utility functions, mostly re-exporting from relational-utils.
 */

export * from "../core/relational-utils";

import type { PaginationOptions, PaginatedResult } from "../db-interface";
import { createPagination as baseCreatePagination } from "../core/relational-utils";

/**
 * Re-export createPagination with explicit types for PostgreSQL
 */
export function createPagination<T>(items: T[], options: PaginationOptions): PaginatedResult<T> {
  return baseCreatePagination(items, options);
}
