import argon2 from 'argon2';
import type { Cookie, User, Session, Token } from './types';
import type { AuthDBAdapter } from './authDBAdapter';

export const SESSION_COOKIE_NAME = 'auth_sessions';

// argon2 attributes
const argon2Attributes = {
	type: argon2.argon2id, // Using Argon2id variant for a balance between Argon2i and Argon2d
	timeCost: 2, // Number of iterations
	memoryCost: 2 ** 12, // Using memory cost of 2^12 = 4MB
	parallelism: 2, // Number of execution threads
	saltLength: 16 // Salt length in bytes
} as { secret?: any };

export class Auth {
	private db: AuthDBAdapter;

	constructor(dbAdapter: AuthDBAdapter) {
		this.db = dbAdapter;
	}

	// Create a new user
	async createUser(userData: Partial<User>): Promise<User> {
		const { email, password, username, role, lastAuthMethod, is_registered } = userData;

		// Hash the password
		let hashed_password: string | undefined = undefined;
		if (password) {
			hashed_password = await argon2.hash(password, argon2Attributes);
		}

		// Create the user
		return await this.db.createUser({
			email,
			password: hashed_password,
			username,
			role,
			lastAuthMethod,
			is_registered
		});
	}

	// Update user attributes
	async updateUserAttributes(user: User, attributes: Partial<User>): Promise<void> {
		// Check if password needs updating
		if (attributes.password) {
			// Hash the password with argon2
			attributes.password = await argon2.hash(attributes.password, argon2Attributes);
		}
		// Update the user attributes
		await this.db.updateUserAttributes(user, attributes);
	}

	// Delete the user from the database
	async deleteUser(id: string): Promise<void> {
		await this.db.deleteUser(id);
	}

	// Create a session, valid for 1 hour by default, and only one session per device
	async createSession({ user_id, expires = 60 * 60 * 1000 }: { user_id: string; expires?: number }): Promise<Session> {
		return await this.db.createSession({ user_id, expires });
	}

	// Check if a user exists by ID or email
	async checkUser(fields: { id?: string; email?: string }): Promise<User | null> {
		return fields.email ? await this.db.getUserByEmail(fields.email) : await this.db.getUserById(fields.id!);
	}

	// Get the total number of users
	async getUserCount(): Promise<number> {
		return await this.db.getUserCount();
	}

	// Get a user by ID
	async getUserById(id: string): Promise<User | null> {
		return await this.db.getUserById(id);
	}

	// Get all users
	async getAllUsers(): Promise<User[]> {
		return await this.db.getAllUsers();
	}

	// Get all tokens
	async getAllTokens(): Promise<Token[]> {
		return await this.db.getAllTokens();
	}

	// Delete a user session
	async destroySession(session_id: string): Promise<void> {
		await this.db.destroySession(session_id);
	}

	// Create a cookie object that expires in 1 year
	createSessionCookie(session: Session): Cookie {
		return {
			name: SESSION_COOKIE_NAME,
			value: session.id,
			attributes: {
				sameSite: 'lax',
				path: '/',
				httpOnly: true,
				expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
				secure: false
			}
		};
	}

	// Log in a user with email and password
	async login(email: string, password: string): Promise<User | null> {
		const user = await this.db.getUserByEmail(email);
		if (user && (await argon2.verify(user.password!, password))) {
			return user;
		}
		return null;
	}

	// Log out a user by destroying their session
	async logOut(session_id: string): Promise<void> {
		await this.db.destroySession(session_id);
	}

	// Validate a session
	async validateSession(session_id: string): Promise<User | null> {
		return await this.db.validateSession(session_id);
	}

	// Create a token, default expires in 1 hour
	async createToken(user_id: string, expires = 60 * 60 * 1000): Promise<string> {
		const user = await this.db.getUserById(user_id);
		if (!user) throw new Error('User not found');
		return await this.db.createToken(user_id, user.email, expires);
	}

	// Validate a token
	async validateToken(token: string, user_id: string): Promise<{ success: boolean; message: string }> {
		return await this.db.validateToken(token, user_id);
	}

	// Consume a token
	async consumeToken(token: string, user_id: string): Promise<{ status: boolean; message: string }> {
		return await this.db.consumeToken(token, user_id);
	}

	// Invalidate all sessions for a user
	async invalidateAllUserSessions(user_id: string): Promise<void> {
		await this.db.invalidateAllUserSessions(user_id);
	}

	// Update a user's password
	async updateUserPassword(email: string, newPassword: string): Promise<{ status: boolean; message: string }> {
		const user = await this.db.getUserByEmail(email);
		if (!user) return { status: false, message: 'User not found' };
		const hashedPassword = await argon2.hash(newPassword, argon2Attributes);
		await this.db.updateUserAttributes(user, { password: hashedPassword });
		return { status: true, message: 'Password updated successfully' };
	}
}
