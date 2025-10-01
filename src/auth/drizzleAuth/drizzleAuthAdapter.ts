import { PermissionAction, PermissionType } from '../types';
// Utility: map snake_case DB result to Permission type
function mapDbPermissionToPermission(dbPermission: Record<string, unknown> | null): Permission | null {
	if (!dbPermission) return null;
	// Safely map enums, fallback to default if not valid
	let action: PermissionAction = PermissionAction.READ;
	if (typeof dbPermission.action === 'string' && Object.values(PermissionAction).includes(dbPermission.action as PermissionAction)) {
		action = dbPermission.action as PermissionAction;
	}
	let type: PermissionType = PermissionType.SYSTEM;
	if (typeof dbPermission.contextType === 'string' && Object.values(PermissionType).includes(dbPermission.contextType as PermissionType)) {
		type = dbPermission.contextType as PermissionType;
	}
	return {
		_id: dbPermission.id as string,
		name: dbPermission.name as string,
		action,
		type,
		contextId: dbPermission.contextId as string | undefined,
		description: dbPermission.description as string | undefined
	};
}
// Utility: map snake_case DB result to camelCase Session type
function mapDbSessionToSession(dbSession: Record<string, unknown> | null): Session | null {
	if (!dbSession) return null;
	return {
		_id: dbSession.id as string,
		user_id: dbSession.user_id as string,
		expires: dbSession.expires ? new Date(dbSession.expires as string) : new Date(),
		tenantId: dbSession.tenantId as string | undefined,
		rotated: dbSession.rotated as boolean | undefined,
		rotatedTo: dbSession.rotatedTo as string | undefined
	};
}
// Utility: map snake_case DB result to Role type
function mapDbRoleToRole(dbRole: Record<string, unknown> | null): Role | null {
	if (!dbRole) return null;
	return {
		_id: dbRole.id as string,
		name: dbRole.name as string,
		description: dbRole.description as string | undefined,
		isAdmin: dbRole.isAdmin as boolean | undefined,
		permissions: dbRole.permissions
			? typeof dbRole.permissions === 'string'
				? (dbRole.permissions as string).split(',')
				: (dbRole.permissions as string[])
			: [],
		groupName: dbRole.groupName as string | undefined,
		icon: dbRole.icon as string | undefined,
		color: dbRole.color as string | undefined
	};
}
/**
 * @file src/auth/drizzleAuth/drizzleAuthAdapter.ts
 * @description Drizzle ORM adapter for authentication operations.
 *
 * This module provides a complete implementation of the authDBInterface using Drizzle ORM:
 * - User management
 * - Role and permission management
 * - Session and token handling
 *
 * Features:
 * - CRUD operations for all auth-related entities
 * - Query building using Drizzle ORM
 * - Transaction support for complex operations
 * - Error handling and logging
 *
 * Usage:
 * Used as the database adapter for authentication when using Drizzle ORM
 */

// TODO: Drizzle adapter is not yet implemented. This file is a stub.
// import { db } from '@root/src/databases/drizzle/drizzleDBAdapter';
const db: any = null; // Stub - Drizzle not implemented yet
import type { authDBInterface, DatabaseResult, PaginationOption } from '../authDBInterface';
import type { Permission, Role, Session, Token, User } from '../types';

