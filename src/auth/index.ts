/**
 * @file src/auth/index.ts
 * @description Main authentication module for the application.
 *
 * This module provides core authentication functionality:
 * - User creation and management
 * - Session handling
 * - Password hashing and verification
 * - Token generation and validation
 *
 * Features:
 * - User authentication and authorization
 * - Session management with optional Redis support
 * - Secure password handling with Argon2
 * - Flexible database adapter integration
 *
 * Usage:
 * Central module for handling all authentication-related operations in the application
 */

import { privateEnv } from '@root/config/private';

// Types
import type { Cookie, User, Session, Token } from './types';
import type { authDBInterface } from './authDBInterface';

// Cache & Redis
import { OptionalRedisSessionStore } from './SessionStores';

// Import argon2 conditionally
let argon2: typeof import('argon2') | null = null;
if (typeof window === 'undefined') {
	import('argon2').then((module) => {
		argon2 = module;
	});
}

// Default expiration time (1 hour in seconds)
const DEFAULT_SESSION_EXPIRATION_SECONDS = 3600; // 1 hour

// System Logs
import logger from '@src/utils/logger';

export const SESSION_COOKIE_NAME = 'auth_sessions';

// Session Store Interface
export interface SessionStore {
	get(sessionId: string): Promise<User | null>;
	set(sessionId: string, user: User, expirationInSeconds: number): Promise<void>;
	delete(sessionId: string): Promise<void>;
	validateWithDB(sessionId: string, dbValidationFn: (sessionId: string) => Promise<User | null>): Promise<User | null>;
	close(): Promise<void>;
}

// Define Argon2 attributes configuration
const argon2Attributes = {
	timeCost: 3, // Number of iterations
	memoryCost: 2 ** 12, // Using memory cost of 2^12 = 4MB
	parallelism: 2, // Number of execution threads
	saltLength: 16 // Salt length in bytes
} as const;

// Default Session Store
export const defaultSessionStore = new OptionalRedisSessionStore();

// Auth class to handle user and session management
export class Auth {
	private db: authDBInterface;
	private sessionStore: SessionStore;

	constructor(dbAdapter: authDBInterface, sessionStore: SessionStore = defaultSessionStore) {
		this.db = dbAdapter;
		this.sessionStore = sessionStore;
	}

