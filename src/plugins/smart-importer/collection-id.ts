/**
 * @file src/plugins/smart-importer/collection-id.ts
 * @description Pure utility functions for collection ID normalization.
 * Extracted from collection-scaffold.ts to avoid node:fs imports in browser bundles.
 *
 * This file has NO server-side Node.js imports — safe for browser bundling.
 *
 * ### Features:
 * - normalizeCollectionId: sanitize collection name to safe _id
 * - FALLBACK_MIGRATION_COLLECTION: fallback collection id
 */

/** Last-resort collection id when inference cannot derive a name */
export const FALLBACK_MIGRATION_COLLECTION = "imported_content";

/** Normalize wizard collection name to a safe collection _id / filename */
export function normalizeCollectionId(name: string): string {
  const id = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return id || FALLBACK_MIGRATION_COLLECTION;
}
