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
		user_id: { type: String, required: true, index: true }, // User identifier
		expires: { type: Date, required: true, index: true } // Expiry timestamp
	},
	{ timestamps: true } // Automatically adds `createdAt` and `updatedAt` fields
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
	async createSession(sessionData: { user_id: string; expires: Date }): Promise<Session> {
		try {
			const session = new this.SessionModel(sessionData);
			await session.save();
			logger.info(`Session created for user: ${sessionData.user_id}`);
			return this.formatSession(session.toObject());
		} catch (error) {
			logger.error('Failed to create session', { error: (error as Error).message });
			throw error;
		}
	}

	// Update the expiry of an existing session
	async updateSessionExpiry(session_id: string, newExpiry: Date): Promise<Session> {
		try {
			const session = await this.SessionModel.findByIdAndUpdate(session_id, { expires: newExpiry }, { new: true }).lean();
			if (!session) {
				logger.warn('Session not found', { session_id });
				throw new Error('Session not found');
			}
			logger.debug('Session expiry updated', { session_id });
			return this.formatSession(session);
		} catch (error) {
			logger.error('Failed to update session expiry', { session_id, error: (error as Error).message });
			throw error;
		}
	}

	// Delete a session
	async deleteSession(session_id: string): Promise<void> {
		try {
			await this.SessionModel.findByIdAndDelete(session_id);
			logger.info(`Session deleted: ${session_id}`);
		} catch (error) {
			logger.error('Failed to delete session', { session_id, error: (error as Error).message });
			throw error;
		}
	}

	// Delete expired sessions
	async deleteExpiredSessions(): Promise<number> {
		try {
			const result = await this.SessionModel.deleteMany({ expires: { $lte: new Date() } });
			logger.info('Expired sessions deleted', { deletedCount: result.deletedCount });
			return result.deletedCount;
		} catch (error) {
			logger.error('Failed to delete expired sessions', { error: (error as Error).message });
			throw error;
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
		} catch (error) {
			logger.error('Failed to validate session', { session_id, error: (error as Error).message });
			throw error;
		}
	}

	// Invalidate all sessions for a user
	async invalidateAllUserSessions(user_id: string): Promise<void> {
		try {
			await this.SessionModel.deleteMany({ user_id });
			logger.debug('All sessions invalidated for user', { user_id });
		} catch (error) {
			logger.error('Failed to invalidate all user sessions', { user_id, error: (error as Error).message });
			throw error;
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
		} catch (error) {
			logger.error('Failed to get active sessions', { user_id, error: (error as Error).message });
			throw error;
		}
	}

	private formatSession(session: any): Session {
		return {
			...session,
			_id: session._id.toString(),
			expires: new Date(session.expires) // Ensure expires is a Date object
		};
	}
}
