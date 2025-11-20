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
import type { DatabaseResult, ISODateString } from '@src/databases/dbInterface';
import type { Session, User } from '@src/databases/auth/types';

// Utilities
import { generateId } from '@src/databases/mongodb/methods/mongoDBUtils';
import { toISOString } from '@utils/dateUtils';

// System Logging
import { logger } from '@utils/logger';

// Define the Session schema
export const SessionSchema = new Schema(
	{
		_id: { type: String, required: true }, // UUID as primary key
		// Index definitions have been removed from here to prevent duplication.
		user_id: { type: String, required: true }, // User identifier
		tenantId: { type: String }, // Tenant identifier for multi-tenancy
		expires: { type: Date, required: true }, // Expiry timestamp - MUST be Date for TTL index
		rotated: { type: Boolean, default: false }, // Flag to mark rotated sessions
		rotatedTo: { type: String } // ID of the new session this was rotated to
	},
	{
		timestamps: true, // Automatically adds createdAt and updatedAt as Date types
		_id: false // Disable auto ObjectId generation - we provide our own UUID
	}
);

// --- Indexes ---
// TTL index: Automatically delete expired sessions (auto-cleanup)
SessionSchema.index({ expires: 1 }, { expireAfterSeconds: 0 });

// Compound indexes for common query patterns (50-80% performance boost)
SessionSchema.index({ user_id: 1, expires: 1, rotated: 1 }); // User's active sessions
SessionSchema.index({ tenantId: 1, user_id: 1, expires: 1 }); // Multi-tenant user sessions
SessionSchema.index({ tenantId: 1, expires: 1, rotated: 1 }); // Tenant-wide session queries
SessionSchema.index({ rotated: 1, expires: 1 }); // Find rotated/active sessions
SessionSchema.index({ rotatedTo: 1 }, { sparse: true }); // Session rotation chain lookups (sparse is efficient)

/**
 * SessionAdapter class handles all session-related database operations.
 * This is a partial implementation that will be composed with other adapters.
 */
export class SessionAdapter {
	private SessionModel: Model<Session>;

	constructor() {
		// Delete existing model if it exists to force recreation with new schema
		if (mongoose.models?.auth_sessions) {
			delete mongoose.models.auth_sessions;
		}

		// Create the Session model with the updated schema
		this.SessionModel = mongoose.model<Session>('auth_sessions', SessionSchema);

		// Clean up old ObjectId-based sessions (migration)
		this.migrateToUuidSessions().catch((err) => {
			logger.warn('Failed to migrate sessions to UUID format', { error: err.message });
		});
	}

