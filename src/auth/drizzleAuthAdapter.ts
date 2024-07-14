import { db } from '@api/databases/drizzleDBAdapter';
import type { authDBInterface } from './authDBInterface';
import type { User, Session, Token, Role, Permission } from './types';
import crypto from 'crypto';

// Import logger
import logger from '@utils/logger';

export class DrizzleAuthAdapter implements authDBInterface {
	async createUser(userData: Partial<User>): Promise<User> {
		logger.info('Creating user with data:', userData);
		try {
			const [user] = await db.insert('users').values(userData).returning('*');
			logger.info('User created successfully:', user);
			return user;
		} catch (error) {
			logger.error('Error creating user:', error);
			throw error;
		}
	}

	async updateUserAttributes(user_id: string, attributes: Partial<User>): Promise<void> {
		logger.info('Updating user attributes for user_id:', user_id, 'with attributes:', attributes);
		try {
			await db.update('users').set(attributes).where({ user_id });
			logger.info('User attributes updated successfully for user_id:', user_id);
		} catch (error) {
			logger.error('Error updating user attributes for user_id:', user_id, 'with error:', error);
			throw error;
		}
	}

	async deleteUser(user_id: string): Promise<void> {
		logger.info('Deleting user with user_id:', user_id);
		try {
			await db.delete('users').where({ user_id });
			logger.info('User deleted successfully with user_id:', user_id);
		} catch (error) {
			logger.error('Error deleting user with user_id:', user_id, 'with error:', error);
			throw error;
		}
	}

	async getUserById(user_id: string): Promise<User | null> {
		logger.info('Fetching user with user_id:', user_id);
		try {
			const user = await db.select().from('users').where({ user_id }).one();
			logger.info('User fetched successfully with user_id:', user_id, 'user:', user);
			return user ? user : null;
		} catch (error) {
			logger.error('Error fetching user with user_id:', user_id, 'with error:', error);
			throw error;
		}
	}

	async getUserByEmail(email: string): Promise<User | null> {
		logger.info('Fetching user with email:', email);
		try {
			const user = await db.select().from('users').where({ email }).one();
			logger.info('User fetched successfully with email:', email, 'user:', user);
			return user ? user : null;
		} catch (error) {
			logger.error('Error fetching user with email:', email, 'with error:', error);
			throw error;
		}
	}

	async getAllUsers(): Promise<User[]> {
		logger.info('Fetching all users');
		try {
			const users = await db.select().from('users');
			logger.info('All users fetched successfully:', users);
			return users;
		} catch (error) {
			logger.error('Error fetching all users with error:', error);
			throw error;
		}
	}

	async getUserCount(): Promise<number> {
		logger.info('Fetching user count');
		try {
			const result = await db.select(db.raw('COUNT(*) as count')).from('users').one();
			const count = result ? parseInt(result.count, 10) : 0;
			logger.info('User count fetched successfully:', count);
			return count;
		} catch (error) {
			logger.error('Error fetching user count with error:', error);
			throw error;
		}
	}

	async createSession(data: { user_id: string; expires: number }): Promise<Session> {
		logger.info('Creating session with data:', data);
		try {
			const [session] = await db
				.insert('sessions')
				.values({
					user_id: data.user_id,
					expires: new Date(Date.now() + data.expires)
				})
				.returning('*');
			logger.info('Session created successfully:', session);
			return session;
		} catch (error) {
			logger.error('Error creating session with data:', data, 'with error:', error);
			throw error;
		}
	}

	async destroySession(session_id: string): Promise<void> {
		logger.info('Destroying session with session_id:', session_id);
		try {
			await db.delete('sessions').where({ session_id });
			logger.info('Session destroyed successfully with session_id:', session_id);
		} catch (error) {
			logger.error('Error destroying session with session_id:', session_id, 'with error:', error);
			throw error;
		}
	}

	async validateSession(session_id: string): Promise<User | null> {
		logger.info('Validating session with session_id:', session_id);
		try {
			const session = await db.select().from('sessions').where({ session_id }).one();
			if (!session || session.expires <= new Date()) {
				if (session) await this.destroySession(session_id);
				logger.warn('Session is invalid or expired for session_id:', session_id);
				return null;
			}
			const user = await this.getUserById(session.user_id);
			logger.info('Session validated successfully for session_id:', session_id, 'user:', user);
			return user;
		} catch (error) {
			logger.error('Error validating session with session_id:', session_id, 'with error:', error);
			throw error;
		}
	}

	async invalidateAllUserSessions(user_id: string): Promise<void> {
		logger.info('Invalidating all sessions for user_id:', user_id);
		try {
			await db.delete('sessions').where({ user_id });
			logger.info('All sessions invalidated successfully for user_id:', user_id);
		} catch (error) {
			logger.error('Error invalidating all sessions for user_id:', user_id, 'with error:', error);
			throw error;
		}
	}