// Utility: map snake_case DB result to camelCase User type
function mapDbUserToUser(dbUser: Record<string, unknown> | null): User | null {
	if (!dbUser) return null;
	return {
		_id: dbUser.id as string,
		email: dbUser.email as string,
		tenantId: dbUser.tenantId as string | undefined,
		password: dbUser.password as string | undefined,
		role: dbUser.role as string,
		username: dbUser.username as string | undefined,
		firstName: dbUser.first_name as string | undefined,
		lastName: dbUser.last_name as string | undefined,
		locale: dbUser.locale as string | undefined,
		avatar: dbUser.avatar as string | undefined,
		lastAuthMethod: dbUser.last_auth_method as string | undefined,
		lastActiveAt: dbUser.last_active_at ? new Date(dbUser.last_active_at as string) : undefined,
		expiresAt: dbUser.expires_at ? new Date(dbUser.expires_at as string) : undefined,
		isRegistered: dbUser.is_registered as boolean | undefined,
		failedAttempts: dbUser.failed_attempts as number | undefined,
		blocked: dbUser.blocked as boolean | undefined,
		resetRequestedAt: dbUser.reset_requested_at ? new Date(dbUser.reset_requested_at as string) : undefined,
		resetToken: dbUser.reset_token as string | undefined,
		lockoutUntil: dbUser.lockout_until ? new Date(dbUser.lockout_until as string) : undefined,
		is2FAEnabled: dbUser.is_2fa_enabled as boolean | undefined,
		totpSecret: dbUser.totp_secret as string | undefined,
		backupCodes: dbUser.backup_codes ? JSON.parse(dbUser.backup_codes as string) : [],
		last2FAVerification: dbUser.last_2fa_verification ? new Date(dbUser.last_2fa_verification as string) : undefined,
		permissions: dbUser.permissions
			? typeof dbUser.permissions === 'string'
				? (dbUser.permissions as string).split(',')
				: (dbUser.permissions as string[])
			: [],
		isAdmin: dbUser.isAdmin as boolean | undefined,
		googleRefreshToken: dbUser.googleRefreshToken as string | null | undefined
	};
}

// Import logger
import { logger } from '@utils/logger.svelte';

export class DrizzleAuthAdapter implements authDBInterface {
	// Initialize default roles and permissions from configuration
	async initializeDefaultRolesAndPermissions(): Promise<void> {
		// Initialization from config is not implemented in mock DB. This method is a placeholder.
		logger.info('Default roles and permissions initialization is not implemented in mock DB.');
	}

	// User Management Methods
	async createUser(userData: Partial<User>): Promise<DatabaseResult<User>> {
		try {
			const inserted = await db.insertMany('users', [userData as Record<string, unknown>]);
			const user = mapDbUserToUser(inserted[0]);
			return { success: true, data: user! };
		} catch (error) {
			logger.error(`Failed to create user: ${(error as Error).message}`);
			return {
				success: false,
				message: 'Failed to create user',
				error: { code: 'CREATE_USER_ERROR', message: (error as Error).message }
			};
		}
	}

	// Update user attributes
	async updateUserAttributes(user_id: string, userData: Partial<User>, tenantId?: string): Promise<DatabaseResult<User>> {
		try {
			const query: Record<string, unknown> = { id: user_id };
			if (tenantId) query.tenantId = tenantId;
			const updatedUser = await db.updateOne('users', query, userData as Record<string, unknown>);
			const user = mapDbUserToUser(updatedUser);
			if (user) {
				return { success: true, data: user };
			} else {
				return {
					success: false,
					message: 'User not found after update',
					error: { code: 'USER_NOT_FOUND', message: 'User not found after update' }
				};
			}
		} catch (error) {
			logger.error(`Failed to update user attributes: ${(error as Error).message}`);
			return {
				success: false,
				message: 'Failed to update user attributes',
				error: { code: 'UPDATE_USER_ERROR', message: (error as Error).message }
			};
		}
	}

	// Delete a user
	async deleteUser(user_id: string, tenantId?: string): Promise<DatabaseResult<void>> {
		try {
			const query: Record<string, unknown> = { id: user_id };
			if (tenantId) query.tenantId = tenantId;
			await db.deleteOne('users', query);
			return { success: true, data: undefined };
		} catch (error) {
			logger.error(`Failed to delete user: ${(error as Error).message}`);
			return {
				success: false,
				message: 'Failed to delete user',
				error: { code: 'DELETE_USER_ERROR', message: (error as Error).message }
			};
		}
	}