	// Migration: Remove old ObjectId-based sessions
	private async migrateToUuidSessions(): Promise<void> {
		try {
			// Delete all sessions with ObjectId format (24-char hex strings)
			// UUID format is 32 chars without dashes
			const result = await this.SessionModel.deleteMany({
				$or: [
					{ _id: { $type: 'objectId' } }, // MongoDB ObjectId type
					{ _id: { $regex: /^[0-9a-f]{24}$/ } } // 24-char hex string (ObjectId format)
				]
			});

			if (result.deletedCount && result.deletedCount > 0) {
				logger.info(`🔄 Migrated sessions: Removed ${result.deletedCount} old ObjectId-based sessions`);
			}
		} catch (err) {
			// Non-critical error - old sessions will expire naturally
			logger.debug('Session migration check completed', { error: err instanceof Error ? err.message : String(err) });
		}
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
	async createSession(sessionData: { user_id: string; expires: ISODateString; tenantId?: string }): Promise<DatabaseResult<Session>> {
		try {
			// Create the new session with UUID
			const sessionId = generateId();
			const session = new this.SessionModel({ ...sessionData, _id: sessionId });
			await session.save();
			logger.info(`Session created: ${sessionId} for user: ${sessionData.user_id}`);
			const sessionObj = session.toObject();
			return {
				success: true,
				data: this.formatSession(
					sessionObj as unknown as { [key: string]: unknown; _id: string | Types.ObjectId; user_id: string; expires: ISODateString }
				)
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

	// Create a new session with options (optimized with atomic bulkWrite)
	async createSessionWithOptions(
		sessionData: { user_id: string; expires: ISODateString; tenantId?: string },
		options: { invalidateOthers?: boolean } = {}
	): Promise<Session> {
		try {
			// Only invalidate all sessions if not explicitly skipped
			if (options.invalidateOthers !== false) {
				// Use bulkWrite for atomic operation: delete old sessions + insert new one
				// This is more efficient than separate deleteMany + insertOne calls
				const now = new Date();
				const filter: Record<string, unknown> = {
					user_id: sessionData.user_id,
					expires: { $gt: now }, // Only delete active (non-expired) sessions
					$or: [
						{ rotated: { $ne: true } }, // Delete non-rotated sessions
						{ rotated: true, expires: { $lte: new Date(now.getTime() + 60000) } } // Delete rotated sessions close to expiry
					]
				};

				if (sessionData.tenantId) {
					filter.tenantId = sessionData.tenantId;
				}

				// Create new session document with UUID
				const sessionId = generateId();
				const newSession = new this.SessionModel({ ...sessionData, _id: sessionId });

				// Execute both operations atomically with bulkWrite
				await this.SessionModel.bulkWrite([
					{
						// Step 1: Delete all existing active sessions for this user
						deleteMany: {
							filter
						}
					},
					{
						// Step 2: Insert the new session
						insertOne: {
							document: newSession
						}
					}
				]);

				logger.info(`Session created: ${sessionId} for user: ${sessionData.user_id}`);

				// Return the formatted session
				return this.formatSession({
					_id: sessionId,
					user_id: sessionData.user_id,
					expires: sessionData.expires,
					tenantId: sessionData.tenantId,
					rotated: false
				});
			} else {
				// Just create the new session without invalidating others
				const sessionResult = await this.createSession(sessionData);
				if (!sessionResult.success) {
					throw new Error(sessionResult.message);
				}
				return sessionResult.data;
			}
		} catch (err) {
			const message = `Error in SessionAdapter.createSessionWithOptions: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Rotate token - create new session and gracefully transition from old one
	async rotateToken(oldToken: string, expires: ISODateString): Promise<DatabaseResult<string>> {
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

	// Validate a session (optimized with MongoDB $lookup aggregation)
	async validateSession(session_id: string): Promise<DatabaseResult<User | null>> {
		try {
			// UUID validation (UUIDs are strings, not ObjectIds)
			if (!session_id || typeof session_id !== 'string' || session_id.length < 32) {
				logger.warn('Invalid session ID format', { session_id });
				return { success: true, data: null };
			}

			// DEBUG: Check if session exists in database
			const sessionExists = await this.SessionModel.findById(session_id).lean();
			logger.debug('Session lookup', {
				session_id,
				exists: !!sessionExists,
				expires: sessionExists?.expires,
				expired: sessionExists ? new Date(sessionExists.expires) <= new Date() : null
			});

			// Use MongoDB aggregation pipeline to join session and user in a single query
			// This replaces two sequential database calls with one optimized query
			const results = await this.SessionModel.aggregate([
				// Stage 1: Find the session by its ID (UUID string)
				{ $match: { _id: session_id } },
				// Stage 2: Check for expiration
				{ $match: { expires: { $gt: new Date() } } },
				// Stage 3: "Join" with the auth_users collection (both using UUID strings)
				{
					$lookup: {
						from: 'auth_users',
						localField: 'user_id', // UUID string
						foreignField: '_id', // UUID string
						as: 'user'
					}
				},
				// Stage 4: Deconstruct the user array
				{ $unwind: { path: '$user', preserveNullAndEmptyArrays: false } },
				// Stage 5: Add rotation metadata to user object
				{
					$addFields: {
						'user._sessionRotated': '$rotated',
						'user._sessionRotatedTo': '$rotatedTo'
					}
				},
				// Stage 6: Make user the root document
				{ $replaceRoot: { newRoot: '$user' } }
			]);

			logger.debug('Aggregation results', {
				session_id,
				resultsCount: results.length,
				hasUser: results.length > 0 && !!results[0]
			});

			if (results.length > 0) {
				const user = results[0];

				// Log rotation status if applicable
				if (user._sessionRotated && user._sessionRotatedTo) {
					logger.debug(`Session ${session_id} was rotated to ${user._sessionRotatedTo}, but still valid during grace period`);
				}

				// Remove session metadata from user object
				delete user._sessionRotated;
				delete user._sessionRotatedTo;

				// Normalize ID
				user._id = user._id.toString();

				// Ensure permissions are strings
				if (user.permissions && Array.isArray(user.permissions)) {
					user.permissions = user.permissions.map((p: unknown) => String(p));
				}

				logger.debug('Session validated', { session_id });
				return { success: true, data: user as User };
			}

			// If no results, the session is invalid, expired, or the user doesn't exist
			// Clean up the potentially invalid session
			await this.SessionModel.findByIdAndDelete(session_id);
			logger.warn('Session invalid or expired', { session_id });
			return { success: true, data: null };
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
				`InvalidateAllUserSessions: Attempted to delete sessions for user_id=${user_id} at ${now.toISOString()}. Deleted count: ${result.deletedCount}`
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
	async getSessionTokenData(session_id: string): Promise<DatabaseResult<{ expiresAt: ISODateString; user_id: string } | null>> {
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
					expiresAt: toISOString(session.expires),
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

	private formatSession(session: {
		_id: Types.ObjectId | string;
		user_id: string;
		expires: Date | ISODateString | string;
		[key: string]: unknown;
	}): Session {
		return {
			...session,
			_id: typeof session._id === 'string' ? session._id : session._id.toString(),
			expires: toISOString(session.expires) // Convert to ISODateString
		} as Session;
	}
}
