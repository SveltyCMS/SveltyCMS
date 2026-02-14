/**
 * @file src/databases/postgresql/adapter/index.ts
 * @description Main PostgreSQL adapter class that composes feature modules and entry point.
 *
 * Features:
 * - CRUD operations
 * - Authentication
 * - Content management
 * - Media management
 * - System preferences
 * - Virtual folders
 * - Themes
 * - Widgets
 * - Website tokens
 * - Transactions
 * - Performance monitoring
 * - Collection management
 * - Query builder
 *
 * NOTE: This is a BETA implementation. All methods return "not implemented" stubs.
 * The adapter is cast to `unknown` in db.ts to bypass type checking until fully implemented.
 */

import type { DatabaseResult, BaseEntity, QueryBuilder } from '../../dbInterface';
import { AdapterCore } from './adapterCore';
import * as utils from '../utils';
import * as schema from '../schema/index';
import { logger } from '@utils/logger';
import { runMigrations } from '../migrations';
import { sql } from 'drizzle-orm';

/**
 * PostgreSQL adapter for SveltyCMS (BETA)
 *
 * This is a beta stub implementation. All core modules return "not implemented".
 * The adapter will be fully implemented following the MariaDB pattern.
 */
export class PostgreSQLAdapter extends AdapterCore {
	private _featureInit = {
		system: false,
		auth: false,
		media: false,
		content: false
	};

	public async ensureSystem(): Promise<void> {
		if (this._featureInit.system) return;
		const result = await runMigrations(this.sql!);
		if (!result.success) {
			logger.error('PostgreSQL Migration failed:', result.error);
			throw new Error(result.error);
		}
		this._featureInit.system = true;
	}
	// Stub modules - will be implemented following the MariaDB pattern
	public readonly crud = {
		findOne: async (collection: string, query: Record<string, unknown>) => {
			return this.wrap(async () => {
				const table = this.getTable(collection);
				const where = this.mapQuery(table, query);
				const [result] = await this.db!.select().from(table).where(where).limit(1);
				return result || null;
			}, 'CRUD_FIND_ONE_FAILED');
		},

		insert: async (collection: string, data: any) => {
			return this.wrap(async () => {
				const table = this.getTable(collection);
				const formattedData = {
					_id: data._id || utils.generateId(),
					...data
				};
				const [result] = await this.db!.insert(table).values(formattedData).returning();
				return result;
			}, 'CRUD_INSERT_FAILED');
		},
		insertMany: async (collection: string, data: any[]) => {
			return this.wrap(async () => {
				const table = this.getTable(collection);
				const formattedData = data.map((d) => ({
					_id: d._id || utils.generateId(),
					...d
				}));
				return await this.db!.insert(table).values(formattedData).returning();
			}, 'CRUD_INSERT_MANY_FAILED');
		},
		updateMany: async (collection: string, query: Record<string, unknown>, data: Record<string, unknown>) => {
			return this.wrap(async () => {
				const { sql } = await import('drizzle-orm');
				const table = this.getTable(collection);
				const where = this.mapQuery(table, query);
				const [result] = await this.db!.update(table)
					.set(data)
					.where(where)
					.returning({ modifiedCount: sql<number>`1` });
				return { modifiedCount: result ? 1 : 0 };
			}, 'CRUD_UPDATE_MANY_FAILED');
		},
		deleteMany: async (collection: string, query: Record<string, unknown>) => {
			return this.wrap(async () => {
				const table = this.getTable(collection);
				const where = this.mapQuery(table, query);
				const result = await this.db!.delete(table).where(where).returning();
				return { deletedCount: result.length };
			}, 'CRUD_DELETE_MANY_FAILED');
		},
		upsert: async (collection: string, query: Record<string, unknown>, data: any) => {
			return this.wrap(async () => {
				const table = this.getTable(collection);
				const where = this.mapQuery(table, query);
				const [existing] = await this.db!.select().from(table).where(where).limit(1);

				if (existing) {
					const [updated] = await this.db!.update(table)
						.set({ ...data, updatedAt: new Date() })
						.where(where)
						.returning();
					return updated;
				} else {
					const formattedData = {
						_id: data._id || utils.generateId(),
						...data,
						createdAt: new Date(),
						updatedAt: new Date()
					};
					const [inserted] = await this.db!.insert(table).values(formattedData).returning();
					return inserted;
				}
			}, 'CRUD_UPSERT_FAILED');
		},
		findMany: async (collection: string, query: Record<string, unknown>, options?: { limit?: number; offset?: number; sort?: any }) => {
			return this.wrap(async () => {
				const table = this.getTable(collection);
				const where = this.mapQuery(table, query);
				let qb = this.db!.select().from(table).where(where);

				if (options?.limit) {
					// @ts-expect-error - Drizzle types
					qb = qb.limit(options.limit);
				}
				if (options?.offset) {
					// @ts-expect-error - Drizzle types
					qb = qb.offset(options.offset);
				}

				const result = await qb;
				return result;
			}, 'CRUD_FIND_MANY_FAILED');
		},
		count: async (collection: string, query?: Record<string, unknown>) => {
			return this.wrap(async () => {
				// DEBUG: Verify method call
				console.log(`[PostgreSQLAdapter] crud.count called for ${collection}`, query);
				const { sql } = await import('drizzle-orm');
				const table = this.getTable(collection);
				const where = query ? this.mapQuery(table, query) : undefined;
				const queryBuilder = this.db!.select({ count: sql<number>`count(*)` }).from(table);
				if (where) queryBuilder.where(where);
				const [result] = await queryBuilder;
				return Number(result.count);
			}, 'CRUD_COUNT_FAILED');
		}
	};

