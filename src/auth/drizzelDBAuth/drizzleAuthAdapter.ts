import { db } from '@src/databases/drizzleDBAdapter';
import type { authDBInterface } from '../authDBInterface';
import type { User, Session, Token, Role, Permission } from '../types';
import crypto from 'crypto';

// Import logger
// import logger from '@src/utils/logger';

export class DrizzleAuthAdapter implements authDBInterface {
	// Default roles and permissions
	async initializeDefaultRolesAndPermissions(): Promise<void> {
		const defaultRoles: Partial<Role>[] = [
			{ name: 'admin', description: 'Administrator with all permissions' },
			{ name: 'developer', description: 'Developer with elevated permissions' },
			{ name: 'editor', description: 'Content editor' },
			{ name: 'user', description: 'Regular user' }
		];

		const defaultPermissions: Partial<Permission>[] = [
			{
				name: 'create_content',
				action: 'create',
				contextId: 'global',
				contextType: 'collection',
				description: 'Create new content',
				requiredRole: 'user'
			},
			{ name: 'read_content', action: 'read', contextId: 'global', contextType: 'collection', description: 'Read content', requiredRole: 'user' },
			{
				name: 'update_content',
				action: 'update',
				contextId: 'global',
				contextType: 'collection',
				description: 'Update existing content',
				requiredRole: 'editor'
			},
			{
				name: 'delete_content',
				action: 'delete',
				contextId: 'global',
				contextType: 'collection',
				description: 'Delete content',
				requiredRole: 'admin'
			},
			{ name: 'manage_users', action: 'manage', contextId: 'global', contextType: 'system', description: 'Manage users', requiredRole: 'admin' },
			{ name: 'manage_roles', action: 'manage', contextId: 'global', contextType: 'system', description: 'Manage roles', requiredRole: 'admin' },
			{
				name: 'manage_permissions',
				action: 'manage',
				contextId: 'global',
				contextType: 'system',
				description: 'Manage permissions',
				requiredRole: 'admin'
			}
		];
	}

	// User Management Methods
	async createUser(userData: Partial<User>): Promise<User> {
		const [user] = await db.insert('users').values(userData).returning('*');
		return user;
	}

	async updateUserAttributes(user_id: string, attributes: Partial<User>): Promise<User> {
		await db.update('users').set(attributes).where({ user_id });
		const updatedUser = await db.select().from('users').where({ user_id }).one();
		return updatedUser;
	}

	async deleteUser(user_id: string): Promise<void> {
		await db.delete('users').where({ user_id });
	}

	async getUserById(user_id: string): Promise<User | null> {
		const user = await db.select().from('users').where({ user_id }).one();
		return user ? user : null;
	}

	async getUserByEmail(email: string): Promise<User | null> {
		const user = await db.select().from('users').where({ email }).one();
		return user ? user : null;
	}

	async getAllUsers(options?: { limit?: number; skip?: number; sort?: object; filter?: object }): Promise<User[]> {
		let query = db.select().from('users');
		if (options?.filter) query = query.where(options.filter);
		if (options?.sort) query = query.orderBy(options.sort);
		if (options?.limit) query = query.limit(options.limit);
		if (options?.skip) query = query.offset(options.skip);
		const users = await query;
		return users;
	}

	async getUserCount(filter?: object): Promise<number> {
		const query = db.select(db.raw('COUNT(*) as count')).from('users');
		if (filter) query.where(filter);
		const result = await query.one();
		return result ? parseInt(result.count, 10) : 0;
	}

	// Session Management Methods
	async createSession(sessionData: { user_id: string; expires: number }): Promise<Session> {
		const [session] = await db
			.insert('sessions')
			.values({
				user_id: sessionData.user_id,
				expires: new Date(Date.now() + sessionData.expires)
			})
			.returning('*');
		return session;
	}

	async updateSessionExpiry(session_id: string, newExpiry: number): Promise<Session> {
		await db
			.update('sessions')
			.set({ expires: new Date(Date.now() + newExpiry) })
			.where({ session_id });
		const updatedSession = await db.select().from('sessions').where({ session_id }).one();
		return updatedSession;
	}

	async destroySession(session_id: string): Promise<void> {
		await db.delete('sessions').where({ session_id });
	}

	async deleteExpiredSessions(): Promise<number> {
		const result = await db
			.delete('sessions')
			.where(db.raw('expires <= ?', [new Date()]))
			.returning('count(*)');
		return result.count;
	}