	async createToken(data: { user_id: string; email: string; expires: number }): Promise<string> {
		logger.info('Creating token with data:', data);
		try {
			const tokenString = crypto.randomBytes(16).toString('hex');
			await db.insert('tokens').values({
				user_id: data.user_id,
				token: tokenString,
				email: data.email,
				expires: new Date(Date.now() + data.expires)
			});
			logger.info('Token created successfully:', tokenString);
			return tokenString;
		} catch (error) {
			logger.error('Error creating token with data:', data, 'with error:', error);
			throw error;
		}
	}

	async validateToken(token: string, user_id: string): Promise<{ success: boolean; message: string }> {
		logger.info('Validating token with token:', token, 'and user_id:', user_id);
		try {
			const tokenDoc = await db.select().from('tokens').where({ token, user_id }).one();
			if (tokenDoc) {
				if (tokenDoc.expires > new Date()) {
					logger.info('Token is valid for token:', token, 'and user_id:', user_id);
					return { success: true, message: 'Token is valid' };
				} else {
					logger.warn('Token is expired for token:', token, 'and user_id:', user_id);
					return { success: false, message: 'Token is expired' };
				}
			} else {
				logger.warn('Token does not exist for token:', token, 'and user_id:', user_id);
				return { success: false, message: 'Token does not exist' };
			}
		} catch (error) {
			logger.error('Error validating token with token:', token, 'and user_id:', user_id, 'with error:', error);
			throw error;
		}
	}

	async consumeToken(token: string, user_id: string): Promise<{ status: boolean; message: string }> {
		logger.info('Consuming token with token:', token, 'and user_id:', user_id);
		try {
			const tokenDoc = await db.delete('tokens').where({ token, user_id }).returning('*').one();
			if (tokenDoc) {
				if (tokenDoc.expires > new Date()) {
					logger.info('Token is valid and consumed for token:', token, 'and user_id:', user_id);
					return { status: true, message: 'Token is valid' };
				} else {
					logger.warn('Token is expired for token:', token, 'and user_id:', user_id);
					return { status: false, message: 'Token is expired' };
				}
			} else {
				logger.warn('Token does not exist for token:', token, 'and user_id:', user_id);
				return { status: false, message: 'Token does not exist' };
			}
		} catch (error) {
			logger.error('Error consuming token with token:', token, 'and user_id:', user_id, 'with error:', error);
			throw error;
		}
	}

	async getAllTokens(): Promise<Token[]> {
		logger.info('Fetching all tokens');
		try {
			const tokens = await db.select().from('tokens');
			logger.info('All tokens fetched successfully:', tokens);
			return tokens;
		} catch (error) {
			logger.error('Error fetching all tokens with error:', error);
			throw error;
		}
	}

	async createRole(roleData: Role): Promise<Role> {
		logger.info('Creating role with data:', roleData);
		try {
			const [role] = await db.insert('roles').values(roleData).returning('*');
			logger.info('Role created successfully:', role);
			return role;
		} catch (error) {
			logger.error('Error creating role with data:', roleData, 'with error:', error);
			throw error;
		}
	}

	async updateRole(role_id: string, roleData: Partial<Role>): Promise<void> {
		logger.info('Updating role with role_id:', role_id, 'and data:', roleData);
		try {
			await db.update('roles').set(roleData).where({ role_id });
			logger.info('Role updated successfully for role_id:', role_id);
		} catch (error) {
			logger.error('Error updating role with role_id:', role_id, 'and data:', roleData, 'with error:', error);
			throw error;
		}
	}

	async deleteRole(role_id: string): Promise<void> {
		logger.info('Deleting role with role_id:', role_id);
		try {
			await db.delete('roles').where({ role_id });
			logger.info('Role deleted successfully for role_id:', role_id);
		} catch (error) {
			logger.error('Error deleting role with role_id:', role_id, 'with error:', error);
			throw error;
		}
	}

	async getRoleById(role_id: string): Promise<Role | null> {
		logger.info('Fetching role with role_id:', role_id);
		try {
			const role = await db.select().from('roles').where({ role_id }).one();
			logger.info('Role fetched successfully for role_id:', role_id, 'role:', role);
			return role ? role : null;
		} catch (error) {
			logger.error('Error fetching role with role_id:', role_id, 'with error:', error);
			throw error;
		}
	}

	async getAllRoles(): Promise<Role[]> {
		logger.info('Fetching all roles');
		try {
			const roles = await db.select().from('roles');
			logger.info('All roles fetched successfully:', roles);
			return roles;
		} catch (error) {
			logger.error('Error fetching all roles with error:', error);
			throw error;
		}
	}

	async createPermission(permissionData: Permission): Promise<Permission> {
		logger.info('Creating permission with data:', permissionData);
		try {
			const [permission] = await db.insert('permissions').values(permissionData).returning('*');
			logger.info('Permission created successfully:', permission);
			return permission;
		} catch (error) {
			logger.error('Error creating permission with data:', permissionData, 'with error:', error);
			throw error;
		}
	}