	/**
	 * Maps a raw PostgreSQL user row to include `role` (string) derived from `roleIds` (array).
	 * This ensures compatibility with the middleware permission checks that expect `user.role`.
	 */
	private mapUser(dbUser: any): any {
		if (!dbUser) return null;
		// Handle roleIds - ensure it is an array
		let roleIds = dbUser.roleIds;
		if (typeof roleIds === 'string') {
			try {
				roleIds = JSON.parse(roleIds);
			} catch {
				roleIds = [];
			}
		}
		const finalRoleIds = Array.isArray(roleIds) ? roleIds : [];
		return {
			...dbUser,
			roleIds: finalRoleIds,
			role: finalRoleIds.length > 0 ? finalRoleIds[0] : 'user',
			permissions: dbUser.permissions || []
		};
	}

	public readonly auth = {
		setupAuthModels: async () => {
			await this.ensureSystem();
			logger.debug('Auth models setup verified');
		},
		// --- DIRECT METHODS (Required by IAuthAdapter) ---
		getUserCount: async (filter?: Record<string, unknown>) => {
			return this.wrap(async () => {
				const { sql } = await import('drizzle-orm');
				const where = filter ? this.mapQuery(schema.authUsers, filter) : undefined;
				const queryBuilder = this.db!.select({ count: sql<number>`count(*)` }).from(schema.authUsers);
				if (where) queryBuilder.where(where);
				const [result] = await queryBuilder;
				return Number(result.count);
			}, 'AUTH_GET_USER_COUNT_FAILED');
		},
		validateSession: async (session_id: string) => {
			return this.wrap(async () => {
				const { eq, and, gt } = await import('drizzle-orm');
				const [result] = await this.db!.select({
					user: schema.authUsers
				})
					.from(schema.authSessions)
					.innerJoin(schema.authUsers, eq(schema.authSessions.user_id, schema.authUsers._id))
					.where(and(eq(schema.authSessions._id, session_id), gt(schema.authSessions.expires, new Date())))
					.limit(1);

				return result?.user ? this.mapUser(result.user) : null;
			}, 'AUTH_VALIDATE_SESSION_FAILED');
		},
		deleteSession: async (session_id: string) => {
			return this.wrap(async () => {
				const { eq } = await import('drizzle-orm');
				await this.db!.delete(schema.authSessions).where(eq(schema.authSessions._id, session_id));
			}, 'AUTH_DELETE_SESSION_FAILED');
		},
		user: {
			getUserById: async (user_id: string, tenantId?: string) => {
				return this.wrap(async () => {
					const { eq, and } = await import('drizzle-orm');
					const conditions = [eq(schema.authUsers._id, user_id)];
					if (tenantId) {
						conditions.push(eq(schema.authUsers.tenantId, tenantId));
					}
					const [user] = await this.db!.select()
						.from(schema.authUsers)
						.where(and(...conditions))
						.limit(1);
					return user || null;
				}, 'AUTH_GET_USER_BY_ID_FAILED');
			},
			findOne: async (_filter: Record<string, unknown>) => this.notImplemented('auth.user.findOne'),
			findMany: async (_filter?: Record<string, unknown>) => this.notImplemented('auth.user.findMany'),
			create: async (_data: unknown) => this.notImplemented('auth.user.create'),
			update: async (_filter: Record<string, unknown>, _data: unknown) => this.notImplemented('auth.user.update'),
			delete: async (_filter: Record<string, unknown>) => this.notImplemented('auth.user.delete'),
			count: async (_filter?: Record<string, unknown>) => this.notImplemented('auth.user.count')
		},
		getUserByEmail: async (criteria: { email: string; tenantId?: string }) => {
			return this.wrap(async () => {
				await this.ensureSystem();
				const { eq, and } = await import('drizzle-orm');
				const conditions = [eq(schema.authUsers.email, criteria.email)];
				if (criteria.tenantId) {
					conditions.push(eq(schema.authUsers.tenantId, criteria.tenantId));
				}
				const [user] = await this.db!.select()
					.from(schema.authUsers)
					.where(and(...conditions))
					.limit(1);
				return this.mapUser(user) || null;
			}, 'AUTH_GET_USER_BY_EMAIL_FAILED');
		},
		createUser: async (userData: any) => {
			return this.wrap(async () => {
				await this.ensureSystem();

				// Ensure password is hashed if provided and not already hashed
				let password = userData.password;
				if (password && !password.startsWith('$argon2')) {
					const argon2 = await import('argon2');
					password = await argon2.hash(password);
				}

				// Map legacy 'role' string to 'roleIds' array if roleIds is missing/empty
				const roleIds = userData.roleIds?.length ? userData.roleIds : userData.role ? [userData.role] : [];

				const formattedUser = {
					_id: userData._id || utils.generateId(),
					...userData,
					password,
					roleIds,
					createdAt: new Date(),
					updatedAt: new Date()
				};
				const [user] = await this.db!.insert(schema.authUsers).values(formattedUser).returning();
				return this.mapUser(user);
			}, 'AUTH_CREATE_USER_FAILED');
		},
		updateUserAttributes: async (user_id: string, userData: any, tenantId?: string) => {
			return this.wrap(async () => {
				await this.ensureSystem();
				const { eq, and } = await import('drizzle-orm');
				const conditions = [eq(schema.authUsers._id, user_id)];
				if (tenantId) conditions.push(eq(schema.authUsers.tenantId, tenantId));

				const [updatedUser] = await this.db!.update(schema.authUsers)
					.set({ ...userData, updatedAt: new Date() })
					.where(and(...conditions))
					.returning();
				return updatedUser;
			}, 'AUTH_UPDATE_USER_FAILED');
		},
		createSession: async (sessionData: { user_id: string; expires: string; tenantId?: string }) => {
			return this.wrap(async () => {
				await this.ensureSystem();
				const newSession = {
					_id: utils.generateId(),
					user_id: sessionData.user_id,
					expires: new Date(sessionData.expires),
					tenantId: sessionData.tenantId,
					createdAt: new Date(),
					updatedAt: new Date()
				};
				const [session] = await this.db!.insert(schema.authSessions).values(newSession).returning();
				return session;
			}, 'AUTH_CREATE_SESSION_FAILED');
		},
		createUserAndSession: async (userData: any, sessionData: { expires: string; tenantId?: string }) => {
			return this.wrap(async () => {
				await this.ensureSystem();
				const userId = userData._id || utils.generateId();

				// Ensure password is hashed if provided and not already hashed
				let password = userData.password;
				if (password && !password.startsWith('$argon2')) {
					const argon2 = await import('argon2');
					password = await argon2.hash(password);
				}

				// Map legacy 'role' string to 'roleIds' array if roleIds is missing/empty
				const roleIds = userData.roleIds?.length ? userData.roleIds : userData.role ? [userData.role] : [];

				const formattedUser = {
					...userData,
					_id: userId,
					password,
					roleIds,
					createdAt: new Date(),
					updatedAt: new Date()
				};

				const formattedSession = {
					_id: utils.generateId(),
					user_id: userId,
					expires: new Date(sessionData.expires),
					tenantId: sessionData.tenantId,
					createdAt: new Date(),
					updatedAt: new Date()
				};

				// Run in parallel for now, better in transaction later
				const [user] = await this.db!.insert(schema.authUsers).values(formattedUser).returning();
				const [session] = await this.db!.insert(schema.authSessions).values(formattedSession).returning();

				return { user, session };
			}, 'AUTH_CREATE_USER_AND_SESSION_FAILED');
		},
		getUserById: async (user_id: string, tenantId?: string) => {
			return this.wrap(async () => {
				await this.ensureSystem();
				const { eq, and } = await import('drizzle-orm');
				const conditions = [eq(schema.authUsers._id, user_id)];
				if (tenantId) {
					conditions.push(eq(schema.authUsers.tenantId, tenantId));
				}
				const [user] = await this.db!.select()
					.from(schema.authUsers)
					.where(and(...conditions))
					.limit(1);
				return this.mapUser(user) || null;
			}, 'AUTH_GET_USER_BY_ID_FAILED');
		},
		getAllUsers: async (options?: { limit?: number; offset?: number }) => {
			return this.wrap(async () => {
				await this.ensureSystem();
				const { desc } = await import('drizzle-orm');
				let query = this.db!.select().from(schema.authUsers).orderBy(desc(schema.authUsers.createdAt));

				if (options?.limit) {
					// @ts-expect-error - Drizzle types
					query = query.limit(options.limit);
				}
				if (options?.offset) {
					// @ts-expect-error - Drizzle types
					query = query.offset(options.offset);
				}

				const users = await query;
				return users.map((u: any) => this.mapUser(u));
			}, 'AUTH_GET_ALL_USERS_FAILED');
		},
		getAllRoles: async (tenantId?: string) => {
			// This returns raw array, not DatabaseResult, as per interface
			try {
				await this.ensureSystem();
				const { eq } = await import('drizzle-orm');
				let query = this.db!.select().from(schema.roles);

				if (tenantId) {
					// @ts-expect-error - Drizzle types
					query = query.where(eq(schema.roles.tenantId, tenantId));
				}

				return await query;
			} catch (err) {
				logger.error('AUTH_GET_ALL_ROLES_FAILED', err);
				return [];
			}
		},
		session: {
			validateSession: async (session_id: string) => {
				return this.wrap(async () => {
					const { eq, and, gt } = await import('drizzle-orm');
					const [result] = await this.db!.select({
						user: schema.authUsers
					})
						.from(schema.authSessions)
						.innerJoin(schema.authUsers, eq(schema.authSessions.user_id, schema.authUsers._id))
						.where(and(eq(schema.authSessions._id, session_id), gt(schema.authSessions.expires, new Date())))
						.limit(1);

					return result?.user || null;
				}, 'AUTH_VALIDATE_SESSION_FAILED');
			},
			deleteSession: async (session_id: string) => {
				return this.wrap(async () => {
					const { eq } = await import('drizzle-orm');
					await this.db!.delete(schema.authSessions).where(eq(schema.authSessions._id, session_id));
				}, 'AUTH_DELETE_SESSION_FAILED');
			},
			findOne: async (_filter: Record<string, unknown>) => this.notImplemented('auth.session.findOne'),
			create: async (_data: unknown) => this.notImplemented('auth.session.create'),
			delete: async (_filter: Record<string, unknown>) => this.notImplemented('auth.session.delete'),
			deleteMany: async (_filter: Record<string, unknown>) => this.notImplemented('auth.session.deleteMany'),
			deleteExpired: async () => this.notImplemented('auth.session.deleteExpired')
		},
		token: {
			findOne: async (_filter: Record<string, unknown>) => this.notImplemented('auth.token.findOne'),
			create: async (_data: unknown) => this.notImplemented('auth.token.create'),
			update: async (_filter: Record<string, unknown>, _data: unknown) => this.notImplemented('auth.token.update'),
			delete: async (_filter: Record<string, unknown>) => this.notImplemented('auth.token.delete'),
			deleteExpired: async () => this.notImplemented('auth.token.deleteExpired')
		},
		role: {
			findOne: async (_filter: Record<string, unknown>) => this.notImplemented('auth.role.findOne'),
			findMany: async (_filter?: Record<string, unknown>) => this.notImplemented('auth.role.findMany'),
			create: async (_data: unknown) => this.notImplemented('auth.role.create'),
			update: async (_filter: Record<string, unknown>, _data: unknown) => this.notImplemented('auth.role.update'),
			delete: async (_filter: Record<string, unknown>) => this.notImplemented('auth.role.delete'),
			count: async (_filter?: Record<string, unknown>) => this.notImplemented('auth.role.count'),
			ensure: async (_role: unknown) => this.notImplemented('auth.role.ensure')
		},
		createRole: async (role: any) => {
			return this.wrap(async () => {
				await this.ensureSystem();
				const formattedRole = {
					...role,
					_id: role._id || utils.generateId(),
					permissions: Array.isArray(role.permissions) ? role.permissions : [],
					createdAt: role.createdAt ? new Date(role.createdAt) : new Date(),
					updatedAt: role.updatedAt ? new Date(role.updatedAt) : new Date()
				};
				const result = await this.db!.insert(schema.roles).values(formattedRole).returning();
				return result[0];
			}, 'AUTH_CREATE_ROLE_FAILED');
		}
	};

