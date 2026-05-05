/**
 * @file src/databases/relational/relational-utils.ts
 * @description
 * Shared utility functions for all relational database adapters (SQLite, MariaDB, PostgreSQL).
 * Handles ID generation, date transformation, and hybrid schema flattening.
 */

import { generateUUID as uuidv4 } from "@utils/native-utils";
import { toISOString } from "@src/utils/date";
import type {
  DatabaseError,
  DatabaseId,
  PaginatedResult,
  PaginationOptions,
} from "../db-interface";

/**
 * Generate a new compact, dash-less UUID v4 for database IDs.
 */
export function generateId(): DatabaseId {
  return uuidv4().replace(/-/g, "") as DatabaseId;
}

/**
 * Validate a DatabaseId (UUID v4, with or without dashes).
 */
export function validateId(id: string): boolean {
  const uuidRegex =
    /^([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
  return uuidRegex.test(id);
}

/**
 * Create a standardized database error object.
 */
export function createDatabaseError(
  code: string,
  message: string,
  originalError?: any,
  statusCode?: number,
): DatabaseError {
  return {
    code,
    message,
    statusCode,
    originalCode:
      originalError?.code || originalError?.sqlState || (originalError as any)?.originalError?.code,
    details: originalError,
  };
}

/**
 * Normalize paths by removing leading/trailing slashes and deduplicating slashes.
 */
export function normalizePath(path: string): string {
  return path.replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
}

/**
 * Convert database row dates to ISO strings and parse JSON fields.
 * 🚀 HYBRID SCHEMA SUPPORT: Flattens the 'data' column into the main object.
 */
export function convertDatesToISO<T extends Record<string, unknown>>(row: T): T {
  if (!row) return row;
  let result = { ...row };

  const jsonFields = [
    "permissions",
    "roleIds",
    "data",
    "metadata",
    "translations",
    "config",
    "instances",
    "dependencies",
    "payload",
    "settings",
    "quota",
    "usage",
    "collectionDef",
  ];

  for (const key in result) {
    if (!Object.hasOwn(result, key)) continue;
    const value = result[key];

    // Handle Dates (PostgreSQL/MariaDB native Date objects)
    if (value instanceof Date) {
      (result as Record<string, unknown>)[key] = toISOString(value);
    }
    // Handle JSON strings (SQLite/MariaDB if not auto-parsed)
    else if (jsonFields.includes(key) && typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        (result as Record<string, unknown>)[key] = parsed;

        // 🚀 HYBRID SCHEMA SUPPORT: Flatten 'data' column
        if (key === "data" && parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          result = { ...parsed, ...result };
        }
      } catch {
        // Silently ignore parsing errors
      }
    }
    // Handle already parsed objects
    else if (key === "data" && value && typeof value === "object" && !Array.isArray(value)) {
      result = { ...(value as any), ...result };
    }
  }

  return result;
}

/**
 * Convert array of database rows to ISO strings.
 */
export function convertArrayDatesToISO<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map((row) => convertDatesToISO(row));
}

/**
 * Convert ISO strings in a record back to Date objects for storage.
 * Fixes "value.getTime is not a function" in Drizzle.
 */
export function convertISOToDates<T extends Record<string, unknown>>(data: T): T {
  if (!data) return data;
  const result = { ...data } as any;

  const dateFields = [
    "createdAt",
    "updatedAt",
    "publishedAt",
    "expires",
    "expiresAt",
    "nextRunAt",
    "appliedAt",
    "fetchedAt",
    "deletedAt",
    "lastHit",
    "last2FAVerification",
  ];

  const jsonFields = [
    "permissions",
    "roleIds",
    "data",
    "metadata",
    "translations",
    "config",
    "instances",
    "dependencies",
    "payload",
    "settings",
    "quota",
    "usage",
    "collectionDef",
  ];

  // Stringify JSON fields for SQLite/MariaDB
  for (const key of jsonFields) {
    if (result[key] !== undefined && typeof result[key] === "object" && result[key] !== null) {
      result[key] = JSON.stringify(result[key]);
    }
  }

  // Parse Date fields
  for (const key of dateFields) {
    if (result[key] !== undefined && typeof result[key] === "string") {
      const d = new Date(result[key]);
      if (!Number.isNaN(d.getTime())) {
        result[key] = d;
      }
    }
  }
  return result;
}

/**
 * Parse a JSON field safely with a fallback.
 */
export function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

/**
 * Create a paginated result from an array of items (in-memory).
 */
export function createPagination<T>(items: T[], options: PaginationOptions): PaginatedResult<T> {
  const page = options.page || 1;
  const pageSize = options.pageSize || 10;
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
