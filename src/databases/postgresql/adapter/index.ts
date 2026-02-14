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
		},
		findByIds: async (collection: string, ids: string[], _options?: { fields?: string[] }) => {
			return this.wrap(async () => {
				const { inArray } = await import('drizzle-orm');
				const table = this.getTable(collection);
				const results = await this.db!.select().from(table).where(inArray(table._id, ids));
				return results;
			}, 'CRUD_FIND_BY_IDS_FAILED');
		}
	};

	/**
	 * Maps a raw PostgreSQL user row to include `role` (string) derived from `roleIds` (array).
	 * This ensures compatibility with the middleware permission checks that expect `user.role`.
	 */
	private mapUser(dbUser: any): any {
		if (!dbUser) return null;
		const user = utils.convertDatesToISO(dbUser);
		const finalRoleIds = utils.parseJsonField<string[]>(user.roleIds, []);
		return {
			...user,
			roleIds: finalRoleIds,
			role: finalRoleIds.length > 0 ? finalRoleIds[0] : 'user',
			permissions: utils.parseJsonField<string[]>(user.permissions, [])
		};
	}

	/**
	 * Maps a raw PostgreSQL role row to ensure permissions is a parsed array.
	 */
	private mapRole(dbRole: any): any {
		if (!dbRole) return null;
		const role = utils.convertDatesToISO(dbRole);
		return {
			...role,
			permissions: utils.parseJsonField<string[]>(role.permissions, [])
		};
	}

	/**
	 * Maps a raw PostgreSQL website token row to ensure permissions is a parsed array.
	 */
	private mapWebsiteToken(dbToken: any): any {
		if (!dbToken) return null;
		const token = utils.convertDatesToISO(dbToken);
		return {
			...token,
			permissions: utils.parseJsonField<string[]>(token.permissions, [])
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
			findOne: async (filter: Record<string, unknown>) => {
				return this.wrap(async () => {
					const where = this.mapQuery(schema.authUsers, filter);
					const [user] = await this.db!.select().from(schema.authUsers).where(where).limit(1);
					return user ? this.mapUser(user) : null;
				}, 'AUTH_USER_FIND_ONE_FAILED');
			},
			findMany: async (filter?: Record<string, unknown>) => {
				return this.wrap(async () => {
					const where = filter ? this.mapQuery(schema.authUsers, filter) : undefined;
					const query = this.db!.select().from(schema.authUsers);
					if (where) query.where(where);
					const users = await query;
					return users.map((u: any) => this.mapUser(u));
				}, 'AUTH_USER_FIND_MANY_FAILED');
			},
			create: async (data: any) => {
				return this.wrap(async () => {
					let password = data.password;
					if (password && !password.startsWith('$argon2')) {
						const argon2 = await import('argon2');
						password = await argon2.hash(password);
					}
					const roleIds = data.roleIds?.length ? data.roleIds : data.role ? [data.role] : [];
					const formattedUser = {
						_id: data._id || utils.generateId(),
						...data,
						password,
						roleIds,
						createdAt: new Date(),
						updatedAt: new Date()
					};
					const [user] = await this.db!.insert(schema.authUsers).values(formattedUser).returning();
					return this.mapUser(user);
				}, 'AUTH_USER_CREATE_FAILED');
			},
			update: async (filter: Record<string, unknown>, data: any) => {
				return this.wrap(async () => {
					const where = this.mapQuery(schema.authUsers, filter);
					const [updated] = await this.db!.update(schema.authUsers)
						.set({ ...data, updatedAt: new Date() })
						.where(where)
						.returning();
					return updated ? this.mapUser(updated) : null;
				}, 'AUTH_USER_UPDATE_FAILED');
			},
			delete: async (filter: Record<string, unknown>) => {
				return this.wrap(async () => {
					const where = this.mapQuery(schema.authUsers, filter);
					await this.db!.delete(schema.authUsers).where(where);
				}, 'AUTH_USER_DELETE_FAILED');
			},
			count: async (filter?: Record<string, unknown>) => {
				return this.wrap(async () => {
					const { sql } = await import('drizzle-orm');
					const where = filter ? this.mapQuery(schema.authUsers, filter) : undefined;
					const query = this.db!.select({ count: sql<number>`count(*)` }).from(schema.authUsers);
					if (where) query.where(where);
					const [result] = await query;
					return Number(result.count);
				}, 'AUTH_USER_COUNT_FAILED');
			}
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

				const results = await query;
				return results.map((r: any) => this.mapRole(r));
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
			findOne: async (filter: Record<string, unknown>) => {
				return this.wrap(async () => {
					const where = this.mapQuery(schema.authSessions, filter);
					const [result] = await this.db!.select().from(schema.authSessions).where(where).limit(1);
					return result || null;
				}, 'AUTH_SESSION_FIND_ONE_FAILED');
			},
			create: async (data: any) => {
				return this.wrap(async () => {
					const formattedData = {
						_id: data._id || utils.generateId(),
						...data,
						expires: data.expires ? new Date(data.expires) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
						createdAt: new Date(),
						updatedAt: new Date()
					};
					const [result] = await this.db!.insert(schema.authSessions).values(formattedData).returning();
					return result;
				}, 'AUTH_SESSION_CREATE_FAILED');
			},
			delete: async (filter: Record<string, unknown>) => {
				return this.wrap(async () => {
					const where = this.mapQuery(schema.authSessions, filter);
					await this.db!.delete(schema.authSessions).where(where);
				}, 'AUTH_SESSION_DELETE_FAILED');
			},
			deleteMany: async (filter: Record<string, unknown>) => {
				return this.wrap(async () => {
					const where = this.mapQuery(schema.authSessions, filter);
					const result = await this.db!.delete(schema.authSessions).where(where).returning();
					return { deletedCount: result.length };
				}, 'AUTH_SESSION_DELETE_MANY_FAILED');
			},
			deleteExpired: async () => {
				return this.wrap(async () => {
					const { lt } = await import('drizzle-orm');
					const result = await this.db!.delete(schema.authSessions).where(lt(schema.authSessions.expires, new Date())).returning();
					return { deletedCount: result.length };
				}, 'AUTH_SESSION_DELETE_EXPIRED_FAILED');
			}
		},
		token: {
			findOne: async (filter: Record<string, unknown>) => {
				return this.wrap(async () => {
					const where = this.mapQuery(schema.authTokens, filter);
					const [result] = await this.db!.select().from(schema.authTokens).where(where).limit(1);
					return result || null;
				}, 'AUTH_TOKEN_FIND_ONE_FAILED');
			},
			create: async (data: any) => {
				return this.wrap(async () => {
					const formattedData = {
						_id: data._id || utils.generateId(),
						...data,
						expires: data.expires ? new Date(data.expires) : new Date(Date.now() + 24 * 60 * 60 * 1000),
						createdAt: new Date(),
						updatedAt: new Date()
					};
					const [result] = await this.db!.insert(schema.authTokens).values(formattedData).returning();
					return result;
				}, 'AUTH_TOKEN_CREATE_FAILED');
			},
			update: async (filter: Record<string, unknown>, data: any) => {
				return this.wrap(async () => {
					const where = this.mapQuery(schema.authTokens, filter);
					const [result] = await this.db!.update(schema.authTokens)
						.set({ ...data, updatedAt: new Date() })
						.where(where)
						.returning();
					return result;
				}, 'AUTH_TOKEN_UPDATE_FAILED');
			},
			delete: async (filter: Record<string, unknown>) => {
				return this.wrap(async () => {
					const where = this.mapQuery(schema.authTokens, filter);
					await this.db!.delete(schema.authTokens).where(where);
				}, 'AUTH_TOKEN_DELETE_FAILED');
			},
			deleteExpired: async () => {
				return this.wrap(async () => {
					const { lt } = await import('drizzle-orm');
					const result = await this.db!.delete(schema.authTokens).where(lt(schema.authTokens.expires, new Date())).returning();
					return { deletedCount: result.length };
				}, 'AUTH_TOKEN_DELETE_EXPIRED_FAILED');
			}
		},
		role: {
			findOne: async (filter: Record<string, unknown>) => {
				return this.wrap(async () => {
					const where = this.mapQuery(schema.roles, filter);
					const [result] = await this.db!.select().from(schema.roles).where(where).limit(1);
					return result ? this.mapRole(result) : null;
				}, 'AUTH_ROLE_FIND_ONE_FAILED');
			},
			findMany: async (filter?: Record<string, unknown>) => {
				return this.wrap(async () => {
					const where = filter ? this.mapQuery(schema.roles, filter) : undefined;
					const query = this.db!.select().from(schema.roles);
					if (where) query.where(where);
					const results = await query;
					return results.map((r: any) => this.mapRole(r));
				}, 'AUTH_ROLE_FIND_MANY_FAILED');
			},
			create: async (data: any) => {
				return this.wrap(async () => {
					const formattedData = {
						_id: data._id || utils.generateId(),
						...data,
						permissions: Array.isArray(data.permissions) ? data.permissions : [],
						createdAt: new Date(),
						updatedAt: new Date()
					};
					const [result] = await this.db!.insert(schema.roles).values(formattedData).returning();
					return this.mapRole(result);
				}, 'AUTH_ROLE_CREATE_FAILED');
			},
			update: async (filter: Record<string, unknown>, data: any) => {
				return this.wrap(async () => {
					const where = this.mapQuery(schema.roles, filter);
					const [result] = await this.db!.update(schema.roles)
						.set({ ...data, updatedAt: new Date() })
						.where(where)
						.returning();
					return result ? this.mapRole(result) : null;
				}, 'AUTH_ROLE_UPDATE_FAILED');
			},
			delete: async (filter: Record<string, unknown>) => {
				return this.wrap(async () => {
					const where = this.mapQuery(schema.roles, filter);
					await this.db!.delete(schema.roles).where(where);
				}, 'AUTH_ROLE_DELETE_FAILED');
			},
			count: async (filter?: Record<string, unknown>) => {
				return this.wrap(async () => {
					const { sql } = await import('drizzle-orm');
					const where = filter ? this.mapQuery(schema.roles, filter) : undefined;
					const query = this.db!.select({ count: sql<number>`count(*)` }).from(schema.roles);
					if (where) query.where(where);
					const [result] = await query;
					return Number(result.count);
				}, 'AUTH_ROLE_COUNT_FAILED');
			},
			ensure: async (role: any) => {
				return this.wrap(async () => {
					const { eq } = await import('drizzle-orm');
					const [existing] = await this.db!.select()
						.from(schema.roles)
						.where(eq(schema.roles.name, role.name || role._id))
						.limit(1);
					if (existing) return this.mapRole(existing);
					const formattedData = {
						_id: role._id || utils.generateId(),
						...role,
						permissions: Array.isArray(role.permissions) ? role.permissions : [],
						createdAt: new Date(),
						updatedAt: new Date()
					};
					const [result] = await this.db!.insert(schema.roles).values(formattedData).returning();
					return this.mapRole(result);
				}, 'AUTH_ROLE_ENSURE_FAILED');
			}
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
				return this.mapRole(result[0]);
			}, 'AUTH_CREATE_ROLE_FAILED');
		},
		// Top-level token methods used by API routes
		getAllTokens: async (filter?: Record<string, unknown>) => {
			return this.wrap(async () => {
				await this.ensureSystem();
				const { eq, and } = await import('drizzle-orm');
				const conditions: any[] = [];
				if (filter) {
					if (filter.email) conditions.push(eq(schema.authTokens.email, filter.email as string));
					if (filter.user_id) conditions.push(eq(schema.authTokens.user_id, filter.user_id as string));
					if (filter.type) conditions.push(eq(schema.authTokens.type, filter.type as string));
					if (filter.tenantId) conditions.push(eq(schema.authTokens.tenantId, filter.tenantId as string));
				}
				let query = this.db!.select().from(schema.authTokens);
				if (conditions.length > 0) {
					// @ts-expect-error - Drizzle types
					query = query.where(and(...conditions));
				}
				return await query;
			}, 'AUTH_GET_ALL_TOKENS_FAILED');
		},
		createToken: async (tokenData: any) => {
			return this.wrap(async () => {
				await this.ensureSystem();
				const crypto = await import('crypto');
				const tokenValue = tokenData.token || crypto.randomBytes(32).toString('hex');
				const formattedToken = {
					_id: tokenData._id || utils.generateId(),
					user_id: tokenData.user_id,
					email: tokenData.email,
					token: tokenValue,
					type: tokenData.type || 'invite',
					expires: tokenData.expires ? new Date(tokenData.expires) : new Date(Date.now() + 24 * 60 * 60 * 1000),
					consumed: false,
					role: tokenData.role,
					username: tokenData.username,
					tenantId: tokenData.tenantId,
					createdAt: new Date(),
					updatedAt: new Date()
				};
				await this.db!.insert(schema.authTokens).values(formattedToken);
				return tokenValue;
			}, 'AUTH_CREATE_TOKEN_FAILED');
		},
		getTokenByValue: async (tokenValue: string) => {
			return this.wrap(async () => {
				await this.ensureSystem();
				const { eq } = await import('drizzle-orm');
				const [result] = await this.db!.select().from(schema.authTokens).where(eq(schema.authTokens.token, tokenValue)).limit(1);
				return result || null;
			}, 'AUTH_GET_TOKEN_BY_VALUE_FAILED');
		},
		validateToken: async (tokenValue: string) => {
			return this.wrap(async () => {
				await this.ensureSystem();
				const { eq, and, gt } = await import('drizzle-orm');
				const [result] = await this.db!.select()
					.from(schema.authTokens)
					.where(and(eq(schema.authTokens.token, tokenValue), gt(schema.authTokens.expires, new Date()), eq(schema.authTokens.consumed, false)))
					.limit(1);
				return result || null;
			}, 'AUTH_VALIDATE_TOKEN_FAILED');
		},
		consumeToken: async (tokenValue: string) => {
			return this.wrap(async () => {
				await this.ensureSystem();
				const { eq } = await import('drizzle-orm');
				const [result] = await this.db!.update(schema.authTokens)
					.set({ consumed: true, updatedAt: new Date() })
					.where(eq(schema.authTokens.token, tokenValue))
					.returning();
				return result || null;
			}, 'AUTH_CONSUME_TOKEN_FAILED');
		},
		updateToken: async (tokenId: string, data: any) => {
			return this.wrap(async () => {
				await this.ensureSystem();
				const { eq } = await import('drizzle-orm');
				const [result] = await this.db!.update(schema.authTokens)
					.set({ ...data, updatedAt: new Date() })
					.where(eq(schema.authTokens._id, tokenId))
					.returning();
				return result;
			}, 'AUTH_UPDATE_TOKEN_FAILED');
		},
		deleteTokens: async (tokenIds: string[]) => {
			return this.wrap(async () => {
				await this.ensureSystem();
				const { inArray, or } = await import('drizzle-orm');
				// API routes may pass token values instead of _ids, so try both
				const result = await this.db!.delete(schema.authTokens)
					.where(or(inArray(schema.authTokens._id, tokenIds), inArray(schema.authTokens.token, tokenIds)))
					.returning();
				return { deletedCount: result.length };
			}, 'AUTH_DELETE_TOKENS_FAILED');
		},
		blockTokens: async (tokenIds: string[]) => {
			return this.wrap(async () => {
				await this.ensureSystem();
				const { inArray } = await import('drizzle-orm');
				const result = await this.db!.update(schema.authTokens)
					.set({ consumed: true, updatedAt: new Date() })
					.where(inArray(schema.authTokens._id, tokenIds))
					.returning();
				return { modifiedCount: result.length };
			}, 'AUTH_BLOCK_TOKENS_FAILED');
		},
		unblockTokens: async (tokenIds: string[]) => {
			return this.wrap(async () => {
				await this.ensureSystem();
				const { inArray } = await import('drizzle-orm');
				const result = await this.db!.update(schema.authTokens)
					.set({ consumed: false, updatedAt: new Date() })
					.where(inArray(schema.authTokens._id, tokenIds))
					.returning();
				return { modifiedCount: result.length };
			}, 'AUTH_UNBLOCK_TOKENS_FAILED');
		},
		checkUser: async (criteria: { email: string; tenantId?: string }) => {
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
				return user ? this.mapUser(user) : null;
			}, 'AUTH_CHECK_USER_FAILED');
		},
		deleteUser: async (userId: string) => {
			return this.wrap(async () => {
				await this.ensureSystem();
				const { eq } = await import('drizzle-orm');
				await this.db!.delete(schema.authUsers).where(eq(schema.authUsers._id, userId));
			}, 'AUTH_DELETE_USER_FAILED');
		},
		getAllActiveSessions: async (tenantId?: string) => {
			return this.wrap(async () => {
				await this.ensureSystem();
				const { gt, and, eq } = await import('drizzle-orm');
				const conditions: any[] = [gt(schema.authSessions.expires, new Date())];
				if (tenantId) conditions.push(eq(schema.authSessions.tenantId, tenantId));
				const results = await this.db!.select()
					.from(schema.authSessions)
					.where(and(...conditions));
				return utils.convertArrayDatesToISO(results);
			}, 'AUTH_GET_ALL_ACTIVE_SESSIONS_FAILED');
		}
	};

	public readonly media = {
		setupMediaModels: async () => {
			await this.ensureSystem();
			logger.debug('Media models setup verified');
		},
		findOne: async (filter: Record<string, unknown>) => {
			return this.wrap(async () => {
				const where = this.mapQuery(schema.mediaItems, filter);
				const [result] = await this.db!.select().from(schema.mediaItems).where(where).limit(1);
				return result || null;
			}, 'MEDIA_FIND_ONE_FAILED');
		},
		findMany: async (filter?: Record<string, unknown>, options?: { limit?: number; offset?: number; sort?: any }) => {
			return this.wrap(async () => {
				const where = filter ? this.mapQuery(schema.mediaItems, filter) : undefined;
				let query = this.db!.select().from(schema.mediaItems);
				if (where) {
					// @ts-expect-error - Drizzle types
					query = query.where(where);
				}
				if (options?.limit) {
					// @ts-expect-error - Drizzle types
					query = query.limit(options.limit);
				}
				if (options?.offset) {
					// @ts-expect-error - Drizzle types
					query = query.offset(options.offset);
				}
				return await query;
			}, 'MEDIA_FIND_MANY_FAILED');
		},
		create: async (data: any) => {
			return this.wrap(async () => {
				const formattedData = {
					_id: data._id || utils.generateId(),
					...data,
					createdAt: new Date(),
					updatedAt: new Date()
				};
				const [result] = await this.db!.insert(schema.mediaItems).values(formattedData).returning();
				return result;
			}, 'MEDIA_CREATE_FAILED');
		},
		update: async (filter: Record<string, unknown>, data: any) => {
			return this.wrap(async () => {
				const where = this.mapQuery(schema.mediaItems, filter);
				const [result] = await this.db!.update(schema.mediaItems)
					.set({ ...data, updatedAt: new Date() })
					.where(where)
					.returning();
				return result;
			}, 'MEDIA_UPDATE_FAILED');
		},
		delete: async (filter: Record<string, unknown>) => {
			return this.wrap(async () => {
				const where = this.mapQuery(schema.mediaItems, filter);
				await this.db!.delete(schema.mediaItems).where(where);
			}, 'MEDIA_DELETE_FAILED');
		},
		count: async (filter?: Record<string, unknown>) => {
			return this.wrap(async () => {
				const { sql } = await import('drizzle-orm');
				const where = filter ? this.mapQuery(schema.mediaItems, filter) : undefined;
				const query = this.db!.select({ count: sql<number>`count(*)` }).from(schema.mediaItems);
				if (where) query.where(where);
				const [result] = await query;
				return Number(result.count);
			}, 'MEDIA_COUNT_FAILED');
		},
		// Nested files interface used by API routes
		files: {
			upload: async (data: any) => {
				return this.wrap(async () => {
					const formattedData = {
						_id: data._id || utils.generateId(),
						...data,
						createdAt: new Date(),
						updatedAt: new Date()
					};
					const [result] = await this.db!.insert(schema.mediaItems).values(formattedData).returning();
					return result;
				}, 'MEDIA_FILES_UPLOAD_FAILED');
			},
			uploadMany: async (files: any[]) => {
				return this.wrap(async () => {
					const formattedFiles = files.map((f) => ({
						_id: f._id || utils.generateId(),
						...f,
						createdAt: new Date(),
						updatedAt: new Date()
					}));
					return await this.db!.insert(schema.mediaItems).values(formattedFiles).returning();
				}, 'MEDIA_FILES_UPLOAD_MANY_FAILED');
			},
			getByFolder: async (
				folderId?: string,
				options?: { page?: number; pageSize?: number; sortField?: string; sortDirection?: string },
				recursive?: boolean
			) => {
				return this.wrap(async () => {
					const { eq, isNull, desc, asc, sql } = await import('drizzle-orm');
					const limit = options?.pageSize || 20;
					const offset = ((options?.page || 1) - 1) * limit;

					const conditions: any[] = [];
					if (folderId) {
						conditions.push(eq(schema.mediaItems.folderId, folderId));
					} else if (!recursive) {
						conditions.push(isNull(schema.mediaItems.folderId));
					}

					let query = this.db!.select().from(schema.mediaItems);
					if (conditions.length > 0) {
						const { and } = await import('drizzle-orm');
						// @ts-expect-error - Drizzle types
						query = query.where(and(...conditions));
					}

					// Sort
					const sortField = options?.sortField || 'updatedAt';
					const sortDir = options?.sortDirection === 'asc' ? asc : desc;
					if ((schema.mediaItems as any)[sortField]) {
						// @ts-expect-error - Drizzle types
						query = query.orderBy(sortDir((schema.mediaItems as any)[sortField]));
					}

					// @ts-expect-error - Drizzle types
					query = query.limit(limit).offset(offset);

					const items = await query;

					// Get total count
					const countQuery = this.db!.select({ count: sql<number>`count(*)` }).from(schema.mediaItems);
					if (conditions.length > 0) {
						const { and } = await import('drizzle-orm');
						countQuery.where(and(...conditions));
					}
					const [countResult] = await countQuery;
					const total = Number(countResult.count);

					return {
						items,
						total,
						page: options?.page || 1,
						pageSize: limit,
						hasNextPage: offset + limit < total,
						hasPreviousPage: (options?.page || 1) > 1
					};
				}, 'MEDIA_FILES_GET_BY_FOLDER_FAILED');
			},
			getById: async (id: string) => {
				return this.wrap(async () => {
					const { eq } = await import('drizzle-orm');
					const [result] = await this.db!.select().from(schema.mediaItems).where(eq(schema.mediaItems._id, id)).limit(1);
					return result || null;
				}, 'MEDIA_FILES_GET_BY_ID_FAILED');
			},
			delete: async (id: string) => {
				return this.wrap(async () => {
					const { eq } = await import('drizzle-orm');
					await this.db!.delete(schema.mediaItems).where(eq(schema.mediaItems._id, id));
				}, 'MEDIA_FILES_DELETE_FAILED');
			}
		},
		// Nested folders interface
		folders: {
			create: async (data: any) => {
				return this.wrap(async () => {
					const formattedData = {
						_id: data._id || utils.generateId(),
						...data,
						createdAt: new Date(),
						updatedAt: new Date()
					};
					const [result] = await this.db!.insert(schema.systemVirtualFolders).values(formattedData).returning();
					return result;
				}, 'MEDIA_FOLDERS_CREATE_FAILED');
			},
			delete: async (folderId: string) => {
				return this.wrap(async () => {
					const { eq } = await import('drizzle-orm');
					await this.db!.delete(schema.systemVirtualFolders).where(eq(schema.systemVirtualFolders._id, folderId));
				}, 'MEDIA_FOLDERS_DELETE_FAILED');
			},
			getByPath: async (path: string) => {
				return this.wrap(async () => {
					const { eq } = await import('drizzle-orm');
					const [result] = await this.db!.select().from(schema.systemVirtualFolders).where(eq(schema.systemVirtualFolders.path, path)).limit(1);
					return result || null;
				}, 'MEDIA_FOLDERS_GET_BY_PATH_FAILED');
			}
		}
	};

	public readonly systemPreferences = {
		get: async (key: string) => {
			return this.wrap(async () => {
				const { eq } = await import('drizzle-orm');
				const [result] = await this.db!.select().from(schema.systemPreferences).where(eq(schema.systemPreferences.key, key)).limit(1);
				return result?.value ?? null;
			}, 'SYSTEM_PREFERENCES_GET_FAILED');
		},
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
		delete: async (key: string) => {
			return this.wrap(async () => {
				const { eq } = await import('drizzle-orm');
				await this.db!.delete(schema.systemPreferences).where(eq(schema.systemPreferences.key, key));
			}, 'SYSTEM_PREFERENCES_DELETE_FAILED');
		},
		getAll: async () => {
			return this.wrap(async () => {
				const results = await this.db!.select().from(schema.systemPreferences);
				const data: Record<string, any> = {};
				results.forEach((r) => (data[r.key] = r.value));
				return data;
			}, 'SYSTEM_PREFERENCES_GET_ALL_FAILED');
		},
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
		findOne: async (filter: Record<string, unknown>) => {
			return this.wrap(async () => {
				const where = this.mapQuery(schema.systemVirtualFolders, filter);
				const [result] = await this.db!.select().from(schema.systemVirtualFolders).where(where).limit(1);
				return result || null;
			}, 'SYSTEM_VIRTUAL_FOLDER_FIND_ONE_FAILED');
		},
		findMany: async (filter?: Record<string, unknown>) => {
			return this.wrap(async () => {
				const where = filter ? this.mapQuery(schema.systemVirtualFolders, filter) : undefined;
				const query = this.db!.select().from(schema.systemVirtualFolders);
				if (where) query.where(where);
				return await query;
			}, 'SYSTEM_VIRTUAL_FOLDER_FIND_MANY_FAILED');
		},
		create: async (data: any) => {
			return this.wrap(async () => {
				const formattedData = {
					_id: data._id || utils.generateId(),
					...data,
					createdAt: new Date(),
					updatedAt: new Date()
				};
				const [result] = await this.db!.insert(schema.systemVirtualFolders).values(formattedData).returning();
				return result;
			}, 'SYSTEM_VIRTUAL_FOLDER_CREATE_FAILED');
		},
		update: async (filter: Record<string, unknown>, data: any) => {
			return this.wrap(async () => {
				const where = this.mapQuery(schema.systemVirtualFolders, filter);
				const [result] = await this.db!.update(schema.systemVirtualFolders)
					.set({ ...data, updatedAt: new Date() })
					.where(where)
					.returning();
				return result;
			}, 'SYSTEM_VIRTUAL_FOLDER_UPDATE_FAILED');
		},
		delete: async (filter: Record<string, unknown>) => {
			return this.wrap(async () => {
				const where = this.mapQuery(schema.systemVirtualFolders, filter);
				await this.db!.delete(schema.systemVirtualFolders).where(where);
			}, 'SYSTEM_VIRTUAL_FOLDER_DELETE_FAILED');
		},
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
		findOne: async (filter: Record<string, unknown>) => {
			return this.wrap(async () => {
				const where = this.mapQuery(schema.themes, filter);
				const [result] = await this.db!.select().from(schema.themes).where(where).limit(1);
				return result || null;
			}, 'THEMES_FIND_ONE_FAILED');
		},
		findMany: async (filter?: Record<string, unknown>) => {
			return this.wrap(async () => {
				const where = filter ? this.mapQuery(schema.themes, filter) : undefined;
				const query = this.db!.select().from(schema.themes);
				if (where) query.where(where);
				return await query;
			}, 'THEMES_FIND_MANY_FAILED');
		},
		create: async (data: any) => {
			return this.wrap(async () => {
				const formattedData = {
					_id: data._id || utils.generateId(),
					...data,
					createdAt: new Date(),
					updatedAt: new Date()
				};
				const [result] = await this.db!.insert(schema.themes).values(formattedData).returning();
				return result;
			}, 'THEMES_CREATE_FAILED');
		},
		update: async (filter: Record<string, unknown>, data: any) => {
			return this.wrap(async () => {
				const where = this.mapQuery(schema.themes, filter);
				const [result] = await this.db!.update(schema.themes)
					.set({ ...data, updatedAt: new Date() })
					.where(where)
					.returning();
				return result;
			}, 'THEMES_UPDATE_FAILED');
		},
		delete: async (filter: Record<string, unknown>) => {
			return this.wrap(async () => {
				const where = this.mapQuery(schema.themes, filter);
				await this.db!.delete(schema.themes).where(where);
			}, 'THEMES_DELETE_FAILED');
		},
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
		findOne: async (filter: Record<string, unknown>) => {
			return this.wrap(async () => {
				const where = this.mapQuery(schema.widgets, filter);
				const [result] = await this.db!.select().from(schema.widgets).where(where).limit(1);
				return result || null;
			}, 'WIDGETS_FIND_ONE_FAILED');
		},
		findAll: async () => {
			return this.wrap(async () => {
				return await this.db!.select().from(schema.widgets);
			}, 'WIDGETS_FIND_ALL_FAILED');
		},
		findMany: async (filter?: Record<string, unknown>) => {
			return this.wrap(async () => {
				const where = filter ? this.mapQuery(schema.widgets, filter) : undefined;
				const query = this.db!.select().from(schema.widgets);
				if (where) query.where(where);
				return await query;
			}, 'WIDGETS_FIND_MANY_FAILED');
		},
		create: async (data: any) => {
			return this.wrap(async () => {
				const formattedData = {
					_id: data._id || utils.generateId(),
					...data,
					createdAt: new Date(),
					updatedAt: new Date()
				};
				const [result] = await this.db!.insert(schema.widgets).values(formattedData).returning();
				return result;
			}, 'WIDGETS_CREATE_FAILED');
		},
		// API route calls update(widgetId, data) with a string ID
		update: async (widgetIdOrFilter: any, data: any) => {
			return this.wrap(async () => {
				const { eq } = await import('drizzle-orm');
				let where: any;
				if (typeof widgetIdOrFilter === 'string') {
					where = eq(schema.widgets._id, widgetIdOrFilter);
				} else {
					where = this.mapQuery(schema.widgets, widgetIdOrFilter);
				}
				const [result] = await this.db!.update(schema.widgets)
					.set({ ...data, updatedAt: new Date() })
					.where(where)
					.returning();
				return result;
			}, 'WIDGETS_UPDATE_FAILED');
		},
		delete: async (filter: Record<string, unknown>) => {
			return this.wrap(async () => {
				const where = this.mapQuery(schema.widgets, filter);
				await this.db!.delete(schema.widgets).where(where);
			}, 'WIDGETS_DELETE_FAILED');
		},
		getActiveWidgets: async () => {
			return this.wrap(async () => {
				const { eq } = await import('drizzle-orm');
				return await this.db!.select().from(schema.widgets).where(eq(schema.widgets.isActive, true));
			}, 'WIDGETS_GET_ACTIVE_FAILED');
		},
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
		findOne: async (filter: Record<string, unknown>) => {
			return this.wrap(async () => {
				const where = this.mapQuery(schema.websiteTokens, filter);
				const [result] = await this.db!.select().from(schema.websiteTokens).where(where).limit(1);
				return result ? this.mapWebsiteToken(result) : null;
			}, 'WEBSITE_TOKENS_FIND_ONE_FAILED');
		},
		findMany: async (filter?: Record<string, unknown>) => {
			return this.wrap(async () => {
				const where = filter ? this.mapQuery(schema.websiteTokens, filter) : undefined;
				const query = this.db!.select().from(schema.websiteTokens);
				if (where) query.where(where);
				const results = await query;
				return results.map((r: any) => this.mapWebsiteToken(r));
			}, 'WEBSITE_TOKENS_FIND_MANY_FAILED');
		},
		create: async (data: any) => {
			return this.wrap(async () => {
				// Convert ISO string dates to Date objects for Drizzle timestamp columns
				const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
				const formattedData = {
					_id: data._id || utils.generateId(),
					...data,
					expiresAt,
					createdAt: new Date(),
					updatedAt: new Date()
				};
				const [result] = await this.db!.insert(schema.websiteTokens).values(formattedData).returning();
				return this.mapWebsiteToken(result);
			}, 'WEBSITE_TOKENS_CREATE_FAILED');
		},
		// API route calls delete(id) with a string ID, not a filter object
		delete: async (tokenId: any) => {
			return this.wrap(async () => {
				const { eq } = await import('drizzle-orm');
				if (typeof tokenId === 'string') {
					await this.db!.delete(schema.websiteTokens).where(eq(schema.websiteTokens._id, tokenId));
				} else {
					const where = this.mapQuery(schema.websiteTokens, tokenId);
					await this.db!.delete(schema.websiteTokens).where(where);
				}
			}, 'WEBSITE_TOKENS_DELETE_FAILED');
		},
		// API route calls getAll({limit, skip, sort, order}) and expects {data: [...], total: ...}
		getAll: async (options?: { limit?: number; skip?: number; sort?: string; order?: string }) => {
			return this.wrap(async () => {
				const { desc, asc } = await import('drizzle-orm');
				let q: any = this.db!.select().from(schema.websiteTokens);

				if (options?.sort) {
					const orderFn = options.order === 'desc' ? desc : asc;
					if ((schema.websiteTokens as any)[options.sort]) {
						q = q.orderBy(orderFn((schema.websiteTokens as any)[options.sort]));
					}
				}

				if (options?.limit) q = q.limit(options.limit);
				if (options?.skip) q = q.offset(options.skip);

				const results = await q;
				// total count
				const [countResult] = await this.db!.select({ count: sql`count(*)` }).from(schema.websiteTokens);
				const total = Number((countResult as any).count);

				return {
					data: results.map((r: any) => this.mapWebsiteToken(r)),
					total
				};
			}, 'WEBSITE_TOKENS_GET_ALL_FAILED');
		},
		getByName: async (name: string) => {
			return this.wrap(async () => {
				const { eq } = await import('drizzle-orm');
				const [result] = await this.db!.select().from(schema.websiteTokens).where(eq(schema.websiteTokens.name, name)).limit(1);
				return result ? this.mapWebsiteToken(result) : null;
			}, 'WEBSITE_TOKENS_GET_BY_NAME_FAILED');
		}
	};

	public readonly batch = {
		insert: async (collection: string, documents: any[]) => {
			return this.wrap(async () => {
				const table = this.getTable(collection);
				const formattedDocs = documents.map((d) => ({
					_id: d._id || utils.generateId(),
					...d,
					createdAt: new Date(),
					updatedAt: new Date()
				}));
				return await this.db!.insert(table).values(formattedDocs).returning();
			}, 'BATCH_INSERT_FAILED');
		},
		update: async (collection: string, operations: any[]) => {
			return this.wrap(async () => {
				const table = this.getTable(collection);
				const results = [];
				for (const op of operations) {
					const where = this.mapQuery(table, op.filter || op.query || {});
					const [result] = await this.db!.update(table)
						.set({ ...op.data, updatedAt: new Date() })
						.where(where)
						.returning();
					results.push(result);
				}
				return results;
			}, 'BATCH_UPDATE_FAILED');
		},
		delete: async (collection: string, filters: any[]) => {
			return this.wrap(async () => {
				const table = this.getTable(collection);
				let deletedCount = 0;
				for (const filter of filters) {
					const where = this.mapQuery(table, filter);
					const result = await this.db!.delete(table).where(where).returning();
					deletedCount += result.length;
				}
				return { deletedCount };
			}, 'BATCH_DELETE_FAILED');
		}
	};

	private _performanceMetrics = {
		queries: 0,
		errors: 0,
		avgResponseTime: 0,
		startTime: Date.now()
	};

	public readonly performance = {
		getMetrics: async () => {
			return this.wrap(async () => {
				return {
					...this._performanceMetrics,
					uptime: Date.now() - this._performanceMetrics.startTime,
					connected: this.connected
				};
			}, 'PERFORMANCE_GET_METRICS_FAILED');
		},
		resetMetrics: async () => {
			return this.wrap(async () => {
				this._performanceMetrics = {
					queries: 0,
					errors: 0,
					avgResponseTime: 0,
					startTime: Date.now()
				};
			}, 'PERFORMANCE_RESET_METRICS_FAILED');
		}
	};

	private _cache = new Map<string, { value: unknown; expires?: number }>();

	public readonly cache = {
		get: async (key: string) => {
			return this.wrap(async () => {
				const entry = this._cache.get(key);
				if (!entry) return null;
				if (entry.expires && entry.expires < Date.now()) {
					this._cache.delete(key);
					return null;
				}
				return entry.value;
			}, 'CACHE_GET_FAILED');
		},
		set: async (key: string, value: unknown, ttl?: number) => {
			return this.wrap(async () => {
				this._cache.set(key, {
					value,
					expires: ttl ? Date.now() + ttl * 1000 : undefined
				});
			}, 'CACHE_SET_FAILED');
		},
		delete: async (key: string) => {
			return this.wrap(async () => {
				this._cache.delete(key);
			}, 'CACHE_DELETE_FAILED');
		},
		clear: async () => {
			return this.wrap(async () => {
				this._cache.clear();
			}, 'CACHE_CLEAR_FAILED');
		}
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

					// Schema now uses nodeType directly, no mapping needed
					const mappedNodes = nodes.map((node) => ({
						...node
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
						nodeType: node.nodeType || node.type || 'unknown',
						name: node.name || node.title,
						slug: node.slug,
						icon: node.icon,
						description: node.description,
						order: node.order || 0,
						status: node.status || 'draft',
						isPublished: !!node.isPublished,
						tenantId: node.tenantId,
						data: node.data,
						metadata: node.metadata,
						translations: node.translations,
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
								nodeType: sql.raw('excluded."nodeType"'),
								name: sql.raw('excluded.name'),
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

						// nodeType is now the schema field name, no mapping needed

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
		findOne: async (collection: string, filter: Record<string, unknown>) => {
			return this.wrap(async () => {
				const table = this.getTable(collection);
				const where = this.mapQuery(table, filter);
				const [result] = await this.db!.select().from(table).where(where).limit(1);
				return result || null;
			}, 'CONTENT_FIND_ONE_FAILED');
		},
		findMany: async (collection: string, filter?: Record<string, unknown>, options?: { limit?: number; offset?: number; sort?: any }) => {
			return this.wrap(async () => {
				const table = this.getTable(collection);
				const where = filter ? this.mapQuery(table, filter) : undefined;
				let query = this.db!.select().from(table);
				if (where) {
					// @ts-expect-error - Drizzle types
					query = query.where(where);
				}
				if (options?.limit) {
					// @ts-expect-error - Drizzle types
					query = query.limit(options.limit);
				}
				if (options?.offset) {
					// @ts-expect-error - Drizzle types
					query = query.offset(options.offset);
				}
				return await query;
			}, 'CONTENT_FIND_MANY_FAILED');
		},
		create: async (collection: string, data: any) => {
			return this.wrap(async () => {
				const table = this.getTable(collection);
				const formattedData = {
					_id: data._id || utils.generateId(),
					...data,
					createdAt: new Date(),
					updatedAt: new Date()
				};
				const [result] = await this.db!.insert(table).values(formattedData).returning();
				return result;
			}, 'CONTENT_CREATE_FAILED');
		},
		update: async (collection: string, filter: Record<string, unknown>, data: any) => {
			return this.wrap(async () => {
				const table = this.getTable(collection);
				const where = this.mapQuery(table, filter);
				const [result] = await this.db!.update(table)
					.set({ ...data, updatedAt: new Date() })
					.where(where)
					.returning();
				return result;
			}, 'CONTENT_UPDATE_FAILED');
		},
		delete: async (collection: string, filter: Record<string, unknown>) => {
			return this.wrap(async () => {
				const table = this.getTable(collection);
				const where = this.mapQuery(table, filter);
				await this.db!.delete(table).where(where);
			}, 'CONTENT_DELETE_FAILED');
		},
		count: async (collection: string, filter?: Record<string, unknown>) => {
			return this.wrap(async () => {
				const { sql } = await import('drizzle-orm');
				const table = this.getTable(collection);
				const where = filter ? this.mapQuery(table, filter) : undefined;
				const query = this.db!.select({ count: sql<number>`count(*)` }).from(table);
				if (where) query.where(where);
				const [result] = await query;
				return Number(result.count);
			}, 'CONTENT_COUNT_FAILED');
		},

		list: async () => {
			return this.wrap(async () => {
				// Return known content-related table names
				return ['content_nodes', 'content_drafts', 'content_revisions'];
			}, 'CONTENT_LIST_FAILED');
		},
		exists: async (name: string) => {
			return this.wrap(async () => {
				const result = await this.db!.execute(sql`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = ${name})`);
				return !!(result as any)?.[0]?.exists;
			}, 'CONTENT_EXISTS_FAILED');
		},
		createCollection: async (name: string, _options?: unknown) => {
			return this.wrap(async () => {
				logger.info(`Collection creation requested for ${name} (using contentNodes table)`);
			}, 'CONTENT_CREATE_COLLECTION_FAILED');
		},
		dropCollection: async (name: string) => {
			return this.wrap(async () => {
				logger.info(`Collection drop requested for ${name} (using contentNodes table)`);
			}, 'CONTENT_DROP_COLLECTION_FAILED');
		},
		createModel: async (_schema: any) => {
			logger.info(`Collection model creation requested for ${_schema.name} (using contentNodes table)`);
		}
	};

	public readonly collection = {
		list: async () => {
			return this.wrap(async () => {
				const result = await this.db!.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
				return (result as any[]).map((r: any) => r.table_name);
			}, 'COLLECTION_LIST_FAILED');
		},
		exists: async (name: string) => {
			return this.wrap(async () => {
				const result = await this.db!.execute(
					sql`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ${name})`
				);
				return !!(result as any)?.[0]?.exists;
			}, 'COLLECTION_EXISTS_FAILED');
		},
		create: async (name: string, _options?: unknown) => {
			return this.wrap(async () => {
				logger.info(`Collection creation requested for ${name} (using existing schema tables)`);
			}, 'COLLECTION_CREATE_FAILED');
		},
		drop: async (name: string) => {
			return this.wrap(async () => {
				logger.info(`Collection drop requested for ${name} (using existing schema tables)`);
			}, 'COLLECTION_DROP_FAILED');
		},
		createModel: async (_schema: any) => {
			// Proxy to content module
			return this.content.createModel(_schema);
		},
		getModel: async (schemaId: string) => {
			// In SQL, we don't have dynamic models. Return the table reference.
			return this.getTable(schemaId);
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
		fn: (transaction: unknown) => Promise<DatabaseResult<T>>,
		_options?: { isolationLevel?: 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE' }
	): Promise<DatabaseResult<T>> => {
		return this.wrap(async () => {
			// postgres.js transactions via drizzle
			const result = await this.db!.transaction(async (tx) => {
				const txResult = await fn(tx);
				if (!txResult.success) throw new Error((txResult as any).message || 'Transaction failed');
				return txResult.data;
			});
			return result;
		}, 'TRANSACTION_FAILED') as Promise<DatabaseResult<T>>;
	};

	// Global CRUD data methods
	getCollectionData = async (
		collection: string,
		options?: { limit?: number; offset?: number; includeMetadata?: boolean; fields?: string[] }
	): Promise<DatabaseResult<{ data: unknown[]; metadata?: { totalCount: number; schema?: unknown; indexes?: string[] } }>> => {
		return this.wrap(async () => {
			const table = this.getTable(collection);
			let query = this.db!.select().from(table);
			if (options?.limit) {
				// @ts-expect-error - Drizzle types
				query = query.limit(options.limit);
			}
			if (options?.offset) {
				// @ts-expect-error - Drizzle types
				query = query.offset(options.offset);
			}
			const data = await query;
			const countResult = await this.db!.select({ count: sql<number>`count(*)` }).from(table);
			const totalCount = Number(countResult[0].count);
			return {
				data,
				metadata: options?.includeMetadata ? { totalCount } : undefined
			};
		}, 'GET_COLLECTION_DATA_FAILED');
	};

	getMultipleCollectionData = async (
		collectionNames: string[],
		options?: { limit?: number; fields?: string[] }
	): Promise<DatabaseResult<Record<string, unknown[]>>> => {
		return this.wrap(async () => {
			const result: Record<string, unknown[]> = {};
			for (const name of collectionNames) {
				const table = this.getTable(name);
				let query = this.db!.select().from(table);
				if (options?.limit) {
					// @ts-expect-error - Drizzle types
					query = query.limit(options.limit);
				}
				result[name] = await query;
			}
			return result;
		}, 'GET_MULTIPLE_COLLECTION_DATA_FAILED');
	};
}

export * from './adapterCore';