	async updatePermission(permission_id: string, permissionData: Partial<Permission>): Promise<void> {
		logger.info('Updating permission with permission_id:', permission_id, 'and data:', permissionData);
		try {
			await db.update('permissions').set(permissionData).where({ permission_id });
			logger.info('Permission updated successfully for permission_id:', permission_id);
		} catch (error) {
			logger.error('Error updating permission with permission_id:', permission_id, 'and data:', permissionData, 'with error:', error);
			throw error;
		}
	}

	async deletePermission(permission_id: string): Promise<void> {
		logger.info('Deleting permission with permission_id:', permission_id);
		try {
			await db.delete('permissions').where({ permission_id });
			logger.info('Permission deleted successfully for permission_id:', permission_id);
		} catch (error) {
			logger.error('Error deleting permission with permission_id:', permission_id, 'with error:', error);
			throw error;
		}
	}

	async getPermissionById(permission_id: string): Promise<Permission | null> {
		logger.info('Fetching permission with permission_id:', permission_id);
		try {
			const permission = await db.select().from('permissions').where({ permission_id }).one();
			logger.info('Permission fetched successfully for permission_id:', permission_id, 'permission:', permission);
			return permission ? permission : null;
		} catch (error) {
			logger.error('Error fetching permission with permission_id:', permission_id, 'with error:', error);
			throw error;
		}
	}

	async getAllPermissions(): Promise<Permission[]> {
		logger.info('Fetching all permissions');
		try {
			const permissions = await db.select().from('permissions');
			logger.info('All permissions fetched successfully:', permissions);
			return permissions;
		} catch (error) {
			logger.error('Error fetching all permissions with error:', error);
			throw error;
		}
	}

	async getPermissionsForRole(role_id: string): Promise<Permission[]> {
		logger.info('Fetching permissions for role_id:', role_id);
		try {
			const role = await db.select().from('roles').where({ role_id }).one();
			const permissions = role ? (role.permissions as Permission[]) : [];
			logger.info('Permissions fetched successfully for role_id:', role_id, 'permissions:', permissions);
			return permissions;
		} catch (error) {
			logger.error('Error fetching permissions for role_id:', role_id, 'with error:', error);
			throw error;
		}
	}

	async assignPermissionToRole(role_id: string, permission_id: string): Promise<void> {
		logger.info('Assigning permission_id:', permission_id, 'to role_id:', role_id);
		try {
			await db
				.update('roles')
				.set({ permissions: db.raw('JSON_ARRAY_APPEND(permissions, "$", ?)', [permission_id]) })
				.where({ role_id });
			logger.info('Permission assigned successfully to role_id:', role_id, 'permission_id:', permission_id);
		} catch (error) {
			logger.error('Error assigning permission_id:', permission_id, 'to role_id:', role_id, 'with error:', error);
			throw error;
		}
	}

	async removePermissionFromRole(role_id: string, permission_id: string): Promise<void> {
		logger.info('Removing permission_id:', permission_id, 'from role_id:', role_id);
		try {
			await db
				.update('roles')
				.set({ permissions: db.raw('JSON_REMOVE(permissions, ?)', [permission_id]) })
				.where({ role_id });
			logger.info('Permission removed successfully from role_id:', role_id, 'permission_id:', permission_id);
		} catch (error) {
			logger.error('Error removing permission_id:', permission_id, 'from role_id:', role_id, 'with error:', error);
			throw error;
		}
	}

	async assignPermissionToUser(user_id: string, permission_id: string): Promise<void> {
		logger.info('Assigning permission_id:', permission_id, 'to user_id:', user_id);
		try {
			await db
				.update('users')
				.set({ permissions: db.raw('JSON_ARRAY_APPEND(permissions, "$", ?)', [permission_id]) })
				.where({ user_id });
			logger.info('Permission assigned successfully to user_id:', user_id, 'permission_id:', permission_id);
		} catch (error) {
			logger.error('Error assigning permission_id:', permission_id, 'to user_id:', user_id, 'with error:', error);
			throw error;
		}
	}

	async removePermissionFromUser(user_id: string, permission_id: string): Promise<void> {
		logger.info('Removing permission_id:', permission_id, 'from user_id:', user_id);
		try {
			await db
				.update('users')
				.set({ permissions: db.raw('JSON_REMOVE(permissions, ?)', [permission_id]) })
				.where({ user_id });
			logger.info('Permission removed successfully from user_id:', user_id, 'permission_id:', permission_id);
		} catch (error) {
			logger.error('Error removing permission_id:', permission_id, 'from user_id:', user_id, 'with error:', error);
			throw error;
		}
	}

	async getPermissionsForUser(user_id: string): Promise<Permission[]> {
		logger.info('Fetching permissions for user_id:', user_id);
		try {
			const user = await db.select().from('users').where({ user_id }).one();
			const permissions = user ? (user.permissions as Permission[]) : [];
			logger.info('Permissions fetched successfully for user_id:', user_id, 'permissions:', permissions);
			return permissions;
		} catch (error) {
			logger.error('Error fetching permissions for user_id:', user_id, 'with error:', error);
			throw error;
		}
	}
}