	public readonly media = {
		setupMediaModels: async () => {
			await this.ensureSystem();
			logger.debug('Media models setup verified');
		},
		findOne: async (_filter: Record<string, unknown>) => this.notImplemented('media.findOne'),
		findMany: async (_filter?: Record<string, unknown>, _options?: unknown) => this.notImplemented('media.findMany'),
		create: async (_data: unknown) => this.notImplemented('media.create'),
		update: async (_filter: Record<string, unknown>, _data: unknown) => this.notImplemented('media.update'),
		delete: async (_filter: Record<string, unknown>) => this.notImplemented('media.delete'),
		count: async (_filter?: Record<string, unknown>) => this.notImplemented('media.count')
	};

	public readonly systemPreferences = {
		get: async (_key: string) => this.notImplemented('systemPreferences.get'),
		set: async (key: string, value: unknown) => {
			return this.wrap(async () => {
				await this.ensureSystem();
				const { eq } = await import('drizzle-orm');
				const [existing] = await this.db!.select().from(schema.systemPreferences).where(eq(schema.systemPreferences.key, key)).limit(1);

				if (existing) {
					await this.db!.update(schema.systemPreferences).set({ value: value, updatedAt: new Date() }).where(eq(schema.systemPreferences.key, key));
				} else {
					await this.db!.insert(schema.systemPreferences).values({
						_id: utils.generateId(),
						key,
						value,
						createdAt: new Date(),
						updatedAt: new Date()
					});
				}
			}, 'SYSTEM_PREFERENCES_SET_FAILED');
		},
		delete: async (_key: string) => this.notImplemented('systemPreferences.delete'),
		getAll: async () => this.notImplemented('systemPreferences.getAll'),
		getMany: async (keys: string[]) => {
			return this.wrap(async () => {
				const { inArray } = await import('drizzle-orm');
				const results = await this.db!.select().from(schema.systemPreferences).where(inArray(schema.systemPreferences.key, keys));
				const data: Record<string, any> = {};
				results.forEach((r) => (data[r.key] = r.value));
				return data;
			}, 'SYSTEM_PREFERENCES_GET_MANY_FAILED');
		},
		setMany: async (preferences: any[]) => {
			return this.wrap(async () => {
				await this.ensureSystem();
				for (const pref of preferences) {
					// Filter out extra fields like 'category' that aren't in the schema
					const { category: _category, ...rest } = pref;
					await this.db!.insert(schema.systemPreferences)
						.values({
							_id: pref._id || utils.generateId(),
							...rest,
							createdAt: pref.createdAt ? new Date(pref.createdAt) : new Date(),
							updatedAt: pref.updatedAt ? new Date(pref.updatedAt) : new Date()
						})
						.onConflictDoUpdate({
							target: [schema.systemPreferences.key, schema.systemPreferences.tenantId],
							set: { value: pref.value, updatedAt: new Date() }
						});
				}
			}, 'SYSTEM_PREFERENCES_SET_MANY_FAILED');
		}
	};

