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

// System Logging
import { logger } from '@utils/logger.svelte';
import { UserAdapter } from './userAdapter';

// Define the Session schema
export const SessionSchema = new Schema(
	{
		user_id: { type: String, required: true, index: true }, // User identifier
		expires: { type: Date, required: true, index: true } // Expiry timestamp
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
	async createSession(sessionData: { user_id: string; expires: Date }): Promise<Session> {
		try {
			// First, invalidate any existing active sessions for this user
			await this.invalidateAllUserSessions(sessionData.user_id);

			// Then create the new session
			const session = new this.SessionModel(sessionData);
			await session.save();
			logger.info(`Session created for user: ${sessionData.user_id}`);
			return this.formatSession(session.toObject());
		} catch (err) {
			const message = `Error in SessionAdapter.createSession: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Rotate token - create new session and invalidate old one
	async rotateToken(oldToken: string, expires: Date): Promise<string> {
		try {
			// Get old session data
			const oldSession = await this.SessionModel.findById(oldToken).lean();
			if (!oldSession) {
				throw error(404, `Session not found: ${oldToken}`);
			}

			// Create new session
			const newSession = await this.createSession({
				user_id: oldSession.user_id,
				expires
			});

			// Invalidate old session
			await this.deleteSession(oldToken);

			logger.debug(`Token rotated - old: ${oldToken}, new: ${newSession._id}`);
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

	// Delete expired sessions
	async deleteExpiredSessions(): Promise<number> {
		try {
			const result = await this.SessionModel.deleteMany({ expires: { $lte: new Date() } });
			logger.info('Expired sessions deleted', { deletedCount: result.deletedCount });
			return result.deletedCount;
		} catch (err) {
			const message = `Error in SessionAdapter.deleteExpiredSessions: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Validate a session
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

			logger.debug('Session validated', { session_id });
			return await this.userAdapter.getUserById(session.user_id);
		} catch (err) {
			const message = `Error in SessionAdapter.validateSession: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Invalidate all sessions for a user
	async invalidateAllUserSessions(user_id: string): Promise<void> {
		try {
			const now = new Date();
			const result = await this.SessionModel.deleteMany({
				user_id,
				expires: { $gt: now } // Only delete active (non-expired) sessions
			});
			logger.debug(
				`invalidateAllUserSessions: Attempted to delete sessions for user_id=${user_id} at ${now.toISOString()}. Deleted count: ${result.deletedCount}`
			);
		} catch (err) {
			const message = `Error in SessionAdapter.invalidateAllUserSessions: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Get active sessions for a user
	async getActiveSessions(user_id: string): Promise<Session[]> {
		try {
			const sessions = await this.SessionModel.find({
				user_id,
				expires: { $gt: new Date() }
			}).lean();
			logger.debug('Active sessions retrieved for user', { user_id });
			return sessions.map(this.formatSession);
		} catch (err) {
			const message = `Error in SessionAdapter.getActiveSessions: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Get session token metadata including expiration
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

	private formatSession(session: { _id: Types.ObjectId; user_id: string; expires: Date }): Session {
		return {
			...session,
			_id: session._id.toString(),
			expires: new Date(session.expires) // Ensure expires is a Date object
		};
	}
}
