/**
 * @file src/auth/index.ts
 * @description Simplified authentication and authorization system
 *
 * This consolidated module handles:
 * - User authentication and session management
 * - Role-based access control with admin override
 * - Permission checking with simplified logic
 * - Token management
 *
 * Key simplifications:
 * - Admins automatically have ALL permissions
 * - Simplified permission structure
 * - Consolidated auth logic in one place
 * - Reduced file complexity from 10+ files to 3 core files
 */

import { error } from '@sveltejs/kit';
import { privateEnv } from '@root/config/private';
import { dev } from '$app/environment';

import type { authDBInterface } from './authDBInterface';
import type { User, Role, Permission, Session, Token, SessionStore } from './types';

import { roles } from '@root/config/roles';
import { corePermissions } from './corePermissions';

// System Logger
import { logger } from '@utils/logger.svelte';

export type { User, Role, Permission, Session, Token, SessionStore, PermissionAction, PermissionType, RolePermissions } from './types';
export { PermissionAction, PermissionType } from './types';

// Import argon2 and related constants
let argon2: typeof import('argon2') | null = null;
if (typeof window === 'undefined') {
	try {
		argon2 = await import('argon2');
	} catch {
		logger.warn('Argon2 not available in this environment');
	}
}

const argon2Attributes = {
	memory: 65536,
	time: 3,
	parallelism: 4
};

const DEFAULT_SESSION_EXPIRATION_SECONDS = 3600; // 1 hour

// Main Auth class
export class Auth {
	private db: authDBInterface;
	private sessionStore: SessionStore;
	private roles: Role[] = [...roles];
	private permissions: Permission[] = [...corePermissions];

	constructor(db: authDBInterface, sessionStore: SessionStore) {
		this.db = db;
		this.sessionStore = sessionStore;
	}

	// Role management
	getRoles(): Role[] {
		return this.roles;
	}

	getRoleById(roleId: string): Role | undefined {
		return this.roles.find((role) => role._id === roleId);
	}

	addRole(role: Role): void {
		const exists = this.roles.some((r) => r._id === role._id);
		if (!exists) {
			this.roles.push(role);
		}
	}

	updateRole(roleId: string, updates: Partial<Role>): void {
		const index = this.roles.findIndex((r) => r._id === roleId);
		if (index !== -1) {
			this.roles[index] = { ...this.roles[index], ...updates };
		}
	}

	deleteRole(roleId: string): void {
		this.roles = this.roles.filter((r) => r._id !== roleId);
	}

	// Permission management
	getPermissions(): Permission[] {
		return this.permissions;
	}

	addPermission(permission: Permission): void {
		const exists = this.permissions.some((p) => p._id === permission._id);
		if (!exists) {
			this.permissions.push(permission);
		}
	}

	// Simplified permission checking - ADMINS GET ALL PERMISSIONS
	hasPermission(user: User, permissionId: string): boolean {
		const userRole = this.getRoleById(user.role);
		if (!userRole) {
			logger.warn('Role not found for user', { email: user.email });
			return false;
		}

		// ADMIN OVERRIDE: Admins automatically have ALL permissions
		if (userRole.isAdmin) {
			logger.debug('Admin user granted permission', { email: user.email, permissionId });
			return true;
		}

		// Check if user's role has the specific permission
		const hasPermission = userRole.permissions.includes(permissionId);
		logger.debug('Permission check for user', { permissionId, granted: hasPermission, email: user.email });
		return hasPermission;
	}

	// Check permission by action and type (for backwards compatibility)
	hasPermissionByAction(user: User, action: string, type: string, contextId?: string): boolean {
		const userRole = this.getRoleById(user.role);
		if (!userRole) return false;

		// ADMIN OVERRIDE: Admins automatically have ALL permissions
		if (userRole.isAdmin) {
			logger.debug('Admin user granted permission for action', { email: user.email, action, type });
			return true;
		}

		// Find matching permission
		const permission = this.permissions.find((p) => p.action === action && p.type === type && (!contextId || p.contextId === contextId));

		if (!permission) return false;

		return userRole.permissions.includes(permission._id);
	}

