/**
 * @file src/databases/mariadb/mariadbAdapter.ts
 * @description MariaDB adapter implementation using Drizzle ORM
 * 
 * This adapter implements the IDBAdapter interface for MariaDB.
 * Implementation status: Core functionality for setup/init complete.
 * Additional methods will be implemented as needed.
 */

import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import { eq, and, inArray, sql } from 'drizzle-orm';
import type {
IDBAdapter,
DatabaseResult,
DatabaseCapabilities,
ConnectionPoolOptions,
DatabaseError,
DatabaseId,
ISODateString,
BaseEntity,
Theme,
SystemVirtualFolder,
QueryFilter,
BatchOperation,
BatchResult,
PerformanceMetrics,
CacheOptions,
DatabaseTransaction,
QueryBuilder,
User,
Session,
Token,
Role,
PaginationOption
} from '../dbInterface';

import * as schema from './schema';
import { createConnectionPool, closeConnectionPool, getConnectionPool, testConnection, type ConnectionConfig } from './connection';
import { runMigrations } from './migrations';
import { seedDatabase } from './seed';
import * as utils from './utils';
import { logger } from '@utils/logger';

export class MariaDBAdapter implements IDBAdapter {
private db: MySql2Database<typeof schema> | null = null;
private connected = false;

// Public utilities
public readonly utils = utils;

/**
 * Get database capabilities
 */
getCapabilities(): DatabaseCapabilities {
return {
supportsTransactions: true,
supportsIndexing: true,
supportsFullTextSearch: false, // MariaDB supports it but not implemented yet
supportsAggregation: true,
supportsStreaming: false,
supportsPartitioning: false,
maxBatchSize: 1000,
maxQueryComplexity: 10
};
}

/**
 * Connect to MariaDB database
 */
async connect(connectionString: string, options?: unknown): Promise<DatabaseResult<void>>;
async connect(poolOptions?: ConnectionPoolOptions): Promise<DatabaseResult<void>>;
async connect(connectionStringOrOptions?: string | ConnectionPoolOptions, options?: unknown): Promise<DatabaseResult<void>> {
try {
if (this.connected && this.db) {
logger.info('MariaDB adapter already connected');
return { success: true, data: undefined };
}

// Parse connection string
let config: ConnectionConfig;
if (typeof connectionStringOrOptions === 'string') {
config = this.parseConnectionString(connectionStringOrOptions);
} else {
throw new Error('ConnectionPoolOptions not yet supported for MariaDB. Please provide a connection string.');
}

// Create connection pool
const pool = await createConnectionPool(config);

// Initialize Drizzle
this.db = drizzle(pool, { schema, mode: 'default' });

// Run migrations to create tables
const migrationResult = await runMigrations(pool);
if (!migrationResult.success) {
throw new Error(`Migration failed: ${migrationResult.error}`);
}

this.connected = true;
logger.info('✅ MariaDB connection established successfully');

return { success: true, data: undefined };
} catch (error) {
const dbError = utils.createDatabaseError(
'CONNECTION_FAILED',
error instanceof Error ? error.message : String(error),
error
);
return { success: false, message: dbError.message, error: dbError };
}
}

/**
 * Parse MariaDB connection string
 */
private parseConnectionString(connectionString: string): ConnectionConfig {
// Format: mysql://user:password@host:port/database
// or: mariadb://user:password@host:port/database
const match = connectionString.match(/^(?:mysql|mariadb):\/\/(?:([^:]+):([^@]+)@)?([^:]+):(\d+)\/(.+)$/);
if (!match) {
throw new Error('Invalid MariaDB connection string format');
}

const [, user = '', password = '', host, port, database] = match;

return {
host,
port: parseInt(port, 10),
user,
password,
database
};
}

/**
 * Disconnect from database
 */
async disconnect(): Promise<DatabaseResult<void>> {
try {
await closeConnectionPool();
this.db = null;
this.connected = false;
logger.info('MariaDB connection closed');
return { success: true, data: undefined };
} catch (error) {
const dbError = utils.createDatabaseError(
'DISCONNECTION_FAILED',
error instanceof Error ? error.message : String(error),
error
);
return { success: false, message: dbError.message, error: dbError };
}
}

/**
 * Check if connected
 */
isConnected(): boolean {
return this.connected && this.db !== null;
}

/**
 * Get connection health
 */
async getConnectionHealth(): Promise<DatabaseResult<{ healthy: boolean; latency: number; activeConnections: number }>> {
try {
const { success, latency } = await testConnection();
return {
success: true,
data: {
healthy: success,
latency,
activeConnections: -1 // Not exposed by mysql2
}
};
} catch (error) {
const dbError = utils.createDatabaseError(
'HEALTH_CHECK_FAILED',
error instanceof Error ? error.message : String(error),
error
);
return { success: false, message: dbError.message, error: dbError };
}
}

//==============================================================================
// SYSTEM PREFERENCES (CRITICAL for init)
//==============================================================================

systemPreferences = {
get: async <T>(key: string, scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<T>> => {
if (!this.db) return this.notConnectedError();

try {
const conditions: any[] = [eq(schema.systemPreferences.key, key)];
if (scope) conditions.push(eq(schema.systemPreferences.scope, scope));
if (userId) conditions.push(eq(schema.systemPreferences.userId, userId));

const [result] = await this.db
.select()
.from(schema.systemPreferences)
.where(and(...conditions))
.limit(1);

if (!result) {
return { success: false, message: 'Preference not found', error: utils.createDatabaseError('NOT_FOUND', 'Preference not found') };
}

return { success: true, data: result.value as T };
} catch (error) {
return this.handleError(error, 'GET_PREFERENCE_FAILED');
}
},

getMany: async <T>(keys: string[], scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<Record<string, T>>> => {
if (!this.db) return this.notConnectedError();

try {
const conditions: any[] = [inArray(schema.systemPreferences.key, keys)];
if (scope) conditions.push(eq(schema.systemPreferences.scope, scope));
if (userId) conditions.push(eq(schema.systemPreferences.userId, userId));

const results = await this.db
.select()
.from(schema.systemPreferences)
.where(and(...conditions));

const prefs: Record<string, T> = {};
for (const result of results) {
prefs[result.key] = result.value as T;
}

return { success: true, data: prefs };
} catch (error) {
return this.handleError(error, 'GET_PREFERENCES_FAILED');
}
},

set: async <T>(key: string, value: T, scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<void>> => {
if (!this.db) return this.notConnectedError();

try {
const exists = await this.db
.select()
.from(schema.systemPreferences)
.where(eq(schema.systemPreferences.key, key))
.limit(1);

if (exists.length > 0) {
await this.db
.update(schema.systemPreferences)
.set({ value: value as any, updatedAt: new Date() })
.where(eq(schema.systemPreferences.key, key));
} else {
await this.db.insert(schema.systemPreferences).values({
_id: utils.generateId(),
key,
value: value as any,
scope: scope || 'system',
userId: userId || null,
visibility: 'private',
createdAt: new Date(),
updatedAt: new Date()
});
}

return { success: true, data: undefined };
} catch (error) {
return this.handleError(error, 'SET_PREFERENCE_FAILED');
}
},

setMany: async <T>(preferences: Array<{ key: string; value: T; scope?: 'user' | 'system'; userId?: DatabaseId }>): Promise<DatabaseResult<void>> => {
if (!this.db) return this.notConnectedError();

try {
for (const pref of preferences) {
await this.systemPreferences.set(pref.key, pref.value, pref.scope, pref.userId);
}
return { success: true, data: undefined };
} catch (error) {
return this.handleError(error, 'SET_PREFERENCES_FAILED');
}
},

delete: async (key: string, scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<void>> => {
if (!this.db) return this.notConnectedError();

try {
await this.db
.delete(schema.systemPreferences)
.where(eq(schema.systemPreferences.key, key));
return { success: true, data: undefined };
} catch (error) {
return this.handleError(error, 'DELETE_PREFERENCE_FAILED');
}
},

deleteMany: async (keys: string[], scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<void>> => {
if (!this.db) return this.notConnectedError();

try {
if (keys.length === 0) {
// Delete all preferences
await this.db.delete(schema.systemPreferences);
} else {
await this.db
.delete(schema.systemPreferences)
.where(inArray(schema.systemPreferences.key, keys));
}
return { success: true, data: undefined };
} catch (error) {
return this.handleError(error, 'DELETE_PREFERENCES_FAILED');
}
},

clear: async (scope?: 'user' | 'system', userId?: DatabaseId): Promise<DatabaseResult<void>> => {
if (!this.db) return this.notConnectedError();

try {
await this.db.delete(schema.systemPreferences);
return { success: true, data: undefined };
} catch (error) {
return this.handleError(error, 'CLEAR_PREFERENCES_FAILED');
}
}
};

//==============================================================================
// THEMES (CRITICAL for init)
//==============================================================================

themes = {
setupThemeModels: async (): Promise<void> => {
// No-op for SQL - tables created by migrations
logger.debug('Theme models setup (no-op for SQL)');
},

getActive: async (): Promise<DatabaseResult<Theme>> => {
if (!this.db) return this.notConnectedError();

try {
const [theme] = await this.db
.select()
.from(schema.themes)
.where(eq(schema.themes.isActive, true))
.limit(1);

if (!theme) {
return { success: false, message: 'No active theme found', error: utils.createDatabaseError('NOT_FOUND', 'No active theme') };
}

return { success: true, data: utils.convertDatesToISO(theme) as Theme };
} catch (error) {
return this.handleError(error, 'GET_ACTIVE_THEME_FAILED');
}
},

setDefault: async (themeId: DatabaseId): Promise<DatabaseResult<void>> => {
if (!this.db) return this.notConnectedError();

try {
// Unset all defaults
await this.db
.update(schema.themes)
.set({ isDefault: false });

// Set new default
await this.db
.update(schema.themes)
.set({ isDefault: true, isActive: true })
.where(eq(schema.themes._id, themeId));

return { success: true, data: undefined };
} catch (error) {
return this.handleError(error, 'SET_DEFAULT_THEME_FAILED');
}
},

install: async (theme: Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<Theme>> => {
if (!this.db) return this.notConnectedError();

try {
const id = utils.generateId();
await this.db.insert(schema.themes).values({
_id: id,
...theme,
config: theme.config as any,
createdAt: new Date(),
updatedAt: new Date()
});

const [inserted] = await this.db
.select()
.from(schema.themes)
.where(eq(schema.themes._id, id));

return { success: true, data: utils.convertDatesToISO(inserted) as Theme };
} catch (error) {
return this.handleError(error, 'INSTALL_THEME_FAILED');
}
},

uninstall: async (themeId: DatabaseId): Promise<DatabaseResult<void>> => {
if (!this.db) return this.notConnectedError();

try {
await this.db
.delete(schema.themes)
.where(eq(schema.themes._id, themeId));
return { success: true, data: undefined };
} catch (error) {
return this.handleError(error, 'UNINSTALL_THEME_FAILED');
}
},

update: async (themeId: DatabaseId, theme: Partial<Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>>): Promise<DatabaseResult<Theme>> => {
if (!this.db) return this.notConnectedError();

try {
await this.db
.update(schema.themes)
.set({ ...theme, config: theme.config as any, updatedAt: new Date() })
.where(eq(schema.themes._id, themeId));

const [updated] = await this.db
.select()
.from(schema.themes)
.where(eq(schema.themes._id, themeId));

return { success: true, data: utils.convertDatesToISO(updated) as Theme };
} catch (error) {
return this.handleError(error, 'UPDATE_THEME_FAILED');
}
},

getAllThemes: async (): Promise<Theme[]> => {
if (!this.db) return [];

try {
const themes = await this.db.select().from(schema.themes);
return utils.convertArrayDatesToISO(themes) as Theme[];
} catch (error) {
logger.error('Get all themes failed:', error);
return [];
}
},

storeThemes: async (themes: Theme[]): Promise<void> => {
if (!this.db) {
throw new Error('Database not connected');
}

try {
for (const theme of themes) {
const exists = await this.db
.select()
.from(schema.themes)
.where(eq(schema.themes.name, theme.name))
.limit(1);

if (exists.length === 0) {
await this.db.insert(schema.themes).values({
_id: theme._id || utils.generateId(),
name: theme.name,
path: theme.path,
isActive: theme.isActive,
isDefault: theme.isDefault,
config: theme.config as any,
previewImage: theme.previewImage || null,
customCss: theme.customCss || null,
createdAt: new Date(),
updatedAt: new Date()
});
}
}
} catch (error) {
logger.error('Store themes failed:', error);
throw error;
}
},

getDefaultTheme: async (tenantId?: string): Promise<DatabaseResult<Theme | null>> => {
if (!this.db) return this.notConnectedError();

try {
const [theme] = await this.db
.select()
.from(schema.themes)
.where(eq(schema.themes.isDefault, true))
.limit(1);

return { success: true, data: theme ? utils.convertDatesToISO(theme) as Theme : null };
} catch (error) {
return this.handleError(error, 'GET_DEFAULT_THEME_FAILED');
}
}
};
