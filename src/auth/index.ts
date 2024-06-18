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
		try {
			const { email, password, username, role, lastAuthMethod, is_registered } = userData;

			// Hash the password
			let hashed_password: string | undefined;
			if (password) {
				hashed_password = await argon2.hash(password, argon2Attributes); // Use await
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
		} catch (error) {
			throw new Error(`Failed to create user: ${error}`);
		}
	}

	// Update user attributes
	async updateUserAttributes(userId: string, attributes: Partial<User>): Promise<void> {
		// Check if password needs updating
		if (attributes.password) {
			// Hash the password with argon2
			attributes.password = await argon2.hash(attributes.password, argon2Attributes);
		}
		// Convert null email to undefined
		if (attributes.email === null) {
			attributes.email = undefined;
		}
		// Update the user attributes
		await this.db.updateUserAttributes(userId, attributes);
	}

	// Delete the user from the database
	async deleteUser(userId: string): Promise<void> {
		await this.db.deleteUser(userId);
	}

	// Create a session, valid for 1 hour by default, and only one session per device
	async createSession({
		userId,
		expires = 60 * 60 * 1000, // 1 hour by default
		isExtended = false // Extend session if required
	}: {
		userId: string;
		expires?: number;
		isExtended?: boolean;
	}): Promise<Session> {
		expires = isExtended ? expires * 2 : expires; // Extend session time if required
		console.log(`Creating session for user ID: ${userId} with expiry: ${expires}`);
		const session = await this.db.createSession({ userId, expires });
		console.log(`Session created with ID: ${session.id} for user ID: ${userId}`);
		return session;
	}
	// Check if a user exists by ID or email
	async checkUser(fields: { userId?: string; email?: string }): Promise<User | null> {
		return fields.email ? await this.db.getUserByEmail(fields.email) : await this.db.getUserById(fields.id!);
	}
	// Get the total number of users
	async getUserCount(): Promise<number> {
		return await this.db.getUserCount();
	}

	// Get a user by ID
	async getUserById(userId: string): Promise<User | null> {
		return await this.db.getUserById(userId);
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
	async destroySession(sessionId: string): Promise<void> {
		await this.db.destroySession(sessionId);
	}

	// Create a cookie object that expires in 1 year
	createSessionCookie(session: Session): Cookie {
		return {
			name: SESSION_COOKIE_NAME,
			value: session.id,
			attributes: {
				sameSite: 'strict',
				path: '/',
				httpOnly: true,
				expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365), // Set cookie to 1-year expiration
				secure: true // Ensure cookies are sent only over HTTPS
			}
		};
	}

	// Log in a user with email and password
	async login(email: string, password: string): Promise<User | null> {
		const user = await this.db.getUserByEmail(email);
		if (!user || !user.password) {
			return null; // Properly handle non-existent user or password not set
		}

		if (user.lockoutUntil && new Date(user.lockoutUntil) > new Date()) {
			throw new Error('Account is temporarily locked. Please try again later.');
		}

		try {
			if (await argon2.verify(user.password, password)) {
				await this.db.updateUserAttributes(user.id, { failedAttempts: 0, lockoutUntil: null });
				return user;
			} else {
				user.failedAttempts++;
				if (user.failedAttempts >= 5) {
					const lockoutUntil = new Date(Date.now() + 30 * 60 * 1000);
					await this.db.updateUserAttributes(user.id, { lockoutUntil });
					throw new Error('Account is temporarily locked due to too many failed attempts. Please try again later.');
				} else {
					await this.db.updateUserAttributes(user.id, { lockoutUntil: undefined }); // Use undefined instead of null
					throw new Error('Invalid credentials. Please try again.');
				}
			}
		} catch (error) {
			console.error(`Login error: ${error}`);
			throw error;
		}
	}

	// Log out a user by destroying their session
	async logOut(session_id: string): Promise<void> {
		await this.db.destroySession(session_id);
	}

	// Validate a session
	async validateSession({ sessionId }: { sessionId: string }): Promise<User | null> {
		console.log(`Auth: Validating session with ID: ${sessionId}`);
		const user = await this.db.validateSession(sessionId);
		if (user) {
			console.log(`Auth: Session is valid for user: ${user.email}`);
		} else {
			console.log(`Auth: Session is invalid or user not found.`);
		}
		return user;
	}
	// Create a token, default expires in 1 hour
	async createToken(userId: string, expires = 60 * 60 * 1000): Promise<string> {
		const user = await this.db.getUserById(userId);
		if (!user) throw new Error('User not found');
		return await this.db.createToken({ userId, email: user.email, expires });
	}

	// Validate a token
	async validateToken(token: string, userId: string): Promise<{ success: boolean; message: string }> {
		console.log(`Auth: Validating token: ${token} for user ID: ${userId}`);
		return await this.db.validateToken(token, userId);
	}

	// Consume a token
	async consumeToken(token: string, userId: string): Promise<{ status: boolean; message: string }> {
		console.log(`Auth: Consuming token: ${token} for user ID: ${userId}`);
		const consumption = await this.db.consumeToken(token, userId);
		console.log(`Auth: Token consumption result: ${consumption.message}`);
		return consumption;
	}

	// Invalidate all sessions for a user
	async invalidateAllUserSessions(userId: string): Promise<void> {
		await this.db.invalidateAllUserSessions(userId);
	}

	// Update a user's password
	async updateUserPassword(email: string, newPassword: string): Promise<{ status: boolean; message: string }> {
		const user = await this.db.getUserByEmail(email);
		if (!user) return { status: false, message: 'User not found' };
		const hashedPassword = await argon2.hash(newPassword, argon2Attributes);
		await this.db.updateUserAttributes(user.id, { password: hashedPassword });
		return { status: true, message: 'Password updated successfully' };
	}
}
