/**
 * @file src/databases/postgresql/utils.ts
 * @description PostgreSQL utility functions for error handling and data transformation.
 */

import { generateUUID as uuidv4 } from "@utils/native-utils";
import type { DatabaseError, DatabaseId } from "../db-interface";

// Create a standardized database error object
export function createDatabaseError(
  code: string,
  message: string,
  originalError?: any,
): DatabaseError {
  return {
    code,
    message,
    originalCode:
      originalError?.code || originalError?.sqlState || (originalError as any)?.originalError?.code,
    details: originalError,
  };
}

// Generate a new UUID v4 for database IDs
export function generateId(): DatabaseId {
  return uuidv4() as DatabaseId;
}

// Convert Date or string to ISODateString
export function dateToISO(date: unknown): string | undefined {
  if (!date) return undefined;
  if (typeof date === "string") return date;
  if (date instanceof Date && typeof date.toISOString === "function") {
    return date.toISOString();
  }
  return undefined;
}

// Convert ISODateString or Date to Date
export function isoToDate(iso: Date | string | null | undefined): Date | undefined {
  if (!iso) {
    return undefined;
  }
  if (iso instanceof Date) {
    return iso;
  }
  return new Date(iso);
}

// Serialize a value for PostgreSQL storage
export function serializeValue(value: unknown): unknown {
  if (value === undefined || value === null) {
    return null;
  }
  if (value instanceof Date && typeof value.toISOString === "function") {
    return value.toISOString();
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return value;
}

// Deserialize a value from PostgreSQL storage
export function deserializeValue(value: unknown): unknown {
  if (typeof value === "string") {
    // Try to parse as JSON
    try {
      const parsed = JSON.parse(value);
      return parsed;
    } catch {
      return value;
    }
  }
  return value;
}

// Convert MongoDB-style ObjectId filter to PostgreSQL compatible
export function convertIdFilter(
  filter: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!filter || typeof filter !== "object") return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filter)) {
    if (key === "_id") {
      result.id = value;
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Parse a JSON field that may come back as a string from PostgreSQL JSONB.
 * Drizzle's .$type<T>() does not guarantee runtime deserialization.
 */
export function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

import { toISOString } from "@src/utils/date";
/**
 * Convert Date objects in a record to ISO strings.
 * PostgreSQL TIMESTAMP fields come back as Date objects from postgres.js.
 */
export function convertDatesToISO<T extends Record<string, unknown>>(obj: T): T {
  if (!obj || typeof obj !== "object") return obj;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value instanceof Date) {
      result[key] = toISOString(value);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

/**
 * Convert dates in an array of records to ISO strings.
 */
export function convertArrayDatesToISO<T extends Record<string, unknown>>(arr: T[]): T[] {
  return arr.map((item) => convertDatesToISO(item));
}

/**
 * Convert ISO strings in a record to Date objects.
 */
export function convertISOToDates<T extends Record<string, unknown>>(obj: T): T {
  if (!obj || typeof obj !== "object") return obj;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/.test(value)
    ) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        result[key] = date;
      } else {
        result[key] = value;
      }
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

// Normalize file paths by removing leading/trailing slashes and deduplicating slashes
export function normalizePath(path: string): string {
  return path
    .replace(/^\/+|\/+$/g, "") // Remove leading/trailing slashes
    .replace(/\/+/g, "/"); // Deduplicate slashes
}

// Validate a DatabaseId (UUID)
export function validateId(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id) || /^[0-9a-f]{32,36}$/i.test(id);
}

// Create pagination helper
export function createPagination<T>(
  items: T[],
  options: import("../db-interface").PaginationOptions,
): import("../db-interface").PaginatedResult<T> {
  const page = options.page || 1;
  const pageSize = options.pageSize || 10;
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    total: items.length,
    page,
    pageSize,
    hasNextPage: items.length > page * pageSize,
    hasPreviousPage: page > 1,
  };
}
