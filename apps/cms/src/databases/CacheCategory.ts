/**
 * @file src/databases/CacheCategory.ts
 * @description Cache category enum - isomorphic (safe for both client and server)
 * Extracted from CacheService.ts to prevent Redis imports in client code
 */

export enum CacheCategory {
	SCHEMA = 'schema',
	WIDGET = 'widget',
	THEME = 'theme',
	CONTENT = 'content',
	MEDIA = 'media',
	SESSION = 'session',
	USER = 'user',
	API = 'api'
}
