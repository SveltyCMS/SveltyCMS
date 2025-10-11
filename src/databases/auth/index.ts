/**
 * @file src/databases/auth/index.ts
 * @description Simplified authentication and authorization system, now multi-tenant aware.
 *
 * This consolidated module handles:
 * - User authentication and session management, scoped by tenant.
 * - Role-based access control with admin override.
 * - Permission checking with simplified logic.
 * - Token management, scoped by tenant.
 */

import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

import type { DatabaseAdapter, DatabaseResult } from '@src/databases/dbInterface';
import type { Permission, Role, Session, SessionStore, Token, User } from './types';

import { roles } from '@root/config/roles';
import { corePermissions } from './corePermissions';

// System Logger
import { logger } from '@utils/logger.svelte';

// Import global settings service for DB-based configuration
import { privateEnv } from '@src/stores/globalSettings';

export {
	checkPermissions,
	getRolePermissionsWithRoles as checkRolePermissions,
	getAllPermissions,
	getPermissionById,
	getPermissionConfig,
	getUserRole,
	getUserRoles,
	hasPermissionWithRoles as hasPermission,
	hasPermissionByAction,
	isAdminRoleWithRoles,
	permissionConfigs,
	permissions,
	registerPermission,
	validateUserPermission
} from './permissions';

// Note: TOTP functions are server-only and should be imported from './totp' directly
// to avoid bundling Node.js crypto module in client-side code.
// Use: import { generateTOTPSecret, ... } from '@src/databases/auth/totp';

// Note: TwoFactorAuthService is server-only and should be imported from './twoFactorAuth' directly
// to avoid bundling Node.js crypto module in client-side code.
// Use: import { TwoFactorAuthService, ... } from '@src/databases/auth/twoFactorAuth';

export type { TwoFactorSetupResponse, TwoFactorVerificationResult } from './twoFactorAuthTypes';

export type { Permission, PermissionAction, PermissionType, Role, RolePermissions, Session, SessionStore, Token, User } from './types';

// Export safe constants
export { generateRandomToken, generateTokenWithExpiry, SESSION_COOKIE_NAME } from './constants';

// Import for internal use
import { SESSION_COOKIE_NAME } from './constants';

// Import shared crypto utilities with Argon2
import { hashPassword as cryptoHashPassword, verifyPassword as cryptoVerifyPassword } from '@utils/crypto';

// Import caching
import { cacheService, CacheCategory } from '@src/databases/CacheService';

// Main Auth class
export class Auth {
	private db: DatabaseAdapter;
	private sessionStore: SessionStore;
	private roles: Role[] = [...roles];
	private permissions: Permission[] = [...corePermissions];

	constructor(db: DatabaseAdapter, sessionStore: SessionStore) {
		this.db = db;
		this.sessionStore = sessionStore;
	}

	// Combined Performance-Optimized Methods (wrapper for db.auth methods)
	async createUserAndSession(
		userData: Partial<User>,
		sessionData: { expires: Date; tenantId?: string }
	): Promise<DatabaseResult<{ user: User; session: Session }>> {
		return this.db.auth.createUserAndSession(userData, sessionData);
	}

	async deleteUserAndSessions(user_id: string, tenantId?: string): Promise<DatabaseResult<{ deletedUser: boolean; deletedSessionCount: number }>> {
		return this.db.auth.deleteUserAndSessions(user_id, tenantId);
	}

	// Additional wrapper methods for common auth operations
	async createToken(tokenData: {
		user_id: string;
		expires: Date;
		type: string;
		metadata?: Record<string, unknown>;
		tenantId?: string;
	}): Promise<DatabaseResult<Token>> {
		return this.db.auth.createToken(tokenData);
	}

	async getUserById(userId: string, tenantId?: string): Promise<DatabaseResult<User | null>> {
		return this.db.auth.getUserById(userId, tenantId);
	}

	async blockUsers(userIds: string[], tenantId?: string): Promise<DatabaseResult<number>> {
		return this.db.auth.blockUsers(userIds, tenantId);
	}

	async unblockUsers(userIds: string[], tenantId?: string): Promise<DatabaseResult<number>> {
		return this.db.auth.unblockUsers(userIds, tenantId);
	}

	// Role management

	getRoles(): Role[] {
		return this.roles;
	}

	getRoleById(roleId: string): Role | undefined {
		return this.roles.find((role) => role._id === roleId);
	}

	addRole(role: Role): void {
		const exists = this.roles.some((r) => r._id === role._id);
		if (!exists) {
			this.roles.push(role);
		}
	}

