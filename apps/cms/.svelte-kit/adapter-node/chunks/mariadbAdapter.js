import { drizzle } from 'drizzle-orm/mysql2';
import { sql, eq, and, inArray, count, desc, asc, lt, gt, or, like, notInArray, gte, lte } from 'drizzle-orm';
import mysql from 'mysql2/promise';
import { mysqlTable, datetime, varchar, json, text, boolean, unique, index, int } from 'drizzle-orm/mysql-core';
import { v4 } from 'uuid';
import { logger } from './logger.js';
const uuidPk = () => varchar('_id', { length: 36 }).primaryKey();
const timestamps = {
	createdAt: datetime('createdAt')
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`),
	updatedAt: datetime('updatedAt')
		.notNull()
		.default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`)
};
const tenantField = () => varchar('tenantId', { length: 36 });
const authUsers = mysqlTable(
	'auth_users',
	{
		_id: uuidPk(),
		email: varchar('email', { length: 255 }).notNull(),
		username: varchar('username', { length: 255 }),
		password: varchar('password', { length: 255 }),
		emailVerified: boolean('emailVerified').notNull().default(false),
		blocked: boolean('blocked').notNull().default(false),
		firstName: varchar('firstName', { length: 255 }),
		lastName: varchar('lastName', { length: 255 }),
		avatar: text('avatar'),
		roleIds: json('roleIds').$type().notNull().default([]),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		emailIdx: index('email_idx').on(table.email),
		tenantIdx: index('tenant_idx').on(table.tenantId),
		emailTenantUnique: unique('email_tenant_unique').on(table.email, table.tenantId)
	})
);
const authSessions = mysqlTable(
	'auth_sessions',
	{
		_id: uuidPk(),
		user_id: varchar('user_id', { length: 36 }).notNull(),
		expires: datetime('expires').notNull(),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		userIdx: index('user_idx').on(table.user_id),
		expiresIdx: index('expires_idx').on(table.expires),
		tenantIdx: index('tenant_idx').on(table.tenantId)
	})
);
const authTokens = mysqlTable(
	'auth_tokens',
	{
		_id: uuidPk(),
		user_id: varchar('user_id', { length: 36 }).notNull(),
		email: varchar('email', { length: 255 }).notNull(),
		token: varchar('token', { length: 255 }).notNull(),
		type: varchar('type', { length: 50 }).notNull(),
		expires: datetime('expires').notNull(),
		consumed: boolean('consumed').notNull().default(false),
		blocked: boolean('blocked').notNull().default(false),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		tokenIdx: index('token_idx').on(table.token),
		userIdx: index('user_idx').on(table.user_id),
		expiresIdx: index('expires_idx').on(table.expires),
		tenantIdx: index('tenant_idx').on(table.tenantId)
	})
);
const roles = mysqlTable(
	'roles',
	{
		_id: uuidPk(),
		name: varchar('name', { length: 255 }).notNull(),
		description: text('description'),
		permissions: json('permissions').$type().notNull().default([]),
		isAdmin: boolean('isAdmin').notNull().default(false),
		icon: varchar('icon', { length: 100 }),
		color: varchar('color', { length: 50 }),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		nameIdx: index('name_idx').on(table.name),
		tenantIdx: index('tenant_idx').on(table.tenantId)
	})
);
const contentNodes = mysqlTable(
	'content_nodes',
	{
		_id: uuidPk(),
		path: varchar('path', { length: 500 }).notNull(),
		parentId: varchar('parentId', { length: 36 }),
		type: varchar('type', { length: 50 }).notNull(),
		status: varchar('status', { length: 50 }).notNull().default('draft'),
		title: varchar('title', { length: 500 }),
		slug: varchar('slug', { length: 500 }),
		data: json('data'),
		metadata: json('metadata'),
		order: int('order').notNull().default(0),
		isPublished: boolean('isPublished').notNull().default(false),
		publishedAt: datetime('publishedAt'),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		pathIdx: unique('path_unique').on(table.path),
		parentIdx: index('parent_idx').on(table.parentId),
		typeIdx: index('type_idx').on(table.type),
		statusIdx: index('status_idx').on(table.status),
		tenantIdx: index('tenant_idx').on(table.tenantId)
	})
);
const contentDrafts = mysqlTable(
	'content_drafts',
	{
		_id: uuidPk(),
		contentId: varchar('contentId', { length: 36 }).notNull(),
		data: json('data').notNull(),
		version: int('version').notNull().default(1),
		status: varchar('status', { length: 50 }).notNull().default('draft'),
		authorId: varchar('authorId', { length: 36 }).notNull(),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		contentIdx: index('content_idx').on(table.contentId),
		authorIdx: index('author_idx').on(table.authorId),
		statusIdx: index('status_idx').on(table.status),
		tenantIdx: index('tenant_idx').on(table.tenantId)
	})
);
const contentRevisions = mysqlTable(
	'content_revisions',
	{
		_id: uuidPk(),
		contentId: varchar('contentId', { length: 36 }).notNull(),
		data: json('data').notNull(),
		version: int('version').notNull().default(1),
		commitMessage: text('commitMessage'),
		authorId: varchar('authorId', { length: 36 }).notNull(),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		contentIdx: index('content_idx').on(table.contentId),
		versionIdx: index('version_idx').on(table.version),
		authorIdx: index('author_idx').on(table.authorId),
		tenantIdx: index('tenant_idx').on(table.tenantId)
	})
);
const themes = mysqlTable(
	'themes',
	{
		_id: uuidPk(),
		name: varchar('name', { length: 255 }).notNull(),
		path: varchar('path', { length: 500 }).notNull(),
		isActive: boolean('isActive').notNull().default(false),
		isDefault: boolean('isDefault').notNull().default(false),
		config: json('config').notNull(),
		previewImage: text('previewImage'),
		customCss: text('customCss'),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		nameIdx: index('name_idx').on(table.name),
		activeIdx: index('active_idx').on(table.isActive),
		tenantIdx: index('tenant_idx').on(table.tenantId)
	})
);
const widgets = mysqlTable(
	'widgets',
	{
		_id: uuidPk(),
		name: varchar('name', { length: 255 }).notNull(),
		isActive: boolean('isActive').notNull().default(true),
		instances: json('instances').notNull().default({}),
		dependencies: json('dependencies').$type().notNull().default([]),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		nameIdx: unique('name_unique').on(table.name),
		activeIdx: index('active_idx').on(table.isActive),
		tenantIdx: index('tenant_idx').on(table.tenantId)
	})
);
const mediaItems = mysqlTable(
	'media_items',
	{
		_id: uuidPk(),
		filename: varchar('filename', { length: 500 }).notNull(),
		originalFilename: varchar('originalFilename', { length: 500 }).notNull(),
		hash: varchar('hash', { length: 255 }).notNull(),
		path: varchar('path', { length: 1e3 }).notNull(),
		size: int('size').notNull(),
		mimeType: varchar('mimeType', { length: 255 }).notNull(),
		folderId: varchar('folderId', { length: 36 }),
		originalId: varchar('originalId', { length: 36 }),
		thumbnails: json('thumbnails').notNull().default({}),
		metadata: json('metadata').notNull().default({}),
		access: varchar('access', { length: 50 }).notNull().default('public'),
		createdBy: varchar('createdBy', { length: 36 }).notNull(),
		updatedBy: varchar('updatedBy', { length: 36 }).notNull(),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		hashIdx: index('hash_idx').on(table.hash),
		folderIdx: index('folder_idx').on(table.folderId),
		createdByIdx: index('created_by_idx').on(table.createdBy),
		tenantIdx: index('tenant_idx').on(table.tenantId)
	})
);
const systemVirtualFolders = mysqlTable(
	'system_virtual_folders',
	{
		_id: uuidPk(),
		name: varchar('name', { length: 500 }).notNull(),
		path: varchar('path', { length: 1e3 }).notNull(),
		parentId: varchar('parentId', { length: 36 }),
		icon: varchar('icon', { length: 100 }),
		order: int('order').notNull().default(0),
		type: varchar('type', { length: 50 }).notNull().default('folder'),
		metadata: json('metadata'),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		pathIdx: unique('path_unique').on(table.path),
		parentIdx: index('parent_idx').on(table.parentId),
		typeIdx: index('type_idx').on(table.type),
		tenantIdx: index('tenant_idx').on(table.tenantId)
	})
);
const systemPreferences = mysqlTable(
	'system_preferences',
	{
		_id: uuidPk(),
		key: varchar('key', { length: 255 }).notNull(),
		value: json('value'),
		scope: varchar('scope', { length: 50 }).notNull().default('system'),
		userId: varchar('userId', { length: 36 }),
		visibility: varchar('visibility', { length: 50 }).notNull().default('private'),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		keyIdx: index('key_idx').on(table.key),
		scopeIdx: index('scope_idx').on(table.scope),
		userIdx: index('user_idx').on(table.userId),
		tenantIdx: index('tenant_idx').on(table.tenantId)
	})
);
const websiteTokens = mysqlTable(
	'website_tokens',
	{
		_id: uuidPk(),
		name: varchar('name', { length: 255 }).notNull(),
		token: varchar('token', { length: 255 }).notNull(),
		createdBy: varchar('createdBy', { length: 36 }).notNull(),
		tenantId: tenantField(),
		...timestamps
	},
	(table) => ({
		tokenIdx: unique('token_unique').on(table.token),
		nameIdx: index('name_idx').on(table.name),
		tenantIdx: index('tenant_idx').on(table.tenantId)
	})
);
const schema = {
	authUsers,
	authSessions,
	authTokens,
	roles,
	contentNodes,
	contentDrafts,
	contentRevisions,
	themes,
	widgets,
	mediaItems,
	systemVirtualFolders,
	systemPreferences,
	websiteTokens
};
const schema$1 = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.defineProperty(
		{
			__proto__: null,
			authSessions,
			authTokens,
			authUsers,
			contentDrafts,
			contentNodes,
			contentRevisions,
			mediaItems,
			roles,
			schema,
			systemPreferences,
			systemVirtualFolders,
			themes,
			websiteTokens,
			widgets
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
function generateId() {
	return v4();
}
function validateId(id) {
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
	return uuidRegex.test(id);
}
function dateToISO(date) {
	if (!date) return void 0;
	return date.toISOString();
}
function isoToDate(iso) {
	if (!iso) return void 0;
	return new Date(iso);
}
function createDatabaseError(code, message, details, statusCode) {
	return {
		code,
		message,
		statusCode,
		details
	};
}
function normalizePath(path) {
	return path.replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
}
function applyTenantFilter(conditions, tenantId) {
	if (tenantId) {
		return { ...conditions, tenantId };
	}
	return conditions;
}
function convertDatesToISO(row) {
	const result = { ...row };
	for (const key in result) {
		const value = result[key];
		if (value instanceof Date) {
			result[key] = value.toISOString();
		}
	}
	return result;
}
function convertArrayDatesToISO(rows) {
	return rows.map((row) => convertDatesToISO(row));
}
function createPagination(items, options) {
	const page = options.page || 1;
	const pageSize = options.pageSize || 10;
	const offset = (page - 1) * pageSize;
	const total = items.length;
	const paginatedItems = items.slice(offset, offset + pageSize);
	return {
		items: paginatedItems,
		total,
		page,
		pageSize,
		hasNextPage: offset + pageSize < total,
		hasPreviousPage: page > 1
	};
}
const utils = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.defineProperty(
		{
			__proto__: null,
			applyTenantFilter,
			convertArrayDatesToISO,
			convertDatesToISO,
			createDatabaseError,
			createPagination,
			dateToISO,
			generateId,
			isoToDate,
			normalizePath,
			validateId
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
class AdapterCore {
	capabilities = {
		supportsTransactions: true,
		supportsIndexing: true,
		supportsFullTextSearch: true,
		supportsAggregation: true,
		supportsStreaming: false,
		supportsPartitioning: true,
		maxBatchSize: 1e3,
		maxQueryComplexity: 100
	};
	pool = null;
	db = null;
	connected = false;
	collectionRegistry = /* @__PURE__ */ new Map();
	getCapabilities() {
		return this.capabilities;
	}
	isConnected() {
		return this.connected;
	}
	async connect(connection, _options) {
		try {
			if (typeof connection === 'string') {
				this.pool = mysql.createPool(connection);
			} else {
				this.pool = mysql.createPool(connection);
			}
			this.db = drizzle(this.pool, { schema: schema$1, mode: 'default' });
			this.connected = true;
			logger.info('Connected to MariaDB');
			return { success: true, data: void 0 };
		} catch (error) {
			this.connected = false;
			return this.handleError(error, 'CONNECTION_FAILED');
		}
	}
	async disconnect() {
		if (this.pool) {
			await this.pool.end();
			this.pool = null;
			this.db = null;
			this.connected = false;
			logger.info('Disconnected from MariaDB');
		}
		return { success: true, data: void 0 };
	}
	async waitForConnection() {
		if (this.connected) return;
		return new Promise((resolve) => {
			const interval = setInterval(() => {
				if (this.connected) {
					clearInterval(interval);
					resolve();
				}
			}, 100);
		});
	}
	async getConnectionHealth() {
		if (!this.connected || !this.pool) {
			return {
				success: false,
				message: 'Database not connected',
				error: createDatabaseError('NOT_CONNECTED', 'Database not connected')
			};
		}
		const start = Date.now();
		try {
			await this.pool.query('SELECT 1');
			const latency = Date.now() - start;
			const poolInfo = this.pool.pool;
			return {
				success: true,
				data: {
					healthy: true,
					latency,
					activeConnections: poolInfo ? poolInfo._allConnections.length : 0
				}
			};
		} catch (error) {
			return this.handleError(error, 'HEALTH_CHECK_FAILED');
		}
	}
	wrap(fn, code) {
		if (!this.db) return Promise.resolve(this.notConnectedError());
		try {
			return fn()
				.then((data) => ({ success: true, data }))
				.catch((error) => this.handleError(error, code));
		} catch (error) {
			return Promise.resolve(this.handleError(error, code));
		}
	}
	handleError(error, code) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error(`MariaDB adapter error [${code}]:`, message);
		return {
			success: false,
			message,
			error: createDatabaseError(code, message, error)
		};
	}
	notImplemented(method) {
		const message = `Method ${method} not yet implemented for MariaDB adapter.`;
		logger.warn(message);
		return {
			success: false,
			message,
			error: createDatabaseError('NOT_IMPLEMENTED', message)
		};
	}
	notConnectedError() {
		return {
			success: false,
			message: 'Database not connected',
			error: createDatabaseError('NOT_CONNECTED', 'Database connection not established')
		};
	}
	getTable(collection) {
		if (schema$1[collection]) {
			return schema$1[collection];
		}
		return contentNodes;
	}
	mapQuery(table, query) {
		if (!query || Object.keys(query).length === 0) return void 0;
		const conditions = [];
		for (const [key, value] of Object.entries(query)) {
			if (table[key]) {
				conditions.push(eq(table[key], value));
			}
		}
		if (conditions.length === 0) return void 0;
		return and(...conditions);
	}
}
class CrudModule {
	core;
	constructor(core) {
		this.core = core;
	}
	get db() {
		return this.core.db;
	}
	async findOne(collection, query, _options) {
		return this.core.wrap(async () => {
			const table = this.core.getTable(collection);
			const where = this.core.mapQuery(table, query);
			const results = await this.db.select().from(table).where(where).limit(1);
			if (results.length === 0) return null;
			return convertDatesToISO(results[0]);
		}, 'CRUD_FIND_ONE_FAILED');
	}
	async findMany(collection, query, options) {
		return this.core.wrap(async () => {
			const table = this.core.getTable(collection);
			const where = this.core.mapQuery(table, query);
			let q = this.db.select().from(table).where(where);
			if (options?.limit) q = q.limit(options.limit);
			if (options?.offset) q = q.offset(options.offset);
			const results = await q;
			return convertArrayDatesToISO(results);
		}, 'CRUD_FIND_MANY_FAILED');
	}
	async findByIds(collection, ids, _options) {
		return this.core.wrap(async () => {
			const table = this.core.getTable(collection);
			const results = await this.db.select().from(table).where(inArray(table._id, ids));
			return convertArrayDatesToISO(results);
		}, 'CRUD_FIND_BY_IDS_FAILED');
	}
	async insert(collection, data) {
		return this.core.wrap(async () => {
			const table = this.core.getTable(collection);
			const id = generateId();
			const now = /* @__PURE__ */ new Date();
			const values = { ...data, _id: id, createdAt: now, updatedAt: now };
			await this.db.insert(table).values(values);
			const result = await this.db.select().from(table).where(eq(table._id, id)).limit(1);
			return convertDatesToISO(result[0]);
		}, 'CRUD_INSERT_FAILED');
	}
	async update(collection, id, data) {
		return this.core.wrap(async () => {
			const table = this.core.getTable(collection);
			const now = /* @__PURE__ */ new Date();
			await this.db
				.update(table)
				.set({ ...data, updatedAt: now })
				.where(eq(table._id, id));
			const result = await this.db.select().from(table).where(eq(table._id, id)).limit(1);
			return convertDatesToISO(result[0]);
		}, 'CRUD_UPDATE_FAILED');
	}
	async delete(collection, id) {
		return this.core.wrap(async () => {
			const table = this.core.getTable(collection);
			await this.db.delete(table).where(eq(table._id, id));
		}, 'CRUD_DELETE_FAILED');
	}
	async upsert(collection, query, data) {
		return this.core.wrap(async () => {
			const table = this.core.getTable(collection);
			const where = this.core.mapQuery(table, query);
			const existing = await this.db.select().from(table).where(where).limit(1);
			if (existing.length > 0) {
				const res = await this.update(collection, existing[0]._id, data);
				if (!res.success) throw res.error;
				return res.data;
			} else {
				const res = await this.insert(collection, data);
				if (!res.success) throw res.error;
				return res.data;
			}
		}, 'CRUD_UPSERT_FAILED');
	}
	async count(collection, query = {}) {
		return this.core.wrap(async () => {
			const table = this.core.getTable(collection);
			const where = this.core.mapQuery(table, query);
			const [result] = await this.db.select({ count: count() }).from(table).where(where);
			return Number(result.count);
		}, 'CRUD_COUNT_FAILED');
	}
	async exists(collection, query) {
		return this.core.wrap(async () => {
			const res = await this.count(collection, query);
			if (!res.success) throw res.error;
			return (res.data ?? 0) > 0;
		}, 'CRUD_EXISTS_FAILED');
	}
	async insertMany(collection, data) {
		return this.core.wrap(async () => {
			if (data.length === 0) return [];
			const table = this.core.getTable(collection);
			const now = /* @__PURE__ */ new Date();
			const values = data.map((d) => ({
				...d,
				_id: generateId(),
				createdAt: now,
				updatedAt: now
			}));
			await this.db.insert(table).values(values);
			const ids = values.map((v) => v._id);
			const results = await this.db.select().from(table).where(inArray(table._id, ids));
			return convertArrayDatesToISO(results);
		}, 'CRUD_INSERT_MANY_FAILED');
	}
	async updateMany(collection, query, data) {
		return this.core.wrap(async () => {
			const table = this.core.getTable(collection);
			const where = this.core.mapQuery(table, query);
			const now = /* @__PURE__ */ new Date();
			const result = await this.db
				.update(table)
				.set({ ...data, updatedAt: now })
				.where(where);
			return { modifiedCount: result[0].affectedRows };
		}, 'CRUD_UPDATE_MANY_FAILED');
	}
	async deleteMany(collection, query) {
		return this.core.wrap(async () => {
			const table = this.core.getTable(collection);
			const where = this.core.mapQuery(table, query);
			const result = await this.db.delete(table).where(where);
			return { deletedCount: result[0].affectedRows };
		}, 'CRUD_DELETE_MANY_FAILED');
	}
	async upsertMany(collection, items) {
		return this.core.wrap(async () => {
			let upsertedCount = 0;
			let modifiedCount = 0;
			for (const item of items) {
				const existing = await this.findOne(collection, item.query);
				if (existing.success && existing.data) {
					await this.update(collection, existing.data._id, item.data);
					modifiedCount++;
				} else {
					await this.insert(collection, item.data);
					upsertedCount++;
				}
			}
			return { upsertedCount, modifiedCount };
		}, 'CRUD_UPSERT_MANY_FAILED');
	}
	async aggregate(_collection, _pipeline) {
		return this.core.notImplemented('crud.aggregate');
	}
}
class AuthModule {
	core;
	constructor(core) {
		this.core = core;
	}
	get db() {
		return this.core.db;
	}
	mapUser(dbUser) {
		if (!dbUser) throw new Error('User not found');
		const user = convertDatesToISO(dbUser);
		let roleIds = user.roleIds;
		if (typeof roleIds === 'string') {
			try {
				roleIds = JSON.parse(roleIds);
			} catch (e) {
				roleIds = [];
			}
		}
		const finalRoleIds = Array.isArray(roleIds) ? roleIds : [];
		return {
			...user,
			roleIds: finalRoleIds,
			role: finalRoleIds.length > 0 ? finalRoleIds[0] : 'user',
			permissions: user.permissions || []
		};
	}
	// Setup method for model registration
	async setupAuthModels() {
		logger.debug('Auth models setup (no-op for SQL)');
	}
	// User methods
	async createUser(userData) {
		return this.core.wrap(async () => {
			const id = userData._id || generateId();
			const now = /* @__PURE__ */ new Date();
			let password = userData.password;
			if (password && !password.startsWith('$argon2')) {
				const argon2 = await import('argon2');
				password = await argon2.hash(password);
			}
			const values = {
				...userData,
				_id: id,
				password,
				createdAt: now,
				updatedAt: now,
				// Map legacy 'role' string to 'roleIds' array if roleIds is missing/empty
				roleIds: userData.roleIds?.length ? userData.roleIds : userData.role ? [userData.role] : []
			};
			await this.db.insert(authUsers).values(values);
			const [result] = await this.db.select().from(authUsers).where(eq(authUsers._id, id)).limit(1);
			return this.mapUser(result);
		}, 'CREATE_USER_FAILED');
	}
	async updateUserAttributes(user_id, userData, tenantId) {
		return this.core.wrap(async () => {
			const conditions = [eq(authUsers._id, user_id)];
			if (tenantId) conditions.push(eq(authUsers.tenantId, tenantId));
			const dataToUpdate = { ...userData };
			if (userData.role && !dataToUpdate.roleIds) {
				dataToUpdate.roleIds = [userData.role];
			}
			await this.db
				.update(authUsers)
				.set({ ...dataToUpdate, updatedAt: /* @__PURE__ */ new Date() })
				.where(and(...conditions));
			const [result] = await this.db
				.select()
				.from(authUsers)
				.where(and(...conditions))
				.limit(1);
			return this.mapUser(result);
		}, 'UPDATE_USER_FAILED');
	}
	async deleteUser(user_id, tenantId) {
		return this.core.wrap(async () => {
			const conditions = [eq(authUsers._id, user_id)];
			if (tenantId) conditions.push(eq(authUsers.tenantId, tenantId));
			await this.db.delete(authUsers).where(and(...conditions));
		}, 'DELETE_USER_FAILED');
	}
	async getUserById(user_id, tenantId) {
		return this.core.wrap(async () => {
			const conditions = [eq(authUsers._id, user_id)];
			if (tenantId) conditions.push(eq(authUsers.tenantId, tenantId));
			const [result] = await this.db
				.select()
				.from(authUsers)
				.where(and(...conditions))
				.limit(1);
			return result ? this.mapUser(result) : null;
		}, 'GET_USER_BY_ID_FAILED');
	}
	async getUserByEmail(criteria) {
		return this.core.wrap(async () => {
			const conditions = [eq(authUsers.email, criteria.email)];
			if (criteria.tenantId) conditions.push(eq(authUsers.tenantId, criteria.tenantId));
			const [result] = await this.db
				.select()
				.from(authUsers)
				.where(and(...conditions))
				.limit(1);
			return result ? this.mapUser(result) : null;
		}, 'GET_USER_BY_EMAIL_FAILED');
	}
	async getAllUsers(options) {
		return this.core.wrap(async () => {
			let q = this.db.select().from(authUsers);
			if (options?.sort) {
				if (Array.isArray(options.sort)) {
					for (const [field, direction] of options.sort) {
						const order = direction === 'desc' ? desc : asc;
						if (authUsers[field]) {
							q = q.orderBy(order(authUsers[field]));
						}
					}
				} else {
					for (const [field, direction] of Object.entries(options.sort)) {
						const order = direction === 'desc' ? desc : asc;
						if (authUsers[field]) {
							q = q.orderBy(order(authUsers[field]));
						}
					}
				}
			}
			if (options?.limit) q = q.limit(options.limit);
			if (options?.offset) q = q.offset(options.offset);
			const results = await q;
			return results.map((u) => this.mapUser(u));
		}, 'GET_ALL_USERS_FAILED');
	}
	async getUserCount(filter) {
		return this.core.wrap(async () => {
			const table = authUsers;
			const where = filter ? this.core.mapQuery(table, filter) : void 0;
			const query = this.db.select({ count: sql`count(*)` }).from(table);
			if (where) {
				query.where(where);
			}
			const [result] = await query;
			return Number(result.count);
		}, 'GET_USER_COUNT_FAILED');
	}
	async deleteUsers(user_ids, tenantId) {
		return this.core.wrap(async () => {
			const conditions = [inArray(authUsers._id, user_ids)];
			if (tenantId) conditions.push(eq(authUsers.tenantId, tenantId));
			const result = await this.db.delete(authUsers).where(and(...conditions));
			return { deletedCount: result[0].affectedRows };
		}, 'DELETE_USERS_FAILED');
	}
	async blockUsers(user_ids, tenantId) {
		return this.core.wrap(async () => {
			const conditions = [inArray(authUsers._id, user_ids)];
			if (tenantId) conditions.push(eq(authUsers.tenantId, tenantId));
			const result = await this.db
				.update(authUsers)
				.set({ blocked: true, updatedAt: /* @__PURE__ */ new Date() })
				.where(and(...conditions));
			return { modifiedCount: result[0].affectedRows };
		}, 'BLOCK_USERS_FAILED');
	}
	async unblockUsers(user_ids, tenantId) {
		return this.core.wrap(async () => {
			const conditions = [inArray(authUsers._id, user_ids)];
			if (tenantId) conditions.push(eq(authUsers.tenantId, tenantId));
			const result = await this.db
				.update(authUsers)
				.set({ blocked: false, updatedAt: /* @__PURE__ */ new Date() })
				.where(and(...conditions));
			return { modifiedCount: result[0].affectedRows };
		}, 'UNBLOCK_USERS_FAILED');
	}
	// Combined methods
	async createUserAndSession(userData, sessionData) {
		return this.core.wrap(async () => {
			const userResult = await this.createUser(userData);
			if (!userResult.success) throw new Error(userResult.message);
			const user = userResult.data;
			const sessionResult = await this.createSession({
				user_id: user._id,
				expires: sessionData.expires,
				tenantId: sessionData.tenantId
			});
			if (!sessionResult.success) throw new Error(sessionResult.message);
			const session = sessionResult.data;
			return { user, session };
		}, 'CREATE_USER_AND_SESSION_FAILED');
	}
	async deleteUserAndSessions(user_id, tenantId) {
		return this.core.wrap(async () => {
			await this.invalidateAllUserSessions(user_id, tenantId);
			const userDeleteResult = await this.deleteUser(user_id, tenantId);
			return {
				deletedUser: userDeleteResult.success,
				deletedSessionCount: 0
			};
		}, 'DELETE_USER_AND_SESSIONS_FAILED');
	}
	// Session methods
	async createSession(sessionData) {
		return this.core.wrap(async () => {
			const id = generateId();
			await this.db.insert(authSessions).values({
				_id: id,
				user_id: sessionData.user_id,
				expires: new Date(sessionData.expires),
				tenantId: sessionData.tenantId || null
			});
			const [result] = await this.db.select().from(authSessions).where(eq(authSessions._id, id)).limit(1);
			return convertDatesToISO(result);
		}, 'CREATE_SESSION_FAILED');
	}
	async updateSessionExpiry(session_id, newExpiry) {
		return this.core.wrap(async () => {
			await this.db
				.update(authSessions)
				.set({ expires: new Date(newExpiry), updatedAt: /* @__PURE__ */ new Date() })
				.where(eq(authSessions._id, session_id));
			const [result] = await this.db.select().from(authSessions).where(eq(authSessions._id, session_id)).limit(1);
			return convertDatesToISO(result);
		}, 'UPDATE_SESSION_FAILED');
	}
	async deleteSession(session_id) {
		return this.core.wrap(async () => {
			await this.db.delete(authSessions).where(eq(authSessions._id, session_id));
		}, 'DELETE_SESSION_FAILED');
	}
	async deleteExpiredSessions() {
		return this.core.wrap(async () => {
			const result = await this.db.delete(authSessions).where(lt(authSessions.expires, /* @__PURE__ */ new Date()));
			return result[0].affectedRows;
		}, 'DELETE_EXPIRED_SESSIONS_FAILED');
	}
	async validateSession(session_id) {
		return this.core.wrap(async () => {
			const [session] = await this.db
				.select()
				.from(authSessions)
				.where(and(eq(authSessions._id, session_id), gt(authSessions.expires, /* @__PURE__ */ new Date())))
				.limit(1);
			if (!session) return null;
			const userResult = await this.getUserById(session.user_id, session.tenantId || void 0);
			return userResult.success ? userResult.data : null;
		}, 'VALIDATE_SESSION_FAILED');
	}
	async invalidateAllUserSessions(user_id, tenantId) {
		return this.core.wrap(async () => {
			const conditions = [eq(authSessions.user_id, user_id)];
			if (tenantId) conditions.push(eq(authSessions.tenantId, tenantId));
			await this.db.delete(authSessions).where(and(...conditions));
		}, 'INVALIDATE_USER_SESSIONS_FAILED');
	}
	async getActiveSessions(user_id, tenantId) {
		return this.core.wrap(async () => {
			const conditions = [eq(authSessions.user_id, user_id), gt(authSessions.expires, /* @__PURE__ */ new Date())];
			if (tenantId) conditions.push(eq(authSessions.tenantId, tenantId));
			const results = await this.db
				.select()
				.from(authSessions)
				.where(and(...conditions));
			return convertArrayDatesToISO(results);
		}, 'GET_ACTIVE_SESSIONS_FAILED');
	}
	async getAllActiveSessions(tenantId) {
		return this.core.wrap(async () => {
			const conditions = [gt(authSessions.expires, /* @__PURE__ */ new Date())];
			if (tenantId) conditions.push(eq(authSessions.tenantId, tenantId));
			const results = await this.db
				.select()
				.from(authSessions)
				.where(and(...conditions));
			return convertArrayDatesToISO(results);
		}, 'GET_ALL_ACTIVE_SESSIONS_FAILED');
	}
	async getSessionTokenData(session_id) {
		return this.core.wrap(async () => {
			const [session] = await this.db.select().from(authSessions).where(eq(authSessions._id, session_id)).limit(1);
			if (!session) return null;
			return {
				expiresAt: session.expires.toISOString(),
				user_id: session.user_id
			};
		}, 'GET_SESSION_TOKEN_DATA_FAILED');
	}
	async rotateToken(oldToken, expires) {
		return this.core.wrap(async () => {
			const [oldSession] = await this.db.select().from(authSessions).where(eq(authSessions._id, oldToken)).limit(1);
			if (!oldSession) throw new Error('Session not found');
			const newId = generateId();
			const now = /* @__PURE__ */ new Date();
			await this.db.insert(authSessions).values({
				...oldSession,
				_id: newId,
				expires: new Date(expires),
				createdAt: now,
				updatedAt: now
			});
			await this.db.delete(authSessions).where(eq(authSessions._id, oldToken));
			return newId;
		}, 'ROTATE_TOKEN_FAILED');
	}
	async cleanupRotatedSessions() {
		return this.core.notImplemented('auth.cleanupRotatedSessions');
	}
	// Token methods
	async createToken(data) {
		return this.core.wrap(async () => {
			const id = generateId();
			const tokenValue = generateId();
			await this.db.insert(authTokens).values({
				_id: id,
				user_id: data.user_id,
				email: data.email,
				token: tokenValue,
				type: data.type,
				expires: new Date(data.expires),
				tenantId: data.tenantId || null,
				consumed: false
			});
			return tokenValue;
		}, 'CREATE_TOKEN_FAILED');
	}
	async updateToken(token_id, tokenData, tenantId) {
		return this.core.wrap(async () => {
			const conditions = [eq(authTokens._id, token_id)];
			if (tenantId) conditions.push(eq(authTokens.tenantId, tenantId));
			await this.db
				.update(authTokens)
				.set({ ...tokenData, updatedAt: /* @__PURE__ */ new Date() })
				.where(and(...conditions));
			const [result] = await this.db
				.select()
				.from(authTokens)
				.where(and(...conditions))
				.limit(1);
			return convertDatesToISO(result);
		}, 'UPDATE_TOKEN_FAILED');
	}
	async validateToken(token, user_id, type, tenantId) {
		return this.core.wrap(async () => {
			const conditions = [eq(authTokens.token, token), gt(authTokens.expires, /* @__PURE__ */ new Date()), eq(authTokens.consumed, false)];
			if (user_id) conditions.push(eq(authTokens.user_id, user_id));
			if (type) conditions.push(eq(authTokens.type, type));
			if (tenantId) conditions.push(eq(authTokens.tenantId, tenantId));
			const [t] = await this.db
				.select()
				.from(authTokens)
				.where(and(...conditions))
				.limit(1);
			if (!t) return { success: false, message: 'Invalid or expired token' };
			return { success: true, message: 'Token is valid', email: t.email };
		}, 'VALIDATE_TOKEN_FAILED');
	}
	async consumeToken(token, user_id, type, tenantId) {
		return this.core.wrap(async () => {
			const conditions = [eq(authTokens.token, token)];
			if (user_id) conditions.push(eq(authTokens.user_id, user_id));
			if (type) conditions.push(eq(authTokens.type, type));
			if (tenantId) conditions.push(eq(authTokens.tenantId, tenantId));
			const result = await this.db
				.update(authTokens)
				.set({ consumed: true, updatedAt: /* @__PURE__ */ new Date() })
				.where(and(...conditions));
			return { status: result[0].affectedRows > 0, message: result[0].affectedRows > 0 ? 'Token consumed' : 'Token not found or already consumed' };
		}, 'CONSUME_TOKEN_FAILED');
	}
	async getTokenData(token, user_id, type, tenantId) {
		return this.core.wrap(async () => {
			const conditions = [eq(authTokens.token, token)];
			if (user_id) conditions.push(eq(authTokens.user_id, user_id));
			if (type) conditions.push(eq(authTokens.type, type));
			if (tenantId) conditions.push(eq(authTokens.tenantId, tenantId));
			const [t] = await this.db
				.select()
				.from(authTokens)
				.where(and(...conditions))
				.limit(1);
			return t ? convertDatesToISO(t) : null;
		}, 'GET_TOKEN_DATA_FAILED');
	}
	async getTokenByValue(token, tenantId) {
		return this.getTokenData(token, void 0, void 0, tenantId);
	}
	async getAllTokens(_filter) {
		return this.core.wrap(async () => {
			const results = await this.db.select().from(authTokens);
			return convertArrayDatesToISO(results);
		}, 'GET_ALL_TOKENS_FAILED');
	}
	async deleteExpiredTokens() {
		return this.core.wrap(async () => {
			const result = await this.db.delete(authTokens).where(lt(authTokens.expires, /* @__PURE__ */ new Date()));
			return result[0].affectedRows;
		}, 'DELETE_EXPIRED_TOKENS_FAILED');
	}
	async deleteTokens(token_ids, tenantId) {
		return this.core.wrap(async () => {
			const conditions = [inArray(authTokens._id, token_ids)];
			if (tenantId) conditions.push(eq(authTokens.tenantId, tenantId));
			const result = await this.db.delete(authTokens).where(and(...conditions));
			return { deletedCount: result[0].affectedRows };
		}, 'DELETE_TOKENS_FAILED');
	}
	async blockTokens(token_ids, tenantId) {
		return this.core.wrap(async () => {
			const conditions = [inArray(authTokens._id, token_ids)];
			if (tenantId) conditions.push(eq(authTokens.tenantId, tenantId));
			const result = await this.db
				.update(authTokens)
				.set({ blocked: true, updatedAt: /* @__PURE__ */ new Date() })
				.where(and(...conditions));
			return { modifiedCount: result[0].affectedRows };
		}, 'BLOCK_TOKENS_FAILED');
	}
	async unblockTokens(token_ids, tenantId) {
		return this.core.wrap(async () => {
			const conditions = [inArray(authTokens._id, token_ids)];
			if (tenantId) conditions.push(eq(authTokens.tenantId, tenantId));
			const result = await this.db
				.update(authTokens)
				.set({ blocked: false, updatedAt: /* @__PURE__ */ new Date() })
				.where(and(...conditions));
			return { modifiedCount: result[0].affectedRows };
		}, 'UNBLOCK_TOKENS_FAILED');
	}
	// Role methods
	async getAllRoles(tenantId) {
		if (!this.db) return [];
		try {
			const conditions = [];
			if (tenantId) conditions.push(eq(roles.tenantId, tenantId));
			const results = await this.db
				.select()
				.from(roles)
				.where(conditions.length > 0 ? and(...conditions) : void 0);
			return convertArrayDatesToISO(results);
		} catch (error) {
			logger.error('Get all roles failed:', error);
			return [];
		}
	}
	async getRoleById(roleId, tenantId) {
		return this.core.wrap(async () => {
			const conditions = [eq(roles._id, roleId)];
			if (tenantId) conditions.push(eq(roles.tenantId, tenantId));
			const [result] = await this.db
				.select()
				.from(roles)
				.where(and(...conditions))
				.limit(1);
			return result ? convertDatesToISO(result) : null;
		}, 'GET_ROLE_BY_ID_FAILED');
	}
	async createRole(role) {
		return this.core.wrap(async () => {
			const id = role._id || generateId();
			await this.db.insert(roles).values({
				...role,
				_id: id,
				createdAt: /* @__PURE__ */ new Date(),
				updatedAt: /* @__PURE__ */ new Date(),
				permissions: role.permissions || []
			});
			const [result] = await this.db.select().from(roles).where(eq(roles._id, id)).limit(1);
			return convertDatesToISO(result);
		}, 'CREATE_ROLE_FAILED');
	}
	async updateRole(roleId, roleData, tenantId) {
		return this.core.wrap(async () => {
			const conditions = [eq(roles._id, roleId)];
			if (tenantId) conditions.push(eq(roles.tenantId, tenantId));
			await this.db
				.update(roles)
				.set({ ...roleData, updatedAt: /* @__PURE__ */ new Date() })
				.where(and(...conditions));
			const [result] = await this.db
				.select()
				.from(roles)
				.where(and(...conditions))
				.limit(1);
			return convertDatesToISO(result);
		}, 'UPDATE_ROLE_FAILED');
	}
	async deleteRole(roleId, tenantId) {
		return this.core.wrap(async () => {
			const conditions = [eq(roles._id, roleId)];
			if (tenantId) conditions.push(eq(roles.tenantId, tenantId));
			await this.db.delete(roles).where(and(...conditions));
		}, 'DELETE_ROLE_FAILED');
	}
}
class ContentModule {
	core;
	constructor(core) {
		this.core = core;
	}
	get db() {
		return this.core.db;
	}
	sanitizeNode(node) {
		const validColumns = [
			'_id',
			'path',
			'parentId',
			'type',
			'status',
			'title',
			'slug',
			'data',
			'metadata',
			'order',
			'isPublished',
			'publishedAt',
			'tenantId',
			'createdAt',
			'updatedAt'
		];
		const sanitized = {};
		for (const key of validColumns) {
			if (node[key] !== void 0) {
				sanitized[key] = node[key];
			}
		}
		return sanitized;
	}
	nodes = {
		getStructure: async (mode, filter, _bypassCache) => {
			return this.core.wrap(async () => {
				let q = this.db.select().from(contentNodes);
				if (filter) {
					const conditions = [];
					if (filter._id) conditions.push(eq(contentNodes._id, filter._id));
					if (filter.path) conditions.push(eq(contentNodes.path, filter.path));
					if (filter.parentId) conditions.push(eq(contentNodes.parentId, filter.parentId));
					if (filter.tenantId) conditions.push(eq(contentNodes.tenantId, filter.tenantId));
					if (conditions.length > 0) q = q.where(and(...conditions));
				}
				q = q.orderBy(asc(contentNodes.order));
				const results = await q;
				const nodes = convertArrayDatesToISO(results);
				if (mode === 'nested') {
					const idMap = /* @__PURE__ */ new Map();
					nodes.forEach((n) => idMap.set(n._id, { ...n, children: [] }));
					const rootNodes = [];
					idMap.forEach((n) => {
						if (n.parentId && idMap.has(n.parentId)) {
							idMap.get(n.parentId).children.push(n);
						} else {
							rootNodes.push(n);
						}
					});
					return rootNodes;
				}
				return nodes;
			}, 'GET_CONTENT_STRUCTURE_FAILED');
		},
		upsertContentStructureNode: async (node) => {
			return this.core.wrap(async () => {
				const id = node._id || generateId();
				const sanitized = this.sanitizeNode(node);
				const [existing] = await this.db.select().from(contentNodes).where(eq(contentNodes._id, id)).limit(1);
				if (existing) {
					await this.db
						.update(contentNodes)
						.set({ ...sanitized, updatedAt: /* @__PURE__ */ new Date() })
						.where(eq(contentNodes._id, id));
				} else {
					const now = /* @__PURE__ */ new Date();
					await this.db.insert(contentNodes).values({
						...sanitized,
						_id: id,
						createdAt: now,
						updatedAt: now
					});
				}
				const [result] = await this.db.select().from(contentNodes).where(eq(contentNodes._id, id)).limit(1);
				return convertDatesToISO(result);
			}, 'UPSERT_CONTENT_NODE_FAILED');
		},
		create: async (node) => {
			return this.core.wrap(async () => {
				const id = node._id || generateId();
				const now = /* @__PURE__ */ new Date();
				const sanitized = this.sanitizeNode(node);
				await this.db.insert(contentNodes).values({
					...sanitized,
					_id: id,
					createdAt: now,
					updatedAt: now
				});
				const [result] = await this.db.select().from(contentNodes).where(eq(contentNodes._id, id)).limit(1);
				return convertDatesToISO(result);
			}, 'CREATE_CONTENT_NODE_FAILED');
		},
		createMany: async (nodes) => {
			return this.core.wrap(async () => {
				const now = /* @__PURE__ */ new Date();
				const values = nodes.map((node) => {
					const sanitized = this.sanitizeNode(node);
					return {
						...sanitized,
						_id: node._id || generateId(),
						createdAt: now,
						updatedAt: now
					};
				});
				await this.db.insert(contentNodes).values(values);
				const ids = values.map((v) => v._id);
				const results = await this.db.select().from(contentNodes).where(inArray(contentNodes._id, ids));
				return convertArrayDatesToISO(results);
			}, 'CREATE_MANY_CONTENT_NODES_FAILED');
		},
		update: async (path, changes) => {
			return this.core.wrap(async () => {
				const sanitized = this.sanitizeNode(changes);
				await this.db
					.update(contentNodes)
					.set({ ...sanitized, updatedAt: /* @__PURE__ */ new Date() })
					.where(eq(contentNodes.path, path));
				const [result] = await this.db.select().from(contentNodes).where(eq(contentNodes.path, path)).limit(1);
				return convertDatesToISO(result);
			}, 'UPDATE_CONTENT_NODE_FAILED');
		},
		bulkUpdate: async (updates) => {
			return this.core.wrap(async () => {
				const results = [];
				for (const update of updates) {
					const [existing] = await this.db.select().from(contentNodes).where(eq(contentNodes.path, update.path)).limit(1);
					const sanitized = this.sanitizeNode(update.changes);
					if (existing) {
						await this.db
							.update(contentNodes)
							.set({ ...sanitized, updatedAt: /* @__PURE__ */ new Date() })
							.where(eq(contentNodes.path, update.path));
					} else {
						const id = update.changes._id || generateId();
						const now = /* @__PURE__ */ new Date();
						await this.db.insert(contentNodes).values({
							...sanitized,
							_id: id,
							path: update.path,
							createdAt: now,
							updatedAt: now
						});
					}
					const [res] = await this.db.select().from(contentNodes).where(eq(contentNodes.path, update.path)).limit(1);
					if (res) results.push(convertDatesToISO(res));
				}
				return results;
			}, 'BULK_UPDATE_CONTENT_NODES_FAILED');
		},
		delete: async (path) => {
			return this.core.wrap(async () => {
				await this.db.delete(contentNodes).where(eq(contentNodes.path, path));
			}, 'DELETE_CONTENT_NODE_FAILED');
		},
		deleteMany: async (paths) => {
			return this.core.wrap(async () => {
				const result = await this.db.delete(contentNodes).where(inArray(contentNodes.path, paths));
				return { deletedCount: result[0].affectedRows };
			}, 'DELETE_MANY_CONTENT_NODES_FAILED');
		},
		reorder: async (nodeUpdates) => {
			return this.core.wrap(async () => {
				const results = [];
				for (const update of nodeUpdates) {
					await this.db.update(contentNodes).set({ order: update.newOrder }).where(eq(contentNodes.path, update.path));
					const [res] = await this.db.select().from(contentNodes).where(eq(contentNodes.path, update.path)).limit(1);
					if (res) results.push(convertDatesToISO(res));
				}
				return results;
			}, 'REORDER_CONTENT_NODES_FAILED');
		},
		reorderStructure: async (items) => {
			return this.core.wrap(async () => {
				for (const item of items) {
					await this.db
						.update(contentNodes)
						.set({ parentId: item.parentId, order: item.order, path: item.path })
						.where(eq(contentNodes._id, item.id));
				}
			}, 'REORDER_CONTENT_STRUCTURE_FAILED');
		}
	};
	drafts = {
		create: async (draft) => {
			return this.core.wrap(async () => {
				const id = generateId();
				const now = /* @__PURE__ */ new Date();
				await this.db.insert(contentDrafts).values({
					...draft,
					_id: id,
					createdAt: now,
					updatedAt: now
				});
				const [result] = await this.db.select().from(contentDrafts).where(eq(contentDrafts._id, id)).limit(1);
				return convertDatesToISO(result);
			}, 'CREATE_CONTENT_DRAFT_FAILED');
		},
		createMany: async (drafts) => {
			return this.core.wrap(async () => {
				const now = /* @__PURE__ */ new Date();
				const values = drafts.map((draft) => ({
					...draft,
					_id: generateId(),
					createdAt: now,
					updatedAt: now
				}));
				await this.db.insert(contentDrafts).values(values);
				const ids = values.map((v) => v._id);
				const results = await this.db.select().from(contentDrafts).where(inArray(contentDrafts._id, ids));
				return convertArrayDatesToISO(results);
			}, 'CREATE_MANY_CONTENT_DRAFTS_FAILED');
		},
		update: async (draftId, data) => {
			return this.core.wrap(async () => {
				await this.db.update(contentDrafts).set({ data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(contentDrafts._id, draftId));
				const [result] = await this.db.select().from(contentDrafts).where(eq(contentDrafts._id, draftId)).limit(1);
				return convertDatesToISO(result);
			}, 'UPDATE_CONTENT_DRAFT_FAILED');
		},
		publish: async (draftId) => {
			return this.core.wrap(async () => {
				const [draft] = await this.db.select().from(contentDrafts).where(eq(contentDrafts._id, draftId)).limit(1);
				if (!draft) throw new Error('Draft not found');
				await this.db
					.update(contentNodes)
					.set({ ...draft.data, updatedAt: /* @__PURE__ */ new Date(), isPublished: true, publishedAt: /* @__PURE__ */ new Date() })
					.where(eq(contentNodes._id, draft.contentId));
				await this.db.delete(contentDrafts).where(eq(contentDrafts._id, draftId));
			}, 'PUBLISH_CONTENT_DRAFT_FAILED');
		},
		publishMany: async (draftIds) => {
			return this.core.wrap(async () => {
				let publishedCount = 0;
				for (const draftId of draftIds) {
					const res = await this.drafts.publish(draftId);
					if (res.success) publishedCount++;
				}
				return { publishedCount };
			}, 'PUBLISH_MANY_CONTENT_DRAFTS_FAILED');
		},
		getForContent: async (contentId, options) => {
			return this.core.wrap(async () => {
				const conditions = [eq(contentDrafts.contentId, contentId)];
				let q = this.db
					.select()
					.from(contentDrafts)
					.where(and(...conditions));
				const limit = options?.pageSize || 20;
				const offset = ((options?.page || 1) - 1) * limit;
				q = q.limit(limit).offset(offset).orderBy(desc(contentDrafts.updatedAt));
				const results = await q;
				const [countResult] = await this.db
					.select({ count: count() })
					.from(contentDrafts)
					.where(and(...conditions));
				const total = Number(countResult?.count || 0);
				return {
					items: convertArrayDatesToISO(results),
					total,
					page: options?.page || 1,
					pageSize: limit,
					hasNextPage: offset + limit < total,
					hasPreviousPage: (options?.page || 1) > 1
				};
			}, 'GET_CONTENT_DRAFTS_FAILED');
		},
		delete: async (draftId) => {
			return this.core.wrap(async () => {
				await this.db.delete(contentDrafts).where(eq(contentDrafts._id, draftId));
			}, 'DELETE_CONTENT_DRAFT_FAILED');
		},
		deleteMany: async (draftIds) => {
			return this.core.wrap(async () => {
				const result = await this.db.delete(contentDrafts).where(inArray(contentDrafts._id, draftIds));
				return { deletedCount: result[0].affectedRows };
			}, 'DELETE_MANY_CONTENT_DRAFTS_FAILED');
		}
	};
	revisions = {
		create: async (revision) => {
			return this.core.wrap(async () => {
				const id = generateId();
				const now = /* @__PURE__ */ new Date();
				await this.db.insert(contentRevisions).values({
					...revision,
					_id: id,
					createdAt: now,
					updatedAt: now
				});
				const [result] = await this.db.select().from(contentRevisions).where(eq(contentRevisions._id, id)).limit(1);
				return convertDatesToISO(result);
			}, 'CREATE_CONTENT_REVISION_FAILED');
		},
		getHistory: async (contentId, options) => {
			return this.core.wrap(async () => {
				const conditions = [eq(contentRevisions.contentId, contentId)];
				let q = this.db
					.select()
					.from(contentRevisions)
					.where(and(...conditions));
				const limit = options?.pageSize || 20;
				const offset = ((options?.page || 1) - 1) * limit;
				q = q.limit(limit).offset(offset).orderBy(desc(contentRevisions.createdAt));
				const results = await q;
				const [countResult] = await this.db
					.select({ count: count() })
					.from(contentRevisions)
					.where(and(...conditions));
				const total = Number(countResult?.count || 0);
				return {
					items: convertArrayDatesToISO(results),
					total,
					page: options?.page || 1,
					pageSize: limit,
					hasNextPage: offset + limit < total,
					hasPreviousPage: (options?.page || 1) > 1
				};
			}, 'GET_CONTENT_HISTORY_FAILED');
		},
		restore: async (revisionId) => {
			return this.core.wrap(async () => {
				const [revision] = await this.db.select().from(contentRevisions).where(eq(contentRevisions._id, revisionId)).limit(1);
				if (!revision) throw new Error('Revision not found');
				await this.db
					.update(contentNodes)
					.set({ ...revision.data, updatedAt: /* @__PURE__ */ new Date() })
					.where(eq(contentNodes._id, revision.contentId));
			}, 'RESTORE_CONTENT_REVISION_FAILED');
		},
		delete: async (revisionId) => {
			return this.core.wrap(async () => {
				await this.db.delete(contentRevisions).where(eq(contentRevisions._id, revisionId));
			}, 'DELETE_CONTENT_REVISION_FAILED');
		},
		deleteMany: async (revisionIds) => {
			return this.core.wrap(async () => {
				const result = await this.db.delete(contentRevisions).where(inArray(contentRevisions._id, revisionIds));
				return { deletedCount: result[0].affectedRows };
			}, 'DELETE_MANY_CONTENT_REVISIONS_FAILED');
		},
		cleanup: async (contentId, keepLatest) => {
			return this.core.wrap(async () => {
				const revisions = await this.db
					.select({ _id: contentRevisions._id })
					.from(contentRevisions)
					.where(eq(contentRevisions.contentId, contentId))
					.orderBy(desc(contentRevisions.createdAt))
					.offset(keepLatest);
				if (revisions.length === 0) return { deletedCount: 0 };
				const idsToDelete = revisions.map((r) => r._id);
				const result = await this.db.delete(contentRevisions).where(inArray(contentRevisions._id, idsToDelete));
				return { deletedCount: result[0].affectedRows };
			}, 'CLEANUP_CONTENT_REVISIONS_FAILED');
		}
	};
}
class MediaModule {
	core;
	constructor(core) {
		this.core = core;
	}
	get db() {
		return this.core.db;
	}
	get crud() {
		return this.core.crud;
	}
	async setupMediaModels() {
		logger.debug('Media models setup (no-op for SQL)');
	}
	files = {
		upload: async (file) => {
			return this.crud.insert('media_items', file);
		},
		uploadMany: async (files) => {
			return this.crud.insertMany('media_items', files);
		},
		delete: async (fileId) => {
			return this.crud.delete('media_items', fileId);
		},
		deleteMany: async (fileIds) => {
			return this.crud.deleteMany('media_items', fileIds);
		},
		getByFolder: async (folderId, options) => {
			return this.core.wrap(async () => {
				const conditions = folderId ? [eq(mediaItems.folderId, folderId)] : [];
				let q = this.db.select().from(mediaItems);
				if (conditions.length > 0) q = q.where(and(...conditions));
				if (options?.sortField) {
					const order = options.sortDirection === 'desc' ? desc : asc;
					if (mediaItems[options.sortField]) {
						q = q.orderBy(order(mediaItems[options.sortField]));
					}
				}
				const limit = options?.pageSize || 20;
				const offset = ((options?.page || 1) - 1) * limit;
				q = q.limit(limit).offset(offset);
				const results = await q;
				const [countResult] = await this.db
					.select({ count: count() })
					.from(mediaItems)
					.where(conditions.length > 0 ? and(...conditions) : void 0);
				const total = Number(countResult?.count || 0);
				return {
					items: convertArrayDatesToISO(results),
					total,
					page: options?.page || 1,
					pageSize: limit,
					hasNextPage: offset + limit < total,
					hasPreviousPage: (options?.page || 1) > 1
				};
			}, 'GET_FILES_BY_FOLDER_FAILED');
		},
		search: async (query, options) => {
			return this.core.wrap(async () => {
				const qry = `%${query}%`;
				const conditions = [or(like(mediaItems.filename, qry), like(mediaItems.originalFilename, qry))];
				let q = this.db
					.select()
					.from(mediaItems)
					.where(and(...conditions));
				if (options?.sortField) {
					const order = options.sortDirection === 'desc' ? desc : asc;
					if (mediaItems[options.sortField]) {
						q = q.orderBy(order(mediaItems[options.sortField]));
					}
				}
				const limit = options?.pageSize || 20;
				const offset = ((options?.page || 1) - 1) * limit;
				q = q.limit(limit).offset(offset);
				const results = await q;
				const [countResult] = await this.db
					.select({ count: count() })
					.from(mediaItems)
					.where(and(...conditions));
				const total = Number(countResult?.count || 0);
				return {
					items: convertArrayDatesToISO(results),
					total,
					page: options?.page || 1,
					pageSize: limit,
					hasNextPage: offset + limit < total,
					hasPreviousPage: (options?.page || 1) > 1
				};
			}, 'SEARCH_FILES_FAILED');
		},
		getMetadata: async (fileIds) => {
			return this.core.wrap(async () => {
				const results = await this.db
					.select({ _id: mediaItems._id, metadata: mediaItems.metadata })
					.from(mediaItems)
					.where(inArray(mediaItems._id, fileIds));
				const metadataMap = {};
				results.forEach((r) => {
					metadataMap[r._id] = r.metadata;
				});
				return metadataMap;
			}, 'GET_FILE_METADATA_FAILED');
		},
		updateMetadata: async (fileId, metadata) => {
			return this.core.wrap(async () => {
				const [existing] = await this.db.select({ metadata: mediaItems.metadata }).from(mediaItems).where(eq(mediaItems._id, fileId)).limit(1);
				const newMetadata = { ...(existing?.metadata || {}), ...metadata };
				await this.db.update(mediaItems).set({ metadata: newMetadata, updatedAt: /* @__PURE__ */ new Date() }).where(eq(mediaItems._id, fileId));
				const [updated] = await this.db.select().from(mediaItems).where(eq(mediaItems._id, fileId)).limit(1);
				return convertDatesToISO(updated);
			}, 'UPDATE_FILE_METADATA_FAILED');
		},
		move: async (fileIds, targetFolderId) => {
			return this.core.wrap(async () => {
				const result = await this.db
					.update(mediaItems)
					.set({ folderId: targetFolderId || null, updatedAt: /* @__PURE__ */ new Date() })
					.where(inArray(mediaItems._id, fileIds));
				return { movedCount: result[0].affectedRows };
			}, 'MOVE_FILES_FAILED');
		},
		duplicate: async (fileId, newName) => {
			return this.core.wrap(async () => {
				const [existing] = await this.db.select().from(mediaItems).where(eq(mediaItems._id, fileId)).limit(1);
				if (!existing) throw new Error('File not found');
				const id = generateId();
				const now = /* @__PURE__ */ new Date();
				const copy = {
					...existing,
					_id: id,
					filename: newName || `${existing.filename}_copy`,
					createdAt: now,
					updatedAt: now
				};
				await this.db.insert(mediaItems).values(copy);
				const [created] = await this.db.select().from(mediaItems).where(eq(mediaItems._id, id)).limit(1);
				return convertDatesToISO(created);
			}, 'DUPLICATE_FILE_FAILED');
		}
	};
	folders = {
		create: async (folder) => {
			return this.core.wrap(async () => {
				const id = generateId();
				const now = /* @__PURE__ */ new Date();
				const values = {
					...folder,
					_id: id,
					type: 'folder',
					createdAt: now,
					updatedAt: now
				};
				await this.db.insert(systemVirtualFolders).values(values);
				const [result] = await this.db.select().from(systemVirtualFolders).where(eq(systemVirtualFolders._id, id)).limit(1);
				return convertDatesToISO(result);
			}, 'CREATE_MEDIA_FOLDER_FAILED');
		},
		createMany: async (folders) => {
			return this.core.wrap(async () => {
				const now = /* @__PURE__ */ new Date();
				const values = folders.map((f) => ({
					...f,
					_id: generateId(),
					type: 'folder',
					createdAt: now,
					updatedAt: now
				}));
				await this.db.insert(systemVirtualFolders).values(values);
				const ids = values.map((v) => v._id);
				const results = await this.db.select().from(systemVirtualFolders).where(inArray(systemVirtualFolders._id, ids));
				return convertArrayDatesToISO(results);
			}, 'CREATE_MANY_MEDIA_FOLDERS_FAILED');
		},
		delete: async (folderId) => {
			return this.core.wrap(async () => {
				await this.db.delete(systemVirtualFolders).where(eq(systemVirtualFolders._id, folderId));
			}, 'DELETE_MEDIA_FOLDER_FAILED');
		},
		deleteMany: async (folderIds) => {
			return this.core.wrap(async () => {
				const result = await this.db.delete(systemVirtualFolders).where(inArray(systemVirtualFolders._id, folderIds));
				return { deletedCount: result[0].affectedRows };
			}, 'DELETE_MANY_MEDIA_FOLDERS_FAILED');
		},
		getTree: async (_maxDepth) => {
			return this.core.wrap(async () => {
				const results = await this.db.select().from(systemVirtualFolders).where(eq(systemVirtualFolders.type, 'folder'));
				return convertArrayDatesToISO(results);
			}, 'GET_MEDIA_FOLDER_TREE_FAILED');
		},
		getFolderContents: async (folderId, _options) => {
			return this.core.wrap(async () => {
				const folderConditions = folderId ? [eq(systemVirtualFolders.parentId, folderId)] : [eq(systemVirtualFolders.parentId, '')];
				const fileConditions = folderId ? [eq(mediaItems.folderId, folderId)] : [];
				const folders = await this.db
					.select()
					.from(systemVirtualFolders)
					.where(and(eq(systemVirtualFolders.type, 'folder'), ...folderConditions));
				const files = await this.db
					.select()
					.from(mediaItems)
					.where(fileConditions.length > 0 ? and(...fileConditions) : void 0);
				return {
					folders: convertArrayDatesToISO(folders),
					files: convertArrayDatesToISO(files),
					totalCount: folders.length + files.length
				};
			}, 'GET_FOLDER_CONTENTS_FAILED');
		},
		move: async (folderId, targetParentId) => {
			return this.core.wrap(async () => {
				await this.db
					.update(systemVirtualFolders)
					.set({ parentId: targetParentId || null, updatedAt: /* @__PURE__ */ new Date() })
					.where(eq(systemVirtualFolders._id, folderId));
				const [updated] = await this.db.select().from(systemVirtualFolders).where(eq(systemVirtualFolders._id, folderId)).limit(1);
				return convertDatesToISO(updated);
			}, 'MOVE_MEDIA_FOLDER_FAILED');
		}
	};
}
class PreferencesModule {
	core;
	constructor(core) {
		this.core = core;
	}
	get db() {
		return this.core.db;
	}
	async get(key, scope, userId) {
		return this.core.wrap(async () => {
			const conditions = [eq(systemPreferences.key, key)];
			if (scope) conditions.push(eq(systemPreferences.scope, scope));
			if (userId) conditions.push(eq(systemPreferences.userId, userId));
			const [result] = await this.db
				.select()
				.from(systemPreferences)
				.where(and(...conditions))
				.limit(1);
			if (!result) {
				return { success: false, message: 'Preference not found', error: createDatabaseError('NOT_FOUND', 'Preference not found') };
			}
			return { success: true, data: result.value };
		}, 'GET_PREFERENCE_FAILED');
	}
	async getMany(keys, scope, userId) {
		return this.core.wrap(async () => {
			const conditions = [inArray(systemPreferences.key, keys)];
			if (scope) conditions.push(eq(systemPreferences.scope, scope));
			if (userId) conditions.push(eq(systemPreferences.userId, userId));
			const results = await this.db
				.select()
				.from(systemPreferences)
				.where(and(...conditions));
			const prefs = {};
			for (const result of results) {
				prefs[result.key] = result.value;
			}
			return { success: true, data: prefs };
		}, 'GET_PREFERENCES_FAILED');
	}
	async set(key, value, scope, userId) {
		return this.core.wrap(async () => {
			const exists = await this.db.select().from(systemPreferences).where(eq(systemPreferences.key, key)).limit(1);
			if (exists.length > 0) {
				await this.db.update(systemPreferences).set({ value, updatedAt: /* @__PURE__ */ new Date() }).where(eq(systemPreferences.key, key));
			} else {
				await this.db.insert(systemPreferences).values({
					_id: generateId(),
					key,
					value,
					scope: scope || 'system',
					userId: userId || null,
					visibility: 'private',
					createdAt: /* @__PURE__ */ new Date(),
					updatedAt: /* @__PURE__ */ new Date()
				});
			}
		}, 'SET_PREFERENCE_FAILED');
	}
	async setMany(preferences) {
		return this.core.wrap(async () => {
			for (const pref of preferences) {
				const result = await this.set(pref.key, pref.value, pref.scope, pref.userId);
				if (!result.success) {
					throw new Error(`Failed to set preference ${pref.key}: ${result.message}`);
				}
			}
		}, 'SET_PREFERENCES_FAILED');
	}
	async delete(key, scope, userId) {
		return this.core.wrap(async () => {
			const conditions = [eq(systemPreferences.key, key)];
			if (scope) conditions.push(eq(systemPreferences.scope, scope));
			if (userId) conditions.push(eq(systemPreferences.userId, userId));
			await this.db.delete(systemPreferences).where(and(...conditions));
		}, 'DELETE_PREFERENCE_FAILED');
	}
	async deleteMany(keys, scope, userId) {
		return this.core.wrap(async () => {
			const conditions = [];
			if (keys.length > 0) conditions.push(inArray(systemPreferences.key, keys));
			if (scope) conditions.push(eq(systemPreferences.scope, scope));
			if (userId) conditions.push(eq(systemPreferences.userId, userId));
			let q = this.db.delete(systemPreferences);
			if (conditions.length > 0) {
				await q.where(and(...conditions));
			} else {
				await q;
			}
		}, 'DELETE_PREFERENCES_FAILED');
	}
	async clear(scope, userId) {
		return this.core.wrap(async () => {
			const conditions = [];
			if (scope) conditions.push(eq(systemPreferences.scope, scope));
			if (userId) conditions.push(eq(systemPreferences.userId, userId));
			let q = this.db.delete(systemPreferences);
			if (conditions.length > 0) {
				await q.where(and(...conditions));
			} else {
				await q;
			}
		}, 'CLEAR_PREFERENCES_FAILED');
	}
}
class VirtualFoldersModule {
	core;
	constructor(core) {
		this.core = core;
	}
	get db() {
		return this.core.db;
	}
	async getAll() {
		return this.core.wrap(async () => {
			const folders = await this.db.select().from(systemVirtualFolders);
			return convertArrayDatesToISO(folders);
		}, 'GET_VIRTUAL_FOLDERS_FAILED');
	}
	async getById(folderId) {
		return this.core.wrap(async () => {
			const [folder] = await this.db.select().from(systemVirtualFolders).where(eq(systemVirtualFolders._id, folderId)).limit(1);
			return folder ? convertDatesToISO(folder) : null;
		}, 'GET_VIRTUAL_FOLDER_FAILED');
	}
	async getByParentId(parentId) {
		return this.core.wrap(async () => {
			const folders = parentId
				? await this.db.select().from(systemVirtualFolders).where(eq(systemVirtualFolders.parentId, parentId))
				: await this.db
						.select()
						.from(systemVirtualFolders)
						.where(sql`${systemVirtualFolders.parentId} IS NULL`);
			return convertArrayDatesToISO(folders);
		}, 'GET_VIRTUAL_FOLDERS_BY_PARENT_FAILED');
	}
	async create(folder) {
		return this.core.wrap(async () => {
			const id = generateId();
			await this.db.insert(systemVirtualFolders).values({
				_id: id,
				name: folder.name,
				path: folder.path,
				parentId: folder.parentId || null,
				icon: folder.icon || null,
				order: folder.order,
				type: folder.type,
				metadata: folder.metadata,
				tenantId: folder.tenantId || null,
				createdAt: /* @__PURE__ */ new Date(),
				updatedAt: /* @__PURE__ */ new Date()
			});
			const [created] = await this.db.select().from(systemVirtualFolders).where(eq(systemVirtualFolders._id, id));
			return convertDatesToISO(created);
		}, 'CREATE_VIRTUAL_FOLDER_FAILED');
	}
	async update(folderId, updateData) {
		return this.core.wrap(async () => {
			await this.db
				.update(systemVirtualFolders)
				.set({ ...updateData, metadata: updateData.metadata, updatedAt: /* @__PURE__ */ new Date() })
				.where(eq(systemVirtualFolders._id, folderId));
			const [updated] = await this.db.select().from(systemVirtualFolders).where(eq(systemVirtualFolders._id, folderId));
			return convertDatesToISO(updated);
		}, 'UPDATE_VIRTUAL_FOLDER_FAILED');
	}
	async delete(folderId) {
		return this.core.wrap(async () => {
			await this.db.delete(systemVirtualFolders).where(eq(systemVirtualFolders._id, folderId));
		}, 'DELETE_VIRTUAL_FOLDER_FAILED');
	}
	async exists(path) {
		return this.core.wrap(async () => {
			const [folder] = await this.db.select().from(systemVirtualFolders).where(eq(systemVirtualFolders.path, path)).limit(1);
			return !!folder;
		}, 'CHECK_VIRTUAL_FOLDER_EXISTS_FAILED');
	}
	async getContents(folderPath) {
		return this.core.wrap(async () => {
			const [folder] = await this.db.select().from(systemVirtualFolders).where(eq(systemVirtualFolders.path, folderPath)).limit(1);
			if (!folder) throw new Error('Folder not found');
			const subfolders = await this.db.select().from(systemVirtualFolders).where(eq(systemVirtualFolders.parentId, folder._id));
			const files = await this.db.select().from(mediaItems).where(eq(mediaItems.folderId, folder._id));
			return {
				folders: convertArrayDatesToISO(subfolders),
				files: convertArrayDatesToISO(files)
			};
		}, 'GET_VIRTUAL_FOLDER_CONTENTS_FAILED');
	}
	async addToFolder(_contentId, _folderPath) {
		return this.core.notImplemented('systemVirtualFolder.addToFolder');
	}
}
class ThemesModule {
	core;
	constructor(core) {
		this.core = core;
	}
	get db() {
		return this.core.db;
	}
	async setupThemeModels() {
		logger.debug('Theme models setup (no-op for SQL)');
	}
	async getActive() {
		return this.core.wrap(async () => {
			const [theme] = await this.db.select().from(themes).where(eq(themes.isActive, true)).limit(1);
			if (!theme) {
				return { success: false, message: 'No active theme found', error: createDatabaseError('NOT_FOUND', 'No active theme') };
			}
			return { success: true, data: convertDatesToISO(theme) };
		}, 'GET_ACTIVE_THEME_FAILED');
	}
	async setDefault(themeId) {
		return this.core.wrap(async () => {
			await this.db.update(themes).set({ isDefault: false });
			await this.db.update(themes).set({ isDefault: true, isActive: true }).where(eq(themes._id, themeId));
		}, 'SET_DEFAULT_THEME_FAILED');
	}
	async install(theme) {
		return this.core.wrap(async () => {
			const id = generateId();
			await this.db.insert(themes).values({
				_id: id,
				...theme,
				config: theme.config,
				createdAt: /* @__PURE__ */ new Date(),
				updatedAt: /* @__PURE__ */ new Date()
			});
			const [inserted] = await this.db.select().from(themes).where(eq(themes._id, id));
			return { success: true, data: convertDatesToISO(inserted) };
		}, 'INSTALL_THEME_FAILED');
	}
	async uninstall(themeId) {
		return this.core.wrap(async () => {
			await this.db.delete(themes).where(eq(themes._id, themeId));
		}, 'UNINSTALL_THEME_FAILED');
	}
	async update(themeId, theme) {
		return this.core.wrap(async () => {
			await this.db
				.update(themes)
				.set({ ...theme, config: theme.config, updatedAt: /* @__PURE__ */ new Date() })
				.where(eq(themes._id, themeId));
			const [updated] = await this.db.select().from(themes).where(eq(themes._id, themeId));
			return { success: true, data: convertDatesToISO(updated) };
		}, 'UPDATE_THEME_FAILED');
	}
	async getAllThemes() {
		if (!this.db) return [];
		try {
			const themes$1 = await this.db.select().from(themes);
			return convertArrayDatesToISO(themes$1);
		} catch (error) {
			logger.error('Get all themes failed:', error);
			return [];
		}
	}
	async storeThemes(themes$1) {
		if (!this.db) throw new Error('Database not connected');
		try {
			for (const theme of themes$1) {
				const exists = await this.db.select().from(themes).where(eq(themes.name, theme.name)).limit(1);
				if (exists.length === 0) {
					await this.db.insert(themes).values({
						_id: theme._id || generateId(),
						name: theme.name,
						path: theme.path,
						isActive: theme.isActive,
						isDefault: theme.isDefault,
						config: theme.config,
						createdAt: /* @__PURE__ */ new Date(),
						updatedAt: /* @__PURE__ */ new Date()
					});
				}
			}
		} catch (error) {
			logger.error('Store themes failed:', error);
			throw error;
		}
	}
	async getDefaultTheme(_tenantId) {
		return this.core.wrap(async () => {
			const [theme] = await this.db.select().from(themes).where(eq(themes.isDefault, true)).limit(1);
			return theme ? convertDatesToISO(theme) : null;
		}, 'GET_DEFAULT_THEME_FAILED');
	}
}
class WidgetsModule {
	core;
	constructor(core) {
		this.core = core;
	}
	get db() {
		return this.core.db;
	}
	async setupWidgetModels() {
		logger.debug('Widget models setup (no-op for SQL)');
	}
	async register(widget) {
		return this.core.wrap(async () => {
			const exists = await this.db.select().from(widgets).where(eq(widgets.name, widget.name)).limit(1);
			if (exists.length > 0) {
				await this.db
					.update(widgets)
					.set({
						isActive: widget.isActive,
						instances: widget.instances,
						dependencies: widget.dependencies,
						updatedAt: /* @__PURE__ */ new Date()
					})
					.where(eq(widgets.name, widget.name));
				const [updated] = await this.db.select().from(widgets).where(eq(widgets.name, widget.name)).limit(1);
				return convertDatesToISO(updated);
			} else {
				const id = generateId();
				await this.db.insert(widgets).values({
					_id: id,
					name: widget.name,
					isActive: widget.isActive,
					instances: widget.instances,
					dependencies: widget.dependencies,
					createdAt: /* @__PURE__ */ new Date(),
					updatedAt: /* @__PURE__ */ new Date()
				});
				const [created] = await this.db.select().from(widgets).where(eq(widgets._id, id)).limit(1);
				return convertDatesToISO(created);
			}
		}, 'REGISTER_WIDGET_FAILED');
	}
	async findAll() {
		return this.core.wrap(async () => {
			const results = await this.db.select().from(widgets);
			return convertArrayDatesToISO(results);
		}, 'FIND_ALL_WIDGETS_FAILED');
	}
	async getActiveWidgets() {
		return this.core.wrap(async () => {
			const results = await this.db.select().from(widgets).where(eq(widgets.isActive, true));
			return convertArrayDatesToISO(results);
		}, 'GET_ACTIVE_WIDGETS_FAILED');
	}
	async activate(widgetId) {
		return this.core.wrap(async () => {
			await this.db.update(widgets).set({ isActive: true, updatedAt: /* @__PURE__ */ new Date() }).where(eq(widgets._id, widgetId));
		}, 'ACTIVATE_WIDGET_FAILED');
	}
	async deactivate(widgetId) {
		return this.core.wrap(async () => {
			await this.db.update(widgets).set({ isActive: false, updatedAt: /* @__PURE__ */ new Date() }).where(eq(widgets._id, widgetId));
		}, 'DEACTIVATE_WIDGET_FAILED');
	}
	async update(widgetId, widget) {
		return this.core.wrap(async () => {
			await this.db
				.update(widgets)
				.set({ ...widget, updatedAt: /* @__PURE__ */ new Date() })
				.where(eq(widgets._id, widgetId));
			const [updated] = await this.db.select().from(widgets).where(eq(widgets._id, widgetId)).limit(1);
			return convertDatesToISO(updated);
		}, 'UPDATE_WIDGET_FAILED');
	}
	async delete(widgetId) {
		return this.core.wrap(async () => {
			await this.db.delete(widgets).where(eq(widgets._id, widgetId));
		}, 'DELETE_WIDGET_FAILED');
	}
}
class WebsiteTokensModule {
	core;
	constructor(core) {
		this.core = core;
	}
	get db() {
		return this.core.db;
	}
	async create(token) {
		return this.core.wrap(async () => {
			const id = generateId();
			const now = /* @__PURE__ */ new Date();
			await this.db.insert(websiteTokens).values({
				...token,
				_id: id,
				createdAt: now,
				updatedAt: now
			});
			const [result] = await this.db.select().from(websiteTokens).where(eq(websiteTokens._id, id)).limit(1);
			return convertDatesToISO(result);
		}, 'CREATE_WEBSITE_TOKEN_FAILED');
	}
	async getAll(options) {
		return this.core.wrap(async () => {
			let q = this.db.select().from(websiteTokens);
			if (options.sort) {
				const order = options.order === 'desc' ? desc : asc;
				if (websiteTokens[options.sort]) {
					q = q.orderBy(order(websiteTokens[options.sort]));
				}
			}
			if (options.limit) q = q.limit(options.limit);
			if (options.skip) q = q.offset(options.skip);
			const results = await q;
			const [countResult] = await this.db.select({ count: sql`count(*)` }).from(websiteTokens);
			const total = countResult.count;
			return {
				data: convertArrayDatesToISO(results),
				total: Number(total)
			};
		}, 'GET_WEBSITE_TOKENS_FAILED');
	}
	async getByName(name) {
		return this.core.wrap(async () => {
			const [result] = await this.db.select().from(websiteTokens).where(eq(websiteTokens.name, name)).limit(1);
			return result ? convertDatesToISO(result) : null;
		}, 'GET_WEBSITE_TOKEN_BY_NAME_FAILED');
	}
	async delete(tokenId) {
		return this.core.wrap(async () => {
			await this.db.delete(websiteTokens).where(eq(websiteTokens._id, tokenId));
		}, 'DELETE_WEBSITE_TOKEN_FAILED');
	}
}
class BatchModule {
	core;
	constructor(core) {
		this.core = core;
	}
	get db() {
		return this.core.db;
	}
	get crud() {
		return this.core.crud;
	}
	async execute(operations) {
		return this.core.wrap(async () => {
			const results = [];
			let totalProcessed = 0;
			const errors = [];
			for (const op of operations) {
				try {
					let res;
					switch (op.operation) {
						case 'insert':
							res = await this.crud.insert(op.collection, op.data);
							break;
						case 'update':
							if (!op.id) throw new Error('ID required for update operation');
							res = await this.crud.update(op.collection, op.id, op.data);
							break;
						case 'delete':
							if (!op.id) throw new Error('ID required for delete operation');
							res = await this.crud.delete(op.collection, op.id);
							break;
						case 'upsert':
							if (!op.query || !op.data) throw new Error('Query and data required for upsert operation');
							res = await this.crud.upsert(op.collection, op.query, op.data);
							break;
						default:
							throw new Error(`Unsupported batch operation: ${op.operation}`);
					}
					results.push(res);
					if (res.success) {
						totalProcessed++;
					} else {
						errors.push(res.error);
					}
				} catch (error) {
					const dbError = createDatabaseError('BATCH_OP_FAILED', error instanceof Error ? error.message : String(error), error);
					results.push({ success: false, message: dbError.message, error: dbError });
					errors.push(dbError);
				}
			}
			return {
				success: errors.length === 0,
				results,
				totalProcessed,
				errors
			};
		}, 'BATCH_EXECUTE_FAILED');
	}
	async bulkInsert(collection, items) {
		return this.crud.insertMany(collection, items);
	}
	async bulkUpdate(collection, updates) {
		return this.core.wrap(async () => {
			const table = this.core.getTable(collection);
			let modifiedCount = 0;
			for (const update of updates) {
				const result = await this.db
					.update(table)
					.set({ ...update.data, updatedAt: /* @__PURE__ */ new Date() })
					.where(eq(table._id, update.id));
				modifiedCount += result[0].affectedRows;
			}
			return { modifiedCount };
		}, 'BULK_UPDATE_FAILED');
	}
	async bulkDelete(collection, ids) {
		return this.core.wrap(async () => {
			const table = this.core.getTable(collection);
			const result = await this.db.delete(table).where(inArray(table._id, ids));
			return { deletedCount: result[0].affectedRows };
		}, 'BULK_DELETE_FAILED');
	}
	async bulkUpsert(collection, items) {
		const mappedItems = items.map((item) => ({
			query: { _id: item.id },
			data: item
		}));
		return this.crud.upsertMany(collection, mappedItems);
	}
}
class TransactionModule {
	core;
	constructor(core) {
		this.core = core;
	}
	get db() {
		return this.core.db;
	}
	async execute(fn, options) {
		if (!this.db) return this.core.notConnectedError();
		try {
			return await this.db.transaction(async (_tx) => {
				const dbTransaction = {
					commit: async () => ({ success: true, data: void 0 }),
					rollback: async () => {
						throw new Error('ROLLBACK_TRANSACTION');
					}
				};
				const result = await fn(dbTransaction);
				if (!result.success) throw new Error(result.message || 'Transaction failed');
				return result;
			}, options);
		} catch (error) {
			if (error.message === 'ROLLBACK_TRANSACTION') {
				return {
					success: false,
					message: 'Transaction rolled back',
					error: createDatabaseError('TRANSACTION_ROLLED_BACK', 'Transaction rolled back')
				};
			}
			return this.core.handleError(error, 'TRANSACTION_FAILED');
		}
	}
}
class PerformanceModule {
	core;
	constructor(core) {
		this.core = core;
	}
	async getMetrics(_tags) {
		return this.core.notImplemented('performance.getMetrics');
	}
	async clearMetrics(_tags) {
		return this.core.notImplemented('performance.clearMetrics');
	}
	async enableProfiling(_enabled) {
		return this.core.notImplemented('performance.enableProfiling');
	}
	async getSlowQueries(_limit) {
		return this.core.notImplemented('performance.getSlowQueries');
	}
}
class CacheModule {
	core;
	constructor(core) {
		this.core = core;
	}
	async get(_key) {
		return this.core.notImplemented('cache.get');
	}
	async set(_key, _value, _options) {
		return this.core.notImplemented('cache.set');
	}
	async delete(_key) {
		return this.core.notImplemented('cache.delete');
	}
	async clear(_tags) {
		return this.core.notImplemented('cache.clear');
	}
	async invalidateCollection(_collection) {
		return this.core.notImplemented('cache.invalidateCollection');
	}
}
class CollectionModule {
	core;
	constructor(core) {
		this.core = core;
	}
	get crud() {
		return this.core.crud;
	}
	get collectionRegistry() {
		return this.core.collectionRegistry;
	}
	async getModel(id) {
		const model = this.collectionRegistry.get(id);
		if (model) return model;
		return {
			findOne: async (query) => {
				const res = await this.crud.findOne(id, query);
				return res.success ? res.data : null;
			},
			aggregate: async (pipeline) => {
				const res = await this.crud.aggregate(id, pipeline);
				return res.success ? res.data : [];
			}
		};
	}
	async createModel(schemaData) {
		const id = schemaData._id;
		if (!id) throw new Error('Schema must have an _id');
		const wrappedModel = {
			findOne: async (query) => {
				const res = await this.crud.findOne(id, query);
				return res.success ? res.data : null;
			},
			aggregate: async (pipeline) => {
				const res = await this.crud.aggregate(id, pipeline);
				return res.success ? res.data : [];
			}
		};
		this.collectionRegistry.set(id, wrappedModel);
	}
	async updateModel(schemaData) {
		await this.createModel(schemaData);
	}
	async deleteModel(id) {
		this.collectionRegistry.delete(id);
	}
}
class MariaDBQueryBuilder {
	adapter;
	collection;
	conditions = [];
	sortOptions = [];
	limitValue;
	skipValue;
	selectedFields;
	constructor(adapter, collection) {
		this.adapter = adapter;
		this.collection = collection;
	}
	get table() {
		return this.adapter.getTable(this.collection);
	}
	get db() {
		return this.adapter.db;
	}
	where(conditions) {
		if (typeof conditions === 'function') {
			logger.warn('Function-based where conditions are not supported in MariaDBQueryBuilder');
			return this;
		}
		for (const [key, value] of Object.entries(conditions)) {
			if (this.table[key]) {
				this.conditions.push(eq(this.table[key], value));
			}
		}
		return this;
	}
	whereIn(field, values) {
		if (this.table[field]) {
			this.conditions.push(inArray(this.table[field], values));
		}
		return this;
	}
	whereNotIn(field, values) {
		if (this.table[field]) {
			this.conditions.push(notInArray(this.table[field], values));
		}
		return this;
	}
	whereBetween(field, min, max) {
		if (this.table[field]) {
			this.conditions.push(and(gte(this.table[field], min), lte(this.table[field], max)));
		}
		return this;
	}
	whereNull(field) {
		if (this.table[field]) {
			this.conditions.push(sql`${this.table[field]} IS NULL`);
		}
		return this;
	}
	whereNotNull(field) {
		if (this.table[field]) {
			this.conditions.push(sql`${this.table[field]} IS NOT NULL`);
		}
		return this;
	}
	search(query, fields) {
		if (fields && fields.length > 0) {
			const searchConditions = fields
				.map((f) => {
					if (this.table[f]) {
						return like(this.table[f], `%${query}%`);
					}
					return null;
				})
				.filter(Boolean);
			if (searchConditions.length > 0) {
				this.conditions.push(or(...searchConditions));
			}
		}
		return this;
	}
	limit(value) {
		this.limitValue = value;
		return this;
	}
	skip(value) {
		this.skipValue = value;
		return this;
	}
	paginate(options) {
		if (options.page && options.pageSize) {
			this.skipValue = (options.page - 1) * options.pageSize;
			this.limitValue = options.pageSize;
		}
		if (options.sortField && options.sortDirection) {
			this.sort(options.sortField, options.sortDirection);
		}
		return this;
	}
	sort(field, direction) {
		this.sortOptions.push({ field, direction });
		return this;
	}
	orderBy(sorts) {
		this.sortOptions = [...this.sortOptions, ...sorts];
		return this;
	}
	select(fields) {
		this.selectedFields = fields;
		return this;
	}
	exclude(_fields) {
		return this;
	}
	distinct(_field) {
		return this;
	}
	groupBy(_field) {
		return this;
	}
	hint(_hints) {
		return this;
	}
	timeout(_milliseconds) {
		return this;
	}
	buildQuery() {
		if (!this.db) throw new Error('Database not connected');
		let q;
		if (this.selectedFields) {
			const projection = {};
			this.selectedFields.forEach((f) => {
				if (this.table[f]) projection[f] = this.table[f];
			});
			q = this.db.select(projection).from(this.table);
		} else {
			q = this.db.select().from(this.table);
		}
		if (this.conditions.length > 0) {
			q = q.where(and(...this.conditions));
		}
		if (this.sortOptions.length > 0) {
			const orderBys = this.sortOptions.map((s) => {
				const order = s.direction === 'desc' ? desc : asc;
				return order(this.table[s.field]);
			});
			q = q.orderBy(...orderBys);
		}
		if (this.limitValue !== void 0) q = q.limit(this.limitValue);
		if (this.skipValue !== void 0) q = q.offset(this.skipValue);
		return q;
	}
	async count() {
		const startTime = Date.now();
		try {
			const table = this.table;
			let q = this.db.select({ count: count() }).from(table);
			if (this.conditions.length > 0) {
				q = q.where(and(...this.conditions));
			}
			const [result] = await q;
			return {
				success: true,
				data: Number(result.count),
				meta: { executionTime: Date.now() - startTime }
			};
		} catch (error) {
			return this.adapter.handleError(error, 'QUERY_BUILDER_COUNT_FAILED');
		}
	}
	async exists() {
		const res = await this.count();
		if (res.success) return { ...res, data: res.data > 0 };
		return res;
	}
	async execute() {
		const startTime = Date.now();
		try {
			const q = this.buildQuery();
			const results = await q;
			return {
				success: true,
				data: convertArrayDatesToISO(results),
				meta: { executionTime: Date.now() - startTime }
			};
		} catch (error) {
			return this.adapter.handleError(error, 'QUERY_BUILDER_EXECUTE_FAILED');
		}
	}
	async stream() {
		return this.adapter.notImplemented('queryBuilder.stream');
	}
	async findOne() {
		const startTime = Date.now();
		try {
			const q = this.buildQuery().limit(1);
			const [result] = await q;
			return {
				success: true,
				data: result ? convertDatesToISO(result) : null,
				meta: { executionTime: Date.now() - startTime }
			};
		} catch (error) {
			return this.adapter.handleError(error, 'QUERY_BUILDER_FIND_ONE_FAILED');
		}
	}
	async findOneOrFail() {
		const res = await this.findOne();
		if (res.success && !res.data) {
			return {
				success: false,
				message: 'Document not found',
				error: createDatabaseError('NOT_FOUND', 'Document not found')
			};
		}
		return res;
	}
	async updateMany(data) {
		const startTime = Date.now();
		try {
			let q = this.db.update(this.table).set({ ...data, updatedAt: /* @__PURE__ */ new Date() });
			if (this.conditions.length > 0) {
				q = q.where(and(...this.conditions));
			}
			const result = await q;
			return {
				success: true,
				data: { modifiedCount: result[0].affectedRows },
				meta: { executionTime: Date.now() - startTime }
			};
		} catch (error) {
			return this.adapter.handleError(error, 'QUERY_BUILDER_UPDATE_MANY_FAILED');
		}
	}
	async deleteMany() {
		const startTime = Date.now();
		try {
			let q = this.db.delete(this.table);
			if (this.conditions.length > 0) {
				q = q.where(and(...this.conditions));
			}
			const result = await q;
			return {
				success: true,
				data: { deletedCount: result[0].affectedRows },
				meta: { executionTime: Date.now() - startTime }
			};
		} catch (error) {
			return this.adapter.handleError(error, 'QUERY_BUILDER_DELETE_MANY_FAILED');
		}
	}
}
class MariaDBAdapter extends AdapterCore {
	crud;
	auth;
	content;
	media;
	systemPreferences;
	systemVirtualFolder;
	themes;
	widgets;
	websiteTokens;
	batch;
	transactionModule;
	performance;
	cache;
	collection;
	utils = utils;
	constructor() {
		super();
		this.crud = new CrudModule(this);
		this.auth = new AuthModule(this);
		this.content = new ContentModule(this);
		this.media = new MediaModule(this);
		this.systemPreferences = new PreferencesModule(this);
		this.systemVirtualFolder = new VirtualFoldersModule(this);
		this.themes = new ThemesModule(this);
		this.widgets = new WidgetsModule(this);
		this.websiteTokens = new WebsiteTokensModule(this);
		this.batch = new BatchModule(this);
		this.transactionModule = new TransactionModule(this);
		this.performance = new PerformanceModule(this);
		this.cache = new CacheModule(this);
		this.collection = new CollectionModule(this);
	}
	queryBuilder = (collection) => {
		return new MariaDBQueryBuilder(this, collection);
	};
	transaction = async (fn, options) => {
		return this.transactionModule.execute(fn, options);
	};
	// Global CRUD data methods
	getCollectionData = async (collection, options) => {
		return this.wrap(async () => {
			const res = await this.crud.findMany(collection, {}, options);
			if (!res.success) throw new Error(res.message);
			return {
				data: res.data ?? [],
				metadata: options?.includeMetadata ? { totalCount: res.data?.length ?? 0 } : void 0
			};
		}, 'GET_COLLECTION_DATA_FAILED');
	};
	getMultipleCollectionData = async (collectionNames, options) => {
		return this.wrap(async () => {
			const results = {};
			for (const name of collectionNames) {
				const res = await this.getCollectionData(name, { limit: options?.limit, fields: options?.fields });
				if (res.success) results[name] = res.data.data;
			}
			return results;
		}, 'GET_MULTIPLE_COLLECTION_DATA_FAILED');
	};
}
export { MariaDBAdapter, MariaDBAdapter as default };
//# sourceMappingURL=mariadbAdapter.js.map