	// Get a user by ID
	async getUserById(user_id: string, tenantId?: string): Promise<DatabaseResult<User | null>> {
		try {
			const query: Record<string, unknown> = { id: user_id };
			if (tenantId) query.tenantId = tenantId;
			const user = await db.findOne('users', query);
			return { success: true, data: mapDbUserToUser(user) };
		} catch (error) {
			logger.error(`Failed to get user by ID: ${(error as Error).message}`);
			return {
				success: false,
				message: 'Failed to get user by ID',
				error: { code: 'GET_USER_BY_ID_ERROR', message: (error as Error).message }
			};
		}
	}

	// Get a user by email
	async getUserByEmail(criteria: { email: string; tenantId?: string }): Promise<DatabaseResult<User | null>> {
		try {
			const query: Record<string, unknown> = { email: criteria.email };
			if (criteria.tenantId) query.tenantId = criteria.tenantId;
			const user = await db.findOne('users', query);
			return { success: true, data: mapDbUserToUser(user) };
		} catch (error) {
			logger.error(`Failed to get user by email: ${(error as Error).message}`);
			return {
				success: false,
				message: 'Failed to get user by email',
				error: { code: 'GET_USER_BY_EMAIL_ERROR', message: (error as Error).message }
			};
		}
	}

	// Get all users
	async getAllUsers(options?: PaginationOption): Promise<DatabaseResult<User[]>> {
		try {
			const query: Record<string, unknown> = options?.filter || {};
			const dbUsers = await db.findMany('users', query);
			// Sorting, offset, limit are not implemented in mock, but could be added here
			const users = dbUsers.map(mapDbUserToUser).filter(Boolean) as User[];
			return { success: true, data: users };
		} catch (error) {
			logger.error(`Failed to get all users: ${(error as Error).message}`);
			return {
				success: false,
				message: 'Failed to get all users',
				error: { code: 'GET_ALL_USERS_ERROR', message: (error as Error).message }
			};
		}
	}

	// Get the count of users
	async getUserCount(filter?: Record<string, unknown>): Promise<DatabaseResult<number>> {
		try {
			const count = await db.count('users', filter || {});
			return { success: true, data: count };
		} catch (error) {
			logger.error(`Failed to get user count: ${(error as Error).message}`);
			return {
				success: false,
				message: 'Failed to get user count',
				error: { code: 'GET_USER_COUNT_ERROR', message: (error as Error).message }
			};
		}
	}

	// Session Management Methods
	async createSession(sessionData: { user_id: string; expires: Date; tenantId?: string }): Promise<DatabaseResult<Session>> {
		try {
			const sessionDoc: Record<string, unknown> = {
				user_id: sessionData.user_id,
				expires: sessionData.expires
			};
			if (sessionData.tenantId) sessionDoc.tenantId = sessionData.tenantId;
			const inserted = await db.insertMany('sessions', [sessionDoc]);
			const session = mapDbSessionToSession(inserted[0]);
			if (session) {
				return { success: true, data: session };
			} else {
				return {
					success: false,
					message: 'Session not created',
					error: { code: 'SESSION_NOT_CREATED', message: 'Session not created' }
				};
			}
		} catch (error) {
			logger.error(`Failed to create session: ${(error as Error).message}`);
			return {
				success: false,
				message: 'Failed to create session',
				error: { code: 'CREATE_SESSION_ERROR', message: (error as Error).message }
			};
		}
	}

	// Update the expiry of an existing session
	async updateSessionExpiry(session_id: string, newExpiry: Date): Promise<DatabaseResult<Session>> {
		try {
			const query: Record<string, unknown> = { id: session_id };
			const update: Record<string, unknown> = { expires: newExpiry };
			const updatedSession = await db.updateOne('sessions', query, update);
			const session = mapDbSessionToSession(updatedSession);
			if (session) {
				return { success: true, data: session };
			} else {
				return {
					success: false,
					message: 'Session not found after update',
					error: { code: 'SESSION_NOT_FOUND', message: 'Session not found after update' }
				};
			}
		} catch (error) {
			logger.error(`Failed to update session expiry: ${(error as Error).message}`);
			return {
				success: false,
				message: 'Failed to update session expiry',
				error: { code: 'UPDATE_SESSION_ERROR', message: (error as Error).message }
			};
		}
	}