	updateRole(roleId: string, updates: Partial<Role>): void {
		const index = this.roles.findIndex((r) => r._id === roleId);
		if (index !== -1) {
			this.roles[index] = { ...this.roles[index], ...updates };
		}
	}

	deleteRole(roleId: string): void {
		this.roles = this.roles.filter((r) => r._id !== roleId);
	} // Permission management

	getPermissions(): Permission[] {
		return this.permissions;
	}

	addPermission(permission: Permission): void {
		const exists = this.permissions.some((p) => p._id === permission._id);
		if (!exists) {
			this.permissions.push(permission);
		}
	} // Simplified permission checking - ADMINS GET ALL PERMISSIONS

	hasPermission(user: User, permissionId: string): boolean {
		const userRole = this.getRoleById(user.role);
		if (!userRole) {
			logger.warn('Role not found for user', { email: user.email });
			return false;
		}

		if (userRole.isAdmin) {
			return true;
		}

		return userRole.permissions.includes(permissionId);
	} // Check permission by action and type

	hasPermissionByAction(user: User, action: string, type: string, contextId?: string): boolean {
		const userRole = this.getRoleById(user.role);
		if (!userRole) return false;

		if (userRole.isAdmin) {
			return true;
		}

		const permission = this.permissions.find((p) => p.action === action && p.type === type && (!contextId || p.contextId === contextId));
		if (!permission) return false;

		return userRole.permissions.includes(permission._id);
	} // User management

	async createUser(userData: Partial<User>, oauth: boolean = false): Promise<User> {
		try {
			const { email, password, tenantId } = userData;

			if (!email || (!oauth && !password)) {
				throw error(400, 'Email and password are required');
			}

			if (privateEnv.MULTI_TENANT && !tenantId) {
				throw error(400, 'Tenant ID is required in multi-tenant mode');
			}

			const normalizedEmail = email.toLowerCase();
			let hashedPassword: string | undefined;
			if (!oauth && password) {
				hashedPassword = await cryptoHashPassword(password);
			}

			const result = await this.db.auth.createUser({ ...userData, email: normalizedEmail, password: hashedPassword });
			if (!result || !result.success || !result.data || !result.data._id) {
				throw error(500, 'User creation failed');
			}
			return result.data;
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			throw error(500, `Failed to create user: ${errMsg}`);
		}
	}

	async getUserById(user_id: string, tenantId?: string): Promise<User | null> {
		// Cache user data using USER category (dynamic TTL from settings)
		const cacheKey = `user:id:${user_id}`;
		const cached = await cacheService.get<User>(cacheKey, tenantId, CacheCategory.USER);
		if (cached) {
			logger.trace('Cache hit for user by ID', { user_id });
			return cached;
		}

		const result = (await this.db.auth.getUserById(user_id, tenantId)) as unknown;
		if (result && typeof result === 'object' && result !== null && 'success' in (result as Record<string, unknown>)) {
			const r = result as DatabaseResult<User | null>;
			if (r.success && r.data) {
				// Cache with USER category (default: 1 min, configurable via settings)
				await cacheService.setWithCategory(cacheKey, r.data, CacheCategory.USER, tenantId);
				return r.data;
			}
			return null;
		}
		return (result as User | null) ?? null;
	}
	async getUserByEmail(criteria: { email: string; tenantId?: string }): Promise<User | null> {
		// Cache user lookups by email using USER category
		const cacheKey = `user:email:${criteria.email.toLowerCase()}`;
		const cached = await cacheService.get<User>(cacheKey, criteria.tenantId, CacheCategory.USER);
		if (cached) {
			logger.trace('Cache hit for user by email', { email: criteria.email });
			return cached;
		}

		const result = (await this.db.auth.getUserByEmail(criteria)) as unknown;
		logger.debug('Auth.getUserByEmail - raw result from db.auth', {
			result,
			isObject: typeof result === 'object',
			hasSuccess: result && typeof result === 'object' && 'success' in result,
			resultType: typeof result
		});
		if (result && typeof result === 'object' && result !== null && 'success' in (result as Record<string, unknown>)) {
			const r = result as DatabaseResult<User | null>;
			logger.debug('Auth.getUserByEmail - unwrapping DatabaseResult', {
				success: r.success,
				dataPresent: r.success && 'data' in r,
				dataType: r.success && 'data' in r ? typeof (r as { data: unknown }).data : 'N/A'
			});
			if (r.success === true) {
				const userData = 'data' in r ? (r as { data: User | null }).data : null;
				if (userData) {
					// Cache with USER category (default: 1 min, configurable via settings)
					await cacheService.setWithCategory(cacheKey, userData, CacheCategory.USER, criteria.tenantId);
				}
				return userData ?? null;
			}
			return null;
		}
		return (result as User | null) ?? null;
	}
	async updateUser(userId: string, updates: Partial<User>, tenantId?: string): Promise<void> {
		const result = await this.db.auth.updateUserAttributes(userId, updates, tenantId);
		if (!result || !result.success) {
			throw error(500, 'Failed to update user');
		}

		// Invalidate user caches after update (maintain cache consistency)
		const cacheKey = `user:id:${userId}`;
		await cacheService.delete(cacheKey, tenantId);

		// If email was in updates, invalidate email cache too
		if (updates.email) {
			const emailCacheKey = `user:email:${updates.email.toLowerCase()}`;
			await cacheService.delete(emailCacheKey, tenantId);
		}
	}
	async deleteUser(user_id: string, tenantId?: string): Promise<void> {
		// Get user first to clear email cache
		const user = await this.getUserById(user_id, tenantId);

		const result = await this.db.auth.deleteUser(user_id, tenantId);
		if (!result || !result.success) {
			throw error(500, 'Failed to delete user');
		}

		// Invalidate all caches for this user
		const cacheKey = `user:id:${user_id}`;
		await cacheService.delete(cacheKey, tenantId);

		if (user?.email) {
			const emailCacheKey = `user:email:${user.email.toLowerCase()}`;
			await cacheService.delete(emailCacheKey, tenantId);
		}
	}
	async getAllUsers(options?: { filter?: { tenantId?: string } }): Promise<User[]> {
		const result = await this.db.auth.getAllUsers(options);
		if (result && result.success) {
			return result.data;
		}
		return [];
	}