	// User management
	// Create a new user with hashed password
	async createUser(userData: Partial<User>, oauth: boolean = false): Promise<User> {
		try {
			const { email, password, username, role, lastAuthMethod, isRegistered, permissions, avatar, firstName, lastName, blocked } = userData;

			if (!email || (!oauth && !password)) {
				throw error(400, 'Email and password are required to create a user');
			}

			// Normalize email to lowercase
			const normalizedEmail = email.toLowerCase();

			// Hash the password
			let hashedPassword: string | undefined;
			if (!oauth && password !== undefined) {
				if (!argon2) {
					throw error(500, 'Argon2 is not available in this environment');
				}
				hashedPassword = await argon2.hash(password, {
					...argon2Attributes,
					type: argon2.argon2id
				});
			}

			logger.debug('Creating user', { email: normalizedEmail });
			// Create the user in the database
			const user = await this.db.createUser({
				email: normalizedEmail,
				password: hashedPassword,
				username,
				role,
				lastAuthMethod,
				isRegistered,
				failedAttempts: 0,
				permissions,
				avatar,
				firstName,
				lastName,
				blocked
			});

			if (!user || !user._id) {
				throw error(500, 'User creation failed: No user ID returned');
			}
			logger.info('User created (src/auth/index.ts)', { email: user.email });
			return user;
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to create user: ${errMsg}`);
			throw error(500, `Failed to create user: ${errMsg}`);
		}
	}

	// Get a user by ID
	async getUserById(user_id: string): Promise<User | null> {
		try {
			return await this.db.getUserById(user_id);
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to get user by ID: ${errMsg}`);
			throw error(500, `Failed to get user by ID: ${errMsg}`);
		}
	}

	async getUserByEmail(email: string): Promise<User | null> {
		return await this.db.getUserByEmail(email);
	}

	async updateUser(userId: string, updates: Partial<User>): Promise<void> {
		await this.db.updateUserAttributes(userId, updates);
	}

	// Delete the user from the database
	async deleteUser(user_id: string): Promise<void> {
		try {
			await this.db.deleteUser(user_id);
			logger.info(`User deleted: \x1b[34m${user_id}\x1b[0m`);
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to delete user: ${errMsg}`);
			throw error(500, `Failed to delete user: ${errMsg}`);
		}
	}

	// Get all users
	async getAllUsers(): Promise<User[]> {
		try {
			return await this.db.getAllUsers();
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to get all user: ${errMsg}`);
			throw error(500, `Failed to get all user: ${errMsg}`);
		}
	}

	// Get the total number of users
	async getUserCount(): Promise<number> {
		try {
			return await this.db.getUserCount();
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to get user count: ${errMsg}`);
			throw error(500, `Failed to get user count: ${errMsg}`);
		}
	}

	// Create a session, valid for 1 hour by default
	async createSession({
		user_id,
		expires = new Date(Date.now() + (privateEnv.SESSION_EXPIRATION_SECONDS ?? DEFAULT_SESSION_EXPIRATION_SECONDS) * 1000),
		isExtended = false
	}: {
		user_id: string;
		expires?: Date;
		isExtended?: boolean;
	}): Promise<Session> {
		if (!user_id) {
			logger.error('user_id is required to create a session');
			throw error(400, 'user_id is required to create a session');
		}

		logger.debug(`Creating session for user ID: \x1b[34m${user_id}\x1b[0m`);

		// Ensure expires is a Date object
		if (!(expires instanceof Date)) {
			expires = new Date(expires);
		}

		// Adjust expiration time if the session is extended
		if (isExtended) {
			expires.setTime(expires.getTime() * 2);
		}
		logger.info(`Creating new session for user ID: \x1b[34m${user_id}\x1b[0m with expiry: \x1b[34m${expires.toISOString()}\x1b[0m`);

		const session = await this.db.createSession({
			user_id,
			expires
		});

		const user = await this.db.getUserById(user_id);
		if (user) {
			// Store the session with the expiration Date in the session store
			await this.sessionStore.set(session._id, user, expires);
		} else {
			logger.error(`User not found for ID: ${user_id}`);
			throw error(404, `User not found for ID: ${user_id}`);
		}

		logger.info(`Session created with ID: \x1b[34m${session._id}\x1b[0m for user ID: \x1b[34m${user_id}\x1b[0m`);
		return session;
	}

	// Validate a session
	async validateSession(session_id: string): Promise<User | null> {
		try {
			logger.info('Validating session (src/auth/index.ts)', { session_id });
			if (!session_id) {
				const message = 'Session ID is undefined';
				logger.error(message);
				throw error(400, { message }); // Bad Request if session ID is missing
			}
			const user = await this.db.validateSession(session_id);

			if (user) {
				logger.info('Session is valid (src/auth/index.ts)', { email: user.email });
			} else {
				logger.warn('Invalid session (src/auth/index.ts)', { session_id });
			}
			return user; // Return the user or null if session is invalid
		} catch (err) {
			logger.error('Failed to validate session', {
				error: err instanceof Error ? err.message : String(err)
			});
			throw error(500, `Failed to validate session: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	// Delete a user session
	async destroySession(session_id: string): Promise<void> {
		try {
			await this.db.deleteSession(session_id);
			await this.sessionStore.delete(session_id);
			logger.info(`Session destroyed: \x1b[34m${session_id}\x1b[0m`);
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to destroy session: \x1b[31m${errMsg}\x1b[0m`);
			throw error(500, `Failed to destroy session: ${errMsg}`);
		}
	}

	// Get session token data
	async getSessionTokenData(session_id: string): Promise<{ expiresAt: Date; user_id: string } | null> {
		try {
			logger.debug(`Fetching session token data for session ID: \x1b[34m${session_id}\x1b[0m`);
			return await this.db.getSessionTokenData(session_id);
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to get session token data: ${errMsg}`);
			throw error(500, `Failed to get session token data: ${errMsg}`);
		}
	}

	// Rotate a token
	async rotateToken(oldToken: string, expires: Date): Promise<string> {
		if (!this.db.rotateToken) {
			logger.error('rotateToken not implemented in database adapter');
			throw error(500, 'Token rotation not supported');
		}
		try {
			logger.debug(`Rotating token: ${oldToken}`);
			const newToken = await this.db.rotateToken(oldToken, expires);
			logger.info(`Token rotated successfully for old token: ${oldToken}`);
			return newToken;
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to rotate token: ${errMsg}`);
			throw error(500, `Failed to rotate token: ${errMsg}`);
		}
	}

	// Get all roles
	async getAllRoles(options?: {
		limit?: number;
		skip?: number;
		sort?: { [key: string]: 1 | -1 } | [string, 1 | -1][];
		filter?: Partial<Role>;
	}): Promise<Role[]> {
		let filteredRoles = [...this.roles.values()];

		// Apply filtering, sorting, and pagination if options are provided
		if (options?.filter) {
			filteredRoles = filteredRoles.filter((role) => Object.entries(options.filter!).every(([key, value]) => role[key as keyof Role] === value));
		}

		if (options?.sort) {
			const sortKeys = Object.keys(options.sort);
			filteredRoles.sort((a, b) =>
				sortKeys.reduce((acc, key) => acc || (a[key as keyof Role] > b[key as keyof Role] ? 1 : -1) * (options.sort![key] as number), 0)
			);
		}

		if (typeof options?.skip === 'number') filteredRoles = filteredRoles.slice(options.skip);
		if (typeof options?.limit === 'number') filteredRoles = filteredRoles.slice(0, options.limit);

		return filteredRoles;
	}

	// Get all tokens
	async getAllTokens(filter?: Record<string, unknown>): Promise<{ tokens: Token[]; count: number }> {
		try {
			const tokens = await this.db.getAllTokens(filter);
			const count = tokens.length;
			logger.debug(`getAllTokens Retrieved \x1b[34m${count}\x1b[0m tokens`);
			return { tokens, count };
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to get all tokens: \x1b[31m${errMsg}\x1b[0m`);
			throw error(500, `Failed to get all tokens: ${errMsg}`);
		}
	}

	// Token management
	async createToken(userId: string, expires: Date, type: string = 'access'): Promise<string> {
		const user = await this.getUserById(userId);
		if (!user) throw new Error('User not found');
		return await this.db.createToken({ user_id: userId, email: user.email.toLowerCase(), expires, type });
	}

	// Validate a token
	async validateToken(token: string, user_id: string, type: string = 'access'): Promise<{ success: boolean; message: string }> {
		try {
			logger.info(`Validating token: ${token} for user ID: ${user_id} of type: ${type}`);
			return await this.db.validateToken(token, user_id, type); // Return validation result
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to validate token: ${errMsg}`);
			throw error(500, `Failed to validate token: ${errMsg}`);
		}
	}

	// Validate a registration/invite token (no user_id required since user doesn't exist yet)
	async validateRegistrationToken(token: string): Promise<{ isValid: boolean; message: string; details?: Token }> {
		try {
			logger.info(`Validating registration token: ${token}`);
			const result = await this.db.validateToken(token, undefined, 'user-invite');

			if (result.success) {
				// Get the full token details for registration
				const tokenDoc = await this.db.getTokenByValue(token);
				return {
					isValid: true,
					message: result.message,
					details: tokenDoc
				};
			} else {
				return {
					isValid: false,
					message: result.message
				};
			}
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to validate registration token: ${errMsg}`);
			throw error(500, `Failed to validate registration token: ${errMsg}`);
		}
	}

	// Consume a token
	async consumeToken(token: string, user_id: string, type: string = 'access'): Promise<{ status: boolean; message: string }> {
		try {
			logger.info(`Consuming token: ${token} for user ID: ${user_id} of type: ${type}`);
			const consumption = await this.db.consumeToken(token, user_id, type);
			logger.info(`Token consumption result: ${consumption.message}`);
			return consumption; // Return consumption result
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to consume token: ${errMsg}`);
			throw error(500, `Failed to consume token: ${errMsg}`);
		}
	}

	// Consume a registration token (no user_id required)
	async consumeRegistrationToken(token: string): Promise<{ status: boolean; message: string }> {
		try {
			logger.info(`Consuming registration token: ${token}`);
			const consumption = await this.db.consumeToken(token, undefined, 'user-invite');
			logger.info(`Registration token consumption result: ${consumption.message}`);
			return consumption;
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to consume registration token: ${errMsg}`);
			throw error(500, `Failed to consume registration token: ${errMsg}`);
		}
	}

	// Authentication
	async authenticate(email: string, password: string): Promise<{ user: User; sessionId: string } | null> {
		try {
			const user = await this.getUserByEmail(email);
			if (!user || !user.password) return null;

			// Verify password (assuming argon2 is used)
			const argon2 = await import('argon2');
			const isValid = await argon2.verify(user.password, password);
			if (!isValid) return null;

			// Create session
			const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
			const session = await this.createSession({ user_id: user._id, expires: expiresAt });

			// Cache user in session store
			await this.sessionStore.set(session._id, user, expiresAt);

			return { user, sessionId: session._id };
		} catch (err) {
			logger.error(`Authentication error: ${err instanceof Error ? err.message : String(err)}`);
			return null;
		}
	}

	// Logout a user by destroying their session
	async logOut(session_id: string): Promise<void> {
		try {
			await this.db.deleteSession(session_id);
			await this.sessionStore.delete(session_id);
			logger.info(`User logged out: \x1b[34m${session_id}\x1b[0m`);
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to log out: \x1b[31m${errMsg}\x1b[0m`);
			throw error(500, `Failed to log out: ${errMsg}`);
		}
	}

	// Check if a user exists by ID or email
	async checkUser(fields: { user_id?: string; email?: string }): Promise<User | null> {
		try {
			if (fields.email) {
				if (typeof fields.email !== 'string') {
					throw error(400, 'Invalid email format');
				}
				return await this.db.getUserByEmail(fields.email);
			} else if (fields.user_id) {
				if (typeof fields.user_id !== 'string') {
					throw error(400, 'Invalid user_id format');
				}
				return await this.db.getUserById(fields.user_id);
			} else {
				logger.warn('No user identifier provided.');
				return null;
			}
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to check user: ${errMsg}`);
			throw error(500, `Failed to check user: ${errMsg}`);
		}
	}

	// Update user attributes
	async updateUserAttributes(user_id: string, attributes: Partial<User>): Promise<void> {
		try {
			if (attributes.password && typeof window === 'undefined') {
				if (!argon2) {
					throw error(500, 'Argon2 is not available in this environment');
				}
				// Hash the password with argon2
				attributes.password = await argon2.hash(attributes.password, {
					...argon2Attributes,
					type: argon2.argon2id
				});
			}
			if (attributes.email === null) {
				attributes.email = undefined;
			}
			await this.db.updateUserAttributes(user_id, attributes);
			logger.info(`User attributes updated for user ID: \x1b[34m${user_id}\x1b[0m`);
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to update user attributes: ${errMsg}`);
			throw error(500, `Failed to update user attributes: ${errMsg}`);
		}
	}

	// Create a cookie object that expires in 24 hours
	createSessionCookie(sessionId: string): { name: string; value: string; attributes: unknown } {
		return {
			name: SESSION_COOKIE_NAME,
			value: sessionId,
			attributes: {
				httpOnly: true,
				secure: !dev, // Only secure in production
				sameSite: 'strict',
				maxAge: 24 * 60 * 60, // 24 hours
				path: '/' // Required by SvelteKit
			}
		};
	}

	// Invalidate all sessions for a user
	async invalidateAllUserSessions(user_id: string): Promise<void> {
		try {
			await this.db.invalidateAllUserSessions(user_id);
			logger.info(`Invalidated all sessions for user ID: ${user_id}`);
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to invalidate all sessions for user ID: ${errMsg}`);
			throw error(500, `Failed to invalidate all sessions for user ID: ${errMsg}`);
		}
	}

	async updateUserPassword(email: string, password: string): Promise<{ status: boolean; message?: string }> {
		try {
			const user = await this.getUserByEmail(email);
			if (!user) {
				return { status: false, message: 'User not found' };
			}

			// Hash password
			const argon2 = await import('argon2');
			const hashedPassword = await argon2.hash(password);

			await this.updateUser(user._id, { password: hashedPassword });
			return { status: true };
		} catch (err) {
			logger.error(`Password update error: ${err instanceof Error ? err.message : String(err)}`);
			return { status: false, message: 'Password update failed' };
		}
	}
}

// Utility functions for backwards compatibility
export function isAdmin(user: User): boolean {
	const role = roles.find((r) => r._id === user.role);
	return role?.isAdmin === true;
}

export function hasRole(user: User, roleName: string): boolean {
	return user.role.toLowerCase() === roleName.toLowerCase();
}

// Export session cookie name
export const SESSION_COOKIE_NAME = 'auth_sessions';