	// Destroy a session
	async deleteSession(session_id: string): Promise<DatabaseResult<void>> {
		try {
			const query: Record<string, unknown> = { id: session_id };
			await db.deleteOne('sessions', query);
			return { success: true, data: undefined };
		} catch (error) {
			logger.error(`Failed to delete session: ${(error as Error).message}`);
			return {
				success: false,
				message: 'Failed to delete session',
				error: { code: 'DELETE_SESSION_ERROR', message: (error as Error).message }
			};
		}
	}

	// Delete expired sessions
	async deleteExpiredSessions(): Promise<DatabaseResult<number>> {
		try {
			const now = new Date();
			const expiredSessions = await db.findMany('sessions', { expires: { $lte: now } });
			let deletedCount = 0;
			for (const session of expiredSessions) {
				await db.deleteOne('sessions', { id: session.id });
				deletedCount++;
			}
			return { success: true, data: deletedCount };
		} catch (error) {
			logger.error(`Failed to delete expired sessions: ${(error as Error).message}`);
			return {
				success: false,
				message: 'Failed to delete expired sessions',
				error: { code: 'DELETE_EXPIRED_SESSIONS_ERROR', message: (error as Error).message }
			};
		}
	}

	// Validate a session
	async validateSession(session_id: string): Promise<DatabaseResult<User | null>> {
		try {
			const session = await db.findOne('sessions', { id: session_id });
			if (!session || (session.expires && new Date(session.expires as string) < new Date())) {
				return { success: true, data: null };
			}
			const userResult = await this.getUserById(session.userId as string);
			return { success: true, data: userResult.data };
		} catch (error) {
			logger.error(`Failed to validate session: ${(error as Error).message}`);
			return { success: false, error };
		}
	}

	// Invalidate all sessions for a user
	async invalidateAllUserSessions(user_id: string, tenantId?: string): Promise<DatabaseResult<void>> {
		try {
			const query: Record<string, unknown> = { userId: user_id };
			if (tenantId) query.tenantId = tenantId;
			await db.deleteMany('sessions', query);
			return { success: true, data: undefined };
		} catch (error) {
			logger.error(`Failed to invalidate all user sessions: ${(error as Error).message}`);
			return { success: false, error };
		}
	}

	// Get active sessions for a user
	async getActiveSessions(user_id: string, tenantId?: string): Promise<DatabaseResult<Session[]>> {
		try {
			const query: Record<string, unknown> = { userId: user_id };
			if (tenantId) query.tenantId = tenantId;
			const sessions = await db.findMany('sessions', query);
			// Filter for active sessions
			const now = new Date();
			const activeSessions = sessions.filter((s) => s.expires && new Date(s.expires as string) > now) as Session[];
			return { success: true, data: activeSessions };
		} catch (error) {
			logger.error(`Failed to get active sessions: ${(error as Error).message}`);
			return { success: false, error };
		}
	}

	// Token Management Methods
	async createToken(data: { user_id: string; email: string; expires: Date; type: string; tenantId?: string }): Promise<DatabaseResult<string>> {
		try {
			const tokenString = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
			const tokenObj: Record<string, unknown> = {
				userId: data.user_id,
				email: data.email,
				token: tokenString,
				type: data.type,
				expires: data.expires,
				tenantId: data.tenantId
			};
			await db.insertMany('tokens', [tokenObj]);
			return { success: true, data: tokenString };
		} catch (error) {
			logger.error(`Failed to create token: ${(error as Error).message}`);
			return { success: false, error };
		}
	}