	public readonly systemVirtualFolder = {
		findOne: async (_filter: Record<string, unknown>) => this.notImplemented('systemVirtualFolder.findOne'),
		findMany: async (_filter?: Record<string, unknown>) => this.notImplemented('systemVirtualFolder.findMany'),
		create: async (_data: unknown) => this.notImplemented('systemVirtualFolder.create'),
		update: async (_filter: Record<string, unknown>, _data: unknown) => this.notImplemented('systemVirtualFolder.update'),
		delete: async (_filter: Record<string, unknown>) => this.notImplemented('systemVirtualFolder.delete'),
		ensure: async (folder: any) => {
			return this.wrap(async () => {
				await this.ensureSystem();
				const { eq } = await import('drizzle-orm');
				const [existing] = await this.db!.select()
					.from(schema.systemVirtualFolders)
					.where(eq(schema.systemVirtualFolders.path, folder.path))
					.limit(1);

				if (existing) return existing;

				const formattedFolder = {
					...folder,
					_id: folder._id || utils.generateId(),
					createdAt: new Date(),
					updatedAt: new Date()
				};
				const [inserted] = await this.db!.insert(schema.systemVirtualFolders).values(formattedFolder).returning();
				return inserted;
			}, 'SYSTEM_VIRTUAL_FOLDER_ENSURE_FAILED');
		}
	};

