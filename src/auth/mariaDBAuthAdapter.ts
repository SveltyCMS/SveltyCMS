import mariadb from 'mariadb';
import crypto from 'crypto';
import type { AuthDBAdapter } from './authDBAdapter';
import type { User, Session, Token } from './types';

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
	// Create a new user
	async createUser(userData: Partial<User>): Promise<User> {
		const conn = await pool.getConnection();
		try {
			const result = await conn.query('INSERT INTO auth_users SET ?', userData);
			const user = { ...userData, id: result.insertId } as User;
			return user;
		} finally {
			conn.release();
		}
	}

	// Update attributes of an existing user
	async updateUserAttributes(user: User, attributes: Partial<User>): Promise<void> {
		const conn = await pool.getConnection();
		try {
			await conn.query('UPDATE auth_users SET ? WHERE id = ?', [attributes, user.id]);
		} finally {
			conn.release();
		}
	}

	// Delete a user by ID
	async deleteUser(id: string): Promise<void> {
		const conn = await pool.getConnection();
		try {
			await conn.query('DELETE FROM auth_users WHERE id = ?', [id]);
		} finally {
			conn.release();
		}
	}

	// Get a user by ID
	async getUserById(id: string): Promise<User | null> {
		const conn = await pool.getConnection();
		try {
			const rows = await conn.query('SELECT * FROM auth_users WHERE id = ?', [id]);
			return rows[0] || null;
		} finally {
			conn.release();
		}
	}

	// Get a user by email
	async getUserByEmail(email: string): Promise<User | null> {
		const conn = await pool.getConnection();
		try {
			const rows = await conn.query('SELECT * FROM auth_users WHERE email = ?', [email]);
			return rows[0] || null;
		} finally {
			conn.release();
		}
	}

	// Get all users
	async getAllUsers(): Promise<User[]> {
		const conn = await pool.getConnection();
		try {
			const rows = await conn.query('SELECT * FROM auth_users');
			return rows;
		} finally {
			conn.release();
		}
	}

	// Get the total number of users
	async getUserCount(): Promise<number> {
		const conn = await pool.getConnection();
		try {
			const rows = await conn.query('SELECT COUNT(*) as count FROM auth_users');
			return rows[0].count;
		} finally {
			conn.release();
		}
	}

	// Create a new session for a user
	async createSession(data: { user_id: string; expires: number }): Promise<Session> {
		const conn = await pool.getConnection();
		try {
			const expiresDate = new Date(Date.now() + data.expires);
			const result = await conn.query('INSERT INTO auth_sessions SET ?', {
				user_id: data.user_id,
				expires: expiresDate
			});
			const session = { id: result.insertId, user_id: data.user_id, expires: expiresDate } as Session;
			return session;
		} finally {
			conn.release();
		}
	}

	// Destroy a session by ID
	async destroySession(session_id: string): Promise<void> {
		const conn = await pool.getConnection();
		try {
			await conn.query('DELETE FROM auth_sessions WHERE id = ?', [session_id]);
		} finally {
			conn.release();
		}
	}

	// Validate a session by ID
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

	// Invalidate all sessions for a user
	async invalidateAllUserSessions(user_id: string): Promise<void> {
		const conn = await pool.getConnection();
		try {
			await conn.query('DELETE FROM auth_sessions WHERE user_id = ?', [user_id]);
		} finally {
			conn.release();
		}
	}

	// Create a new token for a user
	async createToken(user_id: string, email: string, expires: number): Promise<string> {
		const conn = await pool.getConnection();
		try {
			const tokenString = crypto.randomBytes(16).toString('hex');
			const expiresDate = new Date(Date.now() + expires);
			await conn.query('INSERT INTO auth_tokens SET ?', {
				user_id,
				token: tokenString,
				email,
				expires: expiresDate
			});
			return tokenString;
		} finally {
			conn.release();
		}
	}

	// Validate a token
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

	// Consume a token
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

	// Get all tokens
	async getAllTokens(): Promise<Token[]> {
		const conn = await pool.getConnection();
		try {
			const rows = await conn.query('SELECT * FROM auth_tokens');
			return rows;
		} finally {
			conn.release();
		}
	}
}