	// Validate a token
	async validateToken(
		token: string,
		user_id?: string,
		type?: string,
		tenantId?: string
	): Promise<DatabaseResult<{ success: boolean; message: string; email?: string }>> {
		try {
			const query: Record<string, unknown> = { token };
			if (user_id) query.user_id = user_id;
			if (type) query.type = type;
			if (tenantId) query.tenantId = tenantId;
			const dbToken = await db.findOne('tokens', query);
			if (dbToken && dbToken.expires > new Date() && !dbToken.blocked) {
				return { success: true, data: { success: true, message: 'Token is valid', email: dbToken.email as string } };
			} else if (dbToken && dbToken.expires <= new Date()) {
				return {
					success: false,
					message: 'Token is expired',
					error: { code: 'TOKEN_EXPIRED', message: 'Token is expired' }
				};
			} else {
				return {
					success: false,
					message: 'Token does not exist',
					error: { code: 'TOKEN_NOT_FOUND', message: 'Token does not exist' }
				};
			}
		} catch (error) {
			logger.error(`Failed to validate token: ${(error as Error).message}`);
			return {
				success: false,
				message: 'Error validating token',
				error: { code: 'TOKEN_VALIDATE_ERROR', message: (error as Error).message }
			};
		}
	}

	// Consume a token
	async consumeToken(
		token: string,
		user_id?: string,
		type?: string,
		tenantId?: string
	): Promise<DatabaseResult<{ status: boolean; message: string }>> {
		try {
			const query: Record<string, unknown> = { token };
			if (user_id) query.user_id = user_id;
			if (type) query.type = type;
			if (tenantId) query.tenantId = tenantId;
			const dbToken = await db.findOne('tokens', query);
			if (dbToken) {
				await db.deleteOne('tokens', { id: dbToken.id });
				if (dbToken.expires > new Date()) {
					return { success: true, data: { status: true, message: 'Token consumed' } };
				} else {
					return { success: true, data: { status: false, message: 'Token expired' } };
				}
			} else {
				return {
					success: false,
					message: 'Token does not exist',
					error: { code: 'TOKEN_NOT_FOUND', message: 'Token does not exist' }
				};
			}
		} catch (error) {
			logger.error(`Failed to consume token: ${(error as Error).message}`);
			return {
				success: false,
				message: 'Error consuming token',
				error: { code: 'TOKEN_CONSUME_ERROR', message: (error as Error).message }
			};
		}
	}

	// Get all tokens
	async getAllTokens(filter?: Record<string, unknown>): Promise<DatabaseResult<Token[]>> {
		try {
			const query: Record<string, unknown> = filter || {};
			const dbTokens = await db.findMany('tokens', query);
			return { success: true, data: dbTokens as Token[] };
		} catch (error) {
			logger.error(`Failed to get all tokens: ${(error as Error).message}`);
			return {
				success: false,
				message: 'Error getting tokens',
				error: { code: 'GET_TOKENS_ERROR', message: (error as Error).message }
			};
		}
	}

	// Delete expired tokens
	async deleteExpiredTokens(): Promise<DatabaseResult<number>> {
		try {
			const now = new Date();
			const expiredTokens = await db.findMany('tokens', { expires: { $lte: now } });
			let deletedCount = 0;
			for (const token of expiredTokens) {
				await db.deleteOne('tokens', { id: token.id });
				deletedCount++;
			}
			return { success: true, data: deletedCount };
		} catch (error) {
			logger.error(`Failed to delete expired tokens: ${(error as Error).message}`);
			return {
				success: false,
				message: 'Failed to delete expired tokens',
				error: { code: 'DELETE_EXPIRED_TOKENS_ERROR', message: (error as Error).message }
			};
		}
	}

	// Role Management Methods
	async createRole(roleData: Partial<Role>): Promise<DatabaseResult<Role>> {
		try {
			const inserted = await db.insertMany('roles', [roleData as Record<string, unknown>]);
			return { success: true, data: mapDbRoleToRole(inserted[0])! };
		} catch (error) {
			logger.error(`Failed to create role: ${(error as Error).message}`);
			return { success: false, error: { message: (error as Error).message } };
		}
	}

