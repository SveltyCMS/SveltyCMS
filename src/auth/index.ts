/**
 * @file src/auth/index.ts
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

import type { authDBInterface } from './authDBInterface';
import type { Permission, Role, Session, SessionStore, Token, User } from './types';

import { roles } from '@root/config/roles';
import { corePermissions } from './corePermissions';

// System Logger
import { logger } from '@utils/logger.svelte';

// Password utilities

// Import global settings service for DB-based configuration
import type { DatabaseResult } from '@src/databases/dbInterface';
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
// Use: import { generateTOTPSecret, ... } from '@src/auth/totp';

// Note: TwoFactorAuthService is server-only and should be imported from './twoFactorAuth' directly
// to avoid bundling Node.js crypto module in client-side code.
// Use: import { TwoFactorAuthService, ... } from '@src/auth/twoFactorAuth';

export type { TwoFactorSetupResponse, TwoFactorVerificationResult } from './twoFactorAuthTypes';

export type { Permission, PermissionAction, PermissionType, Role, RolePermissions, Session, SessionStore, Token, User } from './types';

// Export safe constants
export { generateRandomToken, generateTokenWithExpiry, SESSION_COOKIE_NAME } from './constants';

// Import for internal use
import { SESSION_COOKIE_NAME } from './constants';

// Import argon2 and related constants
let argon2: typeof import('argon2') | null = null;
if (typeof window === 'undefined') {
	try {
		argon2 = await import('argon2');
	} catch {
		logger.warn('Argon2 not available in this environment');
	}
}

const argon2Attributes = {
	memory: 65536,
	time: 3,
	parallelism: 4
};

// Main Auth class
export class Auth {
	private db: authDBInterface;
	private sessionStore: SessionStore;
	private roles: Role[] = [...roles];
	private permissions: Permission[] = [...corePermissions];

	constructor(db: authDBInterface, sessionStore: SessionStore) {
		this.db = db;
		this.sessionStore = sessionStore;
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
				if (!argon2) throw error(500, 'Argon2 is not available');
				hashedPassword = await argon2.hash(password, { ...argon2Attributes, type: argon2.argon2id });
			}

			const result = await this.db.createUser({ ...userData, email: normalizedEmail, password: hashedPassword });
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
		const result = (await this.db.getUserById(user_id, tenantId)) as unknown;
		if (result && typeof result === 'object' && result !== null && 'success' in (result as Record<string, unknown>)) {
			const r = result as DatabaseResult<User | null>;
			if (r.success) return r.data;
			return null;
		}
		return (result as User | null) ?? null;
	}

	async getUserByEmail(criteria: { email: string; tenantId?: string }): Promise<User | null> {
		const result = (await this.db.getUserByEmail(criteria)) as unknown;
		if (result && typeof result === 'object' && result !== null && 'success' in (result as Record<string, unknown>)) {
			const r = result as DatabaseResult<User | null>;
			if (r.success === true) return r.data;
			return null;
		}
		return (result as User | null) ?? null;
	}

	async updateUser(userId: string, updates: Partial<User>, tenantId?: string): Promise<void> {
		const result = await this.db.updateUserAttributes(userId, updates, tenantId);
		if (!result || !result.success) {
			throw error(500, 'Failed to update user');
		}
	}

	async deleteUser(user_id: string, tenantId?: string): Promise<void> {
		const result = await this.db.deleteUser(user_id, tenantId);
		if (!result || !result.success) {
			throw error(500, 'Failed to delete user');
		}
	}

	async getAllUsers(options?: { filter?: { tenantId?: string } }): Promise<User[]> {
		const result = await this.db.getAllUsers(options);
		if (result && result.success) {
			return result.data;
		}
		return [];
	}

	async getUserCount(filter?: { tenantId?: string }): Promise<number> {
		const result = await this.db.getUserCount(filter);
		if (result && result.success) {
			return result.data;
		}
		return 0;
	}

	async createSession(sessionData: { user_id: string; expires: Date; tenantId?: string }): Promise<Session> {
		const sr = (await this.db.createSession(sessionData)) as unknown;
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

		const ur = (await this.db.getUserById(sessionData.user_id, sessionData.tenantId)) as unknown;
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
		const result = await this.db.validateSession(session_id);
		if (result && result.success) {
			return result.data;
		}
		return null;
	}

	async destroySession(session_id: string): Promise<void> {
		await this.db.deleteSession(session_id);
		await this.sessionStore.delete(session_id);
	}

	async getSessionTokenData(session_id: string): Promise<{ expiresAt: Date; user_id: string } | null> {
		const result = await this.db.getSessionTokenData(session_id);
		if (result && result.success) {
			return result.data;
		}
		return null;
	}

	async rotateToken(oldToken: string, expires: Date): Promise<string> {
		if (!this.db.rotateToken) throw error(500, 'Token rotation not supported');
		const result = await this.db.rotateToken(oldToken, expires);
		if (result && result.success) {
			return result.data;
		}
		throw error(500, 'Token rotation failed');
	}

	async getAllRoles(): Promise<Role[]> {
		return this.roles;
	}

	async getAllTokens(filter?: { tenantId?: string }): Promise<DatabaseResult<Token[]>> {
		const result = await this.db.getAllTokens(filter);
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
			const result = await this.db.createToken({ user_id: userId, email: user.email.toLowerCase(), expires: expires as Date, type, tenantId });
			if (typeof result === 'string') return result;
			if (result && result.success && typeof result.data === 'string') return result.data;
			if (result && !result.success && result.error?.message) throw new Error(result.error.message);
			throw new Error('Failed to create token');
		} else {
			const payload = arg1;
			const result = await this.db.createToken(payload);
			if (typeof result === 'string') return result;
			if (result && result.success && typeof result.data === 'string') return result.data;
			if (result && !result.success && result.error?.message) throw new Error(result.error.message);
			throw new Error('Failed to create token');
		}
	}

	// Token management wrappers for interface completeness
	async updateToken(token_id: string, tokenData: Partial<Token>, tenantId?: string): Promise<Token> {
		const result = await this.db.updateToken(token_id, tokenData, tenantId);
		if (result && result.success) return result.data;
		throw error(500, !result || result.success ? 'Failed to update token' : result.message || 'Failed to update token');
	}

	async deleteTokens(token_ids: string[], tenantId?: string): Promise<{ deletedCount: number }> {
		const result = await this.db.deleteTokens(token_ids, tenantId);
		if (result && result.success) return result.data;
		throw error(500, !result || result.success ? 'Failed to delete tokens' : result.message || 'Failed to delete tokens');
	}

	async blockTokens(token_ids: string[], tenantId?: string): Promise<{ modifiedCount: number }> {
		const result = await this.db.blockTokens(token_ids, tenantId);
		if (result && result.success) return result.data;
		throw error(500, !result || result.success ? 'Failed to block tokens' : result.message || 'Failed to block tokens');
	}

	async unblockTokens(token_ids: string[], tenantId?: string): Promise<{ modifiedCount: number }> {
		const result = await this.db.unblockTokens(token_ids, tenantId);
		if (result && result.success) return result.data;
		throw error(500, !result || result.success ? 'Failed to unblock tokens' : result.message || 'Failed to unblock tokens');
	}

	async getTokenByValue(token: string, tenantId?: string): Promise<Token | null> {
		const result = await this.db.getTokenByValue(token, tenantId);
		if (result && result.success) return result.data;
		throw error(500, !result || result.success ? 'Failed to get token' : result.message || 'Failed to get token');
	}

	async validateToken(token: string, user_id?: string, type: string = 'access', tenantId?: string): Promise<{ success: boolean; message: string }> {
		const result = await this.db.validateToken(token, user_id, type, tenantId);
		if (result && result.success && result.data) {
			return { success: true, message: result.data.message ?? 'Token validated' };
		}
		return { success: false, message: !result || result.success ? 'Token validation failed' : result.message || 'Token validation failed' };
	}

	async validateRegistrationToken(token: string, tenantId?: string): Promise<{ isValid: boolean; message: string; details?: Token }> {
		const result = await this.db.validateToken(token, undefined, 'user-invite', tenantId);
		if (result && result.success && result.data) {
			const tokenResult = await this.db.getTokenByValue(token, tenantId);
			const tokenDoc = tokenResult && tokenResult.success ? tokenResult.data : null;
			return { isValid: true, message: result.data.message, details: tokenDoc ?? undefined };
		} else {
			return { isValid: false, message: !result || result.success ? 'Token validation failed' : result.message || 'Token validation failed' };
		}
	}

	async consumeToken(token: string, user_id?: string, type: string = 'access', tenantId?: string): Promise<{ status: boolean; message: string }> {
		const result = await this.db.consumeToken(token, user_id, type, tenantId);
		if (result && result.success) {
			return result.data;
		}
		return { status: false, message: !result || result.success ? 'Failed to consume token' : result.message || 'Failed to consume token' };
	}

	async consumeRegistrationToken(token: string, tenantId?: string): Promise<{ status: boolean; message: string }> {
		const result = await this.db.consumeToken(token, undefined, 'user-invite', tenantId);
		if (result && result.success && result.data) {
			return result.data;
		} else {
			return { status: false, message: !result || result.success ? 'Failed to consume token' : result.message || 'Failed to consume token' };
		}
	}

	async authenticate(email: string, password: string, tenantId?: string): Promise<{ user: User; sessionId: string } | null> {
		try {
			const user = await this.getUserByEmail({ email, tenantId });
			if (!user || !user.password) return null;

			const argon2 = await import('argon2');
			const isValid = await argon2.verify(user.password, password);
			if (!isValid) return null;

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
			const result = await this.db.getUserByEmail({ email: fields.email, tenantId: fields.tenantId });
			if (result && result.success) {
				return result.data;
			}
			return null;
		} else if (fields.user_id) {
			const result = await this.db.getUserById(fields.user_id, fields.tenantId);
			if (result && result.success) {
				return result.data;
			}
			return null;
		}
		return null;
	}

	async updateUserAttributes(user_id: string, attributes: Partial<User>, tenantId?: string): Promise<User> {
		if (attributes.password && typeof window === 'undefined') {
			if (!argon2) throw error(500, 'Argon2 is not available');
			attributes.password = await argon2.hash(attributes.password, { ...argon2Attributes, type: argon2.argon2id });
		}
		if (attributes.email === null) {
			attributes.email = undefined;
		}
		const result = await this.db.updateUserAttributes(user_id, attributes, tenantId);
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
		await this.db.invalidateAllUserSessions(user_id, tenantId);
	}

	async getActiveSessions(user_id: string, tenantId?: string): Promise<{ success: boolean; data: Session[]; message?: string }> {
		try {
			const result = await this.db.getActiveSessions(user_id, tenantId);
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
			const result = await this.db.getAllActiveSessions(tenantId);
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
		const argon2 = await import('argon2');
		const hashedPassword = await argon2.hash(password);
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
	if (typeof window !== 'undefined') throw new Error('Password hashing is only available on the server');
	const argon2Module = await import('argon2');
	return argon2Module.hash(password, { ...argon2Attributes, type: argon2Module.argon2id });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
	if (typeof window !== 'undefined') throw new Error('Password verification is only available on the server');
	const argon2Module = await import('argon2');
	return argon2Module.verify(hash, password);
}
