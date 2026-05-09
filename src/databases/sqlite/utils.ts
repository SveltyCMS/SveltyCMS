/**
 * @file src/databases/sqlite/utils.ts
 * @description SQLite specific utilities, re-exporting optimized agnostic functions.
 */

import type { PaginationOptions, PaginatedResult } from "../db-interface";

export {
  generateId,
  validateId,
  normalizePath,
  createDatabaseError,
  convertDatesToISO,
  convertArrayDatesToISO,
  convertISOToDates,
  isoDateStringToDate,
  nowISODateString,
} from "../core/relational-utils";

// Create a paginated result from an array of items (in-memory)
export function createPagination<T>(items: T[], options: PaginationOptions): PaginatedResult<T> {
  const page = options.page || 1;
  const pageSize = options.limit || 10;
  const offset = (page - 1) * pageSize;
  const total = items.length;
  const paginatedItems = items.slice(offset, offset + pageSize);

  return {
    items: paginatedItems,
    total,
    page,
    pageSize,
    hasNextPage: offset + pageSize < total,
    hasPreviousPage: page > 1,
  };
}