	async updateRole(role_id: string, roleData: Partial<Role>): Promise<DatabaseResult<Role | null>> {
		try {
			const updated = await db.updateOne('roles', { id: role_id }, roleData as Record<string, unknown>);
			return { success: true, data: mapDbRoleToRole(updated) };
		} catch (error) {
			logger.error(`Failed to update role: ${(error as Error).message}`);
			return { success: false, error: { message: (error as Error).message } };
		}
	}

	async deleteRole(role_id: string): Promise<DatabaseResult<void>> {
		try {
			await db.deleteOne('roles', { id: role_id });
			return { success: true, data: undefined };
		} catch (error) {
			logger.error(`Failed to delete role: ${(error as Error).message}`);
			return {
				success: false,
				message: 'Failed to delete role',
				error: { code: 'DELETE_ROLE_ERROR', message: (error as Error).message }
			};
		}
	}

	async getRoleById(role_id: string): Promise<DatabaseResult<Role | null>> {
		try {
			const role = await db.findOne('roles', { id: role_id });
			return { success: true, data: mapDbRoleToRole(role) };
		} catch (error) {
			logger.error(`Failed to get role by ID: ${(error as Error).message}`);
			return {
				success: false,
				message: 'Failed to get role by ID',
				error: { code: 'GET_ROLE_BY_ID_ERROR', message: (error as Error).message }
			};
		}
	}

	async getAllRoles(options?: PaginationOption): Promise<DatabaseResult<Role[]>> {
		try {
			const query: Record<string, unknown> = options?.filter || {};
			const dbRoles = await db.findMany('roles', query);
			// Sorting, offset, limit are not implemented in mock, but could be added here
			const mappedRoles = dbRoles.map(mapDbRoleToRole).filter(Boolean) as Role[];
			return { success: true, data: mappedRoles };
		} catch (error) {
			logger.error(`Failed to get all roles: ${(error as Error).message}`);
			return {
				success: false,
				message: 'Failed to get all roles',
				error: { code: 'GET_ALL_ROLES_ERROR', message: (error as Error).message }
			};
		}
	}

	async getRoleByName(name: string): Promise<Role | null> {
		try {
			const role = await db.findOne('roles', { name });
			return mapDbRoleToRole(role);
		} catch (error) {
			logger.error(`Failed to get role by name: ${(error as Error).message}`);
			return null;
		}
	}

	// Permission Management Methods
	async createPermission(permissionData: Partial<Permission>): Promise<Permission | null> {
		try {
			const inserted = await db.insertMany('permissions', [permissionData as Record<string, unknown>]);
			const permission = mapDbPermissionToPermission(inserted[0]);
			return permission;
		} catch (error) {
			logger.error(`Failed to create permission: ${(error as Error).message}`);
			return null;
		}
	}

	async updatePermission(permission_id: string, permissionData: Partial<Permission>): Promise<DatabaseResult<void>> {
		try {
			await db.updateOne('permissions', { id: permission_id }, permissionData as Record<string, unknown>);
			return { success: true, data: undefined };
		} catch (error) {
			logger.error(`Failed to update permission: ${(error as Error).message}`);
			return {
				success: false,
				message: 'Failed to update permission',
				error: { code: 'UPDATE_PERMISSION_ERROR', message: (error as Error).message }
			};
		}
	}

	async deletePermission(permission_id: string): Promise<DatabaseResult<void>> {
		try {
			await db.deleteOne('permissions', { id: permission_id });
			return { success: true, data: undefined };
		} catch (error) {
			logger.error(`Failed to delete permission: ${(error as Error).message}`);
			return {
				success: false,
				message: 'Failed to delete permission',
				error: { code: 'DELETE_PERMISSION_ERROR', message: (error as Error).message }
			};
		}
	}

	async getPermissionById(permission_id: string): Promise<Permission | null> {
		try {
			const permission = await db.findOne('permissions', { id: permission_id });
			return mapDbPermissionToPermission(permission);
		} catch (error) {
			logger.error(`Failed to get permission by ID: ${(error as Error).message}`);
			return null;
		}
	}

