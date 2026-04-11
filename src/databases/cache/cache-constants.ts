/**
 * @file src/databases/cache/cache-constants.ts
 * @description
 * Client-safe cache constants extracted from cache/types.ts.
 *
 * This file contains ONLY plain object constants with zero server-side
 * imports (no redis, no node APIs), making it safe to import from
 * .svelte.ts stores and client-visible modules.
 *
 * Features:
 * - client-safe CacheCategory constants
 */

// Standardized cache categories for unified metrics and multi-level caching.
export const CacheCategory = {
  SCHEMA: "schema",
  COLLECTION: "collection",
  ENTRY: "entry",
  SESSION: "session",
  SETTING: "setting",
  THEME: "theme",
  USER: "user",
  API: "api",
  CONTENT: "content",
  WIDGET: "widget",
  MEDIA: "media",
} as const;

export type CacheCategory = (typeof CacheCategory)[keyof typeof CacheCategory];