	async getUserCount(filter?: { tenantId?: string }): Promise<number> {
		const result = await this.db.auth.getUserCount(filter);
		if (result && result.success) {
			return result.data;
		}
		return 0;
	}

	async createSession(sessionData: { user_id: string; expires: Date; tenantId?: string }): Promise<Session> {
		const sr = (await this.db.auth.createSession(sessionData)) as unknown;
		let session: Session | null = null;
		if (sr && typeof sr === 'object' && sr !== null && 'success' in (sr as Record<string, unknown>)) {
			const sessionResult = sr as DatabaseResult<Session>;
			if (!sessionResult || !sessionResult.success) {
				throw error(500, 'Session creation failed');
			}
			session = sessionResult.data;
		} else {
			session = sr as Session;
		}

		if (!session) throw error(500, 'Session creation failed');

		const ur = (await this.db.auth.getUserById(sessionData.user_id, sessionData.tenantId)) as unknown;
		let user: User | null = null;
		if (ur && typeof ur === 'object' && ur !== null && 'success' in (ur as Record<string, unknown>)) {
			const userResult = ur as DatabaseResult<User | null>;
			if (userResult && userResult.success && userResult.data) {
				user = userResult.data;
			}
		} else {
			user = (ur as User) ?? null;
		}

		if (!user) {
			throw error(404, `User not found for ID: ${sessionData.user_id}`);
		}

		await this.sessionStore.set(session._id, user, sessionData.expires);
		return session;
	}

	async validateSession(session_id: string): Promise<User | null> {
		const result = await this.db.auth.validateSession(session_id);
		if (result && result.success) {
			return result.data;
		}
		return null;
	}

	async destroySession(session_id: string): Promise<void> {
		await this.db.auth.deleteSession(session_id);
		await this.sessionStore.delete(session_id);
	}

	async getSessionTokenData(session_id: string): Promise<{ expiresAt: Date; user_id: string } | null> {
		const result = await this.db.auth.getSessionTokenData(session_id);
		if (result && result.success) {
			return result.data;
		}
		return null;
	}

	async rotateToken(oldToken: string, expires: Date): Promise<string> {
		if (!this.db.auth.rotateToken) throw error(500, 'Token rotation not supported');
		const result = await this.db.auth.rotateToken(oldToken, expires);
		if (result && result.success) {
			return result.data;
		}
		throw error(500, 'Token rotation failed');
	}

	async getAllRoles(): Promise<Role[]> {
		return this.roles;
	}

	async getAllTokens(filter?: { tenantId?: string }): Promise<DatabaseResult<Token[]>> {
		const result = await this.db.auth.getAllTokens(filter);
		return result;
	}

