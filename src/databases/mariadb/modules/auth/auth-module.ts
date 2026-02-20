/**
 * @file src/databases/mariadb/modules/auth/auth-module.ts
 * @description Authentication and authorization module for MariaDB
 *
 * Features:
 * - Create user
 * - Update user
 * - Delete user
 * - Get user by id
 * - Get user by email
 * - Get all users
 * - Get user count
 * - Delete users
 */

import type { ISODateString } from '@src/content/types';
import { logger } from '@src/utils/logger';
import { and, asc, desc, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import type { DatabaseResult, PaginationOption, Role, Session, Token, User } from '../../../db-interface';
import type { AdapterCore } from '../../adapter/adapter-core';
import * as schema from '../../schema';
import * as utils from '../../utils';
import { isoDateStringToDate, nowISODateString } from '@src/utils/date-utils';

export class AuthModule {
	private readonly core: AdapterCore;

	constructor(core: AdapterCore) {
		this.core = core;
	}

	private get db() {
		return this.core.db!;
	}

	private mapUser(dbUser: typeof schema.authUsers.$inferSelect): User {
		if (!dbUser) {
			throw new Error('User not found');
		}
		const converted = utils.convertDatesToISO(dbUser);

		// Handle roleIds - ensure it is an array
		let roleIds = converted.roleIds;
		if (typeof roleIds === 'string') {
			try {
				roleIds = JSON.parse(roleIds);
			} catch (_e) {
				// Fallback if parsing fails
				roleIds = [];
			}
		}

		const finalRoleIds = Array.isArray(roleIds) ? (roleIds as string[]) : [];

		return {
			...converted,
			roleIds: finalRoleIds,
			role: finalRoleIds.length > 0 ? finalRoleIds[0] : 'user',
			permissions: (converted as unknown as { permissions?: string[] }).permissions || []
		} as User;
	}

	// Setup method for model registration
	async setupAuthModels(): Promise<void> {
		// No-op for SQL - tables created by migrations
		logger.debug('Auth models setup (no-op for SQL)');
	}

	// User methods
	async createUser(userData: Partial<User>): Promise<DatabaseResult<User>> {
		return this.core.wrap(async () => {
			const id = (userData._id || utils.generateId()) as string;
			const now = isoDateStringToDate(nowISODateString());

			// Ensure password is hashed if provided and not already hashed
			let password = userData.password;
			if (password && !password.startsWith('$argon2')) {
				const argon2 = await import('argon2');
				password = await argon2.hash(password);
			}

			const values: typeof schema.authUsers.$inferInsert = {
				email: userData.email || '',
				username: userData.username || null,
				password: password || null,
				firstName: userData.firstName || null,
				lastName: userData.lastName || null,
				avatar: userData.avatar || null,
				roleIds: [],
				tenantId: userData.tenantId || null,
				_id: id,
				createdAt: now,
				updatedAt: now
			};

			// Map legacy 'role' string to 'roleIds' array if roleIds is missing/empty
			if (userData.roleIds?.length) {
				values.roleIds = userData.roleIds;
			} else if (userData.role) {
				values.roleIds = [userData.role];
			}

			await this.db.insert(schema.authUsers).values(values);
			const [result] = await this.db.select().from(schema.authUsers).where(eq(schema.authUsers._id, id)).limit(1);
			return this.mapUser(result);
		}, 'CREATE_USER_FAILED');
	}

	async updateUserAttributes(user_id: string, userData: Partial<User>, tenantId?: string): Promise<DatabaseResult<User>> {
		return this.core.wrap(async () => {
			const conditions = [eq(schema.authUsers._id, user_id)];
			if (tenantId) {
				conditions.push(eq(schema.authUsers.tenantId, tenantId));
			}

			const updateData: Partial<typeof schema.authUsers.$inferInsert> = {
				...userData,
				updatedAt: isoDateStringToDate(nowISODateString())
			};

			// Map legacy role string to roleIds array if roleIds is missing
			if (userData.role && !updateData.roleIds) {
				updateData.roleIds = [userData.role];
			}

			await this.db
				.update(schema.authUsers)
				.set(updateData as Record<string, unknown>)
				.where(and(...conditions));

			const [result] = await this.db
				.select()
				.from(schema.authUsers)
				.where(and(...conditions))
				.limit(1);
			return this.mapUser(result);
		}, 'UPDATE_USER_FAILED');
	}

	async deleteUser(user_id: string, tenantId?: string): Promise<DatabaseResult<void>> {
		return this.core.wrap(async () => {
			const conditions = [eq(schema.authUsers._id, user_id)];
			if (tenantId) {
				conditions.push(eq(schema.authUsers.tenantId, tenantId));
			}
			await this.db.delete(schema.authUsers).where(and(...conditions));
		}, 'DELETE_USER_FAILED');
	}

	async getUserById(user_id: string, tenantId?: string): Promise<DatabaseResult<User | null>> {
		return this.core.wrap(async () => {
			const conditions = [eq(schema.authUsers._id, user_id)];
			if (tenantId) {
				conditions.push(eq(schema.authUsers.tenantId, tenantId));
			}
			const [result] = await this.db
				.select()
				.from(schema.authUsers)
				.where(and(...conditions))
				.limit(1);
			return result ? this.mapUser(result) : null;
		}, 'GET_USER_BY_ID_FAILED');
	}

	async getUserByEmail(criteria: { email: string; tenantId?: string }): Promise<DatabaseResult<User | null>> {
		return this.core.wrap(async () => {
			const conditions = [eq(schema.authUsers.email, criteria.email)];
			if (criteria.tenantId) {
				conditions.push(eq(schema.authUsers.tenantId, criteria.tenantId));
			}
			const [result] = await this.db
				.select()
				.from(schema.authUsers)
				.where(and(...conditions))
				.limit(1);
			return result ? this.mapUser(result) : null;
		}, 'GET_USER_BY_EMAIL_FAILED');
	}

	async getAllUsers(options?: PaginationOption): Promise<DatabaseResult<User[]>> {
		return this.core.wrap(async () => {
			let q = this.db.select().from(schema.authUsers).$dynamic();

			if (options?.sort) {
				if (Array.isArray(options.sort)) {
					for (const [field, direction] of options.sort) {
						const order = direction === 'desc' ? desc : asc;
						const column = (schema.authUsers as unknown as Record<string, unknown>)[field];
						if (column && typeof column === 'object') {
							q = q.orderBy(order(column as import('drizzle-orm').Column));
						}
					}
				} else {
					for (const [field, direction] of Object.entries(options.sort)) {
						const order = direction === 'desc' ? desc : asc;
						const column = (schema.authUsers as unknown as Record<string, unknown>)[field];
						if (column && typeof column === 'object') {
							q = q.orderBy(order(column as import('drizzle-orm').Column));
						}
					}
				}
			}

			if (options?.limit) {
				q = q.limit(options.limit);
			}
			if (options?.offset) {
				q = q.offset(options.offset);
			}

			const results = await q;
			return results.map((u) => this.mapUser(u));
		}, 'GET_ALL_USERS_FAILED');
	}

	async getUserCount(filter?: Record<string, unknown>): Promise<DatabaseResult<number>> {
		return this.core.wrap(async () => {
			const table = schema.authUsers;
			// Pass table schema AND filter to mapQuery
			const where = filter ? this.core.mapQuery(table as unknown as Record<string, unknown>, filter) : undefined;

			const query = this.db.select({ count: sql<number>`count(*)` }).from(table);

			if (where) {
				query.where(where as import('drizzle-orm').SQL);
			}

			const [result] = await query;
			return Number(result.count);
		}, 'GET_USER_COUNT_FAILED');
	}

	async deleteUsers(user_ids: string[], tenantId?: string): Promise<DatabaseResult<{ deletedCount: number }>> {
		return this.core.wrap(async () => {
			const conditions = [inArray(schema.authUsers._id, user_ids)];
			if (tenantId) {
				conditions.push(eq(schema.authUsers.tenantId, tenantId));
			}
			const result = await this.db.delete(schema.authUsers).where(and(...conditions));
			return { deletedCount: result[0].affectedRows };
		}, 'DELETE_USERS_FAILED');
	}

	async blockUsers(user_ids: string[], tenantId?: string): Promise<DatabaseResult<{ modifiedCount: number }>> {
		return this.core.wrap(async () => {
			const conditions = [inArray(schema.authUsers._id, user_ids)];
			if (tenantId) {
				conditions.push(eq(schema.authUsers.tenantId, tenantId));
			}
			const result = await this.db
				.update(schema.authUsers)
				.set({ blocked: true, updatedAt: isoDateStringToDate(nowISODateString()) })
				.where(and(...conditions));
			return { modifiedCount: result[0].affectedRows };
		}, 'BLOCK_USERS_FAILED');
	}

	async unblockUsers(user_ids: string[], tenantId?: string): Promise<DatabaseResult<{ modifiedCount: number }>> {
		return this.core.wrap(async () => {
			const conditions = [inArray(schema.authUsers._id, user_ids)];
			if (tenantId) {
				conditions.push(eq(schema.authUsers.tenantId, tenantId));
			}
			const result = await this.db
				.update(schema.authUsers)
				.set({ blocked: false, updatedAt: isoDateStringToDate(nowISODateString()) })
				.where(and(...conditions));
			return { modifiedCount: result[0].affectedRows };
		}, 'UNBLOCK_USERS_FAILED');
	}

	// Combined methods
	async createUserAndSession(
		userData: Partial<User>,
		sessionData: { expires: ISODateString; tenantId?: string }
	): Promise<DatabaseResult<{ user: User; session: Session }>> {
		return this.core.wrap(async () => {
			const userResult = await this.createUser(userData);
			if (!userResult.success) {
				throw new Error(userResult.message);
			}
			const user = userResult.data;

			const sessionResult = await this.createSession({
				user_id: user._id,
				expires: sessionData.expires,
				tenantId: sessionData.tenantId
			});
			if (!sessionResult.success) {
				throw new Error(sessionResult.message);
			}
			const session = sessionResult.data;
			return { user, session };
		}, 'CREATE_USER_AND_SESSION_FAILED');
	}

	async deleteUserAndSessions(user_id: string, tenantId?: string): Promise<DatabaseResult<{ deletedUser: boolean; deletedSessionCount: number }>> {
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
	async createSession(sessionData: { user_id: string; expires: ISODateString; tenantId?: string }): Promise<DatabaseResult<Session>> {
		return this.core.wrap(async () => {
			const id = utils.generateId() as string;
			await this.db.insert(schema.authSessions).values({
				_id: id,
				user_id: sessionData.user_id,
				expires: new Date(sessionData.expires),
				tenantId: sessionData.tenantId || null
			});
			const [result] = await this.db.select().from(schema.authSessions).where(eq(schema.authSessions._id, id)).limit(1);
			return utils.convertDatesToISO(result) as unknown as Session;
		}, 'CREATE_SESSION_FAILED');
	}

	async updateSessionExpiry(session_id: string, newExpiry: ISODateString): Promise<DatabaseResult<Session>> {
		return this.core.wrap(async () => {
			await this.db
				.update(schema.authSessions)
				.set({ expires: new Date(newExpiry), updatedAt: isoDateStringToDate(nowISODateString()) })
				.where(eq(schema.authSessions._id, session_id as string));
			const [result] = await this.db.select().from(schema.authSessions).where(eq(schema.authSessions._id, session_id as string)).limit(1);
			return utils.convertDatesToISO(result) as unknown as Session;
		}, 'UPDATE_SESSION_FAILED');
	}

	async deleteSession(session_id: string): Promise<DatabaseResult<void>> {
		return this.core.wrap(async () => {
			await this.db.delete(schema.authSessions).where(eq(schema.authSessions._id, session_id as string));
		}, 'DELETE_SESSION_FAILED');
	}

	async deleteExpiredSessions(): Promise<DatabaseResult<number>> {
		return this.core.wrap(async () => {
			const result = await this.db.delete(schema.authSessions).where(lt(schema.authSessions.expires, isoDateStringToDate(nowISODateString())));
			return result[0].affectedRows;
		}, 'DELETE_EXPIRED_SESSIONS_FAILED');
	}

	async validateSession(session_id: string): Promise<DatabaseResult<User | null>> {
		return this.core.wrap(async () => {
			const [session] = await this.db
				.select()
				.from(schema.authSessions)
				.where(and(eq(schema.authSessions._id, session_id as string), gt(schema.authSessions.expires, isoDateStringToDate(nowISODateString()))))
				.limit(1);

			if (!session) {
				return null;
			}

			const userResult = await this.getUserById(session.user_id as string, session.tenantId || undefined);
			return userResult.success ? userResult.data : null;
		}, 'VALIDATE_SESSION_FAILED');
	}

	async invalidateAllUserSessions(user_id: string, tenantId?: string): Promise<DatabaseResult<void>> {
		return this.core.wrap(async () => {
			const conditions = [eq(schema.authSessions.user_id, user_id)];
			if (tenantId) {
				conditions.push(eq(schema.authSessions.tenantId, tenantId));
			}
			await this.db.delete(schema.authSessions).where(and(...conditions));
		}, 'INVALIDATE_USER_SESSIONS_FAILED');
	}

	async getActiveSessions(user_id: string, tenantId?: string): Promise<DatabaseResult<Session[]>> {
		return this.core.wrap(async () => {
			const conditions = [eq(schema.authSessions.user_id, user_id), gt(schema.authSessions.expires, isoDateStringToDate(nowISODateString()))];
			if (tenantId) {
				conditions.push(eq(schema.authSessions.tenantId, tenantId));
			}
			const results = await this.db
				.select()
				.from(schema.authSessions)
				.where(and(...conditions));
			return utils.convertArrayDatesToISO(results) as unknown as Session[];
		}, 'GET_ACTIVE_SESSIONS_FAILED');
	}

	async getAllActiveSessions(tenantId?: string): Promise<DatabaseResult<Session[]>> {
		return this.core.wrap(async () => {
			const conditions = [gt(schema.authSessions.expires, isoDateStringToDate(nowISODateString()))];
			if (tenantId) {
				conditions.push(eq(schema.authSessions.tenantId, tenantId));
			}
			const results = await this.db
				.select()
				.from(schema.authSessions)
				.where(and(...conditions));
			return utils.convertArrayDatesToISO(results) as unknown as Session[];
		}, 'GET_ALL_ACTIVE_SESSIONS_FAILED');
	}

	async getSessionTokenData(session_id: string): Promise<DatabaseResult<{ expiresAt: ISODateString; user_id: string } | null>> {
		return this.core.wrap(async () => {
			const [session] = await this.db.select().from(schema.authSessions).where(eq(schema.authSessions._id, session_id as string)).limit(1);
			if (!session) {
				return null;
			}
			return {
				expiresAt: session.expires.toISOString() as unknown as ISODateString,
				user_id: session.user_id as string
			};
		}, 'GET_SESSION_TOKEN_DATA_FAILED');
	}

	async rotateToken(oldToken: string, expires: ISODateString): Promise<DatabaseResult<string>> {
		return this.core.wrap(async () => {
			const [oldSession] = await this.db.select().from(schema.authSessions).where(eq(schema.authSessions._id, oldToken as string)).limit(1);

			if (!oldSession) {
				throw new Error('Session not found');
			}

			const newId = utils.generateId() as string;
			const now = isoDateStringToDate(nowISODateString());

			await this.db.insert(schema.authSessions).values({
				_id: newId,
				user_id: oldSession.user_id,
				tenantId: oldSession.tenantId,
				expires: new Date(expires),
				createdAt: now,
				updatedAt: now
			});

			await this.db.delete(schema.authSessions).where(eq(schema.authSessions._id, oldToken as string));

			return newId;
		}, 'ROTATE_TOKEN_FAILED');
	}

	async cleanupRotatedSessions(): Promise<DatabaseResult<number>> {
		return this.core.notImplemented('auth.cleanupRotatedSessions');
	}

	// Token methods
	async createToken(data: {
		user_id: string;
		email: string;
		expires: ISODateString;
		type: string;
		tenantId?: string;
		role?: string;
		username?: string;
	}): Promise<DatabaseResult<string>> {
		return this.core.wrap(async () => {
			const id = utils.generateId() as string;
			const tokenValue = utils.generateId() as string; // Returns a dash-less UUID now
			await this.db.insert(schema.authTokens).values({
				_id: id,
				user_id: data.user_id,
				email: data.email,
				token: tokenValue,
				type: data.type,
				expires: new Date(data.expires),
				tenantId: data.tenantId || null,
				role: data.role || null,
				username: data.username || null,
				consumed: false
			});
			return tokenValue;
		}, 'CREATE_TOKEN_FAILED');
	}

	async updateToken(token_id: string, tokenData: Partial<Token>, tenantId?: string): Promise<DatabaseResult<Token>> {
		return this.core.wrap(async () => {
			const conditions = [eq(schema.authTokens._id, token_id as string)];
			if (tenantId) {
				conditions.push(eq(schema.authTokens.tenantId, tenantId));
			}
			await this.db
				.update(schema.authTokens)
				.set({ ...tokenData, updatedAt: isoDateStringToDate(nowISODateString()) } as Record<string, unknown>)
				.where(and(...conditions));
			const [result] = await this.db
				.select()
				.from(schema.authTokens)
				.where(and(...conditions))
				.limit(1);
			return utils.convertDatesToISO(result) as unknown as Token;
		}, 'UPDATE_TOKEN_FAILED');
	}

	async validateToken(
		token: string,
		user_id?: string,
		type?: string,
		tenantId?: string
	): Promise<DatabaseResult<{ success: boolean; message: string; email?: string }>> {
		return this.core.wrap(async () => {
			const conditions = [
				eq(schema.authTokens.token, token as string),
				gt(schema.authTokens.expires, isoDateStringToDate(nowISODateString())),
				eq(schema.authTokens.consumed, false)
			];
			if (user_id) {
				conditions.push(eq(schema.authTokens.user_id, user_id));
			}
			if (type) {
				conditions.push(eq(schema.authTokens.type, type));
			}
			if (tenantId) {
				conditions.push(eq(schema.authTokens.tenantId, tenantId));
			}

			const [t] = await this.db
				.select()
				.from(schema.authTokens)
				.where(and(...conditions))
				.limit(1);

			if (!t) {
				return { success: false, message: 'Invalid or expired token' };
			}
			return { success: true, message: 'Token is valid', email: t.email as string };
		}, 'VALIDATE_TOKEN_FAILED');
	}

	async consumeToken(
		token: string,
		user_id?: string,
		type?: string,
		tenantId?: string
	): Promise<DatabaseResult<{ status: boolean; message: string }>> {
		return this.core.wrap(async () => {
			const conditions = [eq(schema.authTokens.token, token as string)];
			if (user_id) {
				conditions.push(eq(schema.authTokens.user_id, user_id));
			}
			if (type) {
				conditions.push(eq(schema.authTokens.type, type));
			}
			if (tenantId) {
				conditions.push(eq(schema.authTokens.tenantId, tenantId));
			}

			const result = await this.db
				.update(schema.authTokens)
				.set({ consumed: true, updatedAt: isoDateStringToDate(nowISODateString()) })
				.where(and(...conditions));

			return {
				status: result[0].affectedRows > 0,
				message: result[0].affectedRows > 0 ? 'Token consumed' : 'Token not found or already consumed'
			};
		}, 'CONSUME_TOKEN_FAILED');
	}

	async getTokenData(token: string, user_id?: string, type?: string, tenantId?: string): Promise<DatabaseResult<Token | null>> {
		return this.core.wrap(async () => {
			const conditions = [eq(schema.authTokens.token, token as string)];
			if (user_id) {
				conditions.push(eq(schema.authTokens.user_id, user_id));
			}
			if (type) {
				conditions.push(eq(schema.authTokens.type, type));
			}
			if (tenantId) {
				conditions.push(eq(schema.authTokens.tenantId, tenantId));
			}

			const [t] = await this.db
				.select()
				.from(schema.authTokens)
				.where(and(...conditions))
				.limit(1);
			return t ? (utils.convertDatesToISO(t) as unknown as Token) : null;
		}, 'GET_TOKEN_DATA_FAILED');
	}

	async getTokenByValue(token: string, tenantId?: string): Promise<DatabaseResult<Token | null>> {
		return this.getTokenData(token, undefined, undefined, tenantId);
	}

	async getAllTokens(filter?: Record<string, unknown>): Promise<DatabaseResult<Token[]>> {
		return this.core.wrap(async () => {
			const conditions: import('drizzle-orm').SQL[] = [];
			if (filter?.email) {
				conditions.push(eq(schema.authTokens.email, filter.email as string));
			}
			if (filter?.user_id) {
				conditions.push(eq(schema.authTokens.user_id, filter.user_id as string));
			}
			if (filter?.type) {
				conditions.push(eq(schema.authTokens.type, filter.type as string));
			}
			if (filter?.tenantId) {
				conditions.push(eq(schema.authTokens.tenantId, filter.tenantId as string));
			}

			const results = await this.db
				.select()
				.from(schema.authTokens)
				.where(conditions.length > 0 ? and(...conditions) : undefined);
			return utils.convertArrayDatesToISO(results) as unknown as Token[];
		}, 'GET_ALL_TOKENS_FAILED');
	}

	async deleteExpiredTokens(): Promise<DatabaseResult<number>> {
		return this.core.wrap(async () => {
			const result = await this.db.delete(schema.authTokens).where(lt(schema.authTokens.expires, isoDateStringToDate(nowISODateString())));
			return result[0].affectedRows;
		}, 'DELETE_EXPIRED_TOKENS_FAILED');
	}

	async deleteTokens(token_ids: string[], tenantId?: string): Promise<DatabaseResult<{ deletedCount: number }>> {
		return this.core.wrap(async () => {
			// Try matching by _id first, then fall back to token value
			// (API endpoints pass token values, not _ids)
			const conditions: import('drizzle-orm').SQL[] = [];
			if (tenantId) {
				conditions.push(eq(schema.authTokens.tenantId, tenantId));
			}

			// Try delete by _id
			const byIdResult = await this.db.delete(schema.authTokens).where(and(inArray(schema.authTokens._id, token_ids), ...conditions));
			if (byIdResult[0].affectedRows > 0) {
				return { deletedCount: byIdResult[0].affectedRows };
			}

			// Fall back to delete by token value
			const byValueResult = await this.db.delete(schema.authTokens).where(and(inArray(schema.authTokens.token, token_ids as string[]), ...conditions));
			return { deletedCount: byValueResult[0].affectedRows };
		}, 'DELETE_TOKENS_FAILED');
	}

	async blockTokens(token_ids: string[], tenantId?: string): Promise<DatabaseResult<{ modifiedCount: number }>> {
		return this.core.wrap(async () => {
			const conditions = [inArray(schema.authTokens._id, token_ids)];
			if (tenantId) {
				conditions.push(eq(schema.authTokens.tenantId, tenantId));
			}
			const result = await this.db
				.update(schema.authTokens)
				.set({ blocked: true, updatedAt: isoDateStringToDate(nowISODateString()) })
				.where(and(...conditions));
			return { modifiedCount: result[0].affectedRows };
		}, 'BLOCK_TOKENS_FAILED');
	}

	async unblockTokens(token_ids: string[], tenantId?: string): Promise<DatabaseResult<{ modifiedCount: number }>> {
		return this.core.wrap(async () => {
			const conditions = [inArray(schema.authTokens._id, token_ids)];
			if (tenantId) {
				conditions.push(eq(schema.authTokens.tenantId, tenantId));
			}
			const result = await this.db
				.update(schema.authTokens)
				.set({ blocked: false, updatedAt: isoDateStringToDate(nowISODateString()) })
				.where(and(...conditions));
			return { modifiedCount: result[0].affectedRows };
		}, 'UNBLOCK_TOKENS_FAILED');
	}

	private mapRole(dbRole: typeof schema.roles.$inferSelect): Role {
		const role = utils.convertDatesToISO(dbRole);
		return {
			...role,
			permissions: utils.parseJsonField<string[]>((role as unknown as { permissions: unknown }).permissions, [])
		} as unknown as Role;
	}

	// Role methods
	async getAllRoles(tenantId?: string): Promise<Role[]> {
		if (!this.db) {
			return [];
		}
		try {
			const conditions = [];
			if (tenantId) {
				conditions.push(eq(schema.roles.tenantId, tenantId));
			}
			const results = await this.db
				.select()
				.from(schema.roles)
				.where(conditions.length > 0 ? and(...conditions) : undefined);
			return results.map((r) => this.mapRole(r));
		} catch (error) {
			logger.error('Get all roles failed:', error);
			return [];
		}
	}

	async getRoleById(roleId: string, tenantId?: string): Promise<DatabaseResult<Role | null>> {
		return this.core.wrap(async () => {
			const conditions = [eq(schema.roles._id, roleId as string)];
			if (tenantId) {
				conditions.push(eq(schema.roles.tenantId, tenantId));
			}
			const [result] = await this.db
				.select()
				.from(schema.roles)
				.where(and(...conditions))
				.limit(1);
			return result ? this.mapRole(result) : null;
		}, 'GET_ROLE_BY_ID_FAILED');
	}

	async createRole(role: Role): Promise<DatabaseResult<Role>> {
		return this.core.wrap(async () => {
			const id = (role._id || utils.generateId()) as string;
			await this.db.insert(schema.roles).values({
				...role,
				_id: id,
				createdAt: isoDateStringToDate(nowISODateString()),
				updatedAt: isoDateStringToDate(nowISODateString()),
				permissions: role.permissions || []
			} as typeof schema.roles.$inferInsert);
			const [result] = await this.db.select().from(schema.roles).where(eq(schema.roles._id, id)).limit(1);
			return this.mapRole(result);
		}, 'CREATE_ROLE_FAILED');
	}

	async updateRole(roleId: string, roleData: Partial<Role>, tenantId?: string): Promise<DatabaseResult<Role>> {
		return this.core.wrap(async () => {
			const conditions = [eq(schema.roles._id, roleId as string)];
			if (tenantId) {
				conditions.push(eq(schema.roles.tenantId, tenantId));
			}
			await this.db
				.update(schema.roles)
				.set({ ...roleData, updatedAt: isoDateStringToDate(nowISODateString()) } as Record<string, unknown>)
				.where(and(...conditions));
			const [result] = await this.db
				.select()
				.from(schema.roles)
				.where(and(...conditions))
				.limit(1);
			return this.mapRole(result);
		}, 'UPDATE_ROLE_FAILED');
	}

	async deleteRole(roleId: string, tenantId?: string): Promise<DatabaseResult<void>> {
		return this.core.wrap(async () => {
			const conditions = [eq(schema.roles._id, roleId as string)];
			if (tenantId) {
				conditions.push(eq(schema.roles.tenantId, tenantId));
			}
			await this.db.delete(schema.roles).where(and(...conditions));
		}, 'DELETE_ROLE_FAILED');
	}
}