	// Create a new user with hashed password
	async createUser(userData: Omit<Partial<User>, '_id'>): Promise<User> {
		try {
			const { email, password, username, role, lastAuthMethod, isRegistered } = userData;
			// Hash the password
			let hashedPassword: string | undefined;
			if (password) {
				if (!argon2) {
					throw new Error('Argon2 is not available in this environment');
				}
				hashedPassword = await argon2.hash(password, {
					...argon2Attributes,
					type: argon2.argon2id // Explicitly set the type here
				});
			}
			logger.debug(`Creating user with email: ${email}`);
			// Create the user in the database
			const user = await this.db.createUser({
				email,
				password: hashedPassword,
				username,
				role,
				lastAuthMethod,
				isRegistered,
				failedAttempts: 0 // Initialize failedAttempts to 0
			});
			if (!user || !user._id) {
				throw new Error('User creation failed: No user ID returned');
			}
			logger.info(`User created: ${user._id}`);
			return user;
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to create user: ${err.message}`);
			throw new Error(`Failed to create user: ${err.message}`);
		}
	}

	// Update user attributes
	async updateUserAttributes(user_id: string, attributes: Partial<User>): Promise<void> {
		try {
			// Check if password needs updating
			if (attributes.password && typeof window === 'undefined') {
				if (!argon2) {
					throw new Error('Argon2 is not available in this environment');
				}
				// Hash the password with argon2
				attributes.password = await argon2.hash(attributes.password, {
					...argon2Attributes,
					type: argon2.argon2id // Explicitly set the type here
				});
			}
			// Convert null email to undefined
			if (attributes.email === null) {
				attributes.email = undefined;
			}
			// Update the user attributes
			await this.db.updateUserAttributes(user_id, attributes);
			logger.info(`User attributes updated for user ID: ${user_id}`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to update user attributes: ${err.message}`);
			throw new Error(`Failed to update user attributes: ${err.message}`);
		}
	}

	// Delete the user from the database
	async deleteUser(user_id: string): Promise<void> {
		try {
			await this.db.deleteUser(user_id);
			logger.info(`User deleted: ${user_id}`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to delete user: ${err.message}`);
			throw new Error(`Failed to delete user: ${err.message}`);
		}
	}

	// Create a session, valid for 1 hour by default
	async createSession({
		user_id,
		expires = (privateEnv.SESSION_EXPIRATION_SECONDS ?? DEFAULT_SESSION_EXPIRATION_SECONDS) * 1000, // Use config value or fallback
		isExtended = false // Extend session if required
	}: {
		user_id: string;
		expires?: number;
		isExtended?: boolean;
	}): Promise<Session> {
		if (!user_id) {
			logger.error('user_id is required to create a session');
			throw new Error('user_id is required to create a session');
		}

		logger.debug(`Creating session for user ID: ${user_id}`);

		// If no existing session, create a new one
		expires = isExtended ? expires * 2 : expires;
		logger.info(`Creating new session for user ID: ${user_id} with expiry: ${expires}`);
		const session = await this.db.createSession({ user_id, expires });
		const user = await this.db.getUserById(user_id);
		if (user) {
			await this.sessionStore.set(session._id, user, expires / 1000);
		} else {
			logger.error(`User not found for ID: ${user_id}`);
			throw new Error(`User not found for ID: ${user_id}`);
		}

		logger.info(`Session created with ID: ${session._id} for user ID: ${user_id}`);
		return session;
	}

	// Check if a user exists by ID or email
	async checkUser(fields: { user_id?: string; email?: string }): Promise<User | null> {
		try {
			if (fields.email) {
				if (typeof fields.email !== 'string') {
					throw new Error('Invalid email format');
				}
				return await this.db.getUserByEmail(fields.email);
			} else if (fields.user_id) {
				if (typeof fields.user_id !== 'string') {
					throw new Error('Invalid user_id format');
				}
				return await this.db.getUserById(fields.user_id);
			} else {
				logger.warn('No user identifier provided.');
				return null;
			}
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to check user: ${err.message}`, { fields });
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
	async getUserById(user_id: string): Promise<User | null> {
		try {
			return await this.db.getUserById(user_id);
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
	async getAllTokens(filter?: object): Promise<Token[]> {
		try {
			const tokens = await this.db.getAllTokens(filter);
			logger.debug('All tokens retrieved');
			return tokens;
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to get all tokens: ${err.message}`);
			throw new Error(`Failed to get all tokens: ${err.message}`);
		}
	}

	// Delete a user session
	async destroySession(session_id: string): Promise<void> {
		try {
			await this.db.destroySession(session_id);
			await this.sessionStore.delete(session_id);
			logger.info(`Session destroyed: ${session_id}`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to destroy session: ${err.message}`);
			throw new Error(`Failed to destroy session: ${err.message}`);
		}
	}

	// Clean up expired sessions
	async cleanupExpiredSessions(): Promise<void> {
		try {
			const deletedCount = await this.db.deleteExpiredSessions();
			logger.info(`Cleaned up ${deletedCount} expired sessions`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to clean up expired sessions: ${err.message}`);
			throw new Error(`Failed to clean up expired sessions: ${err.message}`);
		}
	}

	// Create a cookie object that expires in 1 year
	createSessionCookie(session: Session): Cookie {
		return {
			name: SESSION_COOKIE_NAME,
			value: session._id,
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
			return null;
		}

		if (user.lockoutUntil && new Date(user.lockoutUntil) > new Date()) {
			logger.warn(`Login attempt for locked out account: ${email}`);
			throw new Error('Account is temporarily locked. Please try again later.');
		}

		try {
			if (!argon2) {
				throw new Error('Argon2 is not available in this environment');
			}
			if (await argon2.verify(user.password, password)) {
				await this.db.updateUserAttributes(user._id, { failedAttempts: 0, lockoutUntil: null });
				logger.info(`User logged in: ${user._id}`);
				return user;
			} else {
				const failedAttempts = (user.failedAttempts || 0) + 1;
				if (failedAttempts >= 5) {
					const lockoutUntil = new Date(Date.now() + 30 * 60 * 1000);
					await this.db.updateUserAttributes(user._id, { failedAttempts, lockoutUntil });
					logger.warn(`User locked out due to too many failed attempts: ${user._id}`);
					throw new Error('Account is temporarily locked due to too many failed attempts. Please try again later.');
				} else {
					await this.db.updateUserAttributes(user._id, { failedAttempts });
					logger.warn(`Invalid login attempt for user: ${user._id}`);
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
			await this.sessionStore.delete(session_id); // Also remove from session store if applicable
			logger.info(`User logged out: ${session_id}`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to log out: ${err.message}`);
			throw new Error(`Failed to log out: ${err.message}`);
		}
	}

	// Validate a session
	async validateSession({ session_id }: { session_id: string }): Promise<User | null> {
		try {
			logger.info(`Validating session with ID: ${session_id}`);
			if (!session_id) {
				logger.error('Session ID is undefined');
				throw new Error('Session ID is undefined');
			}
			const user = await this.db.validateSession(session_id);
			// const user = await this.sessionStore.validateWithDB(session_id, async (sid) => {
			// 	return this.db.validateSession(sid);
			// });

			if (user) {
				logger.info(`Session is valid for user: ${user.email}`);
			} else {
				logger.warn(`Invalid session ID: ${session_id}`);
			}
			return user;
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to validate session: ${err.message}`);
			throw new Error(`Failed to validate session: ${err.message}`);
		}
	}

	// Create a token, default expires in 1 hour
	async createToken(user_id: string, expires = 60 * 60 * 1000, type = 'access'): Promise<string> {
		try {
			const user = await this.db.getUserById(user_id);
			if (!user) throw new Error('User not found');
			const token = await this.db.createToken({ user_id, email: user.email, expires, type });
			logger.info(`Token created for user ID: ${user_id}`);
			return token;
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to create token: ${err.message}`);
			throw new Error(`Failed to create token: ${err.message}`);
		}
	}

	// Validate a token
	async validateToken(token: string, user_id: string, type: string = 'access'): Promise<{ success: boolean; message: string }> {
		try {
			logger.info(`Validating token: ${token} for user ID: ${user_id} of type: ${type}`);
			return await this.db.validateToken(token, user_id, type);
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to validate token: ${err.message}`);
			throw new Error(`Failed to validate token: ${err.message}`);
		}
	}

	// Consume a token
	async consumeToken(token: string, user_id: string, type: string = 'access'): Promise<{ status: boolean; message: string }> {
		try {
			logger.info(`Consuming token: ${token} for user ID: ${user_id} of type: ${type}`);
			const consumption = await this.db.consumeToken(token, user_id, type);
			logger.info(`Token consumption result: ${consumption.message}`);
			return consumption;
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to consume token: ${err.message}`);
			throw new Error(`Failed to consume token: ${err.message}`);
		}
	}

	// Invalidate all sessions for a user
	async invalidateAllUserSessions(user_id: string): Promise<void> {
		try {
			await this.db.invalidateAllUserSessions(user_id);
			logger.info(`Invalidated all sessions for user ID: ${user_id}`);
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to invalidate all sessions for user ID: ${user_id}. Error: ${err.message}`);
			throw new Error(`Failed to invalidate all sessions for user ID: ${user_id}. Error: ${err.message}`);
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
			if (!argon2) {
				throw new Error('Argon2 is not available in this environment');
			}
			const hashedPassword = await argon2.hash(newPassword, argon2Attributes);
			await this.db.updateUserAttributes(user._id!, { password: hashedPassword });
			logger.info(`Password updated for user ID: ${user._id}`);
			return { status: true, message: 'Password updated successfully' };
		} catch (error) {
			const err = error as Error;
			logger.error(`Failed to update user password: ${err.message}`);
			return { status: false, message: `Failed to update password: ${err.message}` };
		}
	}
}
