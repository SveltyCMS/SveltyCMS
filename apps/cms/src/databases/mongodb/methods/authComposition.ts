/**
 * @file src/databases/mongodb/methods/authComposition.ts
 * @description Composition layer for MongoDB authentication adapters
 *
 * This file combines three specialized auth adapters (User, Session, Token) into
 * a unified interface. It serves as the glue code between modular adapters and
 * the MongoDB adapter, following the composition over inheritance pattern.
 *
 * **Architecture Pattern:**
 * - Dependency Injection: Adapters are instantiated here
 * - Composition: Methods are bound and exposed as unified interface
 * - Decoupling: Keeps individual adapters independent and testable
 *
 * **Purpose:**
 * Instead of merging 1,786 lines of auth code into one massive file, this
 * composition layer allows us to maintain separation of concerns while
 * providing a single interface for the MongoDB adapter.
 */

import type { IDBAdapter, DatabaseResult, ISODateString } from '@src/databases/dbInterface';
import type { User, Session, Role } from '@src/databases/auth/types';

import { SessionAdapter } from '../models/authSession';
import { TokenAdapter } from '../models/authToken';
import { UserAdapter } from '../models/authUser';
import { logger } from '@utils/logger.server';
import { hashPassword } from '@utils/crypto';
import mongoose from 'mongoose';

// Type helper to extract the auth interface from IDBAdapter
type AuthInterface = IDBAdapter['auth'];

/**
 * Compose the MongoDB Auth adapter from its sub-adapters.
 *
 * This function creates instances of UserAdapter, SessionAdapter, and TokenAdapter,
 * then binds all their methods into a unified object that matches the auth interface
 * defined in IDBAdapter['auth'].
 *
 * @returns A composed auth interface with all methods properly bound
 *
 * @example
 * ```typescript
 * // Used internally by MongoDBAdapter
 * const authAdapter = composeMongoAuthAdapter();
 *
 * // All methods are properly bound:
 * const user = await authAdapter.createUser({ email: 'test@example.com' });
 * const session = await authAdapter.createSession({ user_id: user._id, expires: new Date() });
 * ```
 */
