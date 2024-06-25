import { db } from '@api/databases/drizzleDBAdapter';
import type { AuthDBAdapter } from './authDBAdapter';
import type { User, Session, Token, Role, Permission } from './types';

// Import logger
import logger from '@utils/logger';

// Utility function to convert Drizzle records to application format
const convertId = (doc: any) => {
	if (doc.id) {
		doc.id = doc.id.toString();
	}
	return doc;
};

export class DrizzleAuthAdapter implements AuthDBAdapter {
	async createUser(userData: Partial<User>): Promise<User> {
		const [user] = await db.insert('users').values(userData).returning('*');
		return convertId(user);
	}

	async updateUserAttributes(userId: string, attributes: Partial<User>): Promise<void> {
		await db.update('users').set(attributes).where({ id: userId });
	}

	async deleteUser(userId: string): Promise<void> {
		await db.delete('users').where({ id: userId });
	}

	async getUserById(userId: string): Promise<User | null> {
		const user = await db.select().from('users').where({ id: userId }).one();
		return user ? convertId(user) : null;
	}

	async getUserByEmail(email: string): Promise<User | null> {
		const user = await db.select().from('users').where({ email }).one();
		return user ? convertId(user) : null;
	}

	async getAllUsers(): Promise<User[]> {
		const users = await db.select().from('users');
		return users.map(convertId);
	}

	async getUserCount(): Promise<number> {
		const result = await db.select(db.raw('COUNT(*) as count')).from('users').one();
		return result ? parseInt(result.count, 10) : 0;
	}

	async createSession(data: { userId: string; expires: number }): Promise<Session> {
		const [session] = await db
			.insert('sessions')
			.values({
				userId: data.userId,
				expires: new Date(Date.now() + data.expires)
			})
			.returning('*');
		return convertId(session);
	}

	async destroySession(sessionId: string): Promise<void> {
		await db.delete('sessions').where({ id: sessionId });
	}

	async validateSession(sessionId: string): Promise<User | null> {
		const session = await db.select().from('sessions').where({ id: sessionId }).one();
		if (!session || session.expires <= new Date()) {
			if (session) await this.destroySession(sessionId);
			return null;
		}
		const user = await this.getUserById(session.userId);
		return user;
	}

	async invalidateAllUserSessions(userId: string): Promise<void> {
		await db.delete('sessions').where({ userId });
	}

	async createToken(data: { userId: string; email: string; expires: number }): Promise<string> {
		const tokenString = crypto.randomBytes(16).toString('hex');
		await db.insert('tokens').values({
			userId: data.userId,
			token: tokenString,
			email: data.email,
			expires: new Date(Date.now() + data.expires)
		});
		return tokenString;
	}

	async validateToken(token: string, userId: string): Promise<{ success: boolean; message: string }> {
		const tokenDoc = await db.select().from('tokens').where({ token, userId }).one();
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

	async consumeToken(token: string, userId: string): Promise<{ status: boolean; message: string }> {
		const tokenDoc = await db.delete('tokens').where({ token, userId }).returning('*').one();
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
		return tokens.map(convertId);
	}

	async createRole(roleData: Role): Promise<Role> {
		const [role] = await db.insert('roles').values(roleData).returning('*');
		return convertId(role);
	}

	async updateRole(roleId: string, roleData: Partial<Role>): Promise<void> {
		await db.update('roles').set(roleData).where({ id: roleId });
	}

	async deleteRole(roleId: string): Promise<void> {
		await db.delete('roles').where({ id: roleId });
	}

	async getRoleById(roleId: string): Promise<Role | null> {
		const role = await db.select().from('roles').where({ id: roleId }).one();
		return role ? convertId(role) : null;
	}

	async getAllRoles(): Promise<Role[]> {
		const roles = await db.select().from('roles');
		return roles.map(convertId);
	}

	async createPermission(permissionData: Permission): Promise<Permission> {
		const [permission] = await db.insert('permissions').values(permissionData).returning('*');
		return convertId(permission);
	}

	async updatePermission(permissionId: string, permissionData: Partial<Permission>): Promise<void> {
		await db.update('permissions').set(permissionData).where({ id: permissionId });
	}

	async deletePermission(permissionId: string): Promise<void> {
		await db.delete('permissions').where({ id: permissionId });
	}

	async getPermissionById(permissionId: string): Promise<Permission | null> {
		const permission = await db.select().from('permissions').where({ id: permissionId }).one();
		return permission ? convertId(permission) : null;
	}

	async getAllPermissions(): Promise<Permission[]> {
		const permissions = await db.select().from('permissions');
		return permissions.map(convertId);
	}

	async getPermissionsForRole(roleId: string): Promise<Permission[]> {
		const role = await db.select().from('roles').where({ id: roleId }).one();
		return role ? (role.permissions as Permission[]) : [];
	}

	async assignPermissionToRole(roleId: string, permissionId: string): Promise<void> {
		await db
			.update('roles')
			.set({ permissions: db.raw('JSON_ARRAY_APPEND(permissions, "$", ?)', [permissionId]) })
			.where({ id: roleId });
	}

	async removePermissionFromRole(roleId: string, permissionId: string): Promise<void> {
		await db
			.update('roles')
			.set({ permissions: db.raw('JSON_REMOVE(permissions, ?)', [permissionId]) })
			.where({ id: roleId });
	}

	async assignPermissionToUser(userId: string, permissionId: string): Promise<void> {
		await db
			.update('users')
			.set({ permissions: db.raw('JSON_ARRAY_APPEND(permissions, "$", ?)', [permissionId]) })
			.where({ id: userId });
	}

	async removePermissionFromUser(userId: string, permissionId: string): Promise<void> {
		await db
			.update('users')
			.set({ permissions: db.raw('JSON_REMOVE(permissions, ?)', [permissionId]) })
			.where({ id: userId });
	}

	async getPermissionsForUser(userId: string): Promise<Permission[]> {
		const user = await db.select().from('users').where({ id: userId }).one();
		return user ? (user.permissions as Permission[]) : [];
	}
}