	public readonly themes = {
		setupThemeModels: async () => {
			await this.ensureSystem();
			logger.debug('Theme models setup verified');
		},
		findOne: async (_filter: Record<string, unknown>) => this.notImplemented('themes.findOne'),
		findMany: async (_filter?: Record<string, unknown>) => this.notImplemented('themes.findMany'),
		create: async (_data: unknown) => this.notImplemented('themes.create'),
		update: async (_filter: Record<string, unknown>, _data: unknown) => this.notImplemented('themes.update'),
		delete: async (_filter: Record<string, unknown>) => this.notImplemented('themes.delete'),
		ensure: async (theme: any) => {
			return this.wrap(async () => {
				await this.ensureSystem();
				const { eq } = await import('drizzle-orm');
				const [existing] = await this.db!.select().from(schema.themes).where(eq(schema.themes.name, theme.name)).limit(1);
				if (existing) return existing;

				const formattedTheme = {
					...theme,
					_id: theme._id || utils.generateId(),
					createdAt: new Date(),
					updatedAt: new Date()
				};
				const [inserted] = await this.db!.insert(schema.themes).values(formattedTheme).returning();
				return inserted;
			}, 'THEMES_ENSURE_FAILED');
		},
		getAllThemes: async () => {
			return this.wrap(async () => {
				return await this.db!.select().from(schema.themes);
			}, 'THEMES_GET_ALL_FAILED');
		},
		storeThemes: async (themes: any[]) => {
			return this.wrap(async () => {
				const formattedThemes = themes.map((t) => ({
					...t,
					_id: t._id || utils.generateId(),
					createdAt: t.createdAt ? new Date(t.createdAt) : new Date(),
					updatedAt: t.updatedAt ? new Date(t.updatedAt) : new Date()
				}));
				await this.db!.insert(schema.themes).values(formattedThemes).onConflictDoNothing();
			}, 'THEMES_STORE_FAILED');
		}
	};

