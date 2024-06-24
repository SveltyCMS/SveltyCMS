import mariadb from 'mariadb';
import crypto from 'crypto';

// Import types
import type { AuthDBAdapter } from './authDBAdapter';
import type { User, Session, Token, Role, Permission } from './types';

// Define the pool for MariaDB connection
const pool = mariadb.createPool({
	host: process.env.DB_HOST,
	port: Number(process.env.DB_PORT),
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_NAME,
	connectionLimit: 5
});

// MariaDBAuthAdapter class implementing AuthDBAdapter interface
export class MariaDBAuthAdapter implements AuthDBAdapter {
	// Create a new user.
	async createUser(userData: Partial<User>): Promise<User> {
		const conn = await pool.getConnection();
		try {
			const result = await conn.query('INSERT INTO auth_users SET ?', userData);
			return { ...userData, id: result.insertId } as User;
		} finally {
			conn.release();
		}
	}

	// Update attributes of an existing user.
	async updateUserAttributes(user_id: string, attributes: Partial<User>): Promise<void> {
		const conn = await pool.getConnection();
		try {
			await conn.query('UPDATE auth_users SET ? WHERE id = ?', [attributes, user_id]);
		} finally {
			conn.release();
		}
	}

	// Delete a user by ID.
	async deleteUser(id: string): Promise<void> {
		const conn = await pool.getConnection();
		try {
			await conn.query('DELETE FROM auth_users WHERE id = ?', [id]);
		} finally {
			conn.release();
		}
	}

	// Get a user by ID.
	async getUserById(id: string): Promise<User | null> {
		const conn = await pool.getConnection();
		try {
			const rows = await conn.query('SELECT * FROM auth_users WHERE id = ?', [id]);
			return rows[0] || null;
		} finally {
			conn.release();
		}
	}

	// Get a user by email.
	async getUserByEmail(email: string): Promise<User | null> {
		const conn = await pool.getConnection();
		try {
			const rows = await conn.query('SELECT * FROM auth_users WHERE email = ?', [email]);
			return rows[0] || null;
		} finally {
			conn.release();
		}
	}

	// Get all users.
	async getAllUsers(): Promise<User[]> {
		const conn = await pool.getConnection();
		try {
			const rows = await conn.query('SELECT * FROM auth_users');
			return rows;
		} finally {
			conn.release();
		}
	}

	// Get the total number of users.
	async getUserCount(): Promise<number> {
		const conn = await pool.getConnection();
		try {
			const rows = await conn.query('SELECT COUNT(*) as count FROM auth_users');
			return rows[0].count;
		} finally {
			conn.release();
		}
	}

	// Create a new session for a user.
	async createSession(data: { user_id: string; expires: number }): Promise<Session> {
		const conn = await pool.getConnection();
		try {
			const expiresDate = new Date(Date.now() + data.expires);
			const result = await conn.query('INSERT INTO auth_sessions SET ?', {
				user_id: data.user_id,
				expires: expiresDate
			});
			return { id: result.insertId, user_id: data.user_id, expires: expiresDate } as Session;
		} finally {
			conn.release();
		}
	}

	// Destroy a session by ID.
	async destroySession(session_id: string): Promise<void> {
		const conn = await pool.getConnection();
		try {
			await conn.query('DELETE FROM auth_sessions WHERE id = ?', [session_id]);
		} finally {
			conn.release();
		}
	}

	// Validate a session by ID.
	async validateSession(session_id: string): Promise<User | null> {
		const conn = await pool.getConnection();
		try {
			const rows = await conn.query('SELECT * FROM auth_sessions WHERE id = ? AND expires > NOW()', [session_id]);
			if (rows.length > 0) {
				const session = rows[0];
				const userRows = await conn.query('SELECT * FROM auth_users WHERE id = ?', [session.user_id]);
				return userRows[0] || null;
			}
			return null;
		} finally {
			conn.release();
		}
	}

	// Invalidate all sessions for a user.
	async invalidateAllUserSessions(user_id: string): Promise<void> {
		const conn = await pool.getConnection();
		try {
			await conn.query('DELETE FROM auth_sessions WHERE user_id = ?', [user_id]);
		} finally {
			conn.release();
		}
	}

	// Create a new token.
	async createToken(data: { user_id: string; email: string; expires: number }): Promise<string> {
		const conn = await pool.getConnection();
		try {
			const tokenString = crypto.randomBytes(16).toString('hex');
			const expiresDate = new Date(Date.now() + data.expires);
			await conn.query('INSERT INTO auth_tokens SET ?', {
				user_id: data.user_id,
				token: tokenString,
				email: data.email,
				expires: expiresDate
			});
			return tokenString;
		} finally {
			conn.release();
		}
	}

	// Validate a token.
	async validateToken(token: string, user_id: string): Promise<{ success: boolean; message: string }> {
		const conn = await pool.getConnection();
		try {
			const rows = await conn.query('SELECT * FROM auth_tokens WHERE token = ? AND user_id = ?', [token, user_id]);
			if (rows.length > 0) {
				const tokenDoc = rows[0];
				if (tokenDoc.expires > new Date()) {
					return { success: true, message: 'Token is valid' };
				} else {
					return { success: false, message: 'Token is expired' };
				}
			}
			return { success: false, message: 'Token does not exist' };
		} finally {
			conn.release();
		}
	}