	async getAllPermissions(options?: { limit?: number; skip?: number; sort?: object; filter?: object }): Promise<Permission[]> {
		try {
			const query: Record<string, unknown> = options?.filter ? (options.filter as Record<string, unknown>) : {};
			const dbPermissions = await db.findMany('permissions', query);
			// Sorting, limit, skip not implemented in mock, but could be added here
			return dbPermissions.map(mapDbPermissionToPermission).filter(Boolean) as Permission[];
		} catch (error) {
			logger.error(`Failed to get all permissions: ${(error as Error).message}`);
			return [];
		}
	}

	async getPermissionByName(name: string): Promise<Permission | null> {
		try {
			const permission = await db.findOne('permissions', { name });
			return permission ? mapDbPermissionToPermission(permission) : null;
		} catch (error) {
			logger.error(`Failed to get permission by name: ${(error as Error).message}`);
			throw error;
		}
	}

	// Role-Permissions Linking Methods
	async assignPermissionToRole(role_id: string, permission_id: string): Promise<void> {
		try {
			await db.insertMany('rolePermissions', [{ roleId: role_id, permissionId: permission_id }]);
		} catch (error) {
			logger.error(`Failed to assign permission to role: ${(error as Error).message}`);
			throw error;
		}
	}

	async deletePermissionFromRole(role_id: string, permission_id: string): Promise<void> {
		try {
			await db.deleteOne('rolePermissions', { roleId: role_id, permissionId: permission_id });
		} catch (error) {
			logger.error(`Failed to delete permission from role: ${(error as Error).message}`);
			throw error;
		}
	}

	async getPermissionsForRole(role_id: string): Promise<Permission[]> {
		try {
			const rolePermLinks = await db.findMany('rolePermissions', { roleId: role_id });
			const permissionIds = rolePermLinks.map((link) => link.permissionId as string);
			const permissionsArr = await Promise.all(
				permissionIds.map(async (id: string) => {
					const perm = await db.findOne('permissions', { id });
					return perm ? mapDbPermissionToPermission(perm) : null;
				})
			);
			return permissionsArr.filter(Boolean) as Permission[];
		} catch (error) {
			logger.error(`Failed to get permissions for role: ${(error as Error).message}`);
			throw error;
		}
	}

	async getRolesForPermission(permission_id: string): Promise<Role[]> {
		try {
			const rolePermLinks = await db.findMany('rolePermissions', { permissionId: permission_id });
			const roleIds = rolePermLinks.map((link) => link.roleId as string);
			const rolesArr = await Promise.all(
				roleIds.map(async (id: string) => {
					const role = await db.findOne('roles', { id });
					return role ? mapDbRoleToRole(role) : null;
				})
			);
			return rolesArr.filter(Boolean) as Role[];
		} catch (error) {
			logger.error(`Failed to get roles for permission: ${(error as Error).message}`);
			throw error;
		}
	}

	// User-Specific Permissions Methods
	async assignPermissionToUser(user_id: string, permission_id: string): Promise<void> {
		try {
			const user = await db.findOne('users', { id: user_id });
			if (!user) throw new Error('User not found');
			const permissionsArr = Array.isArray(user.permissions) ? user.permissions : [];
			if (!permissionsArr.includes(permission_id)) {
				permissionsArr.push(permission_id);
				await db.updateOne('users', { id: user_id }, { permissions: permissionsArr });
			}
		} catch (error) {
			logger.error(`Failed to assign permission to user: ${(error as Error).message}`);
			throw error;
		}
	}

	async deletePermissionFromUser(user_id: string, permission_id: string): Promise<void> {
		try {
			const user = await db.findOne('users', { id: user_id });
			if (!user) throw new Error('User not found');
			const permissionsArr = Array.isArray(user.permissions) ? user.permissions : [];
			const newArr = permissionsArr.filter((id: string) => id !== permission_id);
			await db.updateOne('users', { id: user_id }, { permissions: newArr });
		} catch (error) {
			logger.error(`Failed to remove permission from user: ${(error as Error).message}`);
			throw error;
		}
	}

