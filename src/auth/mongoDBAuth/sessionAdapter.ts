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

import mongoose, { Schema } from 'mongoose';
import type { Types, Model } from 'mongoose';
import { error } from '@sveltejs/kit';

// Types
import type { Session, User } from '../types';
import type { authDBInterface } from '../authDBInterface';

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
	async validateToken(token: string): Promise<boolean> {
		try {
			const session = await this.SessionModel.findById(token).lean();
			if (!session) return false;

			// Check if token is expired
			if (new Date(session.expires) <= new Date()) {
				await this.SessionModel.findByIdAndDelete(token);
				return false;
			}

			return true;
		} catch (err) {
			logger.error(`Token validation failed: ${err instanceof Error ? err.message : String(err)}`);
			return false;
		}
	}

	// Create a new session
	async createSession(
		sessionData: { user_id: string; expires: Date; tenantId?: string },
		options: { invalidateOthers?: boolean } = {}
	): Promise<Session> {
		try {
			// Only invalidate all sessions if not explicitly skipped
			if (options.invalidateOthers !== false) {
				await this.invalidateAllUserSessions(sessionData.user_id);
			}

			// Then create the new session
			const session = new this.SessionModel(sessionData);
			await session.save();
			logger.info(`Session created for user: \x1b[34m${sessionData.user_id}\x1b[0m`);
			return this.formatSession(session.toObject());
		} catch (err) {
			const message = `Error in SessionAdapter.createSession: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Rotate token - create new session and gracefully transition from old one
	async rotateToken(oldToken: string, expires: Date): Promise<string> {
		try {
			// Get old session data
			const oldSession = await this.SessionModel.findById(oldToken).lean();
			if (!oldSession) {
				throw error(404, `Session not found: ${oldToken}`);
			}

			// Check if token is already expired
			if (new Date(oldSession.expires) <= new Date()) {
				logger.warn(`Attempting to rotate expired session: ${oldToken}`);
				throw error(400, `Cannot rotate expired session: ${oldToken}`);
			}

			// Create new session, do NOT invalidate all others
			const newSession = await this.createSession(
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
			return newSession._id;
		} catch (err) {
			const message = `Error in SessionAdapter.rotateToken: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Update the expiry of an existing session
	async updateSessionExpiry(session_id: string, newExpiry: Date): Promise<Session> {
		try {
			const session = await this.SessionModel.findByIdAndUpdate(session_id, { expires: newExpiry }, { new: true }).lean();
			if (!session) {
				throw error(404, `Session not found: ${session_id}`);
			}
			logger.debug('Session expiry updated', { session_id });
			return this.formatSession(session);
		} catch (err) {
			const message = `Error in SessionAdapter.updateSessionExpiry: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Delete a session
	async deleteSession(session_id: string): Promise<void> {
		try {
			await this.SessionModel.findByIdAndDelete(session_id);
			logger.info(`Session deleted: ${session_id}`);
		} catch (err) {
			const message = `Error in SessionAdapter.deleteSession: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Delete expired sessions (enhanced to clean up rotated sessions)
	async deleteExpiredSessions(): Promise<number> {
		try {
			const now = new Date();

			// Delete all expired sessions (including rotated ones past grace period)
			const result = await this.SessionModel.deleteMany({ expires: { $lte: now } });

			logger.info('Expired sessions deleted', { deletedCount: result.deletedCount });
			return result.deletedCount;
		} catch (err) {
			const message = `Error in SessionAdapter.deleteExpiredSessions: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Validate a session (enhanced to handle rotated sessions)
	async validateSession(session_id: string): Promise<User | null> {
		try {
			const session = await this.SessionModel.findById(session_id).lean();
			if (!session) {
				logger.warn('Session not found', { session_id });
				return null;
			}

			if (new Date(session.expires) <= new Date()) {
				await this.SessionModel.findByIdAndDelete(session_id);
				logger.warn('Expired session', { session_id });
				return null;
			}

			// If this is a rotated session, check if we should redirect to the new session
			if (session.rotated && session.rotatedTo) {
				logger.debug(`Session ${session_id} was rotated to ${session.rotatedTo}, but still valid during grace period`);
				// Still return the user for the grace period, but log the rotation
			}

			logger.debug('Session validated', { session_id });
			return await this.userAdapter.getUserById(session.user_id);
		} catch (err) {
			const message = `Error in SessionAdapter.validateSession: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Invalidate all sessions for a user (enhanced to handle rotated sessions)
	async invalidateAllUserSessions(user_id: string): Promise<void> {
		try {
			const now = new Date();
			const result = await this.SessionModel.deleteMany({
				user_id,
				expires: { $gt: now }, // Only delete active (non-expired) sessions
				$or: [
					{ rotated: { $ne: true } }, // Delete non-rotated sessions
					{ rotated: true, expires: { $lte: new Date(now.getTime() + 60000) } } // Delete rotated sessions close to expiry
				]
			});
			logger.debug(
				`InvalidateAllUserSessions: Attempted to delete sessions for user_id=\x1b[34m${user_id}\x1b[0m at ${now.toISOString()}. Deleted count: ${result.deletedCount}`
			);
		} catch (err) {
			const message = `Error in SessionAdapter.invalidateAllUserSessions: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Get active sessions for a user (enhanced to show rotation status)
	async getActiveSessions(user_id: string): Promise<{ success: boolean; data: Session[]; error?: string }> {
		try {
			const sessions = await this.SessionModel.find({
				user_id,
				expires: { $gt: new Date() }
			}).lean();
			logger.debug('Active sessions retrieved for user', { user_id, count: sessions.length });
			return { success: true, data: sessions.map((session) => this.formatSession(session)) };
		} catch (err) {
			const message = `Error in SessionAdapter.getActiveSessions: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return { success: false, data: [], error: message };
		}
	}

	// Get all active sessions for all users (for online users widget)
	async getAllActiveSessions(tenantId?: string): Promise<{ success: boolean; data: Session[]; error?: string }> {
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
			return { success: false, data: [], error: message };
		}
	}

	// Get session token metadata including expiration (enhanced to handle rotated sessions)
	async getSessionTokenData(token: string): Promise<{ expiresAt: Date; user_id: string } | null> {
		try {
			const session = await this.SessionModel.findById(token).lean();
			if (!session) return null;

			// Check if token is expired
			if (new Date(session.expires) <= new Date()) {
				await this.SessionModel.findByIdAndDelete(token);
				return null;
			}

			return {
				expiresAt: new Date(session.expires),
				user_id: session.user_id // Include user_id as required by authDBInterface
			};
		} catch (err) {
			logger.error(`Failed to get token data: ${err instanceof Error ? err.message : String(err)}`);
			return null;
		}
	}

	// Clean up rotated sessions that have passed their grace period
	async cleanupRotatedSessions(): Promise<number> {
		try {
			const now = new Date();
			const result = await this.SessionModel.deleteMany({
				rotated: true,
				expires: { $lte: now }
			});

			if (result.deletedCount > 0) {
				logger.info(`Cleaned up ${result.deletedCount} rotated sessions past grace period`);
			}

			return result.deletedCount;
		} catch (err) {
			const message = `Error in SessionAdapter.cleanupRotatedSessions: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	private formatSession(session: { _id: Types.ObjectId; user_id: string; expires: Date }): Session {
		return {
			...session,
			_id: session._id.toString(),
			expires: new Date(session.expires) // Ensure expires is a Date object
		};
	}
}
