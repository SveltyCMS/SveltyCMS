/**
 * @file src/auth/drizzelDBAuth/drizzleAuthAdapter.ts
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

import { eq, and, sql } from 'drizzle-orm';
import { users, roles, permissions, rolePermissions, sessions, tokens } from './Schema';
import type { authDBInterface } from '../authDBInterface';
import type { User, Role, Permission, Session, Token } from '../types';
import { db } from '@root/src/databases/drizzle/drizzleDBAdapter';

// Import logger
import { logger } from '@utils/logger.svelte';

export class DrizzleAuthAdapter implements authDBInterface {
	// Initialize default roles and permissions from configuration
	async initializeDefaultRolesAndPermissions(): Promise<void> {
		// Initialize roles and permissions in the database from configuration
		await db.transaction(async (trx) => {
			// Insert default roles
			for (const role of configRoles) {
				await trx.insert(roles).values(role).onConflictDoNothing();
			}

			// Insert default permissions
			for (const permission of configPermissions) {
				await trx.insert(permissions).values(permission).onConflictDoNothing();
			}

			// Assign permissions to roles based on configuration
			for (const role of configRoles) {
				for (const permissionId of role.permissions) {
					const rolePermission = {
						roleId: role._id,
						permissionId: permissionId
					};
					await trx.insert(rolePermissions).values(rolePermission).onConflictDoNothing();
				}
			}
		});
		logger.info('Default roles and permissions initialized successfully from configuration.');
	}

	// User Management Methods
	async createUser(userData: Partial<User>): Promise<User> {
		try {
			const [user] = await db.insert(users).values(userData).returning();
			return user as User;
		} catch (error) {
			logger.error(`Failed to create user: ${(error as Error).message}`);
			throw error;
		}
	}

	// Update user attributes
	async updateUserAttributes(user_id: string, attributes: Partial<User>): Promise<User> {
		try {
			const [updatedUser] = await db.update(users).set(attributes).where(eq(users.id, user_id)).returning();
			return updatedUser as User;
		} catch (error) {
			logger.error(`Failed to update user attributes: ${(error as Error).message}`);
			throw error;
		}
	}

	// Delete a user
	async deleteUser(user_id: string): Promise<void> {
		try {
			await db.delete(users).where(eq(users.id, user_id));
		} catch (error) {
			logger.error(`Failed to delete user: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get a user by ID
	async getUserById(user_id: string): Promise<User | null> {
		try {
			const user = await db.select().from(users).where(eq(users.id, user_id)).get();
			return user as User | null;
		} catch (error) {
			logger.error(`Failed to get user by ID: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get a user by email
	async getUserByEmail(email: string): Promise<User | null> {
		try {
			const user = await db.select().from(users).where(eq(users.email, email)).get();
			return user as User | null;
		} catch (error) {
			logger.error(`Failed to get user by email: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get all users
	async getAllUsers(options?: { limit?: number; skip?: number; sort?: object; filter?: object }): Promise<User[]> {
		try {
			let query = db.select().from(users);
			if (options?.filter) query = query.where(options.filter);
			if (options?.sort) query = query.orderBy(options.sort);
			if (options?.limit) query = query.limit(options.limit);
			if (options?.skip) query = query.offset(options.skip);
			const users = await query;
			return users as User[];
		} catch (error) {
			logger.error(`Failed to get all users: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get the count of users
	async getUserCount(filter?: object): Promise<number> {
		try {
			let query = db.select({ count: sql`count(*)` }).from(users);

			if (filter && Object.keys(filter).length > 0) {
				// Apply filters dynamically
				Object.entries(filter).forEach(([key, value]) => {
					if (key in users) {
						query = query.where(eq(users[key as keyof typeof users], value));
					}
				});
			}

			const result = await query.get();
			return result?.count as number;
		} catch (error) {
			logger.error(`Failed to get user count: ${(error as Error).message}`);
			throw error;
		}
	}

	// Session Management Methods
	async createSession(sessionData: { user_id: string; expires: number }): Promise<Session> {
		try {
			const [session] = await db
				.insert(sessions)
				.values({
					userId: sessionData.user_id,
					expires: new Date(Date.now() + sessionData.expires)
				})
				.returning();
			return session as Session;
		} catch (error) {
			logger.error(`Failed to create session: ${(error as Error).message}`);
			throw error;
		}
	}

	// Update the expiry of an existing session
	async updateSessionExpiry(session_id: string, newExpiry: number): Promise<Session> {
		try {
			const [updatedSession] = await db
				.update(sessions)
				.set({ expires: new Date(Date.now() + newExpiry) })
				.where(eq(sessions.id, session_id))
				.returning();
			return updatedSession as Session;
		} catch (error) {
			logger.error(`Failed to update session expiry: ${(error as Error).message}`);
			throw error;
		}
	}

	// Destroy a session
	async destroySession(session_id: string): Promise<void> {
		try {
			await db.delete(sessions).where(eq(sessions.id, session_id));
		} catch (error) {
			logger.error(`Failed to destroy session: ${(error as Error).message}`);
			throw error;
		}
	}

	// Delete expired sessions
	async deleteExpiredSessions(): Promise<number> {
		try {
			const result = await db
				.delete(sessions)
				.where(sql`expires <= CURRENT_TIMESTAMP`)
				.returning({ count: sql`count(*)` });
			return result[0]?.count as number;
		} catch (error) {
			logger.error(`Failed to delete expired sessions: ${(error as Error).message}`);
			throw error;
		}
	}

	// Validate a session
	async validateSession(session_id: string): Promise<User | null> {
		try {
			const session = await db
				.select()
				.from(sessions)
				.where(and(eq(sessions.id, session_id), sql`expires > CURRENT_TIMESTAMP`))
				.get();
			if (!session) return null;
			return this.getUserById(session.userId);
		} catch (error) {
			logger.error(`Failed to validate session: ${(error as Error).message}`);
			throw error;
		}
	}

	// Invalidate all sessions for a user
	async invalidateAllUserSessions(user_id: string): Promise<void> {
		try {
			await db.delete(sessions).where(eq(sessions.userId, user_id));
		} catch (error) {
			logger.error(`Failed to invalidate all user sessions: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get active sessions for a user
	async getActiveSessions(user_id: string): Promise<Session[]> {
		try {
			const activeSessions = await db
				.select()
				.from(sessions)
				.where(and(eq(sessions.userId, user_id), sql`expires > CURRENT_TIMESTAMP`));
			return activeSessions as Session[];
		} catch (error) {
			logger.error(`Failed to get active sessions: ${(error as Error).message}`);
			throw error;
		}
	}

	// Token Management Methods
	async createToken(data: { user_id: string; email: string; expires: number; type: string }): Promise<string> {
		try {
			const tokenString = crypto.randomBytes(32).toString('hex');
			const [token] = await db
				.insert(tokens)
				.values({
					userId: data.user_id,
					token: tokenString,
					type: data.type,
					expires: new Date(Date.now() + data.expires)
				})
				.returning();
			return token.token;
		} catch (error) {
			logger.error(`Failed to create token: ${(error as Error).message}`);
			throw error;
		}
	}

	// Validate a token
	async validateToken(token: string, user_id: string, type: string): Promise<{ success: boolean; message: string }> {
		try {
			const tokenDoc = await db
				.select()
				.from(tokens)
				.where(and(eq(tokens.token, token), eq(tokens.userId, user_id), eq(tokens.type, type)))
				.get();
			if (tokenDoc) {
				if (tokenDoc.expires > new Date()) {
					return { success: true, message: 'Token is valid' };
				} else {
					return { success: false, message: 'Token is expired' };
				}
			} else {
				return { success: false, message: 'Token does not exist' };
			}
		} catch (error) {
			logger.error(`Failed to validate token: ${(error as Error).message}`);
			throw error;
		}
	}

	// Consume a token
	async consumeToken(token: string, user_id: string, type: string): Promise<{ status: boolean; message: string }> {
		try {
			const [deletedToken] = await db
				.delete(tokens)
				.where(and(eq(tokens.token, token), eq(tokens.userId, user_id), eq(tokens.type, type)))
				.returning();
			if (deletedToken) {
				if (deletedToken.expires > new Date()) {
					return { status: true, message: 'Token is valid' };
				} else {
					return { status: false, message: 'Token is expired' };
				}
			} else {
				return { status: false, message: 'Token does not exist' };
			}
		} catch (error) {
			logger.error(`Failed to consume token: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get all tokens
	async getAllTokens(filter?: object): Promise<Token[]> {
		try {
			const query = db.select().from(tokens);
			if (filter) {
				// Implement filtering logic based on your needs
			}
			const result = await query;
			return result as Token[];
		} catch (error) {
			logger.error(`Failed to get all tokens: ${(error as Error).message}`);
			throw error;
		}
	}

	// Delete expired tokens
	async deleteExpiredTokens(): Promise<number> {
		try {
			const result = await db
				.delete(tokens)
				.where(sql`expires <= CURRENT_TIMESTAMP`)
				.returning({ count: sql`count(*)` });
			return result[0]?.count as number;
		} catch (error) {
			logger.error(`Failed to delete expired tokens: ${(error as Error).message}`);
			throw error;
		}
	}

	// Role Management Methods
	async createRole(roleData: Partial<Role>): Promise<Role> {
		try {
			const [role] = await db.insert(roles).values(roleData).returning();
			return role as Role;
		} catch (error) {
			logger.error(`Failed to create role: ${(error as Error).message}`);
			throw error;
		}
	}

	async updateRole(role_id: string, roleData: Partial<Role>): Promise<void> {
		try {
			await db.update(roles).set(roleData).where(eq(roles.id, role_id));
		} catch (error) {
			logger.error(`Failed to update role: ${(error as Error).message}`);
			throw error;
		}
	}

	async deleteRole(role_id: string): Promise<void> {
		try {
			await db.delete(roles).where(eq(roles.id, role_id));
		} catch (error) {
			logger.error(`Failed to delete role: ${(error as Error).message}`);
			throw error;
		}
	}

	async getRoleById(role_id: string): Promise<Role | null> {
		try {
			const role = await db.select().from(roles).where(eq(roles.id, role_id)).get();
			return role as Role | null;
		} catch (error) {
			logger.error(`Failed to get role by ID: ${(error as Error).message}`);
			throw error;
		}
	}

	async getAllRoles(options?: { limit?: number; skip?: number; sort?: object; filter?: object }): Promise<Role[]> {
		try {
			let query = db.select().from(roles);
			if (options?.filter) query = query.where(options.filter);
			if (options?.sort) query = query.orderBy(options.sort);
			if (options?.limit) query = query.limit(options.limit);
			if (options?.skip) query = query.offset(options.skip);
			const roles = await query;
			return roles as Role[];
		} catch (error) {
			logger.error(`Failed to get all roles: ${(error as Error).message}`);
			throw error;
		}
	}

	async getRoleByName(name: string): Promise<Role | null> {
		try {
			const role = await db.select().from(roles).where(eq(roles.name, name)).get();
			return role as Role | null;
		} catch (error) {
			logger.error(`Failed to get role by name: ${(error as Error).message}`);
			throw error;
		}
	}

	// Permission Management Methods
	async createPermission(permissionData: Partial<Permission>): Promise<Permission> {
		try {
			const [permission] = await db.insert(permissions).values(permissionData).returning();
			return permission as Permission;
		} catch (error) {
			logger.error(`Failed to create permission: ${(error as Error).message}`);
			throw error;
		}
	}

	async updatePermission(permission_id: string, permissionData: Partial<Permission>): Promise<void> {
		try {
			await db.update(permissions).set(permissionData).where(eq(permissions.id, permission_id));
		} catch (error) {
			logger.error(`Failed to update permission: ${(error as Error).message}`);
			throw error;
		}
	}

	async deletePermission(permission_id: string): Promise<void> {
		try {
			await db.delete(permissions).where(eq(permissions.id, permission_id));
		} catch (error) {
			logger.error(`Failed to delete permission: ${(error as Error).message}`);
			throw error;
		}
	}

	async getPermissionById(permission_id: string): Promise<Permission | null> {
		try {
			const permission = await db.select().from(permissions).where(eq(permissions.id, permission_id)).get();
			return permission as Permission | null;
		} catch (error) {
			logger.error(`Failed to get permission by ID: ${(error as Error).message}`);
			throw error;
		}
	}

	async getAllPermissions(options?: { limit?: number; skip?: number; sort?: object; filter?: object }): Promise<Permission[]> {
		try {
			let query = db.select().from(permissions);
			if (options?.filter) query = query.where(options.filter);
			if (options?.sort) query = query.orderBy(options.sort);
			if (options?.limit) query = query.limit(options.limit);
			if (options?.skip) query = query.offset(options.skip);
			const permissions = await query;
			return permissions as Permission[];
		} catch (error) {
			logger.error(`Failed to get all permissions: ${(error as Error).message}`);
			throw error;
		}
	}

	async getPermissionByName(name: string): Promise<Permission | null> {
		try {
			const permission = await db.select().from(permissions).where(eq(permissions.name, name)).get();
			return permission as Permission | null;
		} catch (error) {
			logger.error(`Failed to get permission by name: ${(error as Error).message}`);
			throw error;
		}
	}

	// Role-Permissions Linking Methods
	async assignPermissionToRole(role_id: string, permission_id: string): Promise<void> {
		try {
			await db.insert(rolePermissions).values({ roleId: role_id, permissionId: permission_id }).onConflictDoNothing();
		} catch (error) {
			logger.error(`Failed to assign permission to role: ${(error as Error).message}`);
			throw error;
		}
	}

	async deletePermissionFromRole(role_id: string, permission_id: string): Promise<void> {
		try {
			await db.delete(rolePermissions).where(and(eq(rolePermissions.roleId, role_id), eq(rolePermissions.permissionId, permission_id)));
		} catch (error) {
			logger.error(`Failed to delete permission from role: ${(error as Error).message}`);
			throw error;
		}
	}

	async getPermissionsForRole(role_id: string): Promise<Permission[]> {
		try {
			const rolePerms = await db
				.select(permissions)
				.from(rolePermissions)
				.join(permissions)
				.on(eq(rolePermissions.permissionId, permissions.id))
				.where(eq(rolePermissions.roleId, role_id));
			return rolePerms as Permission[];
		} catch (error) {
			logger.error(`Failed to get permissions for role: ${(error as Error).message}`);
			throw error;
		}
	}

	async getRolesForPermission(permission_id: string): Promise<Role[]> {
		try {
			const rolesWithPerm = await db
				.select(roles)
				.from(rolePermissions)
				.join(roles)
				.on(eq(rolePermissions.roleId, roles.id))
				.where(eq(rolePermissions.permissionId, permission_id));
			return rolesWithPerm as Role[];
		} catch (error) {
			logger.error(`Failed to get roles for permission: ${(error as Error).message}`);
			throw error;
		}
	}

	// User-Specific Permissions Methods
	async assignPermissionToUser(user_id: string, permission_id: string): Promise<void> {
		try {
			await db
				.update(users)
				.set({ permissions: db.raw('JSON_ARRAY_APPEND(permissions, "$", ?)', [permission_id]) })
				.where(eq(users.id, user_id));
		} catch (error) {
			logger.error(`Failed to assign permission to user: ${(error as Error).message}`);
			throw error;
		}
	}

	async deletePermissionFromUser(user_id: string, permission_id: string): Promise<void> {
		try {
			await db
				.update(users)
				.set({
					permissions: db.raw('JSON_REMOVE(permissions, JSON_UNQUOTE(JSON_SEARCH(permissions, "one", ?)))', [permission_id])
				})
				.where(eq(users.id, user_id));
		} catch (error) {
			logger.error(`Failed to remove permission from user: ${(error as Error).message}`);
			throw error;
		}
	}

	async getPermissionsForUser(user_id: string): Promise<Permission[]> {
		try {
			const user = await db.select().from(users).where(eq(users.id, user_id)).get();
			return user ? (user.permissions as Permission[]) : [];
		} catch (error) {
			logger.error(`Failed to get permissions for user: ${(error as Error).message}`);
			throw error;
		}
	}

	async getUsersWithPermission(permission_id: string): Promise<User[]> {
		try {
			const usersWithPerm = await db
				.select(users)
				.from(users)
				.where(db.raw('JSON_SEARCH(permissions, "one", ?)', [permission_id]));
			return usersWithPerm as User[];
		} catch (error) {
			logger.error(`Failed to get users with permission: ${(error as Error).message}`);
			throw error;
		}
	}

	// User-Role Methods
	async assignRoleToUser(user_id: string, role_id: string): Promise<void> {
		try {
			await db
				.update(users)
				.set({ roles: db.raw('JSON_ARRAY_APPEND(roles, "$", ?)', [role_id]) })
				.where(eq(users.id, user_id));
		} catch (error) {
			logger.error(`Failed to assign role to user: ${(error as Error).message}`);
			throw error;
		}
	}

	async removeRoleFromUser(user_id: string, role_id: string): Promise<void> {
		try {
			await db
				.update(users)
				.set({
					roles: db.raw('JSON_REMOVE(roles, JSON_UNQUOTE(JSON_SEARCH(roles, "one", ?)))', [role_id])
				})
				.where(eq(users.id, user_id));
		} catch (error) {
			logger.error(`Failed to remove role from user: ${(error as Error).message}`);
			throw error;
		}
	}

	async getRolesForUser(user_id: string): Promise<Role[]> {
		try {
			const user = await db.select().from(users).where(eq(users.id, user_id)).get();
			return user ? (user.roles as Role[]) : [];
		} catch (error) {
			logger.error(`Failed to get roles for user: ${(error as Error).message}`);
			throw error;
		}
	}

	async getUsersWithRole(role_id: string): Promise<User[]> {
		try {
			const usersWithRole = await db
				.select(users)
				.from(users)
				.where(db.raw('JSON_SEARCH(roles, "one", ?)', [role_id]));
			return usersWithRole as User[];
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
