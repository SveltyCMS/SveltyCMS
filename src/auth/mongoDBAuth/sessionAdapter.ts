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
		expires: { type: Date, required: true } // Expiry date of the session, required field
	},
	{ timestamps: true }
);

/**
 * Custom Error class for Session-related errors.
 */
class SessionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'SessionError';
	}
}

export class SessionAdapter implements Partial<authDBInterface> {
	private SessionModel: Model<Session & Document>;
	private userAdapter: UserAdapter;

	constructor() {
		// Create the Session model if it doesn't exist
		this.SessionModel = mongoose.models.auth_sessions || mongoose.model<Session & Document>('auth_sessions', SessionSchema);
		this.userAdapter = new UserAdapter();
	}

	/**
	 * Helper function for centralized logging
	 */
	private log(level: 'info' | 'debug' | 'warn' | 'error', message: string, additionalInfo: any = {}) {
		logger[level](`${message} ${JSON.stringify(additionalInfo)}`);
	}

	// Create a new session
	async createSession(sessionData: { user_id: string; expires: Date }): Promise<Session> {
		try {
			// Ensure the expires field is correctly formatted
			if (!(sessionData.expires instanceof Date)) {
				throw new Error('Invalid expiry date format. Expires must be a Date object.');
			}

			const session = new this.SessionModel(sessionData);
			await session.save();
			logger.info(`Session created for user: ${sessionData.user_id}`);
			return session.toObject() as Session;
		} catch (error) {
			logger.error(`Failed to create session: ${(error as Error).message}`);
			throw error;
		}
	}

	// Update the expiry of an existing session
	async updateSessionExpiry(session_id: string, newExpiry: Date): Promise<Session> {
		try {
			// Use the Date object directly for the expiry update
			const session = await this.SessionModel.findByIdAndUpdate(session_id, { expires: newExpiry }, { new: true }).lean();
			if (!session) {
				throw new SessionError('Session not found');
			}
			this.log('debug', 'Session expiry updated', { session_id });
			return session;
		} catch (error) {
			this.log('error', 'Failed to update session expiry', { session_id, error: (error as Error).message });
			throw new SessionError('Failed to update session expiry');
		}
	}

	// Delete a session
	async deleteSession(session_id: string): Promise<void> {
		try {
			await this.SessionModel.findByIdAndDelete(session_id);
			logger.info(`Session deleted: ${session_id}`);
		} catch (error) {
			logger.error(`Failed to delete session: ${(error as Error).message}`);
			throw error;
		}
	}

	// Delete expired sessions
	async deleteExpiredSessions(): Promise<number> {
		try {
			const result = await this.SessionModel.deleteMany({ expires: { $lte: new Date() } });
			this.log('info', 'Expired sessions deleted', { deletedCount: result.deletedCount });
			return result.deletedCount;
		} catch (error) {
			this.log('error', 'Failed to delete expired sessions', { error: (error as Error).message });
			throw new SessionError('Failed to delete expired sessions');
		}
	}

	// Validate a session
	async validateSession(session_id: string): Promise<User | null> {
		try {
			const session = await this.SessionModel.findById(session_id).lean();
			if (!session || session.expires <= new Date()) {
				if (session) await this.SessionModel.findByIdAndDelete(session_id); // Clean up expired session
				this.log('warn', 'Invalid or expired session', { session_id });
				return null;
			}
			this.log('debug', 'Session validated', { session_id });

			return await this.userAdapter.getUserById(session.user_id);
		} catch (error) {
			this.log('error', 'Failed to validate session', { session_id, error: (error as Error).message });
			throw new SessionError('Failed to validate session');
		}
	}

	// Invalidate all sessions for a user
	async invalidateAllUserSessions(user_id: string): Promise<void> {
		try {
			await this.SessionModel.deleteMany({ user_id });
			this.log('debug', 'All sessions invalidated for user', { user_id });
		} catch (error) {
			this.log('error', 'Failed to invalidate all user sessions', { user_id, error: (error as Error).message });
			throw new SessionError('Failed to invalidate all user sessions');
		}
	}

	// Get active sessions for a user
	async getActiveSessions(user_id: string): Promise<Session[]> {
		try {
			const sessions = await this.SessionModel.find({
				user_id,
				expires: { $gt: new Date() }
			}).lean();
			this.log('debug', 'Active sessions retrieved for user', { user_id });
			return sessions;
		} catch (error) {
			this.log('error', 'Failed to get active sessions', { user_id, error: (error as Error).message });
			throw new SessionError('Failed to get active sessions');
		}
	}
}
