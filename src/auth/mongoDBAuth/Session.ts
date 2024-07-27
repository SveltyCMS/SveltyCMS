import mongoose, { Schema, Document } from 'mongoose';
import type { Session, User } from '../types';
import { UserModel } from './User';

// Import logger
import { logger } from '@src/utils/logger';

// Define the Session schema
const SessionSchema = new Schema(
	{
		user_id: { type: String, required: true }, // ID of the user who owns the session, required field
		expires: { type: Date, required: true } // Expiry date of the session, required field
	},
	{ timestamps: true }
);

// Export the Session model if it doesn't exist
export const SessionModel = mongoose.models.auth_sessions || mongoose.model<Session & Document>('auth_sessions', SessionSchema);

// Export the Session Class
export class SessionClass {
	// Create a new session for a user
	async createSession(data: { user_id: string; expires: number }): Promise<Session> {
		try {
			const expiresAt = new Date(Date.now() + data.expires);
			const session = new SessionModel({
				user_id: data.user_id,
				expires: expiresAt
			});
			await session.save();
			logger.debug(`Session created for user: ${data.user_id}, expires at: ${expiresAt}`);
			return {
				session_id: session._id.toString(),
				user_id: session.user_id,
				expires: session.expires
			} as Session;
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to create session: ${error.message}`);
			} else {
				logger.error('Failed to create session: Unknown error');
			}
			throw error;
		}
	}

	// Destroy a session by ID
	async destroySession(session_id: string): Promise<void> {
		try {
			await SessionModel.deleteOne({ _id: session_id });
			logger.debug(`Session destroyed: ${session_id}`);
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to destroy session: ${error.message}`);
			} else {
				logger.error('Failed to destroy session: Unknown error');
			}
			throw error;
		}
	}

	// Validate a session by ID
	async validateSession(session_id: string): Promise<User | null> {
		try {
			const session = await SessionModel.findById(session_id);
			if (!session || session.expires <= new Date()) {
				if (session) await SessionModel.deleteOne({ _id: session_id });
				logger.warn(`Session invalid or expired: ${session_id}`);
				return null;
			}
			const user = await UserModel.findById(session.user_id);
			logger.debug(`Session validated for user: ${session.user_id}`);
			return user ? (user.toObject() as User) : null;
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to validate session: ${error.message}`);
			} else {
				logger.error('Failed to validate session: Unknown error');
			}
			throw error;
		}
	}

	// Invalidate all sessions for a user
	async invalidateAllUserSessions(user_id: string): Promise<void> {
		try {
			await SessionModel.deleteMany({ user_id });
			logger.debug(`All sessions invalidated for user: ${user_id}`);
		} catch (error) {
			if (error instanceof Error) {
				logger.error(`Failed to invalidate all sessions: ${error.message}`);
			} else {
				logger.error('Failed to invalidate all sessions: Unknown error');
			}
			throw error;
		}
	}
}
