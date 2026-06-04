/**
 * @file src/databases/core/relational-utils.ts
 * @description Standard utility functions for relational adapters. (Clean Agnostic Version)
 */

import { generateUUID as uuidv4 } from "@utils/native-utils";
import { isoDateStringToDate, nowISODateString } from "@src/utils/date";
import type {
  DatabaseError,
  DatabaseId,
  PaginatedResult,
  PaginationOptions,
} from "../db-interface";

export { isoDateStringToDate, nowISODateString };

export const generateId = () => uuidv4().replace(/-/g, "") as DatabaseId;
export const validateId = (id: string) => /^[0-9a-f]{32}$/i.test(id) || /^[0-9a-f-]{36}$/i.test(id);

export const createDatabaseError = (
  code: string,
  message: string,
  originalError?: any,
  statusCode?: number,
): DatabaseError => ({
  code,
  message,
  statusCode,
  originalCode: originalError?.code || (originalError as any)?.originalError?.code,
  details: originalError,
});

export const normalizePath = (p: string) => p.replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");

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
export const safeDate = (input: any): Date => {
  if (input && typeof input === "object" && typeof (input as any).getTime === "function") {
    return new Date((input as any).getTime());
  }
  return new Date(input);
};

/**
 * 🚀 High-Performance Data Transformer
 * Guaranteed to preserve integrity even in minified production environments.
 */
export function convertDatesToISO(row: any): any {
  if (!row) return row;
  if (Array.isArray(row)) {
    return row.map(convertDatesToISO);
  }

  const result: any = {};
  const keys = Object.keys(row);

  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    let v = row[k];

    if (
      v instanceof Date ||
      (v && typeof v === "object" && typeof (v as any).getTime === "function")
    ) {
      v = (v instanceof Date ? v : new Date((v as any).getTime())).toISOString();
    } else if (
      JSON_FIELDS.has(k) &&
      typeof v === "string" &&
      v.length > 1 &&
      (v[0] === "{" || v[0] === "[")
    ) {
      try {
        const parsed = JSON.parse(v);
        v = parsed;
        if (k === "data" && parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          Object.assign(result, parsed);
        }
      } catch {
        // Keep original string
      }
    }
    result[k] = v;
  }

  return result;
}

export const convertArrayDatesToISO = (rows: any[]) => {
  if (!rows || rows.length === 0) return [];
  return rows.map(convertDatesToISO);
};

export function convertISOToDates(data: any): any {
  if (!data) return data;
  if (Array.isArray(data)) {
    return data.map(convertISOToDates);
  }

  const result: any = Object.assign({}, data);
  const keys = Object.keys(result);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const val = result[key];
    if (DATE_FIELDS.has(key)) {
      if (typeof val === "string" && val.length > 5) {
        result[key] = isoDateStringToDate(val as any);
      } else if (val && typeof val === "object" && typeof (val as any).getTime === "function") {
        // 🚀 CROSS-CONTEXT FIX: Always re-wrap if it looks like a Date.
        result[key] = new Date((val as any).getTime());
      }
    } else if (JSON_FIELDS.has(key) && val !== null && typeof val === "object") {
      // 🚀 DRIZZLE COMPATIBILITY: Drizzle handles JSON serialization natively.
      // Manually stringifying here causes double-serialization in MariaDB/MySQL.
      result[key] = val;
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
  return (v !== undefined && v !== null ? v : fallback !== undefined ? fallback : v) as T;
};
