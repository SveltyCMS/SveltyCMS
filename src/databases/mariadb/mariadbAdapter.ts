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

//==============================================================================
// SYSTEM VIRTUAL FOLDER (CRITICAL for init)
//==============================================================================

systemVirtualFolder = {
getAll: async (): Promise<DatabaseResult<SystemVirtualFolder[]>> => {
if (!this.db) return this.notConnectedError();

try {
const folders = await this.db.select().from(schema.systemVirtualFolders);
return { success: true, data: utils.convertArrayDatesToISO(folders) as SystemVirtualFolder[] };
} catch (error) {
return this.handleError(error, 'GET_VIRTUAL_FOLDERS_FAILED');
}
},

getById: async (id: DatabaseId): Promise<DatabaseResult<SystemVirtualFolder>> => {
if (!this.db) return this.notConnectedError();

try {
const [folder] = await this.db
.select()
.from(schema.systemVirtualFolders)
.where(eq(schema.systemVirtualFolders._id, id))
.limit(1);

if (!folder) {
return { success: false, message: 'Virtual folder not found', error: utils.createDatabaseError('NOT_FOUND', 'Virtual folder not found') };
}

return { success: true, data: utils.convertDatesToISO(folder) as SystemVirtualFolder };
} catch (error) {
return this.handleError(error, 'GET_VIRTUAL_FOLDER_FAILED');
}
},

getByParentId: async (parentId: DatabaseId | null): Promise<DatabaseResult<SystemVirtualFolder[]>> => {
if (!this.db) return this.notConnectedError();

try {
const folders = parentId
? await this.db
.select()
.from(schema.systemVirtualFolders)
.where(eq(schema.systemVirtualFolders.parentId, parentId))
: await this.db
.select()
.from(schema.systemVirtualFolders)
.where(sql`${schema.systemVirtualFolders.parentId} IS NULL`);

return { success: true, data: utils.convertArrayDatesToISO(folders) as SystemVirtualFolder[] };
} catch (error) {
return this.handleError(error, 'GET_VIRTUAL_FOLDERS_BY_PARENT_FAILED');
}
},

create: async (folder: Omit<SystemVirtualFolder, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<SystemVirtualFolder>> => {
if (!this.db) return this.notConnectedError();

try {
const id = utils.generateId();
await this.db.insert(schema.systemVirtualFolders).values({
_id: id,
name: folder.name,
path: folder.path,
parentId: folder.parentId || null,
icon: folder.icon || null,
order: folder.order,
type: folder.type,
metadata: folder.metadata as any,
tenantId: folder.tenantId || null,
createdAt: new Date(),
updatedAt: new Date()
});

const [created] = await this.db
.select()
.from(schema.systemVirtualFolders)
.where(eq(schema.systemVirtualFolders._id, id));

return { success: true, data: utils.convertDatesToISO(created) as SystemVirtualFolder };
} catch (error) {
return this.handleError(error, 'CREATE_VIRTUAL_FOLDER_FAILED');
}
},

update: async (id: DatabaseId, folder: Partial<Omit<SystemVirtualFolder, '_id' | 'createdAt' | 'updatedAt'>>): Promise<DatabaseResult<SystemVirtualFolder>> => {
if (!this.db) return this.notConnectedError();

try {
await this.db
.update(schema.systemVirtualFolders)
.set({ ...folder, metadata: folder.metadata as any, updatedAt: new Date() })
.where(eq(schema.systemVirtualFolders._id, id));

const [updated] = await this.db
.select()
.from(schema.systemVirtualFolders)
.where(eq(schema.systemVirtualFolders._id, id));

return { success: true, data: utils.convertDatesToISO(updated) as SystemVirtualFolder };
} catch (error) {
return this.handleError(error, 'UPDATE_VIRTUAL_FOLDER_FAILED');
}
},

delete: async (id: DatabaseId): Promise<DatabaseResult<void>> => {
if (!this.db) return this.notConnectedError();

try {
await this.db
.delete(schema.systemVirtualFolders)
.where(eq(schema.systemVirtualFolders._id, id));
return { success: true, data: undefined };
} catch (error) {
return this.handleError(error, 'DELETE_VIRTUAL_FOLDER_FAILED');
}
},

exists: async (path: string): Promise<DatabaseResult<boolean>> => {
if (!this.db) return this.notConnectedError();

try {
const [folder] = await this.db
.select()
.from(schema.systemVirtualFolders)
.where(eq(schema.systemVirtualFolders.path, path))
.limit(1);

return { success: true, data: !!folder };
} catch (error) {
return this.handleError(error, 'CHECK_VIRTUAL_FOLDER_EXISTS_FAILED');
}
},

getContents: async (folderId: DatabaseId): Promise<DatabaseResult<SystemVirtualFolder[]>> => {
if (!this.db) return this.notConnectedError();

try {
const folders = await this.db
.select()
.from(schema.systemVirtualFolders)
.where(eq(schema.systemVirtualFolders.parentId, folderId));

return { success: true, data: utils.convertArrayDatesToISO(folders) as SystemVirtualFolder[] };
} catch (error) {
return this.handleError(error, 'GET_VIRTUAL_FOLDER_CONTENTS_FAILED');
}
}
};

//==============================================================================
// WIDGETS (needed for init)
//==============================================================================

widgets = {
setupWidgetModels: async (): Promise<void> => {
// No-op for SQL - tables created by migrations
logger.debug('Widget models setup (no-op for SQL)');
},

register: async (widget: any): Promise<DatabaseResult<void>> => {
if (!this.db) return this.notConnectedError();

try {
const exists = await this.db
.select()
.from(schema.widgets)
.where(eq(schema.widgets.name, widget.name))
.limit(1);

if (exists.length > 0) {
await this.db
.update(schema.widgets)
.set({
isActive: widget.isActive,
instances: widget.instances as any,
dependencies: widget.dependencies,
updatedAt: new Date()
})
.where(eq(schema.widgets.name, widget.name));
} else {
await this.db.insert(schema.widgets).values({
_id: utils.generateId(),
name: widget.name,
isActive: widget.isActive,
instances: widget.instances as any,
dependencies: widget.dependencies,
createdAt: new Date(),
updatedAt: new Date()
});
}

return { success: true, data: undefined };
} catch (error) {
return this.handleError(error, 'REGISTER_WIDGET_FAILED');
}
},

findAll: async (): Promise<DatabaseResult<any[]>> => {
if (!this.db) return this.notConnectedError();

try {
const widgets = await this.db.select().from(schema.widgets);
return { success: true, data: utils.convertArrayDatesToISO(widgets) };
} catch (error) {
return this.handleError(error, 'FIND_ALL_WIDGETS_FAILED');
}
},

findByName: async (name: string): Promise<DatabaseResult<any>> => {
if (!this.db) return this.notConnectedError();

try {
const [widget] = await this.db
.select()
.from(schema.widgets)
.where(eq(schema.widgets.name, name))
.limit(1);

if (!widget) {
return { success: false, message: 'Widget not found', error: utils.createDatabaseError('NOT_FOUND', 'Widget not found') };
}

return { success: true, data: utils.convertDatesToISO(widget) };
} catch (error) {
return this.handleError(error, 'FIND_WIDGET_BY_NAME_FAILED');
}
},

activate: async (name: string): Promise<DatabaseResult<void>> => {
if (!this.db) return this.notConnectedError();

try {
await this.db
.update(schema.widgets)
.set({ isActive: true, updatedAt: new Date() })
.where(eq(schema.widgets.name, name));

return { success: true, data: undefined };
} catch (error) {
return this.handleError(error, 'ACTIVATE_WIDGET_FAILED');
}
},

deactivate: async (name: string): Promise<DatabaseResult<void>> => {
if (!this.db) return this.notConnectedError();

try {
await this.db
.update(schema.widgets)
.set({ isActive: false, updatedAt: new Date() })
.where(eq(schema.widgets.name, name));

return { success: true, data: undefined };
} catch (error) {
return this.handleError(error, 'DEACTIVATE_WIDGET_FAILED');
}
}
};

//==============================================================================
// MEDIA (needed for init)
//==============================================================================

media = {
setupMediaModels: async (): Promise<void> => {
// No-op for SQL - tables created by migrations
logger.debug('Media models setup (no-op for SQL)');
}
};

//==============================================================================
// CONTENT (stub - not critical for initial setup)
//==============================================================================

content = {
nodes: {
create: async (): Promise<DatabaseResult<any>> => this.notImplemented('content.nodes.create'),
update: async (): Promise<DatabaseResult<any>> => this.notImplemented('content.nodes.update'),
delete: async (): Promise<DatabaseResult<void>> => this.notImplemented('content.nodes.delete'),
getById: async (): Promise<DatabaseResult<any>> => this.notImplemented('content.nodes.getById'),
getByPath: async (): Promise<DatabaseResult<any>> => this.notImplemented('content.nodes.getByPath'),
getChildren: async (): Promise<DatabaseResult<any[]>> => this.notImplemented('content.nodes.getChildren'),
getStructure: async (): Promise<DatabaseResult<any>> => this.notImplemented('content.nodes.getStructure'),
reorder: async (): Promise<DatabaseResult<void>> => this.notImplemented('content.nodes.reorder')
},
drafts: {
create: async (): Promise<DatabaseResult<any>> => this.notImplemented('content.drafts.create'),
update: async (): Promise<DatabaseResult<any>> => this.notImplemented('content.drafts.update'),
delete: async (): Promise<DatabaseResult<void>> => this.notImplemented('content.drafts.delete'),
getById: async (): Promise<DatabaseResult<any>> => this.notImplemented('content.drafts.getById'),
getByContentId: async (): Promise<DatabaseResult<any>> => this.notImplemented('content.drafts.getByContentId'),
publish: async (): Promise<DatabaseResult<any>> => this.notImplemented('content.drafts.publish')
},
revisions: {
create: async (): Promise<DatabaseResult<any>> => this.notImplemented('content.revisions.create'),
getById: async (): Promise<DatabaseResult<any>> => this.notImplemented('content.revisions.getById'),
getByContentId: async (): Promise<DatabaseResult<any[]>> => this.notImplemented('content.revisions.getByContentId'),
getHistory: async (): Promise<DatabaseResult<any[]>> => this.notImplemented('content.revisions.getHistory'),
restore: async (): Promise<DatabaseResult<any>> => this.notImplemented('content.revisions.restore')
}
};

//==============================================================================
// CRUD (stub - not critical for initial setup)
//==============================================================================

crud = {
findOne: async (): Promise<DatabaseResult<any>> => this.notImplemented('crud.findOne'),
findMany: async (): Promise<DatabaseResult<any[]>> => this.notImplemented('crud.findMany'),
insert: async (): Promise<DatabaseResult<any>> => this.notImplemented('crud.insert'),
update: async (): Promise<DatabaseResult<any>> => this.notImplemented('crud.update'),
delete: async (): Promise<DatabaseResult<void>> => this.notImplemented('crud.delete'),
upsert: async (): Promise<DatabaseResult<any>> => this.notImplemented('crud.upsert'),
count: async (): Promise<DatabaseResult<number>> => this.notImplemented('crud.count'),
exists: async (): Promise<DatabaseResult<boolean>> => this.notImplemented('crud.exists'),
aggregate: async (): Promise<DatabaseResult<any[]>> => this.notImplemented('crud.aggregate'),
insertMany: async (): Promise<DatabaseResult<any[]>> => this.notImplemented('crud.insertMany'),
updateMany: async (): Promise<DatabaseResult<number>> => this.notImplemented('crud.updateMany'),
deleteMany: async (): Promise<DatabaseResult<number>> => this.notImplemented('crud.deleteMany')
};

//==============================================================================
// WEBSITE TOKENS (stub)
//==============================================================================

websiteTokens = {
create: async (): Promise<DatabaseResult<WebsiteToken>> => this.notImplemented('websiteTokens.create'),
getAll: async (): Promise<DatabaseResult<WebsiteToken[]>> => this.notImplemented('websiteTokens.getAll'),
getById: async (): Promise<DatabaseResult<WebsiteToken>> => this.notImplemented('websiteTokens.getById'),
delete: async (): Promise<DatabaseResult<void>> => this.notImplemented('websiteTokens.delete')
};

//==============================================================================
// AUTH (CRITICAL for setup - stub for now, implement as needed)
//==============================================================================

auth = {
setupAuthModels: async (): Promise<void> => {
// No-op for SQL - tables created by migrations
logger.debug('Auth models setup (no-op for SQL)');
},

// User methods
createUser: async (): Promise<DatabaseResult<User>> => this.notImplemented('auth.createUser'),
updateUserAttributes: async (): Promise<DatabaseResult<User>> => this.notImplemented('auth.updateUserAttributes'),
deleteUser: async (): Promise<DatabaseResult<void>> => this.notImplemented('auth.deleteUser'),
getUserById: async (): Promise<DatabaseResult<User>> => this.notImplemented('auth.getUserById'),
getUserByEmail: async (): Promise<DatabaseResult<User>> => this.notImplemented('auth.getUserByEmail'),
getAllUsers: async (): Promise<DatabaseResult<User[]>> => this.notImplemented('auth.getAllUsers'),
getUserCount: async (): Promise<DatabaseResult<number>> => this.notImplemented('auth.getUserCount'),
deleteUsers: async (): Promise<DatabaseResult<void>> => this.notImplemented('auth.deleteUsers'),
blockUsers: async (): Promise<DatabaseResult<void>> => this.notImplemented('auth.blockUsers'),
unblockUsers: async (): Promise<DatabaseResult<void>> => this.notImplemented('auth.unblockUsers'),

// Combined methods
createUserAndSession: async (): Promise<DatabaseResult<{ user: User; session: Session }>> => this.notImplemented('auth.createUserAndSession'),
deleteUserAndSessions: async (): Promise<DatabaseResult<void>> => this.notImplemented('auth.deleteUserAndSessions'),

// Session methods
createSession: async (): Promise<DatabaseResult<Session>> => this.notImplemented('auth.createSession'),
updateSessionExpiry: async (): Promise<DatabaseResult<Session>> => this.notImplemented('auth.updateSessionExpiry'),
deleteSession: async (): Promise<DatabaseResult<void>> => this.notImplemented('auth.deleteSession'),
deleteExpiredSessions: async (): Promise<DatabaseResult<void>> => this.notImplemented('auth.deleteExpiredSessions'),
getSessionById: async (): Promise<DatabaseResult<Session>> => this.notImplemented('auth.getSessionById'),
getSessionsByUserId: async (): Promise<DatabaseResult<Session[]>> => this.notImplemented('auth.getSessionsByUserId'),
validateSession: async (): Promise<DatabaseResult<{ session: Session; user: User }>> => this.notImplemented('auth.validateSession'),
deleteSessionsByUserId: async (): Promise<DatabaseResult<void>> => this.notImplemented('auth.deleteSessionsByUserId'),

// Token methods
createToken: async (): Promise<DatabaseResult<Token>> => this.notImplemented('auth.createToken'),
getTokenByValue: async (): Promise<DatabaseResult<Token>> => this.notImplemented('auth.getTokenByValue'),
validateToken: async (): Promise<DatabaseResult<Token>> => this.notImplemented('auth.validateToken'),
consumeToken: async (): Promise<DatabaseResult<void>> => this.notImplemented('auth.consumeToken'),
deleteToken: async (): Promise<DatabaseResult<void>> => this.notImplemented('auth.deleteToken'),
deleteExpiredTokens: async (): Promise<DatabaseResult<void>> => this.notImplemented('auth.deleteExpiredTokens'),
deleteTokensByUserId: async (): Promise<DatabaseResult<void>> => this.notImplemented('auth.deleteTokensByUserId'),

// Role methods
getAllRoles: async (): Promise<DatabaseResult<Role[]>> => this.notImplemented('auth.getAllRoles'),
getRoleById: async (): Promise<DatabaseResult<Role>> => this.notImplemented('auth.getRoleById'),
createRole: async (): Promise<DatabaseResult<Role>> => this.notImplemented('auth.createRole'),
updateRole: async (): Promise<DatabaseResult<Role>> => this.notImplemented('auth.updateRole'),
deleteRole: async (): Promise<DatabaseResult<void>> => this.notImplemented('auth.deleteRole')
};

//==============================================================================
// BATCH OPERATIONS (stub)
//==============================================================================

batch = {
executeBatch: async (): Promise<DatabaseResult<BatchResult>> => this.notImplemented('batch.executeBatch'),
insertMany: async (): Promise<DatabaseResult<any[]>> => this.notImplemented('batch.insertMany'),
updateMany: async (): Promise<DatabaseResult<number>> => this.notImplemented('batch.updateMany'),
deleteMany: async (): Promise<DatabaseResult<number>> => this.notImplemented('batch.deleteMany')
};

//==============================================================================
// COLLECTION (stub)
//==============================================================================

collection = {
getModel: (): CollectionModel | null => null,
registerDynamicModel: async (): Promise<void> => {},
getDynamicModel: (): any => null,
listDynamicModels: (): string[] => []
};

//==============================================================================
// PERFORMANCE & CACHE (stub)
//==============================================================================

performance = {
getMetrics: async (): Promise<DatabaseResult<PerformanceMetrics>> => this.notImplemented('performance.getMetrics'),
resetMetrics: async (): Promise<DatabaseResult<void>> => this.notImplemented('performance.resetMetrics'),
optimizeQuery: async (): Promise<DatabaseResult<any>> => this.notImplemented('performance.optimizeQuery'),
analyzeQuery: async (): Promise<DatabaseResult<any>> => this.notImplemented('performance.analyzeQuery')
};

cache = {
get: async (): Promise<DatabaseResult<any>> => this.notImplemented('cache.get'),
set: async (): Promise<DatabaseResult<void>> => this.notImplemented('cache.set'),
delete: async (): Promise<DatabaseResult<void>> => this.notImplemented('cache.delete'),
clear: async (): Promise<DatabaseResult<void>> => this.notImplemented('cache.clear')
};

//==============================================================================
// TRANSACTION (stub)
//==============================================================================

transaction = async (): Promise<DatabaseResult<any>> => this.notImplemented('transaction');

//==============================================================================
// QUERY BUILDER (stub)
//==============================================================================

queryBuilder = (): QueryBuilder<any> => {
throw new Error('QueryBuilder not implemented for MariaDB adapter yet');
};

//==============================================================================
// COLLECTION DATA (stub)
//==============================================================================

getCollectionData = async (): Promise<DatabaseResult<any>> => this.notImplemented('getCollectionData');
getMultipleCollectionData = async (): Promise<DatabaseResult<any>> => this.notImplemented('getMultipleCollectionData');

//==============================================================================
// HELPER METHODS
//==============================================================================

private notConnectedError(): DatabaseResult<any> {
return {
success: false,
message: 'Database not connected',
error: utils.createDatabaseError('NOT_CONNECTED', 'Database connection not established')
};
}

private handleError(error: unknown, code: string): DatabaseResult<any> {
const message = error instanceof Error ? error.message : String(error);
logger.error(`MariaDB adapter error [${code}]:`, message);
return {
success: false,
message,
error: utils.createDatabaseError(code, message, error)
};
}

private notImplemented(method: string): DatabaseResult<any> {
const message = `Method ${method} not yet implemented for MariaDB adapter. See MARIADB_IMPLEMENTATION.md for completion roadmap.`;
logger.warn(message);
return {
success: false,
message,
error: utils.createDatabaseError('NOT_IMPLEMENTED', message)
};
}
}
