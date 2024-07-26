import type { User, Session, Token, Role, Permission } from './types';

export interface authDBInterface {
	// User Management Methods
	createUser(userData: Partial<User>): Promise<User>;
	updateUserAttributes(user_id: string, attributes: Partial<User>): Promise<User>;
	deleteUser(user_id: string): Promise<void>;
	getUserById(user_id: string): Promise<User | null>;
	getUserByEmail(email: string): Promise<User | null>;
	getAllUsers(options?: { limit?: number; skip?: number; sort?: object }): Promise<User[]>;
	getUserCount(): Promise<number>;

	// Session Management Methods
	createSession(data: { user_id: string; expires: number }): Promise<Session>;
	destroySession(session_id: string): Promise<void>;
	validateSession(session_id: string): Promise<User | null>;
	invalidateAllUserSessions(user_id: string): Promise<void>;

	// Token Management Methods
	createToken(data: { user_id: string; email: string; expires: number }): Promise<string>;
	validateToken(token: string, user_id: string): Promise<{ success: boolean; message: string }>;
	consumeToken(token: string, user_id: string): Promise<{ status: boolean; message: string }>;
	getAllTokens(): Promise<Token[]>;

	// Role Management Methods
	createRole(roleData: Role): Promise<Role>;
	updateRole(role_id: string, roleData: Partial<Role>): Promise<void>;
	deleteRole(role_id: string): Promise<void>;
	getRoleById(role_id: string): Promise<Role | null>;
	getAllRoles(options?: { limit?: number; skip?: number; sort?: object }): Promise<Role[]>;

	// Permission Management Methods
	createPermission(permissionData: Permission): Promise<Permission>;
	updatePermission(permission_id: string, permissionData: Partial<Permission>): Promise<void>;
	deletePermission(permission_id: string): Promise<void>;
	getPermissionById(permission_id: string): Promise<Permission | null>;
	getAllPermissions(options?: { limit?: number; skip?: number; sort?: object }): Promise<Permission[]>;

	// Role-Permissions Linking Methods
	assignPermissionToRole(role_id: string, permission_id: string): Promise<void>;
	removePermissionFromRole(role_id: string, permission_id: string): Promise<void>;
	getPermissionsForRole(role_id: string): Promise<Permission[]>;

	// User-Specific Permissions Methods
	assignPermissionToUser(user_id: string, permission_id: string): Promise<void>;
	removePermissionFromUser(user_id: string, permission_id: string): Promise<void>;
	getPermissionsForUser(user_id: string): Promise<Permission[]>;
}
