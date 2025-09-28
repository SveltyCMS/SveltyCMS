/**
 * @file src/auth/mongoDBAuth/sessionAdapter.ts
 * @description MongoDB adapter for session-related operations.
 *
 * This module provides functionality to:
 * - Create, update, delete, and retrieve sessions
 * - Manage session schemas and models
 * - Handle session validation and expiration
 *
 * Features:
 * - CRUD operations for sessions
 * - Session schema definition
 * - Session expiration handling
 * - Integration with MongoDB through Mongoose
 *
 * Usage:
 * Utilized by the auth system to manage user sessions in a MongoDB database
 */

import { error } from '@sveltejs/kit';
import type { Model, Types } from 'mongoose';
import mongoose, { Schema } from 'mongoose';

// Types
import type { authDBInterface, DatabaseResult } from '../authDBInterface';
import type { Session, User } from '../types';

// Auth
import { UserAdapter } from './userAdapter';

// System Logging
import { logger } from '@utils/logger.svelte';

// Define the Session schema
export const SessionSchema = new Schema(
	{
		user_id: { type: String, required: true, index: true }, // User identifier
		tenantId: { type: String, index: true }, // Tenant identifier for multi-tenancy
		expires: { type: Date, required: true, index: true }, // Expiry timestamp
		rotated: { type: Boolean, default: false, index: true }, // Flag to mark rotated sessions
		rotatedTo: { type: String, index: true } // ID of the new session this was rotated to
	},
	{ timestamps: true } // Automatically adds `createdAt` and `updatedAt` fields
);

export class SessionAdapter implements Partial<authDBInterface> {
	private SessionModel: Model<Session>;
	private userAdapter: UserAdapter;

	constructor() {
		// Create the Session model if it doesn't exist
		this.SessionModel = mongoose.models?.auth_sessions || mongoose.model<Session>('auth_sessions', SessionSchema);
		this.userAdapter = new UserAdapter();
	}

	// Validate token signature and claims
	async validateToken(
		token: string,
		user_id?: string,
		_type?: string,
		tenantId?: string
	): Promise<DatabaseResult<{ success: boolean; message: string; email?: string }>> {
		try {
			const session = await this.SessionModel.findById(token).lean();
			if (!session) {
				return {
					success: true,
					data: { success: false, message: 'Session not found' }
				};
			}

			// Check if token is expired
			if (new Date(session.expires) <= new Date()) {
				await this.SessionModel.findByIdAndDelete(token);
				return {
					success: true,
					data: { success: false, message: 'Session expired' }
				};
			}

			// Additional validation if user_id is provided
			if (user_id && session.user_id !== user_id) {
				return {
					success: true,
					data: { success: false, message: 'Session does not match user' }
				};
			}

			// Check tenant isolation if tenantId is provided
			if (tenantId && session.tenantId !== tenantId) {
				return {
					success: true,
					data: { success: false, message: 'Session does not match tenant' }
				};
			}

			return {
				success: true,
				data: { success: true, message: 'Token is valid' }
			};
		} catch (err) {
			logger.error(`Token validation failed: ${err instanceof Error ? err.message : String(err)}`);
			return {
				success: false,
				message: `Token validation failed: ${err instanceof Error ? err.message : String(err)}`,
				error: {
					code: 'VALIDATION_ERROR',
					message: err instanceof Error ? err.message : String(err)
				}
			};
		}
	}

