/**
 * @file src/auth/authDBInterface.ts
 * @description Interface definition for authentication database operations.
 *
 * This module defines the contract for database adapters used in the authentication system:
 * - User management methods
 * - Session management methods
 * - Token management methods
 * - Role and permission management methods
 *
 * Features:
 * - Comprehensive set of method signatures for auth operations
 * - Typescript interface for type safety and consistency
 *
 * Usage:
 * Implemented by database adapters to ensure consistent auth operations across different databases
 */

import type { User, Session, Token, Role, Permission } from './types';

export interface authDBInterface {
	// User Management Methods
	createUser(userData: Partial<User>): Promise<User>;
	updateUserAttributes(userId: string, userData: Partial<User>): Promise<User>;
	addUser(userData: Partial<User>, expirationTime: number): Promise<{ user: User; token: string }>;
	deleteUser(user_id: string): Promise<void>;
	changePassword(userId: string, newPassword: string): Promise<void>;
	blockUser(userId: string): Promise<void>;
	unblockUser(userId: string): Promise<void>;
	getUserById(user_id: string): Promise<User | null>;
	getUserByEmail(email: string): Promise<User | null>;
	getAllUsers(options?: { limit?: number; skip?: number; sort?: { [key: string]: 1 | -1 } | [string, 1 | -1][]; filter?: object }): Promise<User[]>;
	getUserCount(filter?: object): Promise<number>;

	// Session Management Methods
	createSession(sessionData: { user_id: string; expires: number }): Promise<Session>;
	updateSessionExpiry(session_id: string, newExpiry: number): Promise<Session>;
	destroySession(session_id: string): Promise<void>;
	deleteExpiredSessions(): Promise<number>;
	validateSession(session_id: string): Promise<User | null>;
	invalidateAllUserSessions(user_id: string): Promise<void>;
	getActiveSessions(user_id: string): Promise<Session[]>;

	// Token Management Methods
	createToken(data: { user_id: string; email: string; expires: number; type: string }): Promise<string>;
	validateToken(token: string, user_id: string, type: string): Promise<{ success: boolean; message: string }>;
	consumeToken(token: string, user_id: string, type: string): Promise<{ status: boolean; message: string }>;
	getAllTokens(filter?: object): Promise<Token[]>;
	deleteExpiredTokens(): Promise<number>;

	// Role Management Methods
	createRole(roleData: Partial<Role>, currentUserId: string): Promise<Role>;
	updateRole(role_id: string, roleData: Partial<Role>, currentUserId: string): Promise<void>;
	deleteRole(role_id: string, currentUserId: string): Promise<void>;
	getRoleById(role_id: string): Promise<Role | null>;
	getAllRoles(options?: { limit?: number; skip?: number; sort?: { [key: string]: 1 | -1 } | [string, 1 | -1][]; filter?: object }): Promise<Role[]>;
	getRoleByName(name: string): Promise<Role | null>;

	// Permission Management Methods
	createPermission(permissionData: Partial<Permission>, currentUserId: string): Promise<Permission>;
	updatePermission(permission_id: string, permissionData: Partial<Permission>, currentUserId: string): Promise<void>;
	deletePermission(permission_id: string, currentUserId: string): Promise<void>;
	getPermissionById(permission_id: string): Promise<Permission | null>;
	getAllPermissions(
		options?:
			| {
					limit?: number;
					skip?: number;
					sort?: { [key: string]: 1 | -1 } | [string, 1 | -1][];
					filter?: object;
			  }
			| undefined
	): Promise<Permission[]>;
	getPermissionByName(name: string): Promise<Permission | null>;

	// Role-Permissions Linking Methods
	assignPermissionToRole(role_id: string, permission_id: string, currentUserId: string): Promise<void>;
	removePermissionFromRole(role_id: string, permission_id: string, currentUserId: string): Promise<void>;
	getPermissionsForRole(role_id: string): Promise<Permission[]>;
	getRolesForPermission(permission_id: string): Promise<Role[]>;

	// User-Specific Permissions Methods
	assignPermissionToUser(user_id: string, permission_id: string): Promise<void>;
	removePermissionFromUser(user_id: string, permission_id: string): Promise<void>;
	getPermissionsForUser(user_id: string): Promise<Permission[]>;
	getUsersWithPermission(permission_id: string): Promise<User[]>;

	// User-Role Methods
	assignRoleToUser(user_id: string, role_id: string): Promise<void>;
	removeRoleFromUser(user_id: string, role_id: string): Promise<void>;
	getRolesForUser(user_id: string): Promise<Role[]>;
	getUsersWithRole(role_id: string): Promise<User[]>;

	// Initialization and Utility Methods
	initializeDefaultRolesAndPermissions(): Promise<void>;
	checkUserPermission(user_id: string, permission_name: string): Promise<boolean>;
	checkUserRole(user_id: string, role_name: string): Promise<boolean>;
}