	// Overloaded createToken: support (userId, expires, type, tenantId) and ({ user_id, email, expires, type, tenantId })
	async createToken(
		arg1: string | { user_id: string; email: string; expires: Date; type: string; tenantId?: string },
		expires?: Date,
		type: string = 'access',
		tenantId?: string
	): Promise<string> {
		if (typeof arg1 === 'string') {
			const userId = arg1;
			const user = await this.getUserById(userId, tenantId);
			if (!user) throw new Error('User not found');
			const result = await this.db.auth.createToken({ user_id: userId, email: user.email.toLowerCase(), expires: expires as Date, type, tenantId });
			if (typeof result === 'string') return result;
			if (result && result.success && typeof result.data === 'string') return result.data;
			if (result && !result.success && result.error?.message) throw new Error(result.error.message);
			throw new Error('Failed to create token');
		} else {
			const payload = arg1;
			const result = await this.db.auth.createToken(payload);
			if (typeof result === 'string') return result;
			if (result && result.success && typeof result.data === 'string') return result.data;
			if (result && !result.success && result.error?.message) throw new Error(result.error.message);
			throw new Error('Failed to create token');
		}
	}

	// Token management wrappers for interface completeness
	async updateToken(token_id: string, tokenData: Partial<Token>, tenantId?: string): Promise<Token> {
		const result = await this.db.auth.updateToken(token_id, tokenData, tenantId);
		if (result && result.success) return result.data;
		throw error(500, !result || result.success ? 'Failed to update token' : result.message || 'Failed to update token');
	}

	async deleteTokens(token_ids: string[], tenantId?: string): Promise<{ deletedCount: number }> {
		const result = await this.db.auth.deleteTokens(token_ids, tenantId);
		if (result && result.success) return result.data;
		throw error(500, !result || result.success ? 'Failed to delete tokens' : result.message || 'Failed to delete tokens');
	}

	async blockTokens(token_ids: string[], tenantId?: string): Promise<{ modifiedCount: number }> {
		const result = await this.db.auth.blockTokens(token_ids, tenantId);
		if (result && result.success) return result.data;
		throw error(500, !result || result.success ? 'Failed to block tokens' : result.message || 'Failed to block tokens');
	}

	async unblockTokens(token_ids: string[], tenantId?: string): Promise<{ modifiedCount: number }> {
		const result = await this.db.auth.unblockTokens(token_ids, tenantId);
		if (result && result.success) return result.data;
		throw error(500, !result || result.success ? 'Failed to unblock tokens' : result.message || 'Failed to unblock tokens');
	}

	async getTokenByValue(token: string, tenantId?: string): Promise<Token | null> {
		const result = await this.db.auth.getTokenByValue(token, tenantId);
		if (result && result.success) return result.data;
		throw error(500, !result || result.success ? 'Failed to get token' : result.message || 'Failed to get token');
	}

	async validateToken(token: string, user_id?: string, type: string = 'access', tenantId?: string): Promise<{ success: boolean; message: string }> {
		const result = await this.db.auth.validateToken(token, user_id, type, tenantId);
		if (result && result.success && result.data) {
			return { success: true, message: result.data.message ?? 'Token validated' };
		}
		return { success: false, message: !result || result.success ? 'Token validation failed' : result.message || 'Token validation failed' };
	}

	async validateRegistrationToken(token: string, tenantId?: string): Promise<{ isValid: boolean; message: string; details?: Token }> {
		const result = await this.db.auth.validateToken(token, undefined, 'user-invite', tenantId);
		if (result && result.success && result.data) {
			const tokenResult = await this.db.auth.getTokenByValue(token, tenantId);
			const tokenDoc = tokenResult && tokenResult.success ? tokenResult.data : null;
			return { isValid: true, message: result.data.message, details: tokenDoc ?? undefined };
		} else {
			return { isValid: false, message: !result || result.success ? 'Token validation failed' : result.message || 'Token validation failed' };
		}
	}

	async consumeToken(token: string, user_id?: string, type: string = 'access', tenantId?: string): Promise<{ status: boolean; message: string }> {
		const result = await this.db.auth.consumeToken(token, user_id, type, tenantId);
		if (result && result.success) {
			return result.data;
		}
		return { status: false, message: !result || result.success ? 'Failed to consume token' : result.message || 'Failed to consume token' };
	}

	async consumeRegistrationToken(token: string, tenantId?: string): Promise<{ status: boolean; message: string }> {
		const result = await this.db.auth.consumeToken(token, undefined, 'user-invite', tenantId);
		if (result && result.success && result.data) {
			return result.data;
		} else {
			return { status: false, message: !result || result.success ? 'Failed to consume token' : result.message || 'Failed to consume token' };
		}
	}

