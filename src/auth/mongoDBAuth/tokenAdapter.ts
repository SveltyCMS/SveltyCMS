import mongoose, { Schema, Document, Model } from 'mongoose';

// Types
import type { Token } from '../types';
import type { TokenDBInterface } from '../authDBInterface';

import crypto from 'crypto';

// System Logging
import logger from '@utils/logger';

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

export class TokenAdapter implements TokenDBInterface {
	private TokenModel: Model<Token & Document>;

	constructor() {
		// Create the Token model
		this.TokenModel = mongoose.models.auth_tokens || mongoose.model<Token & Document>('auth_tokens', TokenSchema);
	}

	// Create a new token
	async createToken(data: { user_id: string; email: string; expires: number; type: string }): Promise<string> {
		try {
			const token = crypto.randomBytes(32).toString('hex'); // Generate a secure token string
			const newToken = new this.TokenModel({
				user_id: data.user_id,
				token,
				email: data.email,
				type: data.type,
				expires: new Date(Date.now() + data.expires) // Calculate the expiration time from the current time
			});
			await newToken.save();
			logger.debug(`Token created for user: ${data.user_id}`);
			return token; // Return the newly created token
		} catch (error) {
			logger.error(`Failed to create token: ${(error as Error).message}`);
			throw error;
		}
	}

	// Validate a token
	async validateToken(token: string, user_id: string, type: string): Promise<{ success: boolean; message: string }> {
		try {
			const tokenDoc = await this.TokenModel.findOne({ token, user_id, type });
			if (tokenDoc) {
				if (tokenDoc.expires > new Date()) {
					logger.debug(`Token validated for user: ${user_id}`);
					return { success: true, message: 'Token is valid' };
				} else {
					logger.warn(`Expired token for user: ${user_id}`);
					return { success: false, message: 'Token is expired' };
				}
			} else {
				logger.warn(`Invalid token for user: ${user_id}`);
				return { success: false, message: 'Token is invalid' };
			}
		} catch (error) {
			logger.error(`Failed to validate token: ${(error as Error).message}`);
			throw error;
		}
	}

	// Consume a token
	async consumeToken(token: string, user_id: string, type: string): Promise<{ status: boolean; message: string }> {
		try {
			const tokenDoc = await this.TokenModel.findOneAndDelete({ token, user_id, type });
			if (tokenDoc) {
				if (tokenDoc.expires > new Date()) {
					logger.debug(`Token consumed for user: ${user_id}`);
					return { status: true, message: 'Token is valid and consumed' };
				} else {
					logger.warn(`Expired token consumed for user: ${user_id}`);
					return { status: false, message: 'Token is expired' };
				}
			} else {
				logger.warn(`Invalid token attempted to consume for user: ${user_id}`);
				return { status: false, message: 'Token is invalid' };
			}
		} catch (error) {
			logger.error(`Failed to consume token: ${(error as Error).message}`);
			throw error;
		}
	}

	// Get all tokens
	async getAllTokens(filter?: object): Promise<Token[]> {
		try {
			const tokens = await this.TokenModel.find(filter || {});
			logger.debug('All tokens retrieved');
			return tokens.map((token) => token.toObject() as Token);
		} catch (error) {
			logger.error(`Failed to get all tokens: ${(error as Error).message}`);
			throw error;
		}
	}

	// Delete expired tokens
	async deleteExpiredTokens(): Promise<number> {
		try {
			const result = await this.TokenModel.deleteMany({ expires: { $lte: new Date() } });
			logger.info(`Deleted ${result.deletedCount} expired tokens`);
			return result.deletedCount;
		} catch (error) {
			logger.error(`Failed to delete expired tokens: ${(error as Error).message}`);
			throw error;
		}
	}
}
