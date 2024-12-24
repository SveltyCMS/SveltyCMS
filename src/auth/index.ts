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

import { error } from '@sveltejs/kit';
import { privateEnv } from '@root/config/private';
import path from 'path';
import { dev } from '$app/environment';

// Types
import type { Cookie, User, Session, Token, Role, Permission, SessionStore } from './types';
import type { authDBInterface } from './authDBInterface';

import { roles as configRoles } from '@root/config/roles';
import { getPermissionByName, getAllPermissions } from './permissionManager';

// Cache & Redis
import { OptionalRedisSessionStore } from './InMemoryCacheStore';

// Import argon2 conditionally
let argon2: typeof import('argon2') | null = null;
if (typeof window === 'undefined') {
	import('argon2').then((module) => {
		argon2 = module;
	});
}

// Default expiration time (1 hour in seconds)
const DEFAULT_SESSION_EXPIRATION_SECONDS = 3600; // 1 hour

// System Logger
import { logger } from '@utils/logger.svelte';

export const SESSION_COOKIE_NAME = 'auth_sessions';

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
	private roles: Map<string, Role>;

	constructor(dbAdapter: authDBInterface, sessionStore: SessionStore = defaultSessionStore) {
		if (!dbAdapter) {
			logger.error('Database adapter is not initialized');
			throw error(500, 'Database adapter is required but was not initialized');
		}

		this.db = dbAdapter;
		this.sessionStore = sessionStore;
		this.roles = new Map(configRoles.map((role) => [role._id, role]));
	}

	// Create a new user with hashed password
	async createUser(userData: Partial<User>, oauth: boolean = false): Promise<User> {
		try {
			const { email, password, username, role, lastAuthMethod, isRegistered } = userData;

			if (!email || (!oauth && !password)) {
				throw error(400, 'Email and password are required to create a user');
			}

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

			logger.debug('Creating user', { email: email });
			// Create the user in the database
			const user = await this.db.createUser({
				email,
				password: hashedPassword,
				username,
				role,
				lastAuthMethod,
				isRegistered,
				failedAttempts: 0
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
			// Store the session with the expiration Date in the session store7
			await this.sessionStore.set(session._id, user, expires);
		} else {
			logger.error(`User not found for ID: ${user_id}`);
			throw error(404, `User not found for ID: ${user_id}`);
		}

		logger.info(`Session created with ID: \x1b[34m${session._id}\x1b[0m for user ID: \x1b[34m${user_id}\x1b[0m`);
		return session;
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

	// Create a new role
	async createRole(roleData: Partial<Role>, current_user_id: string): Promise<Role> {
		if (!roleData.name) throw error(400, 'Role name is required');

		if (this.roles.has(roleData.name)) throw error(400, 'Role with this name already exists');

		const newRole: Role = {
			_id: roleData._id!,
			name: roleData.name,
			description: roleData.description || '',
			permissions: roleData.permissions || []
		};

		this.roles.set(newRole._id, newRole);
		await this.syncConfigFile();
		logger.info(`Role created: ${newRole.name} by user: ${current_user_id}`);
		return newRole;
	}

	// Update role
	async updateRole(role_id: string, roleData: Partial<Role>, current_user_id: string): Promise<void> {
		const role = this.roles.get(role_id);
		if (!role) throw error(404, 'Role not found');

		this.roles.set(role_id, { ...role, ...roleData });
		await this.syncConfigFile();
		logger.debug(`Role updated: ${role.name} by user: ${current_user_id}`);
	}

	// Delete role
	async deleteRole(role_id: string, current_user_id: string): Promise<void> {
		if (!this.roles.has(role_id)) throw error(404, 'Role not found');

		this.roles.delete(role_id);
		await this.syncConfigFile();
		logger.info(`Role deleted: ${role_id} by user: ${current_user_id}`);
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

	// Get role by id
	async getRoleById(role_id: string): Promise<Role | null> {
		const role = this.roles.get(role_id) || null;
		if (!role) {
			logger.warn(`Role not found: ${role_id}`);
			throw error(404, `Role not found: ${role_id}`);
		}
		return role;
	}
	// Get role by name
	async getRoleByName(name: string): Promise<Role | null> {
		const role = [...this.roles.values()].find((r) => r.name === name) || null;
		if (!role) {
			logger.warn(`Role not found: ${name}`);
			throw error(404, `Role not found: ${name}`);
		}
		return role;
	}

	// Get permissions for a role
	async getPermissionsForRole(role_name: string): Promise<Permission[]> {
		const role = [...this.roles.values()].find((r) => r.name === role_name);
		if (!role) return [];

		const allPermissions = await getAllPermissions();
		return allPermissions.filter((p) => role.permissions.includes(p._id));
	}

	// Assign a permission to a role
	async assignPermissionToRole(role_name: string, permission_name: string, current_user_id: string): Promise<void> {
		const role = [...this.roles.values()].find((r) => r.name === role_name);
		if (!role) throw error(404, 'Role not found');

		const permission = await getPermissionByName(permission_name);
		if (!permission) throw error(404, 'Permission not found');

		if (!role.permissions.includes(permission_name)) {
			role.permissions.push(permission_name);
			await this.syncConfigFile();
			logger.debug(`Permission ${permission_name} assigned to role ${role_name} by user ${current_user_id}`);
		}
	}

	// Remove a permission from a role
	async deletePermissionFromRole(role_name: string, permission_name: string, current_user_id: string): Promise<void> {
		const role = [...this.roles.values()].find((r) => r.name === role_name);
		if (!role) throw error(404, 'Role not found');

		const permissionIndex = role.permissions.indexOf(permission_name);
		if (permissionIndex > -1) {
			role.permissions.splice(permissionIndex, 1);
			await this.syncConfigFile();
			logger.debug(`Permission ${permission_name} deleted from role ${role_name} by user ${current_user_id}`);
		}
	}

	// Get roles for a permission
	async getRolesForPermission(permission_name: string): Promise<Role[]> {
		return [...this.roles.values()].filter((role) => role.permissions.includes(permission_name));
	}

	// Sync the roles with the config file
	async syncRolesWithConfig(): Promise<void> {
		try {
			this.roles = new Map(configRoles.map((role) => [role._id, role]));
			await this.syncConfigFile();
			logger.info('Roles synced with configuration successfully');
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to sync roles with config: ${errMsg}`);
			throw error(500, `Failed to sync roles with config: ${errMsg}`);
		}
	}

	// Set all roles
	async setAllRoles(roles: Role[]): Promise<void> {
		try {
			this.roles = new Map(roles.map((role) => [role._id, role]));
			await this.syncConfigFile();
			logger.info('Roles set and config file synced successfully');
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to set roles and sync config: ${errMsg}`);
			throw error(500, `Failed to set roles and sync config: ${errMsg}`);
		}
	}
	// Sync the config file with the default roles and permissions
	private async syncConfigFile(): Promise<void> {
		const configPath = path.resolve('./config/roles.ts');

		const rolesArrayString = [...this.roles.values()]
			.map((cur) => {
				const isAdminString = cur.isAdmin ? `isAdmin: true,` : '';
				const permissionsString = cur.isAdmin
					? `permissions: permissions.map((p) => p._id) // All permissions`
					: `permissions: ${JSON.stringify(cur.permissions, null, 2)}`;

				return `{
                _id: '${cur._id}',
                name: '${cur.name}',
                description: '${cur.description}',
                ${isAdminString}
                ${permissionsString}
            }`;
			})
			.join(',\n');

		const content = `
    /**
    * @file config/roles.ts
    * @description  Role configuration file
    */
    
    import type { Role } from '../src/auth/types';
    import { permissions } from './permissions';
    
    export const roles: Role[] = [
    ${rolesArrayString}
    ];
    
    export function registerRole(newRole: Role): void {
        const exists = roles.some((role) => role._id === newRole._id); 
        if (!exists) {
            roles.push(newRole);
        }
    }
    
    export function setPermissions(newPermissions: Permission[]): void {
        const uniquePermissions = newPermissions.filter((newPermission) =>
            !permissions.some((existingPermission) => existingPermission._id === newPermission._id)
        );
        permissions = [...permissions, ...uniquePermissions];
    }
    `.trim();

		try {
			await writeConfigFile(configPath, content);
			logger.info('Config file updated with new roles and permissions');
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to update config file: ${errMsg}`);
			throw error(500, `Failed to update config file: ${errMsg}`);
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

	// Clean up expired sessions
	async cleanupExpiredSessions(): Promise<void> {
		try {
			const deletedCount = await this.db.deleteExpiredSessions();
			logger.info(`Cleaned up \x1b[34m${deletedCount}\x1b[0m expired sessions`);
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to clean up expired sessions: ${errMsg}`);
			throw error(500, `Failed to clean up expired sessions: ${errMsg}`);
		}
	}

	// Create a cookie object that expires in 1 year
	createSessionCookie(session: Session): Cookie {
		return {
			name: SESSION_COOKIE_NAME,
			value: session._id,
			attributes: {
				sameSite: 'lax', // Secure by default
				path: '/',
				httpOnly: true,
				expires: session.expires,
				secure: !dev // Only secure in production
			}
		};
	}

	// Log in a user with email and password
	async login(email: string, password: string): Promise<User | null> {
		const user = await this.db.getUserByEmail(email);
		if (!user || !user.password) {
			const message = `Login failed: User not found or password not set for email: ${user.email}`;
			logger.warn(message);
			return null; // Return null if user doesn't exist or password is not set
		}

		if (user.lockoutUntil && new Date(user.lockoutUntil) > new Date()) {
			const message = `Login attempt for locked out account: ${user.email}`;
			logger.warn(message);
			throw error(403, { message: 'Account is temporarily locked. Please try again later.' });
		}

		try {
			if (!argon2) {
				throw new Error('Argon2 is not available in this environment');
			}

			if (await argon2.verify(user.password, password)) {
				await this.db.updateUserAttributes(user._id!, { failedAttempts: 0, lockoutUntil: null });
				logger.info(`User logged in with email: ${user.email}`);
				return user; // Return user on successful login
			} else {
				const failedAttempts = (user.failedAttempts || 0) + 1;
				if (failedAttempts >= 5) {
					const lockoutUntil = new Date(Date.now() + 30 * 60 * 1000); // Lockout for 30 minutes
					await this.db.updateUserAttributes(user._id!, { failedAttempts, lockoutUntil });
					const message = `User locked out due to too many failed attempts: \x1b[34m${user._id}\x1b[0m`;
					logger.warn(message);
					throw error(403, { message: 'Account is temporarily locked due to too many failed attempts. Please try again later.' });
				} else {
					await this.db.updateUserAttributes(user._id!, { failedAttempts });
					const message = `Invalid login attempt for user with email: ${user.email}`;
					logger.warn(message);
					throw error(401, { message: 'Invalid credentials. Please try again.' });
				}
			}
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			logger.error(`Login error: \x1b[31m${errMsg}\x1b[0m`);
			throw error(500, `Login error: ${errMsg}`);
		}
	}

	// Log out a user by destroying their session
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

	// Validate a session
	async validateSession({ session_id }: { session_id: string }): Promise<User | null> {
		try {
			logger.info('Validating session (src/auth/index.ts)', { session_id });
			if (!session_id) {
				const message = 'Session ID is undefined';
				logger.error(message);
				throw error(400, { message }); // Bad Request if session ID is missing
			}
			const user = await this.db.validateSession(session_id);

			if (user) {
				logger.info('Session is valid (src/auth/index.ts) ', { email: user.email });
			} else {
				logger.warn('Invalid session (src/auth/index.ts)', { session_id });
			}
			return user; // Return the user or null if session is invalid
		} catch (err) {
			logger.error('Failed to validate session', { error: err instanceof Error ? err.message : String(err) });
			throw error(500, `Failed to validate session: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	// Create a token, default expires in 1 hour
	async createToken(user_id: string, expires = new Date(Date.now() + 60 * 60 * 1000), type = 'access'): Promise<string> {
		try {
			const user = await this.db.getUserById(user_id);
			if (!user) throw error(404, { message: 'User not found' }); // Not Found if user doesn't exist

			const token = await this.db.createToken({
				user_id,
				email: user.email,
				expires,
				type
			});
			logger.info(`Token created for user with email: ${user.email}`);
			return token; // Return the created token
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to create token: ${errMsg}`);
			throw error(500, `Failed to create token: ${errMsg}`);
		}
	}

	// Validate a token
	async validateToken(token: string, user_id: string, type: string = 'access'): Promise<{ success: boolean; message: string }> {
		try {
			logger.info(`Validating token: ${token} for user ID: ${user_id} of type: ${type}`);
			return await this.db.validateToken(token, user_id, type); // Return validation result
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			logger.error(`Failed to create token: ${errMsg}`);
			throw error(500, `Failed to create token: ${errMsg}`);
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

	// Update a user's password
	async updateUserPassword(email: string, newPassword: string): Promise<{ status: boolean; message: string }> {
		try {
			const user = await this.db.getUserByEmail(email);
			if (!user) {
				const message = `Failed to update password: User not found for email: ${user.email}`;
				logger.warn(message, { email: user.email });
				return { status: false, message: 'User not found' }; // Return status if user not found
			}
			if (!argon2) {
				throw new Error('Argon2 is not available in this environment');
			}
			const hashedPassword = await argon2.hash(newPassword, argon2Attributes);
			await this.db.updateUserAttributes(user._id!, { password: hashedPassword });
			logger.info(`Password updated for user with email: ${user.email}`);
			return { status: true, message: 'Password updated successfully' }; // Return success status
		} catch (error) {
			const errMsg = error instanceof Error ? error.message : String(error);
			const message = `Failed to update user password: ${errMsg}`;
			logger.error(message);
			return { status: false, message: `Failed to update password: ${message}` }; // Return failure status
		}
	}
}
