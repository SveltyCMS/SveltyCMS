import { db } from '@api/databases/drizzleDBAdapter';
import type { authDBInterface } from './authDBInterface';
import type { User, Session, Token, Role, Permission } from './types';
import crypto from 'crypto';

// Import logger
// import { logger } from '@src/utils/logger';

export class DrizzleAuthAdapter implements authDBInterface {
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

	async getAllUsers(): Promise<User[]> {
		const users = await db.select().from('users');
		return users;
	}

	async getUserCount(): Promise<number> {
		const result = await db.select(db.raw('COUNT(*) as count')).from('users').one();
		return result ? parseInt(result.count, 10) : 0;
	}

	async createSession(data: { user_id: string; expires: number }): Promise<Session> {
		const [session] = await db
			.insert('sessions')
			.values({
				user_id: data.user_id,
				expires: new Date(Date.now() + data.expires)
			})
			.returning('*');
		return session;
	}

	async destroySession(session_id: string): Promise<void> {
		await db.delete('sessions').where({ session_id });
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

	async createToken(data: { user_id: string; email: string; expires: number }): Promise<string> {
		const tokenString = crypto.randomBytes(16).toString('hex');
		await db.insert('tokens').values({
			user_id: data.user_id,
			token: tokenString,
			email: data.email,
			expires: new Date(Date.now() + data.expires)
		});
		return tokenString;
	}

	async validateToken(token: string, user_id: string): Promise<{ success: boolean; message: string }> {
		const tokenDoc = await db.select().from('tokens').where({ token, user_id }).one();
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

	async consumeToken(token: string, user_id: string): Promise<{ status: boolean; message: string }> {
		const tokenDoc = await db.delete('tokens').where({ token, user_id }).returning('*').one();
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

	async getAllTokens(): Promise<Token[]> {
		const tokens = await db.select().from('tokens');
		return tokens;
	}

	async createRole(roleData: Role): Promise<Role> {
		const [role] = await db.insert('roles').values(roleData).returning('*');
		return role;
	}

	async updateRole(role_id: string, roleData: Partial<Role>): Promise<void> {
		await db.update('roles').set(roleData).where({ role_id });
	}

	async deleteRole(role_id: string): Promise<void> {
		await db.delete('roles').where({ role_id });
	}

	async getRoleById(role_id: string): Promise<Role | null> {
		const role = await db.select().from('roles').where({ role_id }).one();
		return role ? role : null;
	}

	async getAllRoles(): Promise<Role[]> {
		const roles = await db.select().from('roles');
		return roles;
	}

	async createPermission(permissionData: Permission): Promise<Permission> {
		const [permission] = await db.insert('permissions').values(permissionData).returning('*');
		return permission;
	}

	async updatePermission(permission_id: string, permissionData: Partial<Permission>): Promise<void> {
		await db.update('permissions').set(permissionData).where({ permission_id });
	}

	async deletePermission(permission_id: string): Promise<void> {
		await db.delete('permissions').where({ permission_id });
	}

	async getPermissionById(permission_id: string): Promise<Permission | null> {
		const permission = await db.select().from('permissions').where({ permission_id }).one();
		return permission ? permission : null;
	}

	async getAllPermissions(): Promise<Permission[]> {
		const permissions = await db.select().from('permissions');
		return permissions;
	}

	async getPermissionsForRole(role_id: string): Promise<Permission[]> {
		const role = await db.select().from('roles').where({ role_id }).one();
		return role ? (role.permissions as Permission[]) : [];
	}

	async assignPermissionToRole(role_id: string, permission_id: string): Promise<void> {
		await db
			.update('roles')
			.set({ permissions: db.raw('JSON_ARRAY_APPEND(permissions, "$", ?)', [permission_id]) })
			.where({ role_id });
	}

	async removePermissionFromRole(role_id: string, permission_id: string): Promise<void> {
		await db
			.update('roles')
			.set({ permissions: db.raw('JSON_REMOVE(permissions, ?)', [permission_id]) })
			.where({ role_id });
	}

	async assignPermissionToUser(user_id: string, permission_id: string): Promise<void> {
		await db
			.update('users')
			.set({ permissions: db.raw('JSON_ARRAY_APPEND(permissions, "$", ?)', [permission_id]) })
			.where({ user_id });
	}

	async removePermissionFromUser(user_id: string, permission_id: string): Promise<void> {
		await db
			.update('users')
			.set({ permissions: db.raw('JSON_REMOVE(permissions, ?)', [permission_id]) })
			.where({ user_id });
	}

	async getPermissionsForUser(user_id: string): Promise<Permission[]> {
		const user = await db.select().from('users').where({ user_id }).one();
		return user ? (user.permissions as Permission[]) : [];
	}
}