export function composeMongoAuthAdapter(): AuthInterface {
	const userAdapter = new UserAdapter();
	const sessionAdapter = new SessionAdapter();
	const tokenAdapter = new TokenAdapter();

	const adapter = {
		// User Management Methods
		createUser: userAdapter.createUser.bind(userAdapter),
		updateUserAttributes: userAdapter.updateUserAttributes.bind(userAdapter),
		deleteUser: userAdapter.deleteUser.bind(userAdapter),
		getUserById: userAdapter.getUserById.bind(userAdapter),
		getUserByEmail: userAdapter.getUserByEmail.bind(userAdapter),
		getAllUsers: userAdapter.getAllUsers.bind(userAdapter),
		getUserCount: userAdapter.getUserCount.bind(userAdapter),
		deleteUsers: userAdapter.deleteUsers?.bind(userAdapter),
		blockUsers: userAdapter.blockUsers?.bind(userAdapter),
		unblockUsers: userAdapter.unblockUsers?.bind(userAdapter),

		// Combined Performance-Optimized Methods
		createUserAndSession: async (
			userData: Partial<User>,
			sessionData: { expires: ISODateString; tenantId?: string }
		): Promise<DatabaseResult<{ user: User; session: Session }>> => {
			try {
				// Hash password if provided
				if (userData.password) {
					userData.password = await hashPassword(userData.password);
				}

				// Create user first
				const userResult = await userAdapter.createUser(userData);
				if (!userResult.success) {
					return {
						success: false,
						message: userResult.message || 'Failed to create user',
						error: userResult.error
					};
				}

				// Create session for the new user
				const sessionResult = await sessionAdapter.createSession({
					user_id: userResult.data._id,
					expires: sessionData.expires,
					tenantId: sessionData.tenantId
				});

				if (!sessionResult.success) {
					// Rollback: delete the user we just created
					await userAdapter.deleteUser(userResult.data._id, sessionData.tenantId);
					return {
						success: false,
						message: sessionResult.message || 'Failed to create session',
						error: sessionResult.error
					};
				}

				return {
					success: true,
					data: {
						user: userResult.data,
						session: sessionResult.data
					}
				};
			} catch (err) {
				const message = `Error in createUserAndSession: ${err instanceof Error ? err.message : String(err)}`;
				logger.error(message);
				return {
					success: false,
					message,
					error: {
						code: 'CREATE_USER_AND_SESSION_ERROR',
						message: err instanceof Error ? err.message : String(err)
					}
				};
			}
		},

		deleteUserAndSessions: async (
			user_id: string,
			tenantId?: string
		): Promise<DatabaseResult<{ deletedUser: boolean; deletedSessionCount: number }>> => {
			try {
				// Step 1: Get session count before deletion (for reporting)
				let deletedSessionCount = 0;
				try {
					const activeSessions = await sessionAdapter.getActiveSessions(user_id, tenantId);
					if (activeSessions.success && activeSessions.data) {
						deletedSessionCount = activeSessions.data.length;
					}
				} catch {
					// Non-fatal: just log and continue
					logger.debug('Could not count sessions before deletion', { user_id });
				}

				// Step 2: Delete all user sessions
				const sessionsResult = await sessionAdapter.invalidateAllUserSessions(user_id, tenantId);

				if (!sessionsResult.success) {
					logger.warn('Failed to invalidate user sessions, continuing with user deletion', {
						user_id,
						error: sessionsResult.message
					});
				}

				// Step 3: Delete the user
				const userResult = await userAdapter.deleteUser(user_id, tenantId);

				if (!userResult.success) {
					return {
						success: false,
						message: userResult.message || 'Failed to delete user',
						error: userResult.error
					};
				}

				logger.info(`User and sessions deleted: user=\x1b[34m${user_id}\x1b[0m, sessions=\x1b[34m${deletedSessionCount}\x1b[0m`, {
					user_id,
					deletedSessionCount,
					tenantId
				});

				return {
					success: true,
					data: {
						deletedUser: true,
						deletedSessionCount
					}
				};
			} catch (err) {
				const message = `Error in deleteUserAndSessions: ${err instanceof Error ? err.message : String(err)}`;
				logger.error(message, { user_id, tenantId });
				return {
					success: false,
					message,
					error: {
						code: 'DELETE_USER_AND_SESSIONS_ERROR',
						message: err instanceof Error ? err.message : String(err)
					}
				};
			}
		},

		// Session Management Methods
		createSession: sessionAdapter.createSession.bind(sessionAdapter),
		updateSessionExpiry: sessionAdapter.updateSessionExpiry.bind(sessionAdapter),
		deleteSession: sessionAdapter.deleteSession.bind(sessionAdapter),
		deleteExpiredSessions: sessionAdapter.deleteExpiredSessions.bind(sessionAdapter),
		validateSession: sessionAdapter.validateSession.bind(sessionAdapter),
		invalidateAllUserSessions: sessionAdapter.invalidateAllUserSessions.bind(sessionAdapter),
		getActiveSessions: sessionAdapter.getActiveSessions.bind(sessionAdapter),
		getAllActiveSessions: sessionAdapter.getAllActiveSessions.bind(sessionAdapter),
		getSessionTokenData: sessionAdapter.getSessionTokenData.bind(sessionAdapter),
		rotateToken: sessionAdapter.rotateToken.bind(sessionAdapter),
		cleanupRotatedSessions: sessionAdapter.cleanupRotatedSessions?.bind(sessionAdapter),

		// Token Management Methods
		createToken: tokenAdapter.createToken.bind(tokenAdapter),
		validateToken: tokenAdapter.validateToken.bind(tokenAdapter),
		consumeToken: tokenAdapter.consumeToken.bind(tokenAdapter),
		getTokenByValue: tokenAdapter.getTokenByValue.bind(tokenAdapter),
		deleteExpiredTokens: tokenAdapter.deleteExpiredTokens.bind(tokenAdapter),
		getAllTokens: tokenAdapter.getAllTokens.bind(tokenAdapter),
		updateToken: tokenAdapter.updateToken.bind(tokenAdapter),
		deleteTokens: tokenAdapter.deleteTokens.bind(tokenAdapter),
		blockTokens: tokenAdapter.blockTokens.bind(tokenAdapter),
		unblockTokens: tokenAdapter.unblockTokens.bind(tokenAdapter),

		// Role Management Methods (basic implementation)
		createRole: async (role: Role): Promise<DatabaseResult<Role>> => {
			try {
				// Get or create Role model (stored in 'auth_roles' collection)
				const RoleModel =
					mongoose.models.auth_roles ||
					mongoose.model<Role>(
						'auth_roles',
						new mongoose.Schema(
							{
								_id: { type: String, required: true },
								name: { type: String, required: true },
								description: String,
								isAdmin: Boolean,
								permissions: [String],
								tenantId: { type: String, index: true }, // Multi-tenant support
								groupName: String,
								icon: String,
								color: String
							},
							{
								_id: false,
								timestamps: true,
								collection: 'auth_roles'
							}
						)
					);

				// Create indexes for multi-tenant queries
				await RoleModel.collection.createIndex({ tenantId: 1 });
				await RoleModel.collection.createIndex({ tenantId: 1, _id: 1 });

				const newRole = await RoleModel.create(role);

				return {
					success: true,
					data: newRole.toObject() as Role
				};
			} catch (err) {
				const message = `Error creating role: ${err instanceof Error ? err.message : String(err)}`;
				logger.error(message);
				return {
					success: false,
					message,
					error: {
						code: 'CREATE_ROLE_ERROR',
						message: err instanceof Error ? err.message : String(err)
					}
				};
			}
		},

		getAllRoles: async (tenantId?: string): Promise<Role[]> => {
			try {
				const RoleModel =
					mongoose.models.auth_roles ||
					mongoose.model<Role>(
						'auth_roles',
						new mongoose.Schema(
							{
								_id: { type: String, required: true },
								name: { type: String, required: true },
								description: String,
								isAdmin: Boolean,
								permissions: [String],
								tenantId: { type: String, index: true },
								groupName: String,
								icon: String,
								color: String
							},
							{
								_id: false,
								timestamps: true,
								collection: 'auth_roles'
							}
						)
					);

				// Filter by tenantId if in multi-tenant mode
				const filter = tenantId ? { tenantId } : { tenantId: { $exists: false } };
				const roles = await RoleModel.find(filter).lean<Role[]>();

				return roles;
			} catch (err) {
				logger.error(`Error fetching roles: ${err instanceof Error ? err.message : String(err)}`);
				return [];
			}
		},

		getRoleById: async (roleId: string, tenantId?: string): Promise<DatabaseResult<Role | null>> => {
			try {
				const RoleModel =
					mongoose.models.auth_roles ||
					mongoose.model<Role>(
						'auth_roles',
						new mongoose.Schema(
							{
								_id: { type: String, required: true },
								name: { type: String, required: true },
								description: String,
								isAdmin: Boolean,
								permissions: [String],
								tenantId: { type: String, index: true },
								groupName: String,
								icon: String,
								color: String
							},
							{
								_id: false,
								timestamps: true,
								collection: 'auth_roles'
							}
						)
					);

				const filter: { _id: string; tenantId?: { $exists: boolean } | string } = { _id: roleId };
				if (tenantId) {
					filter.tenantId = tenantId;
				} else {
					filter.tenantId = { $exists: false };
				}

				const role = await RoleModel.findOne(filter).lean<Role>();

				return {
					success: true,
					data: role || null
				};
			} catch (err) {
				const message = `Error fetching role: ${err instanceof Error ? err.message : String(err)}`;
				logger.error(message);
				return {
					success: false,
					message,
					error: {
						code: 'GET_ROLE_ERROR',
						message: err instanceof Error ? err.message : String(err)
					}
				};
			}
		},

		updateRole: async (roleId: string, roleData: Partial<Role>, tenantId?: string): Promise<DatabaseResult<Role>> => {
			try {
				const RoleModel =
					mongoose.models.auth_roles ||
					mongoose.model<Role>(
						'auth_roles',
						new mongoose.Schema(
							{
								_id: { type: String, required: true },
								name: { type: String, required: true },
								description: String,
								isAdmin: Boolean,
								permissions: [String],
								tenantId: { type: String, index: true },
								groupName: String,
								icon: String,
								color: String
							},
							{
								_id: false,
								timestamps: true,
								collection: 'auth_roles'
							}
						)
					);

				const filter: { _id: string; tenantId?: { $exists: boolean } | string } = { _id: roleId };
				if (tenantId) {
					filter.tenantId = tenantId;
				} else {
					filter.tenantId = { $exists: false };
				}

				const updatedRole = await RoleModel.findOneAndUpdate(filter, { $set: roleData }, { new: true }).lean<Role>();

				if (!updatedRole) {
					return {
						success: false,
						message: 'Role not found',
						error: {
							code: 'ROLE_NOT_FOUND',
							message: 'Role not found'
						}
					};
				}

				return {
					success: true,
					data: updatedRole
				};
			} catch (err) {
				const message = `Error updating role: ${err instanceof Error ? err.message : String(err)}`;
				logger.error(message);
				return {
					success: false,
					message,
					error: {
						code: 'UPDATE_ROLE_ERROR',
						message: err instanceof Error ? err.message : String(err)
					}
				};
			}
		},

		deleteRole: async (roleId: string, tenantId?: string): Promise<DatabaseResult<void>> => {
			try {
				const RoleModel =
					mongoose.models.auth_roles ||
					mongoose.model<Role>(
						'auth_roles',
						new mongoose.Schema(
							{
								_id: { type: String, required: true },
								name: { type: String, required: true },
								description: String,
								isAdmin: Boolean,
								permissions: [String],
								tenantId: { type: String, index: true },
								groupName: String,
								icon: String,
								color: String
							},
							{
								_id: false,
								timestamps: true,
								collection: 'auth_roles'
							}
						)
					);

				const filter: { _id: string; tenantId?: { $exists: boolean } | string } = { _id: roleId };
				if (tenantId) {
					filter.tenantId = tenantId;
				} else {
					filter.tenantId = { $exists: false };
				}

				const result = await RoleModel.deleteOne(filter);

				if (result.deletedCount === 0) {
					return {
						success: false,
						message: 'Role not found',
						error: {
							code: 'ROLE_NOT_FOUND',
							message: 'Role not found'
						}
					};
				}

				return {
					success: true,
					data: undefined
				};
			} catch (err) {
				const message = `Error deleting role: ${err instanceof Error ? err.message : String(err)}`;
				logger.error(message);
				return {
					success: false,
					message,
					error: {
						code: 'DELETE_ROLE_ERROR',
						message: err instanceof Error ? err.message : String(err)
					}
				};
			}
		}
	};

	// Return the composed adapter (TypeScript will enforce type compatibility)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return adapter as any as AuthInterface;
}