	public readonly widgets = {
		setupWidgetModels: async () => {
			await this.ensureSystem();
			logger.debug('Widget models setup verified');
		},
		findOne: async (_filter: Record<string, unknown>) => this.notImplemented('widgets.findOne'),
		findMany: async (_filter?: Record<string, unknown>) => this.notImplemented('widgets.findMany'),
		create: async (_data: unknown) => this.notImplemented('widgets.create'),
		update: async (_filter: Record<string, unknown>, _data: unknown) => this.notImplemented('widgets.update'),
		delete: async (_filter: Record<string, unknown>) => this.notImplemented('widgets.delete'),
		ensure: async (widget: any) => {
			return this.wrap(async () => {
				await this.ensureSystem();
				const { eq } = await import('drizzle-orm');
				const [existing] = await this.db!.select().from(schema.widgets).where(eq(schema.widgets.name, widget.name)).limit(1);
				if (existing) return existing;

				const formattedWidget = {
					...widget,
					_id: widget._id || utils.generateId(),
					createdAt: new Date(),
					updatedAt: new Date()
				};
				const [inserted] = await this.db!.insert(schema.widgets).values(formattedWidget).returning();
				return inserted;
			}, 'WIDGETS_ENSURE_FAILED');
		}
	};

	public readonly websiteTokens = {
		findOne: async (_filter: Record<string, unknown>) => this.notImplemented('websiteTokens.findOne'),
		findMany: async (_filter?: Record<string, unknown>) => this.notImplemented('websiteTokens.findMany'),
		create: async (_data: unknown) => this.notImplemented('websiteTokens.create'),
		delete: async (_filter: Record<string, unknown>) => this.notImplemented('websiteTokens.delete')
	};

