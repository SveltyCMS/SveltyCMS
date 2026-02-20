/**
 * @file src/databases/cache-category.ts
 * @description Standardized cache categories for unified metrics and multi-level caching.
 */

export const CacheCategory = {
	SCHEMA: 'schema',
	COLLECTION: 'collection',
	ENTRY: 'entry',
	SESSION: 'session',
	SETTING: 'setting',
	THEME: 'theme',
	USER: 'user',
	API: 'api',
	CONTENT: 'content',
	WIDGET: 'widget',
	MEDIA: 'media'
} as const;

export type CacheCategory = (typeof CacheCategory)[keyof typeof CacheCategory];
