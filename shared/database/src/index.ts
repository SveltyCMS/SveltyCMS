/**
 * @file shared/database/src/index.ts
 * @description - Database Adapter Library
 *
 * Provides conditional loading of database drivers.
 * Only the selected driver is bundled in production.
 */

// Core exports
// Core exports (Commented out to prevent client bundle leaks)
// export { dbAdapter, auth } from './db';
export type { IDBAdapter } from './dbInterface';

// Schema exports
export * from './schemas';

// Services
export { cacheService } from './CacheService';
export { CacheMetrics } from './CacheMetrics';

// Re-export adapters for conditional loading
// MongoDB: import('./mongodb/...')
// MariaDB: import('./mariadb/...')