	// Create a new session
	async createSession(sessionData: { user_id: string; expires: Date; tenantId?: string }): Promise<DatabaseResult<Session>> {
		try {
			// Create the new session
			const session = new this.SessionModel(sessionData);
			await session.save();
			logger.info(`Session created for user: \x1b[34m${sessionData.user_id}\x1b[0m`);
			const sessionObj = session.toObject();
			return {
				success: true,
				data: this.formatSession({
					_id: sessionObj._id,
					user_id: sessionObj.user_id,
					expires: sessionObj.expires,
					...sessionObj
				})
			};
		} catch (err) {
			const message = `Error in SessionAdapter.createSession: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return {
				success: false,
				message,
				error: {
					code: 'CREATE_SESSION_ERROR',
					message: err instanceof Error ? err.message : String(err)
				}
			};
		}
	}

	// Create a new session with options (internal method)
	async createSessionWithOptions(
		sessionData: { user_id: string; expires: Date; tenantId?: string },
		options: { invalidateOthers?: boolean } = {}
	): Promise<Session> {
		try {
			// Only invalidate all sessions if not explicitly skipped
			if (options.invalidateOthers !== false) {
				const invalidationResult = await this.invalidateAllUserSessions(sessionData.user_id, sessionData.tenantId);
				if (!invalidationResult.success) {
					logger.warn(`Failed to invalidate existing sessions: ${invalidationResult.message}`);
				}
			}

			// Then create the new session
			const sessionResult = await this.createSession(sessionData);
			if (!sessionResult.success) {
				throw new Error(sessionResult.message);
			}
			return sessionResult.data;
		} catch (err) {
			const message = `Error in SessionAdapter.createSessionWithOptions: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Rotate token - create new session and gracefully transition from old one
	async rotateToken(oldToken: string, expires: Date): Promise<DatabaseResult<string>> {
		try {
			// Get old session data
			const oldSession = await this.SessionModel.findById(oldToken).lean();
			if (!oldSession) {
				return {
					success: false,
					message: `Session not found: ${oldToken}`,
					error: {
						code: 'SESSION_NOT_FOUND',
						message: `Session not found: ${oldToken}`,
						statusCode: 404
					}
				};
			}

			// Check if token is already expired
			if (new Date(oldSession.expires) <= new Date()) {
				logger.warn(`Attempting to rotate expired session: ${oldToken}`);
				return {
					success: false,
					message: `Cannot rotate expired session: ${oldToken}`,
					error: {
						code: 'SESSION_EXPIRED',
						message: `Cannot rotate expired session: ${oldToken}`,
						statusCode: 400
					}
				};
			}

			// Create new session using createSessionWithOptions to avoid invalidating all others
			const newSession = await this.createSessionWithOptions(
				{
					user_id: oldSession.user_id,
					expires,
					tenantId: oldSession.tenantId
				},
				{ invalidateOthers: false }
			);

			// Instead of immediately deleting old session, extend it for 5 minutes grace period
			// This prevents race conditions where cached references to old session cause failures

			const graceExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes grace period
			await this.SessionModel.findByIdAndUpdate(oldToken, {
				expires: graceExpiry,
				// Add a flag to mark this as a rotated session for cleanup
				rotated: true,
				rotatedTo: newSession._id
			});

			logger.info(`Token rotated successfully - old: ${oldToken} (grace period until ${graceExpiry.toISOString()}), new: ${newSession._id}`);
			return {
				success: true,
				data: newSession._id
			};
		} catch (err) {
			const message = `Error in SessionAdapter.rotateToken: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return {
				success: false,
				message,
				error: {
					code: 'ROTATE_TOKEN_ERROR',
					message: err instanceof Error ? err.message : String(err)
				}
			};
		}
	}

	// Update the expiry of an existing session
	async updateSessionExpiry(session_id: string, newExpiry: Date): Promise<DatabaseResult<Session>> {
		try {
			const session = await this.SessionModel.findByIdAndUpdate(session_id, { expires: newExpiry }, { new: true }).lean();
			if (!session) {
				return {
					success: false,
					message: `Session not found: ${session_id}`,
					error: {
						code: 'SESSION_NOT_FOUND',
						message: `Session not found: ${session_id}`,
						statusCode: 404
					}
				};
			}
			logger.debug('Session expiry updated', { session_id });
			return {
				success: true,
				data: this.formatSession(session)
			};
		} catch (err) {
			const message = `Error in SessionAdapter.updateSessionExpiry: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return {
				success: false,
				message,
				error: {
					code: 'UPDATE_SESSION_ERROR',
					message: err instanceof Error ? err.message : String(err)
				}
			};
		}
	}

	// Delete a session
	async deleteSession(session_id: string): Promise<DatabaseResult<void>> {
		try {
			await this.SessionModel.findByIdAndDelete(session_id);
			logger.info(`Session deleted: ${session_id}`);
			return {
				success: true,
				data: undefined
			};
		} catch (err) {
			const message = `Error in SessionAdapter.deleteSession: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return {
				success: false,
				message,
				error: {
					code: 'DELETE_SESSION_ERROR',
					message: err instanceof Error ? err.message : String(err)
				}
			};
		}
	}

	// Delete expired sessions (enhanced to clean up rotated sessions)
	async deleteExpiredSessions(): Promise<DatabaseResult<number>> {
		try {
			const now = new Date();

			// Delete all expired sessions (including rotated ones past grace period)
			const result = await this.SessionModel.deleteMany({ expires: { $lte: now } });

			logger.info('Expired sessions deleted', { deletedCount: result.deletedCount });
			return {
				success: true,
				data: result.deletedCount
			};
		} catch (err) {
			const message = `Error in SessionAdapter.deleteExpiredSessions: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return {
				success: false,
				message,
				error: {
					code: 'DELETE_EXPIRED_SESSIONS_ERROR',
					message: err instanceof Error ? err.message : String(err)
				}
			};
		}
	}

	// Validate a session (enhanced to handle rotated sessions)
	async validateSession(session_id: string): Promise<DatabaseResult<User | null>> {
		try {
			const session = await this.SessionModel.findById(session_id).lean();
			if (!session) {
				logger.warn('Session not found', { session_id });
				return { success: true, data: null };
			}

			if (new Date(session.expires) <= new Date()) {
				await this.SessionModel.findByIdAndDelete(session_id);
				logger.warn('Expired session', { session_id });
				return { success: true, data: null };
			}

			// If this is a rotated session, check if we should redirect to the new session
			if (session.rotated && session.rotatedTo) {
				logger.debug(`Session ${session_id} was rotated to ${session.rotatedTo}, but still valid during grace period`);
				// Still return the user for the grace period, but log the rotation
			}

			logger.debug('Session validated', { session_id });
			// getUserById may throw errors, we need to handle them
			try {
				const userResult = await this.userAdapter.getUserById(session.user_id);
				if (userResult.success) {
					return { success: true, data: userResult.data };
				} else {
					const userMessage = `Failed to get user: ${userResult.message || 'Unknown error'}`;
					logger.error(userMessage);
					return {
						success: false,
						message: userMessage,
						error: { code: 'USER_RETRIEVAL_ERROR', message: userMessage }
					};
				}
			} catch (userErr) {
				const userMessage = `Error getting user in validateSession: ${userErr instanceof Error ? userErr.message : String(userErr)}`;
				logger.error(userMessage);
				return {
					success: false,
					message: userMessage,
					error: { code: 'USER_RETRIEVAL_ERROR', message: userMessage }
				};
			}
		} catch (err) {
			const message = `Error in SessionAdapter.validateSession: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return {
				success: false,
				message,
				error: { code: 'VALIDATION_ERROR', message }
			};
		}
	}

	// Invalidate all sessions for a user (enhanced to handle rotated sessions)
	async invalidateAllUserSessions(user_id: string, tenantId?: string): Promise<DatabaseResult<void>> {
		try {
			const now = new Date();
			const filter: Record<string, unknown> = {
				user_id,
				expires: { $gt: now }, // Only delete active (non-expired) sessions
				$or: [
					{ rotated: { $ne: true } }, // Delete non-rotated sessions
					{ rotated: true, expires: { $lte: new Date(now.getTime() + 60000) } } // Delete rotated sessions close to expiry
				]
			};

			if (tenantId) {
				filter.tenantId = tenantId;
			}

			const result = await this.SessionModel.deleteMany(filter);
			logger.debug(
				`InvalidateAllUserSessions: Attempted to delete sessions for user_id=\x1b[34m${user_id}\x1b[0m at ${now.toISOString()}. Deleted count: ${result.deletedCount}`
			);
			return { success: true, data: undefined };
		} catch (err) {
			const message = `Error in SessionAdapter.invalidateAllUserSessions: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return {
				success: false,
				message,
				error: { code: 'INVALIDATION_ERROR', message }
			};
		}
	}

	// Get active sessions for a user (enhanced to show rotation status)
	async getActiveSessions(user_id: string, tenantId?: string): Promise<DatabaseResult<Session[]>> {
		try {
			const filter: Record<string, unknown> = {
				user_id,
				expires: { $gt: new Date() }
			};

			if (tenantId) {
				filter.tenantId = tenantId;
			}

			const sessions = await this.SessionModel.find(filter).lean();
			logger.debug('Active sessions retrieved for user', { user_id, count: sessions.length });
			return { success: true, data: sessions.map((session) => this.formatSession(session)) };
		} catch (err) {
			const message = `Error in SessionAdapter.getActiveSessions: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return {
				success: false,
				message,
				error: { code: 'RETRIEVAL_ERROR', message }
			};
		}
	}

	// Get all active sessions for all users (for online users widget)
	async getAllActiveSessions(tenantId?: string): Promise<DatabaseResult<Session[]>> {
		try {
			const query: Record<string, unknown> = {
				expires: { $gt: new Date() }
			};

			// If multi-tenant mode, filter by tenantId
			if (tenantId) {
				query.tenantId = tenantId;
			}

			const sessions = await this.SessionModel.find(query).lean();
			logger.debug('All active sessions retrieved', { count: sessions.length, tenantId });
			return { success: true, data: sessions.map((session) => this.formatSession(session)) };
		} catch (err) {
			const message = `Error in SessionAdapter.getAllActiveSessions: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return {
				success: false,
				message,
				error: { code: 'RETRIEVAL_ERROR', message }
			};
		}
	}

	// Get session token metadata including expiration (enhanced to handle rotated sessions)
	async getSessionTokenData(session_id: string): Promise<DatabaseResult<{ expiresAt: Date; user_id: string } | null>> {
		try {
			const session = await this.SessionModel.findById(session_id).lean();
			if (!session) {
				return { success: true, data: null };
			}

			// Check if token is expired
			if (new Date(session.expires) <= new Date()) {
				await this.SessionModel.findByIdAndDelete(session_id);
				return { success: true, data: null };
			}

			return {
				success: true,
				data: {
					expiresAt: new Date(session.expires),
					user_id: session.user_id // Include user_id as required by authDBInterface
				}
			};
		} catch (err) {
			const message = `Failed to get token data: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return {
				success: false,
				message,
				error: { code: 'TOKEN_DATA_ERROR', message }
			};
		}
	}

	// Clean up rotated sessions that have passed their grace period
	async cleanupRotatedSessions(): Promise<DatabaseResult<number>> {
		try {
			const now = new Date();
			const result = await this.SessionModel.deleteMany({
				rotated: true,
				expires: { $lte: now }
			});

			if (result.deletedCount > 0) {
				logger.info(`Cleaned up ${result.deletedCount} rotated sessions past grace period`);
			}

			return { success: true, data: result.deletedCount };
		} catch (err) {
			const message = `Error in SessionAdapter.cleanupRotatedSessions: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return {
				success: false,
				message,
				error: { code: 'CLEANUP_ERROR', message }
			};
		}
	}

	private formatSession(session: { _id: Types.ObjectId | string; user_id: string; expires: Date; [key: string]: unknown }): Session {
		return {
			...session,
			_id: typeof session._id === 'string' ? session._id : session._id.toString(),
			expires: new Date(session.expires) // Ensure expires is a Date object
		} as Session;
	}
}
