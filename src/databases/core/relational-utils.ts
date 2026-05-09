/**
 * @file src/databases/core/relational-utils.ts
 * @description
 * Shared utility functions for all relational database adapters (SQLite, MariaDB, PostgreSQL).
 * Handles ID generation, date transformation, and hybrid schema flattening.
 */

import { generateUUID as uuidv4 } from "@utils/native-utils";
import { toISOString, isoDateStringToDate, nowISODateString } from "@src/utils/date";
import type {
  DatabaseError,
  DatabaseId,
  PaginatedResult,
  PaginationOptions,
} from "../db-interface";

export { isoDateStringToDate, nowISODateString };

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

const JSON_FIELDS = new Set([
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
  "value",
  "thumbnails",
]);

const DATE_FIELDS = new Set([
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
]);

/**
 * Convert database row dates to ISO strings and parse JSON fields.
 * 🚀 HYBRID SCHEMA SUPPORT: Flattens the 'data' column into the main object.
 * ⚡ PERFORMANCE: Zero-allocation fast-path for clean rows.
 */
export function convertDatesToISO<T extends Record<string, unknown>>(row: T): T {
  if (!row) return row;

  let result: any = null;
  let hasChanges = false;

  for (const key in row) {
    if (!Object.hasOwn(row, key)) continue;
    const value = row[key];

    // Handle Dates (PostgreSQL/MariaDB native Date objects)
    if (value instanceof Date) {
      if (!hasChanges) {
        result = { ...row };
        hasChanges = true;
      }
      result[key] = toISOString(value);
    }
    // Handle JSON strings (SQLite/MariaDB if not auto-parsed)
    else if (JSON_FIELDS.has(key)) {
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value);
          if (!hasChanges) {
            result = { ...row };
            hasChanges = true;
          }
          result[key] = parsed;

          // 🚀 HYBRID SCHEMA SUPPORT: Flatten 'data' column
          if (key === "data" && parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            Object.assign(result, parsed);
          }
        } catch {
          // Silently ignore parsing errors
        }
      } else if (key === "data" && value && typeof value === "object" && !Array.isArray(value)) {
        if (!hasChanges) {
          result = { ...row };
          hasChanges = true;
        }
        Object.assign(result, value);
      }
    }
  }

  return hasChanges ? (result as T) : row;
}

/**
 * 🚀 Specialized session mapper (Zero-Scanning).
 */
export function convertSessionToISO<T extends Record<string, any>>(session: T): T {
  if (!session) return session;
  const res = { ...session } as any;
  if (res.expires instanceof Date) res.expires = toISOString(res.expires);
  if (res.createdAt instanceof Date) res.createdAt = toISOString(res.createdAt);
  if (res.updatedAt instanceof Date) res.updatedAt = toISOString(res.updatedAt);
  return res;
}

/**
 * 🚀 Specialized user mapper (Zero-Scanning).
 */
export function convertUserToISO<T extends Record<string, any>>(user: T): T {
  if (!user) return user;
  const res = { ...user } as any;
  if (res.createdAt instanceof Date) res.createdAt = toISOString(res.createdAt);
  if (res.updatedAt instanceof Date) res.updatedAt = toISOString(res.updatedAt);
  if (res.last2FAVerification instanceof Date)
    res.last2FAVerification = toISOString(res.last2FAVerification);
  if (res.lockoutUntil instanceof Date) res.lockoutUntil = toISOString(res.lockoutUntil);

  // Parse known JSON fields directly
  if (typeof res.roleIds === "string") res.roleIds = parseJsonField(res.roleIds, []);
  if (typeof res.permissions === "string") res.permissions = parseJsonField(res.permissions, []);

  return res;
}

/**
 * Convert array of database rows to ISO strings.
 */
export function convertArrayDatesToISO<T extends Record<string, unknown>>(rows: T[]): T[] {
  if (!rows || rows.length === 0) return rows;
  return rows.map((row) => convertDatesToISO(row));
}

/**
 * Convert ISO strings in a record back to Date objects for storage.
 * Fixes "value.getTime is not a function" in Drizzle.
 */
export function convertISOToDates<T extends Record<string, unknown>>(data: T): T {
  if (!data) return data;
  let result: any = null;
  let hasChanges = false;

  for (const key in data) {
    if (!Object.hasOwn(data, key)) continue;
    const value = data[key];

    // Stringify JSON fields for SQLite/MariaDB
    if (
      JSON_FIELDS.has(key) &&
      value !== undefined &&
      typeof value === "object" &&
      value !== null
    ) {
      if (!hasChanges) {
        result = { ...data };
        hasChanges = true;
      }
      result[key] = JSON.stringify(value);
    }
    // Parse Date fields
    else if (DATE_FIELDS.has(key) && typeof value === "string") {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) {
        if (!hasChanges) {
          result = { ...data };
          hasChanges = true;
        }
        result[key] = d;
      }
    }
  }

  return hasChanges ? (result as T) : data;
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