	public readonly batch = {
		insert: async (_collection: string, _documents: unknown[]) => this.notImplemented('batch.insert'),
		update: async (_collection: string, _operations: unknown[]) => this.notImplemented('batch.update'),
		delete: async (_collection: string, _filters: unknown[]) => this.notImplemented('batch.delete')
	};

	public readonly performance = {
		getMetrics: async () => this.notImplemented('performance.getMetrics'),
		resetMetrics: async () => this.notImplemented('performance.resetMetrics')
	};

	public readonly cache = {
		get: async (_key: string) => this.notImplemented('cache.get'),
		set: async (_key: string, _value: unknown, _ttl?: number) => this.notImplemented('cache.set'),
		delete: async (_key: string) => this.notImplemented('cache.delete'),
		clear: async () => this.notImplemented('cache.clear')
	};

	public readonly content = {
		nodes: {
			getStructure: async (mode: 'flat' | 'nested', options?: { tenantId?: string }) => {
				return this.wrap(async () => {
					await this.ensureSystem();
					const { eq, asc } = await import('drizzle-orm');
					let query = this.db!.select().from(schema.contentNodes);

					if (options?.tenantId) {
						// @ts-expect-error - Drizzle types
						query = query.where(eq(schema.contentNodes.tenantId, options.tenantId));
					}

					// Apply ordering
					// @ts-expect-error - Drizzle types
					query = query.orderBy(asc(schema.contentNodes.order));

					const nodes = await query;

					// Transform for ContentManager (map type -> nodeType)
					const mappedNodes = nodes.map((node) => ({
						...node,
						nodeType: node.type
					}));

					if (mode === 'nested') {
						const idMap = new Map();
						mappedNodes.forEach((n: any) => idMap.set(n._id, { ...n, children: [] }));
						const rootNodes: any[] = [];
						idMap.forEach((n: any) => {
							if (n.parentId && idMap.has(n.parentId)) {
								idMap.get(n.parentId)!.children!.push(n);
							} else {
								rootNodes.push(n);
							}
						});
						return rootNodes;
					}

					return mappedNodes;
				}, 'CONTENT_NODES_GET_STRUCTURE_FAILED');
			},
			createMany: async (nodes: any[]) => {
				return this.wrap(async () => {
					await this.ensureSystem();
					if (!nodes.length) return [];

					const formattedNodes = nodes.map((node) => ({
						_id: node._id || utils.generateId(),
						path: node.path,
						parentId: node.parentId,
						type: node.nodeType || node.type || 'unknown',
						title: node.name || node.title,
						order: node.order || 0,
						status: node.status || 'draft',
						isPublished: !!node.isPublished,
						tenantId: node.tenantId,
						data: node.data,
						metadata: node.metadata,
						createdAt: node.createdAt ? new Date(node.createdAt) : new Date(),
						updatedAt: node.updatedAt ? new Date(node.updatedAt) : new Date()
					}));

					// Use onConflictDoUpdate to handle upserts
					await this.db!.insert(schema.contentNodes)
						.values(formattedNodes)
						.onConflictDoUpdate({
							target: schema.contentNodes._id,
							set: {
								path: sql.raw('excluded.path'),
								parentId: sql.raw('excluded."parentId"'),
								type: sql.raw('excluded."type"'),
								title: sql.raw('excluded.title'),
								order: sql.raw('excluded."order"'),
								updatedAt: new Date()
							}
						});

					return formattedNodes;
				}, 'CONTENT_NODES_CREATE_MANY_FAILED');
			},
			bulkUpdate: async (updates: { path: string; changes: any }[]) => {
				return this.wrap(async () => {
					const { eq } = await import('drizzle-orm');

					for (const update of updates) {
						// Map changes fields if necessary
						// Map changes fields if necessary
						const changes = { ...update.changes };

						if (changes.nodeType) {
							changes.type = changes.nodeType;
							delete changes.nodeType;
						}

						// FIX: Remove _id from changes to avoid PK update issues
						delete changes._id;

						// FIX: Handle empty strings for nullable fields - more robust check
						if (!changes.parentId || changes.parentId === '' || changes.parentId === 'null') {
							changes.parentId = null;
						}

						// FIX: Convert date strings to Date objects
						if (changes.createdAt && typeof changes.createdAt === 'string') changes.createdAt = new Date(changes.createdAt);
						if (changes.updatedAt && typeof changes.updatedAt === 'string') changes.updatedAt = new Date(changes.updatedAt);
						if (changes.publishedAt && typeof changes.publishedAt === 'string') changes.publishedAt = new Date(changes.publishedAt);

						await this.db!.update(schema.contentNodes)
							.set({ ...changes, updatedAt: new Date() })
							.where(eq(schema.contentNodes.path, update.path));
					}
				}, 'CONTENT_NODES_BULK_UPDATE_FAILED');
			},
			deleteMany: async (pathsOrIds: string[]) => {
				return this.wrap(async () => {
					await this.ensureSystem();
					const { inArray, or } = await import('drizzle-orm');
					await this.db!.delete(schema.contentNodes).where(
						or(inArray(schema.contentNodes.path, pathsOrIds), inArray(schema.contentNodes._id, pathsOrIds))
					);
				}, 'CONTENT_NODES_DELETE_MANY_FAILED');
			}
		},
		findOne: async (_collection: string, _filter: Record<string, unknown>) => this.notImplemented('content.findOne'),
		findMany: async (_collection: string, _filter?: Record<string, unknown>, _options?: unknown) => this.notImplemented('content.findMany'),
		create: async (_collection: string, _data: unknown) => this.notImplemented('content.create'),
		update: async (_collection: string, _filter: Record<string, unknown>, _data: unknown) => this.notImplemented('content.update'),
		delete: async (_collection: string, _filter: Record<string, unknown>) => this.notImplemented('content.delete'),
		count: async (_collection: string, _filter?: Record<string, unknown>) => this.notImplemented('content.count'),

		// Stub for collection management within content module (if needed) or can be delegated to collection module
		list: async () => this.notImplemented('content.collection.list'),
		exists: async (_name: string) => this.notImplemented('content.collection.exists'),
		createCollection: async (_name: string, _options?: unknown) => this.notImplemented('content.collection.create'),
		dropCollection: async (_name: string) => this.notImplemented('content.collection.drop'),
		createModel: async (_schema: any) => {
			logger.info(`Collection model creation requested for ${_schema.name} (BETA - skipping actual table creation)`);
		}
	};

