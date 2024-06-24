import argon2 from 'argon2';
import type { Cookie, User, Session, Token } from './types';
import type { AuthDBAdapter } from './authDBAdapter';
import logger from '../utils/logger'; // Import logger

export const SESSION_COOKIE_NAME = 'auth_sessions';

// Argon2 hashing attributes
const argon2Attributes = {
	type: argon2.argon2id, // Using Argon2id variant for a balance between Argon2i and Argon2d
	timeCost: 2, // Number of iterations
	memoryCost: 2 ** 12, // Using memory cost of 2^12 = 4MB
	parallelism: 2, // Number of execution threads
	saltLength: 16 // Salt length in bytes
} as const;

// Auth class to handle user and session management
export class Auth {
	private db: AuthDBAdapter;

	constructor(dbAdapter: AuthDBAdapter) {
		this.db = dbAdapter;
	}

	// Create a new user with hashed password
	async createUser(userData: Partial<User>): Promise<User> {
		try {
			const { email, password, username, role, lastAuthMethod, isRegistered } = userData;

			// Hash the password
			let hashed_password: string | undefined;
			if (password) {
				hashed_password = await argon2.hash(password, argon2Attributes); // Use await
			}

			// Create the user in the database
			const user = await this.db.createUser({
				email,
				password: hashed_password,
				username,
				role,
				lastAuthMethod,
				isRegistered
			});

			logger.info(`User created: ${user.id}`);
			return user;
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to create user: ${err.message}`);
			throw new Error(`Failed to create user: ${err.message}`);
		}
	}

	// Update user attributes
	async updateUserAttributes(userId: string, attributes: Partial<User>): Promise<void> {
		try {
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
			logger.info(`User attributes updated for user ID: ${userId}`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to update user attributes: ${err.message}`);
			throw new Error(`Failed to update user attributes: ${err.message}`);
		}
	}

	// Delete the user from the database
	async deleteUser(userId: string): Promise<void> {
		try {
			await this.db.deleteUser(userId);
			logger.info(`User deleted: ${userId}`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to delete user: ${err.message}`);
			throw new Error(`Failed to delete user: ${err.message}`);
		}
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
		try {
			expires = isExtended ? expires * 2 : expires; // Extend session time if required
			logger.info(`Creating session for user ID: ${userId} with expiry: ${expires}`);
			const session = await this.db.createSession({ userId, expires });
			logger.info(`Session created with ID: ${session.id} for user ID: ${userId}`);
			return session;
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to create session: ${err.message}`);
			throw new Error(`Failed to create session: ${err.message}`);
		}
	}

	// Check if a user exists by ID or email
	async checkUser(fields: { userId?: string; email?: string }): Promise<User | null> {
		try {
			if (fields.email) {
				return await this.db.getUserByEmail(fields.email);
			} else if (fields.userId) {
				return await this.db.getUserById(fields.userId);
			} else {
				logger.warn('No user identifier provided.');
				return null;
			}
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to check user: ${err.message}`);
			throw new Error(`Failed to check user: ${err.message}`);
		}
	}

	// Get the total number of users
	async getUserCount(): Promise<number> {
		try {
			return await this.db.getUserCount();
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to get user count: ${err.message}`);
			throw new Error(`Failed to get user count: ${err.message}`);
		}
	}

	// Get a user by ID
	async getUserById(userId: string): Promise<User | null> {
		try {
			return await this.db.getUserById(userId);
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to get user by ID: ${err.message}`);
			throw new Error(`Failed to get user by ID: ${err.message}`);
		}
	}

	// Get all users
	async getAllUsers(): Promise<User[]> {
		try {
			return await this.db.getAllUsers();
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to get all users: ${err.message}`);
			throw new Error(`Failed to get all users: ${err.message}`);
		}
	}

	// Get all tokens
	async getAllTokens(): Promise<Token[]> {
		try {
			return await this.db.getAllTokens();
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to get all tokens: ${err.message}`);
			throw new Error(`Failed to get all tokens: ${err.message}`);
		}
	}

	// Delete a user session
	async destroySession(sessionId: string): Promise<void> {
		try {
			await this.db.destroySession(sessionId);
			logger.info(`Session destroyed: ${sessionId}`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to destroy session: ${err.message}`);
			throw new Error(`Failed to destroy session: ${err.message}`);
		}
	}

	// Create a cookie object that expires in 1 year
	createSessionCookie(session: Session): Cookie {
		return {
			name: SESSION_COOKIE_NAME,
			value: session.id,
			attributes: {
				sameSite: 'lax', // Set 'SameSite' to 'Lax' or 'Strict' depending on your requirements
				path: '/',
				httpOnly: true,
				expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365), // Set cookie to 1-year expiration
				secure: process.env.NODE_ENV === 'production' // Secure flag based on environment
			}
		};
	}

	// Log in a user with email and password
	async login(email: string, password: string): Promise<User | null> {
		const user = await this.db.getUserByEmail(email);
		if (!user || !user.password) {
			logger.warn(`Login failed: User not found or password not set for email: ${email}`);
			return null; // Properly handle non-existent user or password not set
		}

		if (user.lockoutUntil && new Date(user.lockoutUntil) > new Date()) {
			logger.warn(`Login attempt for locked out account: ${email}`);
			throw new Error('Account is temporarily locked. Please try again later.');
		}

		try {
			if (await argon2.verify(user.password, password)) {
				await this.db.updateUserAttributes(user.id, { failedAttempts: 0, lockoutUntil: null });
				logger.info(`User logged in: ${user.id}`);
				return user;
			} else {
				user.failedAttempts++;
				if (user.failedAttempts >= 5) {
					const lockoutUntil = new Date(Date.now() + 30 * 60 * 1000);
					await this.db.updateUserAttributes(user._id.toString(), { lockoutUntil });
					logger.warn(`User locked out due to too many failed attempts: ${user.id}`);
					throw new Error('Account is temporarily locked due to too many failed attempts. Please try again later.');
				} else {
					await this.db.updateUserAttributes(user._id.toString(), { failedAttempts: user.failedAttempts });
					logger.warn(`Invalid login attempt for user: ${user.id}`);
					throw new Error('Invalid credentials. Please try again.');
				}
			}
		} catch (error) {
			const err = error as Error;
			logger.error(`Login error: ${err.message}`);
			throw err;
		}
	}

	// Log out a user by destroying their session
	async logOut(session_id: string): Promise<void> {
		try {
			await this.db.destroySession(session_id);
			logger.info(`User logged out: ${session_id}`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to log out: ${err.message}`);
			throw new Error(`Failed to log out: ${err.message}`);
		}
	}

	// Validate a session
	async validateSession({ sessionId }: { sessionId: string }): Promise<User | null> {
		try {
			logger.info(`Validating session with ID: ${sessionId}`);
			const user = await this.db.validateSession(sessionId);
			if (user) {
				logger.info(`Session is valid for user: ${user.email}`);
			} else {
				logger.warn(`Invalid session ID: ${sessionId}`);
			}
			return user;
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to validate session: ${err.message}`);
			throw new Error(`Failed to validate session: ${err.message}`);
		}
	}

	// Create a token, default expires in 1 hour
	async createToken(userId: string, expires = 60 * 60 * 1000): Promise<string> {
		try {
			const user = await this.db.getUserById(userId);
			if (!user) throw new Error('User not found');
			const token = await this.db.createToken({ userId, email: user.email, expires });
			logger.info(`Token created for user ID: ${userId}`);
			return token;
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to create token: ${err.message}`);
			throw new Error(`Failed to create token: ${err.message}`);
		}
	}

	// Validate a token
	async validateToken(token: string, userId: string): Promise<{ success: boolean; message: string }> {
		try {
			logger.info(`Validating token: ${token} for user ID: ${userId}`);
			return await this.db.validateToken(token, userId);
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to validate token: ${err.message}`);
			throw new Error(`Failed to validate token: ${err.message}`);
		}
	}

	// Consume a token
	async consumeToken(token: string, userId: string): Promise<{ status: boolean; message: string }> {
		try {
			logger.info(`Consuming token: ${token} for user ID: ${userId}`);
			const consumption = await this.db.consumeToken(token, userId);
			logger.info(`Token consumption result: ${consumption.message}`);
			return consumption;
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to consume token: ${err.message}`);
			throw new Error(`Failed to consume token: ${err.message}`);
		}
	}

	// Invalidate all sessions for a user
	async invalidateAllUserSessions(userId: string): Promise<void> {
		try {
			await this.db.invalidateAllUserSessions(userId);
			logger.info(`Invalidated all sessions for user ID: ${userId}`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to invalidate all sessions for user ID: ${err.message}`);
			throw new Error(`Failed to invalidate all sessions for user ID: ${err.message}`);
		}
	}

	// Update a user's password
	async updateUserPassword(email: string, newPassword: string): Promise<{ status: boolean; message: string }> {
		try {
			const user = await this.db.getUserByEmail(email);
			if (!user) {
				logger.warn(`Failed to update password: User not found for email: ${email}`);
				return { status: false, message: 'User not found' };
			}
			const hashedPassword = await argon2.hash(newPassword, argon2Attributes);
			await this.db.updateUserAttributes(user.id, { password: hashedPassword });
			logger.info(`Password updated for user ID: ${user.id}`);
			return { status: true, message: 'Password updated successfully' };
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to update user password: ${err.message}`);
			return { status: false, message: `Failed to update password: ${err.message}` };
		}
	}
}
