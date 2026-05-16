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
  "author",
  "categories",
  "tags",
  "featuredImage",
  "relatedPosts",
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
  "lastLoginAt",
  "lastActivityAt",
  "lastRun",
  "timestamp",
]);

/**
 * Convert database row dates to ISO strings and parse JSON fields.
 * 🚀 HYBRID SCHEMA SUPPORT: Flattens the 'data' column into the main object.
 * ⚡ PERFORMANCE: High-speed scanner with early-exit and zero-allocation fast-path.
 */
export function convertDatesToISO<T extends Record<string, unknown>>(row: T): T {
  if (!row) return row;

  // 🚀 PERFORMANCE: Most rows don't need transformation. Avoid cloning unless necessary.
  let result: any = null;

  for (const key in row) {
    if (!Object.hasOwn(row, key)) continue;
    const value = row[key];

    // 1. Handle Dates (Most frequent transformation in Postgres/MariaDB)
    if (value instanceof Date) {
      if (!result) result = { ...row };
      result[key] = toISOString(value);
      continue;
    }

    // 2. Handle known JSON fields (High frequency in SQLite/MariaDB)
    if (JSON_FIELDS.has(key) && typeof value === "string") {
      // 🚀 HARDENING: Guard against 'undefined' or empty strings stored in DB
      if (
        value === "undefined" ||
        value === "" ||
        value === "null" ||
        value === "undefined" ||
        value.trim() === "undefined"
      ) {
        if (!result) result = { ...row };
        result[key] = null; // Always null for botched JSON strings
        continue;
      }

      try {
        const parsed = JSON.parse(value);
        if (!result) result = { ...row };
        result[key] = parsed;

        // 🚀 HYBRID SCHEMA SUPPORT: Flatten 'data' column without Object.assign
        if (key === "data" && parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          for (const pKey in parsed) {
            result[pKey] = (parsed as any)[pKey];
          }
        }
      } catch (err: any) {
        if (!result) result = { ...row };

        // 🚀 HARDENING: If it's not valid JSON, but it's a non-empty string, keep it as raw string.
        // This is critical for fields like 'value' which can store both JSON and plain text.
        if (value && value !== "undefined" && value !== "null") {
          result[key] = value;
        } else {
          result[key] = null;
        }

        // Log warning only for truly botched values that look like they SHOULD have been JSON
        if (value.startsWith("{") || value.startsWith("[")) {
          console.warn(`[RelationalUtils] Failed to parse JSON field '${key}': ${err.message}`, {
            valueSnippet: value.substring(0, 100),
          });
        }
      }
      continue;
    }

    // 3. Handle already parsed 'data' object (already done by some adapters)
    if (key === "data" && value && typeof value === "object" && !Array.isArray(value)) {
      if (!result) result = { ...row };
      for (const pKey in value as any) {
        result[pKey] = (value as any)[pKey];
      }
    }
  }

  return result || row;
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
  const len = rows.length;
  const result = Array.from({ length: len }) as T[];
  for (let i = 0; i < len; i++) {
    result[i] = convertDatesToISO(rows[i]);
  }
  return result;
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

    // 1. Catch undefined values early to prevent driver crashes
    if (value === undefined) {
      if (!hasChanges) {
        result = { ...data };
        hasChanges = true;
      }
      delete result[key];
      continue;
    }

    // 2. Stringify JSON fields for SQLite/MariaDB
    if (JSON_FIELDS.has(key)) {
      if (value === null || value === "undefined") {
        if (value === "undefined") {
          console.error(
            `[RelationalUtils] CRITICAL: Detected 'undefined' string in JSON field '${key}' during serialization!`,
            {
              data: JSON.stringify(data).substring(0, 500),
            },
          );
        }
        if (!hasChanges) {
          result = { ...data };
          hasChanges = true;
        }
        result[key] = null;
      } else if (typeof value === "object") {
        if (!hasChanges) {
          result = { ...data };
          hasChanges = true;
        }
        result[key] = JSON.stringify(value);
      }
      continue;
    }
    // 3. Parse Date fields
    else if (DATE_FIELDS.has(key) || key.endsWith("At") || key.endsWith("Date")) {
      if (typeof value === "string" || typeof value === "number") {
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
  }

  return hasChanges ? (result as T) : data;
}

/**
 * Parse a JSON field safely with a fallback.
 */
export function parseJsonField<T>(value: unknown, fallback: T): T {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    value === "undefined" ||
    value === "null"
  ) {
    return fallback;
  }
  if (typeof value === "object") return value as T;

  try {
    return JSON.parse(value as string) as T;
  } catch {
    return fallback;
  }
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
