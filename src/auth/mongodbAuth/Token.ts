import mongoose, { Schema, Document } from 'mongoose';
import type { Token } from '../types';

// Define the Token schema
export const TokenSchema = new Schema(
	{
		user_id: { type: String, required: true }, // ID of the user who owns the token, required field
		token: { type: String, required: true }, // Token string, required field
		email: { type: String, required: true }, // Email associated with the token, required field
		expires: { type: Date, required: true } // Expiry date of the token, required field
	},
	{ timestamps: true }
);

// Export the Token model if it doesn't exist
export const TokenModel = mongoose.models.auth_tokens || mongoose.model<Token & Document>('auth_tokens', TokenSchema);