	async validateSession(session_id: string): Promise<User | null> {
		const session = await db.select().from('sessions').where({ session_id }).one();
		if (!session || session.expires <= new Date()) {
			if (session) await this.destroySession(session_id);
			return null;
		}
		const user = await this.getUserById(session.user_id);
		return user;
	}

	async invalidateAllUserSessions(user_id: string): Promise<void> {
		await db.delete('sessions').where({ user_id });
	}

	async getActiveSessions(user_id: string): Promise<Session[]> {
		const sessions = await db
			.select()
			.from('sessions')
			.where({ user_id })
			.andWhere(db.raw('expires > ?', [new Date()]));
		return sessions;
	}

	// Token Management Methods
	async createToken(data: { user_id: string; email: string; expires: number; type: string }): Promise<string> {
		const tokenString = crypto.randomBytes(32).toString('hex');
		await db.insert('tokens').values({
			user_id: data.user_id,
			token: tokenString,
			email: data.email,
			expires: new Date(Date.now() + data.expires),
			type: data.type
		});
		return tokenString;
	}

	async validateToken(token: string, user_id: string, type: string): Promise<{ success: boolean; message: string }> {
		const tokenDoc = await db.select().from('tokens').where({ token, user_id, type }).one();
		if (tokenDoc) {
			if (tokenDoc.expires > new Date()) {
				return { success: true, message: 'Token is valid' };
			} else {
				return { success: false, message: 'Token is expired' };
			}
		} else {
			return { success: false, message: 'Token does not exist' };
		}
	}

	async consumeToken(token: string, user_id: string, type: string): Promise<{ status: boolean; message: string }> {
		const tokenDoc = await db.delete('tokens').where({ token, user_id, type }).returning('*').one();
		if (tokenDoc) {
			if (tokenDoc.expires > new Date()) {
				return { status: true, message: 'Token is valid' };
			} else {
				return { status: false, message: 'Token is expired' };
			}
		} else {
			return { status: false, message: 'Token does not exist' };
		}
	}

	async getAllTokens(filter?: object): Promise<Token[]> {
		let query = db.select().from('tokens');
		if (filter) query = query.where(filter);
		const tokens = await query;
		return tokens;
	}

	async deleteExpiredTokens(): Promise<number> {
		const result = await db
			.delete('tokens')
			.where(db.raw('expires <= ?', [new Date()]))
			.returning('count(*)');
		return result.count;
	}

	// Role Management Methods
	async createRole(roleData: Partial<Role>, currentUserId: string): Promise<Role> {
		const [role] = await db.insert('roles').values(roleData).returning('*');
		return role;
	}

	async updateRole(role_id: string, roleData: Partial<Role>, currentUserId: string): Promise<void> {
		await db.update('roles').set(roleData).where({ role_id });
	}

	async deleteRole(role_id: string, currentUserId: string): Promise<void> {
		await db.delete('roles').where({ role_id });
	}

	async getRoleById(role_id: string): Promise<Role | null> {
		const role = await db.select().from('roles').where({ role_id }).one();
		return role ? role : null;
	}

	async getAllRoles(options?: { limit?: number; skip?: number; sort?: object; filter?: object }): Promise<Role[]> {
		let query = db.select().from('roles');
		if (options?.filter) query = query.where(options.filter);
		if (options?.sort) query = query.orderBy(options.sort);
		if (options?.limit) query = query.limit(options.limit);
		if (options?.skip) query = query.offset(options.skip);
		const roles = await query;
		return roles;
	}

	async getRoleByName(name: string): Promise<Role | null> {
		const role = await db.select().from('roles').where({ name }).one();
		return role ? role : null;
	}

	// Permission Management Methods
	async createPermission(permissionData: Partial<Permission>, currentUserId: string): Promise<Permission> {
		const [permission] = await db.insert('permissions').values(permissionData).returning('*');
		return permission;
	}

	async updatePermission(permission_id: string, permissionData: Partial<Permission>, currentUserId: string): Promise<void> {
		await db.update('permissions').set(permissionData).where({ permission_id });
	}

	async deletePermission(permission_id: string, currentUserId: string): Promise<void> {
		await db.delete('permissions').where({ permission_id });
	}