	async getPermissionsForUser(user_id: string): Promise<Permission[]> {
		try {
			const user = await db.findOne('users', { id: user_id });
			if (!user || !Array.isArray(user.permissions)) return [];
			const permissionsArr = await Promise.all(
				user.permissions.map(async (id: string) => {
					const perm = await db.findOne('permissions', { id });
					return perm ? mapDbPermissionToPermission(perm) : null;
				})
			);
			return permissionsArr.filter(Boolean) as Permission[];
		} catch (error) {
			logger.error(`Failed to get permissions for user: ${(error as Error).message}`);
			throw error;
		}
	}

	async getUsersWithPermission(permission_id: string): Promise<User[]> {
		try {
			const allUsers = await db.findMany('users', {});
			const usersWithPerm = allUsers.filter(
				(user: { permissions?: string[] }) => Array.isArray(user.permissions) && user.permissions.includes(permission_id)
			);
			return usersWithPerm.map(mapDbUserToUser).filter(Boolean) as User[];
		} catch (error) {
			logger.error(`Failed to get users with permission: ${(error as Error).message}`);
			throw error;
		}
	}

	// User-Role Methods
	async assignRoleToUser(user_id: string, role_id: string): Promise<void> {
		try {
			const user = await db.findOne('users', { id: user_id });
			if (!user) throw new Error('User not found');
			const rolesArr = Array.isArray(user.roles) ? user.roles : [];
			if (!rolesArr.includes(role_id)) {
				rolesArr.push(role_id);
				await db.updateOne('users', { id: user_id }, { roles: rolesArr });
			}
		} catch (error) {
			logger.error(`Failed to assign role to user: ${(error as Error).message}`);
			throw error;
		}
	}

	async removeRoleFromUser(user_id: string, role_id: string): Promise<void> {
		try {
			const user = await db.findOne('users', { id: user_id });
			if (!user) throw new Error('User not found');
			const rolesArr = Array.isArray(user.roles) ? user.roles : [];
			const newArr = rolesArr.filter((id: string) => id !== role_id);
			await db.updateOne('users', { id: user_id }, { roles: newArr });
		} catch (error) {
			logger.error(`Failed to remove role from user: ${(error as Error).message}`);
			throw error;
		}
	}

	async getRolesForUser(user_id: string): Promise<Role[]> {
		try {
			const user = await db.findOne('users', { id: user_id });
			if (!user || !Array.isArray(user.roles)) return [];
			const rolesArr = await Promise.all(
				user.roles.map(async (id: string) => {
					const role = await db.findOne('roles', { id });
					return role ? mapDbRoleToRole(role) : null;
				})
			);
			return rolesArr.filter(Boolean) as Role[];
		} catch (error) {
			logger.error(`Failed to get roles for user: ${(error as Error).message}`);
			throw error;
		}
	}

	async getUsersWithRole(role_id: string): Promise<User[]> {
		try {
			const allUsers = await db.findMany('users', {});
			const usersWithRole = allUsers.filter((user: { roles?: string[] }) => Array.isArray(user.roles) && user.roles.includes(role_id));
			return usersWithRole.map(mapDbUserToUser).filter(Boolean) as User[];
		} catch (error) {
			logger.error(`Failed to get users with role: ${(error as Error).message}`);
			throw error;
		}
	}

	async hasPermissionByAction(user_id: string, permission_name: string): Promise<boolean> {
		try {
			const userPermissions = await this.getPermissionsForUser(user_id);
			return userPermissions.some((permission) => permission.name === permission_name);
		} catch (error) {
			logger.error(`Failed to check user permission: ${(error as Error).message}`);
			throw error;
		}
	}

	async checkUserRole(user_id: string, role_name: string): Promise<boolean> {
		try {
			const userRoles = await this.getRolesForUser(user_id);
			return userRoles.some((role) => role.name === role_name);
		} catch (error) {
			logger.error(`Failed to check user role: ${(error as Error).message}`);
			throw error;
		}
	}
}