	public readonly collection = {
		list: async () => this.notImplemented('collection.list'),
		exists: async (_name: string) => this.notImplemented('collection.exists'),
		create: async (_name: string, _options?: unknown) => this.notImplemented('collection.create'),
		drop: async (_name: string) => this.notImplemented('collection.drop'),
		createModel: async (_schema: any) => {
			// Proxy to content module
			return this.content.createModel(_schema);
		}
	};

	public readonly utils = utils;

	constructor() {
		super();
	}

	public queryBuilder = <T extends BaseEntity>(_collection: string): QueryBuilder<T> => {
		// Return a stub query builder for now - cast through unknown since this is a beta stub
		return {
			where: () => this.queryBuilder(_collection),
			orderBy: () => this.queryBuilder(_collection),
			limit: () => this.queryBuilder(_collection),
			offset: () => this.queryBuilder(_collection),
			select: () => this.queryBuilder(_collection),
			execute: async () => ({ success: false, message: 'QueryBuilder not yet implemented for PostgreSQL' })
		} as unknown as QueryBuilder<T>;
	};

	public transaction = async <T>(
		_fn: (transaction: unknown) => Promise<DatabaseResult<T>>,
		_options?: { isolationLevel?: 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE' }
	): Promise<DatabaseResult<T>> => {
		return this.notImplemented('transaction');
	};

	// Global CRUD data methods
	getCollectionData = async (
		_collection: string,
		_options?: { limit?: number; offset?: number; includeMetadata?: boolean; fields?: string[] }
	): Promise<DatabaseResult<{ data: unknown[]; metadata?: { totalCount: number; schema?: unknown; indexes?: string[] } }>> => {
		return this.notImplemented('getCollectionData');
	};

	getMultipleCollectionData = async (
		_collectionNames: string[],
		_options?: { limit?: number; fields?: string[] }
	): Promise<DatabaseResult<Record<string, unknown[]>>> => {
		return this.notImplemented('getMultipleCollectionData');
	};
}

export * from './adapterCore';
