import mongoose, { Schema, Document } from 'mongoose';
import type { Session } from '../types';

// Define the Session schema
const SessionSchema = new Schema(
	{
		user_id: { type: String, required: true }, // ID of the user who owns the session, required field
		device_id: { type: String, required: true }, // ID of the device used for the session, required field
		expires: { type: Date, required: true } // Expiry date of the session, required field
	},
	{ timestamps: true }
);

// Export the Session model if it doesn't exist
export const SessionModel = mongoose.models.auth_sessions || mongoose.model<Session & Document>('auth_sessions', SessionSchema);
