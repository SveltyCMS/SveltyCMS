import mongoose, { Schema, Document, Model } from 'mongoose';

// Types
import type { Session, User } from '../types';
import type { SessionDBInterface } from '../authDBInterface';

// System Logging
import logger from '@utils/logger';

// Define the Session schema
export const SessionSchema = new Schema(
	{
		user_id: { type: String, required: true }, // ID of the user who owns the session, required field
		expires: { type: Date, required: true } // Expiry date of the session, required field
	},
	{ timestamps: true }
);

export class SessionAdapter implements SessionDBInterface {
	private SessionModel: Model<Session & Document>;

	constructor() {
		// Create the Session model if it doesn't exist
		this.SessionModel = mongoose.models.auth_sessions || mongoose.model<Session & Document>('auth_sessions', SessionSchema);
	}

	// Create a new session
	async createSession(sessionData: { user_id: string; expires: number }): Promise<Session> {
		try {
			const session = new this.SessionModel({
				user_id: sessionData.user_id,
				expires: new Date(Date.now() + sessionData.expires)
			});
			await session.save();
			logger.debug(`Session created for user: ${sessionData.user_id}`);
			return session.toObject() as Session;
		} catch (error) {
			logger.error(`Failed to create session: ${(error as Error).message}`);
			throw error;
		}
	}

	// Update the expiry of an existing session
	async updateSessionExpiry(session_id: string, newExpiry: number): Promise<Session> {
		try {
			const session = await this.SessionModel.findByIdAndUpdate(session_id, { expires: new Date(Date.now() + newExpiry) }, { new: true });
			if (!session) {
				throw new Error('Session not found');
			}
			logger.debug(`Session expiry updated: ${session_id}`);
			return session.toObject() as Session;
		} catch (error) {
			logger.error(`Failed to update session expiry: ${(error as Error).message}`);
			throw error;
		}
	}

	// Destroy a session
	async destroySession(session_id: string): Promise<void> {
		try {
			await this.SessionModel.findByIdAndDelete(session_id);
			logger.debug(`Session destroyed: ${session_id}`);
		} catch (error) {
			logger.error(`Failed to destroy session: ${(error as Error).message}`);
			throw error;
		}
	}

	// Delete expired sessions
	async deleteExpiredSessions(): Promise<number> {
		try {
			const result = await this.SessionModel.deleteMany({ expires: { $lte: new Date() } });
			logger.info(`Deleted ${result.deletedCount} expired sessions`);
			return result.deletedCount;
		} catch (error) {
			logger.error(`Failed to delete expired sessions: ${(error as Error).message}`);
			throw error;
		}
	}

	// Validate a session
	async validateSession(session_id: string): Promise<User | null> {
		try {
			const session = await this.SessionModel.findById(session_id);
			if (!session || session.expires <= new Date()) {
				if (session) await this.SessionModel.findByIdAndDelete(session_id);
				logger.warn(`Invalid or expired session: ${session_id}`);
				return null;
			}
			logger.debug(`Session validated: ${session_id}`);
			return null; // Replace with actual user fetching logic
		} catch (error) {
			logger.error(`Failed to validate session: ${(error as Error).message}`);
			throw error;
		}
	}

	// Invalidate all sessions for a user
	async invalidateAllUserSessions(user_id: string): Promise<void> {
		try {
			await this.SessionModel.deleteMany({ user_id });
			logger.debug(`All sessions invalidated for user: ${user_id}`);
		} catch (error) {
			logger.error(`Failed to invalidate all user sessions: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get active sessions for a user
	async getActiveSessions(user_id: string): Promise<Session[]> {
		try {
			const sessions = await this.SessionModel.find({
				user_id,
				expires: { $gt: new Date() }
			});
			logger.debug(`Active sessions retrieved for user: ${user_id}`);
			return sessions.map((session) => session.toObject() as Session);
		} catch (error) {
			logger.error(`Failed to get active sessions: ${(error as Error).message}`);
			throw error;
		}
	}
}
