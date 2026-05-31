/**
 * @file src/databases/core/relational-utils.ts
 * @description Standard utility functions for relational adapters. (Clean Agnostic Version)
 */

import { generateUUID as uuidv4 } from "@utils/native-utils";
import {
  toISOString,
  isoDateStringToDate,
  nowISODateString,
} from "@src/utils/date";
import type {
  DatabaseError,
  DatabaseId,
  PaginatedResult,
  PaginationOptions,
} from "../db-interface";

export { isoDateStringToDate, nowISODateString };

export const generateId = () => uuidv4().replace(/-/g, "") as DatabaseId;
export const validateId = (id: string) =>
  /^[0-9a-f]{32}$/i.test(id) || /^[0-9a-f-]{36}$/i.test(id);

export const createDatabaseError = (
  code: string,
  message: string,
  originalError?: any,
  statusCode?: number,
): DatabaseError => ({
  code,
  message,
  statusCode,
  originalCode:
    originalError?.code || (originalError as any)?.originalError?.code,
  details: originalError,
});

export const normalizePath = (p: string) =>
  p.replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");

const JSON_FIELDS = new Set([
  "data",
  "metadata",
  "config",
  "settings",
  "payload",
  "translations",
  "collectionDef",
  "thumbnails",
  "quota",
  "usage",
  "details",
  "errorDetails",
  "instances",
  "roleIds",
  "permissions",
]);
const DATE_FIELDS = new Set([
  "createdAt",
  "updatedAt",
  "publishedAt",
  "expires",
  "expiresAt",
  "lastLoginAt",
  "timestamp",
  "appliedAt",
  "nextRunAt",
  "lastError",
  "lastErrorAt",
  "deletedAt",
  "publishDate",
  "lastHit",
  "fetchedAt",
  "last2FAVerification",
  "expiresAt",
]);

/**
 * 🚀 High-Performance Data Transformer
 * Guaranteed to preserve integrity even in minified production environments.
 */
export function convertDatesToISO(row: any): any {
  if (!row) return row;

  // 1. Create a clean result object
  const result: any = {};

  // 2. EXHAUSTIVE CRAWL: Capture everything the driver returned
  // Drizzle results are sometimes Proxies; crawling helps preserve keys.
  const keys = Object.getOwnPropertyNames(row).concat(Object.keys(row));
  for (const key of keys) {
    if (result[key] === undefined) result[key] = row[key];
  }

  // 3. TRANSFORMATIONS
  for (const key in result) {
    const val = result[key];

    if (
      val instanceof Date ||
      (val &&
        typeof val === "object" &&
        typeof (val as any).getTime === "function")
    ) {
      result[key] = toISOString(
        val instanceof Date ? val : new Date((val as any).getTime()),
      );
    } else if (
      JSON_FIELDS.has(key) &&
      typeof val === "string" &&
      (val.startsWith("{") || val.startsWith("["))
    ) {
      try {
        const parsed = JSON.parse(val);
        result[key] = parsed;
        // HYBRID FLATTENING: Dynamic data to top-level
        if (
          key === "data" &&
          parsed &&
          typeof parsed === "object" &&
          !Array.isArray(parsed)
        ) {
          Object.assign(result, parsed);
        }
      } catch {
        result[key] = val;
      }
    }
  }

  return result;
}

export const convertArrayDatesToISO = (rows: any[]) => {
  if (!rows || rows.length === 0) return [];
  const len = rows.length;
  const result = Array.from({ length: len });
  for (let i = 0; i < len; i++) {
    result[i] = convertDatesToISO(rows[i]);
  }
  return result;
};

export function convertISOToDates(data: any): any {
  if (!data) return data;
  const result: any = Object.assign({}, data);
  for (const key in result) {
    const val = result[key];
    if (DATE_FIELDS.has(key)) {
      if (typeof val === "string" && val.length > 5) {
        result[key] = isoDateStringToDate(val as any);
      } else if (
        val &&
        typeof val === "object" &&
        typeof (val as any).getTime === "function"
      ) {
        // 🚀 CROSS-CONTEXT FIX: Always re-wrap if it looks like a Date.
        // This handles cases where 'instanceof Date' fails due to multiple constructor instances (cross-chunk).
        result[key] = new Date((val as any).getTime());
      }
    } else if (
      JSON_FIELDS.has(key) &&
      val !== null &&
      typeof val === "object"
    ) {
      result[key] = JSON.stringify(val);
    }
  }
  return result;
}

export function createPagination<T>(
  items: T[],
  options: PaginationOptions = {},
): PaginatedResult<T> {
  const page = options.page || 1;
  const pageSize = options.limit || 25;
  const total = items.length;
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    total,
    page,
    pageSize,
    hasNextPage: page * pageSize < total,
    hasPreviousPage: page > 1,
  };
}

export const paginateResults = createPagination;
export const convertUserToISO = convertDatesToISO;
export const convertSessionToISO = convertDatesToISO;
export const parseJsonField = <T = any>(v: any, fallback?: T): T => {
  if (typeof v === "string" && (v.startsWith("{") || v.startsWith("["))) {
    try {
      return JSON.parse(v) as T;
    } catch {
      return (fallback !== undefined ? fallback : v) as T;
    }
  }
  return (
    v !== undefined && v !== null ? v : fallback !== undefined ? fallback : v
  ) as T;
};