	// Consume a token.
	async consumeToken(token: string, user_id: string): Promise<{ status: boolean; message: string }> {
		const conn = await pool.getConnection();
		try {
			const rows = await conn.query('DELETE FROM auth_tokens WHERE token = ? AND user_id = ? RETURNING *', [token, user_id]);
			if (rows.length > 0) {
				const tokenDoc = rows[0];
				if (tokenDoc.expires > new Date()) {
					return { status: true, message: 'Token is valid' };
				} else {
					return { status: false, message: 'Token is expired' };
				}
			}
			return { status: false, message: 'Token does not exist' };
		} finally {
			conn.release();
		}
	}

	// Get all tokens.
	async getAllTokens(): Promise<Token[]> {
		const conn = await pool.getConnection();
		try {
			const rows = await conn.query('SELECT * FROM auth_tokens');
			return rows;
		} finally {
			conn.release();
		}
	}

	// Create a new role.
	async createRole(roleData: Role): Promise<Role> {
		const conn = await pool.getConnection();
		try {
			const result = await conn.query('INSERT INTO roles SET ?', roleData);
			return { ...roleData, id: result.insertId };
		} finally {
			conn.release();
		}
	}

	// Update a role.
	async updateRole(roleId: string, roleData: Partial<Role>): Promise<void> {
		const conn = await pool.getConnection();
		try {
			await conn.query('UPDATE roles SET ? WHERE id = ?', [roleData, roleId]);
		} finally {
			conn.release();
		}
	}

	// Delete a role.
	async deleteRole(roleId: string): Promise<void> {
		const conn = await pool.getConnection();
		try {
			await conn.query('DELETE FROM roles WHERE id = ?', [roleId]);
		} finally {
			conn.release();
		}
	}

	// Get a role by ID.
	async getRoleById(roleId: string): Promise<Role | null> {
		const conn = await pool.getConnection();
		try {
			const rows = await conn.query('SELECT * FROM roles WHERE id = ?', [roleId]);
			return rows[0] || null;
		} finally {
			conn.release();
		}
	}

	// Get all roles.
	async getAllRoles(): Promise<Role[]> {
		const conn = await pool.getConnection();
		try {
			const rows = await conn.query('SELECT * FROM roles');
			return rows;
		} finally {
			conn.release();
		}
	}

	// Create a permission.
	async createPermission(permissionData: Permission): Promise<Permission> {
		const conn = await pool.getConnection();
		try {
			const result = await conn.query('INSERT INTO permissions SET ?', permissionData);
			return { ...permissionData, id: result.insertId };
		} finally {
			conn.release();
		}
	}

	// Update a permission.
	async updatePermission(permissionId: string, permissionData: Partial<Permission>): Promise<void> {
		const conn = await pool.getConnection();
		try {
			await conn.query('UPDATE permissions SET ? WHERE id = ?', [permissionData, permissionId]);
		} finally {
			conn.release();
		}
	}

	// Delete a permission.
	async deletePermission(permissionId: string): Promise<void> {
		const conn = await pool.getConnection();
		try {
			await conn.query('DELETE FROM permissions WHERE id = ?', [permissionId]);
		} finally {
			conn.release();
		}
	}

	// Get a permission by ID.
	async getPermissionById(permissionId: string): Promise<Permission | null> {
		const conn = await pool.getConnection();
		try {
			const rows = await conn.query('SELECT * FROM permissions WHERE id = ?', [permissionId]);
			return rows[0] || null;
		} finally {
			conn.release();
		}
	}

	// Get all permissions.
	async getAllPermissions(): Promise<Permission[]> {
		const conn = await pool.getConnection();
		try {
			const rows = await conn.query('SELECT * FROM permissions');
			return rows;
		} finally {
			conn.release();
		}
	}

	// Assign permission to a role.
	async assignPermissionToRole(roleId: string, permissionId: string): Promise<void> {
		const conn = await pool.getConnection();
		try {
			await conn.query('INSERT INTO role_permissions (roleId, permissionId) VALUES (?, ?)', [roleId, permissionId]);
		} finally {
			conn.release();
		}
	}

	// Remove permission from a role.
	async removePermissionFromRole(roleId: string, permissionId: string): Promise<void> {
		const conn = await pool.getConnection();
		try {
			await conn.query('DELETE FROM role_permissions WHERE roleId = ? AND permissionId = ?', [roleId, permissionId]);
		} finally {
			conn.release();
		}
	}

	// Get permissions for a role.
	async getPermissionsForRole(roleId: string): Promise<Permission[]> {
		const conn = await pool.getConnection();
		try {
			const rows = await conn.query(
				`
                SELECT p.* FROM permissions p
                JOIN role_permissions rp ON p.id = rp.permissionId
                WHERE rp.roleId = ?
            `,
				[roleId]
			);
			return rows;
		} finally {
			conn.release();
		}
	}

	// Assign permission to a user.
	async assignPermissionToUser(user_id: string, permissionId: string): Promise<void> {
		const conn = await pool.getConnection();
		try {
			await conn.query('INSERT INTO user_permissions (user_id, permissionId) VALUES (?, ?)', [user_id, permissionId]);
		} finally {
			conn.release();
		}
	}

	// Remove permission from a user.
	async removePermissionFromUser(user_id: string, permissionId: string): Promise<void> {
		const conn = await pool.getConnection();
		try {
			await conn.query('DELETE FROM user_permissions WHERE user_id = ? AND permissionId = ?', [user_id, permissionId]);
		} finally {
			conn.release();
		}
	}

	// Get permissions for a user.
	async getPermissionsForUser(user_id: string): Promise<Permission[]> {
		const conn = await pool.getConnection();
		try {
			const rows = await conn.query(
				`
                SELECT p.* FROM permissions p
                JOIN user_permissions up ON p.id = up.permissionId
                WHERE up.user_id = ?
            `,
				[user_id]
			);
			return rows;
		} finally {
			conn.release();
		}
	}
}
