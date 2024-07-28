import mongoose, { Schema, Document } from 'mongoose';
import type { User } from '../types';

// Define the User schema
const UserSchema = new Schema(
	{
		email: { type: String, required: true, unique: true }, // User's email, required field
		password: { type: String }, // User's password, optional field
		role: { type: String, required: true }, // User's role, required field
		permissions: [{ type: Schema.Types.ObjectId, ref: 'Permission' }], // User-specific permissions, optional field
		username: String, // User's username, optional field
		firstName: String, // First name of the user
		lastName: String, // Last name of the user
		locale: String, // Locale of the user
		avatar: String, // URL of the user's avatar, optional field
		lastAuthMethod: String, // Last authentication method used by the user, optional field
		lastActiveAt: Date, // Last time the user was active, optional field
		expiresAt: Date, // Expiry date for the user, optional field
		isRegistered: Boolean, // Registration status of the user, optional field
		failedAttempts: { type: Number, default: 0 }, // Number of failed login attempts, optional field
		blocked: Boolean, // Whether the user is blocked, optional field
		resetRequestedAt: Date, // Last time the user requested a password reset, optional field
		resetToken: String, // Token for resetting the user's password, optional field
		lockoutUntil: Date, // Lockout date for the user, optional field
		is2FAEnabled: Boolean // Whether the user has 2FA enabled, optional field
	},
	{ timestamps: true }
);

// Export the User model if it doesn't exist
export const UserModel = mongoose.models.auth_users || mongoose.model<User & Document>('auth_users', UserSchema);
