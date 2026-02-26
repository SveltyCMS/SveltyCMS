/**
 * @file src/databases/mongodb/methods/auth-composition.ts
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

import type { Role, Session, User } from '@src/databases/auth/types';
import type { DatabaseResult, IDBAdapter, ISODateString } from '@src/databases/db-interface';
import { safeQuery } from '@src/utils/security/safe-query';
import { hashPassword } from '@utils/crypto';
import { logger } from '@utils/logger';
import mongoose from 'mongoose';
import { SessionAdapter } from '../models/auth-session';
import { TokenAdapter } from '../models/auth-token';
import { UserAdapter } from '../models/auth-user';

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
/**
 * Helper to get or create the Role model idempotently.
 */
function getRoleModel(): mongoose.Model<Role> {
	if (mongoose.models.auth_roles) {
		return mongoose.models.auth_roles as mongoose.Model<Role>;
	}

	const schema = new mongoose.Schema(
		{
			_id: { type: String, required: true },
			name: { type: String, required: true },
			description: String,
			isAdmin: Boolean,
			permissions: [String],
			tenantId: { type: String },
			groupName: String,
			icon: String,
			color: String
		},
		{
			_id: false,
			timestamps: true,
			collection: 'auth_roles'
		}
	);

	// Create optimized indexes for multi-tenant and ID queries
	schema.index({ tenantId: 1 });
	schema.index({ tenantId: 1, _id: 1 });

	return mongoose.model<Role>('auth_roles', schema);
}

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
			userId: string,
			tenantId?: string
		): Promise<DatabaseResult<{ deletedUser: boolean; deletedSessionCount: number }>> => {
			try {
				// Step 1: Get session count before deletion (for reporting)
				let deletedSessionCount = 0;
				try {
					const activeSessions = await sessionAdapter.getActiveSessions(userId, tenantId);
					if (activeSessions.success && activeSessions.data) {
						deletedSessionCount = activeSessions.data.length;
					}
				} catch {
					// Non-fatal: just log and continue
					logger.debug('Could not count sessions before deletion', { user_id: userId });
				}

				// Step 2: Delete all user sessions
				const sessionsResult = await sessionAdapter.invalidateAllUserSessions(userId, tenantId);

				if (!sessionsResult.success) {
					logger.warn('Failed to invalidate user sessions, continuing with user deletion', {
						user_id: userId,
						error: sessionsResult.message
					});
				}

				// Step 3: Delete the user
				const userResult = await userAdapter.deleteUser(userId, tenantId);

				if (!userResult.success) {
					return {
						success: false,
						message: userResult.message || 'Failed to delete user',
						error: userResult.error
					};
				}

				logger.info(`User and sessions deleted: user=${userId}, sessions=${deletedSessionCount}`, {
					user_id: userId,
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
				logger.error(message, { user_id: userId, tenantId });
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

		// Role Management Methods (normalized and de-duplicated)
		createRole: async (role: Role): Promise<DatabaseResult<Role>> => {
			try {
				const ROLE_MODEL = getRoleModel();
				const filter = safeQuery({ _id: role._id }, role.tenantId);

				const upsertedRole = await ROLE_MODEL.findOneAndUpdate(
					filter,
					{ $set: role },
					{ upsert: true, returnDocument: 'after', runValidators: true }
				).lean<Role>();

				return {
					success: true,
					data: upsertedRole
				};
			} catch (err) {
				const message = `Error creating/updating role: ${err instanceof Error ? err.message : String(err)}`;
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
				const ROLE_MODEL = getRoleModel();
				const filter = safeQuery({}, tenantId);
				return await ROLE_MODEL.find(filter).lean<Role[]>();
			} catch (err) {
				logger.error(`Error fetching roles: ${err instanceof Error ? err.message : String(err)}`);
				return [];
			}
		},

		getRoleById: async (roleId: string, tenantId?: string): Promise<DatabaseResult<Role | null>> => {
			try {
				const ROLE_MODEL = getRoleModel();
				const filter = safeQuery({ _id: roleId }, tenantId);

				const role = await ROLE_MODEL.findOne(filter).lean<Role>();

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
				const ROLE_MODEL = getRoleModel();
				const filter = safeQuery({ _id: roleId }, tenantId);

				const updatedRole = await ROLE_MODEL.findOneAndUpdate(filter, { $set: roleData }, { returnDocument: 'after' }).lean<Role>();

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
				const ROLE_MODEL = getRoleModel();
				const filter = safeQuery({ _id: roleId }, tenantId);

				const result = await ROLE_MODEL.deleteOne(filter);

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
	return adapter as unknown as AuthInterface;
}