	async authenticate(email: string, password: string, tenantId?: string): Promise<{ user: User; sessionId: string } | null> {
		try {
			const user = await this.getUserByEmail({ email, tenantId });
			if (!user) {
				logger.debug('User not found for authentication', { email, tenantId });
				return null;
			}
			if (!user.password) {
				logger.debug('User has no password field', { email, tenantId, userId: user._id });
				return null;
			}

			logger.debug('Attempting password verification', {
				email,
				tenantId,
				userId: user._id,
				hasPassword: !!user.password,
				passwordLength: user.password.length,
				passwordStartsWith: user.password.substring(0, 10) + '...'
			});

			const isValid = await cryptoVerifyPassword(password, user.password);

			logger.debug('Password verification result', { email, isValid });

			if (!isValid) {
				logger.warn('Password authentication failed', { email: email.replace(/(.{2}).*@(.*)/, '$1****@$2') });
				return null;
			}

			const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
			const session = await this.createSession({ user_id: user._id, expires: expiresAt, tenantId });

			await this.sessionStore.set(session._id, user, expiresAt);

			return { user, sessionId: session._id };
		} catch (err) {
			logger.error(`Authentication error: ${err instanceof Error ? err.message : String(err)}`);
			return null;
		}
	}

	async logOut(session_id: string): Promise<void> {
		await this.destroySession(session_id);
	}

	async checkUser(fields: { user_id?: string; email?: string; tenantId?: string }): Promise<User | null> {
		if (fields.email) {
			const result = await this.db.auth.getUserByEmail({ email: fields.email, tenantId: fields.tenantId });
			if (result && result.success) {
				return result.data;
			}
			return null;
		} else if (fields.user_id) {
			const result = await this.db.auth.getUserById(fields.user_id, fields.tenantId);
			if (result && result.success) {
				return result.data;
			}
			return null;
		}
		return null;
	}

	async updateUserAttributes(user_id: string, attributes: Partial<User>, tenantId?: string): Promise<User> {
		if (attributes.password && typeof window === 'undefined') {
			attributes.password = await cryptoHashPassword(attributes.password);
		}
		if (attributes.email === null) {
			attributes.email = undefined;
		}
		const result = await this.db.auth.updateUserAttributes(user_id, attributes, tenantId);
		if (result && result.success) {
			return result.data;
		}
		throw error(500, 'Failed to update user attributes');
	}

	createSessionCookie(sessionId: string): { name: string; value: string; attributes: unknown } {
		return {
			name: SESSION_COOKIE_NAME,
			value: sessionId,
			attributes: {
				httpOnly: true,
				secure: !dev,
				sameSite: 'strict',
				maxAge: 24 * 60 * 60,
				path: '/'
			}
		};
	}

	async invalidateAllUserSessions(user_id: string, tenantId?: string): Promise<void> {
		await this.db.auth.invalidateAllUserSessions(user_id, tenantId);
	}

	async getActiveSessions(user_id: string, tenantId?: string): Promise<{ success: boolean; data: Session[]; message?: string }> {
		try {
			const result = await this.db.auth.getActiveSessions(user_id, tenantId);
			if (result && result.success) {
				return { success: true, data: result.data };
			}
			return { success: false, data: [], message: 'Failed to retrieve active sessions' };
		} catch (err) {
			logger.error(`Error getting active sessions: ${err instanceof Error ? err.message : String(err)}`);
			return { success: false, data: [], message: err instanceof Error ? err.message : 'Unknown error' };
		}
	}

	async getAllActiveSessions(tenantId?: string): Promise<{ success: boolean; data: Session[]; message?: string }> {
		try {
			const result = await this.db.auth.getAllActiveSessions(tenantId);
			if (result && result.success) {
				return { success: true, data: result.data };
			}
			return { success: false, data: [], message: 'Failed to retrieve all active sessions' };
		} catch (err) {
			logger.error(`Error getting all active sessions: ${err instanceof Error ? err.message : String(err)}`);
			return { success: false, data: [], message: err instanceof Error ? err.message : 'Unknown error' };
		}
	}

	async updateUserPassword(email: string, password: string, tenantId?: string): Promise<{ status: boolean; message?: string }> {
		const user = await this.getUserByEmail({ email, tenantId });
		if (!user) {
			return { status: false, message: 'User not found' };
		}
		const hashedPassword = await cryptoHashPassword(password);
		await this.updateUser(user._id, { password: hashedPassword }, tenantId);
		return { status: true };
	}
}

// Utility functions for backwards compatibility
export function isAdmin(user: User): boolean {
	const role = roles.find((r) => r._id === user.role);
	return role?.isAdmin === true;
}

export function hasRole(user: User, roleName: string): boolean {
	return user.role.toLowerCase() === roleName.toLowerCase();
}

export async function hashPassword(password: string): Promise<string> {
	return cryptoHashPassword(password);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
	return cryptoVerifyPassword(hash, password);
}