	async getPermissionById(permission_id: string): Promise<Permission | null> {
		const permission = await db.select().from('permissions').where({ permission_id }).one();
		return permission ? permission : null;
	}

	async getAllPermissions(options?: { limit?: number; skip?: number; sort?: object; filter?: object }): Promise<Permission[]> {
		let query = db.select().from('permissions');
		if (options?.filter) query = query.where(options.filter);
		if (options?.sort) query = query.orderBy(options.sort);
		if (options?.limit) query = query.limit(options.limit);
		if (options?.skip) query = query.offset(options.skip);
		const permissions = await query;
		return permissions;
	}

	async getPermissionByName(name: string): Promise<Permission | null> {
		const permission = await db.select().from('permissions').where({ name }).one();
		return permission ? permission : null;
	}

	// Role-Permissions Linking Methods
	async assignPermissionToRole(role_id: string, permission_id: string, currentUserId: string): Promise<void> {
		await db
			.update('roles')
			.set({ permissions: db.raw('JSON_ARRAY_APPEND(permissions, "$", ?)', [permission_id]) })
			.where({ role_id });
	}

	async removePermissionFromRole(role_id: string, permission_id: string, currentUserId: string): Promise<void> {
		await db
			.update('roles')
			.set({ permissions: db.raw('JSON_REMOVE(permissions, JSON_UNQUOTE(JSON_SEARCH(permissions, "one", ?)))', [permission_id]) })
			.where({ role_id });
	}

	async getPermissionsForRole(role_id: string): Promise<Permission[]> {
		const role = await db.select().from('roles').where({ role_id }).one();
		return role ? (role.permissions as Permission[]) : [];
	}

	async getRolesForPermission(permission_id: string): Promise<Role[]> {
		const roles = await db
			.select()
			.from('roles')
			.where(db.raw('JSON_SEARCH(permissions, "one", ?)', [permission_id]))
			.returning('*');
		return roles;
	}

	// User-Specific Permissions Methods
	async assignPermissionToUser(user_id: string, permission_id: string): Promise<void> {
		await db
			.update('users')
			.set({ permissions: db.raw('JSON_ARRAY_APPEND(permissions, "$", ?)', [permission_id]) })
			.where({ user_id });
	}

	async removePermissionFromUser(user_id: string, permission_id: string): Promise<void> {
		await db
			.update('users')
			.set({ permissions: db.raw('JSON_REMOVE(permissions, JSON_UNQUOTE(JSON_SEARCH(permissions, "one", ?)))', [permission_id]) })
			.where({ user_id });
	}

	async getPermissionsForUser(user_id: string): Promise<Permission[]> {
		const user = await db.select().from('users').where({ user_id }).one();
		return user ? (user.permissions as Permission[]) : [];
	}

	async getUsersWithPermission(permission_id: string): Promise<User[]> {
		const users = await db
			.select()
			.from('users')
			.where(db.raw('JSON_SEARCH(permissions, "one", ?)', [permission_id]))
			.returning('*');
		return users;
	}

	// User-Role Methods
	async assignRoleToUser(user_id: string, role_id: string): Promise<void> {
		await db
			.update('users')
			.set({ roles: db.raw('JSON_ARRAY_APPEND(roles, "$", ?)', [role_id]) })
			.where({ user_id });
	}

	async removeRoleFromUser(user_id: string, role_id: string): Promise<void> {
		await db
			.update('users')
			.set({ roles: db.raw('JSON_REMOVE(roles, JSON_UNQUOTE(JSON_SEARCH(roles, "one", ?)))', [role_id]) })
			.where({ user_id });
	}

	async getRolesForUser(user_id: string): Promise<Role[]> {
		const user = await db.select().from('users').where({ user_id }).one();
		return user ? (user.roles as Role[]) : [];
	}

	async getUsersWithRole(role_id: string): Promise<User[]> {
		const users = await db
			.select()
			.from('users')
			.where(db.raw('JSON_SEARCH(roles, "one", ?)', [role_id]))
			.returning('*');
		return users;
	}

	async checkUserPermission(user_id: string, permission_name: string): Promise<boolean> {
		const userPermissions = await this.getPermissionsForUser(user_id);
		return userPermissions.some((permission) => permission.name === permission_name);
	}

	async checkUserRole(user_id: string, role_name: string): Promise<boolean> {
		const userRoles = await this.getRolesForUser(user_id);
		return userRoles.some((role) => role.name === role_name);
	}
}
