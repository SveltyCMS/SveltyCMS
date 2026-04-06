/**
 * @file src/databases/db-utils.ts
 * @description Lightweight utility constants and helpers for the database system.
 */

import { privateConfigSchema, publicConfigSchema } from "./schemas";

// Infrastructure keys that come from config file, not database
export const INFRASTRUCTURE_KEYS = new Set([
  "DB_TYPE",
  "DB_HOST",
  "DB_PORT",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
  "DB_RETRY_ATTEMPTS",
  "DB_RETRY_DELAY",
  "DB_POOL_SIZE",
  "JWT_SECRET_KEY",
  "ENCRYPTION_KEY",
  "MULTI_TENANT",
  "DEMO",
  "TEST_API_SECRET",
]);

export const KNOWN_PUBLIC_KEYS =
  publicConfigSchema && "entries" in publicConfigSchema
    ? Object.keys(publicConfigSchema.entries)
    : [];

export const KNOWN_PRIVATE_KEYS =
  privateConfigSchema && "entries" in privateConfigSchema
    ? Object.keys(privateConfigSchema.entries).filter((key) => !INFRASTRUCTURE_KEYS.has(key))
    : [];

// --- Optimization Constants ---
export const CRITICAL_SETTINGS = [
  "MEDIA_FOLDER",
  "MULTI_TENANT",
  "BASE_LOCALE",
  "DEFAULT_CONTENT_LANGUAGE",
];
