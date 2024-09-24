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

import mongoose, { Schema, Document, Model } from 'mongoose';

// Types
import type { Session, User } from '../types';
import type { authDBInterface } from '../authDBInterface';

// System Logging
import logger from '@utils/logger';
import { UserAdapter } from './userAdapter';

// Define the Session schema
export const SessionSchema = new Schema(
	{
		user_id: { type: String, required: true }, // ID of the user who owns the session, required field
		expires: { type: Number, required: true } // Expiry date of the session, required field
	},
	{ timestamps: true }
);

export class SessionAdapter implements Partial<authDBInterface> {
	private SessionModel: Model<Session & Document>;
	private userAdapter: UserAdapter;

	constructor() {
		// Create the Session model if it doesn't exist
		this.SessionModel = mongoose.models.auth_sessions || mongoose.model<Session & Document>('auth_sessions', SessionSchema);
		this.userAdapter = new UserAdapter();
	}

	// Create a new session
	async createSession(sessionData: { user_id: string; expires: number }): Promise<Session> {
		try {
			// Create a new session with the provided data
			const session = new this.SessionModel(sessionData);
			await session.save();
			logger.info(`Session created for user: ${sessionData.user_id}`);
			const savedSession = session.toObject();
			savedSession._id = savedSession._id.toString();
			return savedSession as Session;
		} catch (error) {
			logger.error('Failed to create session', { error: (error as Error).message });
			throw error; // Rethrow the original error after logging
		}
	}

	// Update the expiry of an existing session
	async updateSessionExpiry(session_id: string, newExpiry: number): Promise<Session> {
		try {
			// Update the session's expiry date
			const session = await this.SessionModel.findByIdAndUpdate(session_id, { expires: newExpiry }, { new: true }).lean();
			if (!session) {
				logger.warn('Session not found', { session_id });
				throw new Error('Session not found');
			}
			session._id = session._id.toString();
			logger.debug('Session expiry updated', { session_id });
			return session as Session;
		} catch (error) {
			logger.error('Failed to update session expiry', { session_id, error: (error as Error).message });
			throw error; // Rethrow the original error after logging
		}
	}

	// Delete a session
	async deleteSession(session_id: string): Promise<void> {
		try {
			await this.SessionModel.findByIdAndDelete(session_id);
			logger.info(`Session deleted: ${session_id}`);
		} catch (error) {
			logger.error('Failed to delete session', { session_id, error: (error as Error).message });
			throw error; // Rethrow the original error after logging
		}
	}

	// Delete expired sessions
	async deleteExpiredSessions(): Promise<number> {
		try {
			const result = await this.SessionModel.deleteMany({ expires: { $lte: Math.floor(Date.now() / 1000) } });
			logger.info('Expired sessions deleted', { deletedCount: result.deletedCount });
			return result.deletedCount;
		} catch (error) {
			logger.error('Failed to delete expired sessions', { error: (error as Error).message });
			throw error; // Rethrow the original error after logging
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

			session._id = session._id.toString();
			const currentTimestamp = Math.floor(Date.now() / 1000); // Current Unix timestamp in seconds

			if (session.expires <= currentTimestamp) {
				await this.SessionModel.findByIdAndDelete(session_id); // Clean up expired session
				logger.warn('Expired session', { session_id });
				return null;
			}

			logger.debug('Session validated', { session_id });
			return await this.userAdapter.getUserById(session.user_id);
		} catch (error) {
			logger.error('Failed to validate session', { session_id, error: (error as Error).message });
			throw error; // Rethrow the original error after logging
		}
	}

	// Invalidate all sessions for a user
	async invalidateAllUserSessions(user_id: string): Promise<void> {
		try {
			await this.SessionModel.deleteMany({ user_id });
			logger.debug('All sessions invalidated for user', { user_id });
		} catch (error) {
			logger.error('Failed to invalidate all user sessions', { user_id, error: (error as Error).message });
			throw error; // Rethrow the original error after logging
		}
	}

	// Get active sessions for a user
	async getActiveSessions(user_id: string): Promise<Session[]> {
		try {
			const sessions = await this.SessionModel.find({
				user_id,
				expires: { $gt: Math.floor(Date.now() / 1000) } // Compare with current timestamp
			}).lean();
			logger.debug('Active sessions retrieved for user', { user_id });
			return sessions.map((session) => {
				session._id = session._id.toString();
				return session as Session;
			});
		} catch (error) {
			logger.error('Failed to get active sessions', { user_id, error: (error as Error).message });
			throw error; // Rethrow the original error after logging
		}
	}
}
