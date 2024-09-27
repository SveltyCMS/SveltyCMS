/**
 * @file src/auth/mongoDBAuth/tokenAdapter.ts
 * @description MongoDB adapter for token-related operations.
 *
 * This module provides functionality to:
 * - Create, validate, and consume tokens
 * - Manage token schemas and models
 * - Handle token expiration
 *
 * Features:
 * - Token generation and validation
 * - Token schema definition
 * - Token expiration handling
 * - Integration with MongoDB through Mongoose
 *
 * Usage:
 * Used by the auth system to manage authentication tokens in a MongoDB database
 */

import mongoose, { Schema, Document, Model, type FilterQuery } from 'mongoose';
import crypto from 'crypto';

// Types
import type { Token } from '../types';
import type { authDBInterface } from '../authDBInterface';

// System Logging
import logger from '@utils/logger';

// Define the Token schema
export const TokenSchema = new Schema(
	{
		user_id: { type: String, required: true }, // ID of the user who owns the token, required field
		token: { type: String, required: true }, // Token string, required field
		email: { type: String, required: true }, // Email associated with the token, required field
		expires: { type: Number, required: true }, // Expiry timestamp of the token in seconds, required field
		type: { type: String, required: true } // Type of the token, required field
	},
	{ timestamps: true }
);

// Custom Error class for Token-related errors
class TokenError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'TokenError';
	}
}

export class TokenAdapter implements Partial<authDBInterface> {
	private TokenModel: Model<Token & Document>;

	constructor() {
		// Create the Token model
		this.TokenModel = mongoose.models.auth_tokens || mongoose.model<Token & Document>('auth_tokens', TokenSchema);
	}

	// Helper function for centralized logging
	private log(level: 'info' | 'debug' | 'warn' | 'error', message: string, additionalInfo: any = {}) {
		logger[level](`${message} ${JSON.stringify(additionalInfo)}`);
	}

	// Create a new token
	async createToken(data: { user_id: string; email: string; expires: number; type: string }): Promise<string> {
		try {
			const token = crypto.randomBytes(32).toString('hex');
			const newToken = new this.TokenModel({
				user_id: data.user_id,
				token,
				email: data.email,
				expires: Math.floor(Date.now() / 1000) + data.expires,
				type: data.type
			});
			await newToken.save();
			this.log('debug', 'Token created', { user_id: data.user_id, type: data.type });
			return token;
		} catch (error) {
			this.log('error', 'Failed to create token', { error: (error as Error).message });
			throw new TokenError('Failed to create token');
		}
	}

	// Validate a token
	async validateToken(token: string, user_id?: string, type?: string): Promise<{ success: boolean; message: string; email?: string }> {
		try {
			const query: FilterQuery<Token & Document> = { token };
			if (user_id) query.user_id = user_id;
			if (type) query.type = type;

			const tokenDoc = await this.TokenModel.findOne(query).lean();
			if (tokenDoc) {
				if (tokenDoc.expires > Math.floor(Date.now() / 1000)) {
					// Compare using Unix timestamp in seconds
					this.log('debug', 'Token validated', { user_id: tokenDoc.user_id, type: tokenDoc.type });
					return { success: true, message: 'Token is valid', email: tokenDoc.email };
				} else {
					this.log('warn', 'Expired token', { user_id: tokenDoc.user_id, type: tokenDoc.type });
					return { success: false, message: 'Token is expired' };
				}
			} else {
				this.log('warn', 'Invalid token', { token });
				return { success: false, message: 'Token is invalid' };
			}
		} catch (error) {
			this.log('error', 'Failed to validate token', { error: (error as Error).message });
			throw new TokenError('Failed to validate token');
		}
	}

	// Consume a token
	async consumeToken(token: string, user_id?: string, type?: string): Promise<{ status: boolean; message: string }> {
		try {
			const query: FilterQuery<Token & Document> = { token };
			if (user_id) query.user_id = user_id;
			if (type) query.type = type;

			const tokenDoc = await this.TokenModel.findOneAndDelete(query).lean();

			if (tokenDoc) {
				if (tokenDoc.expires > Math.floor(Date.now() / 1000)) {
					// Compare using Unix timestamp in seconds
					this.log('debug', 'Token consumed', { user_id: tokenDoc.user_id, type: tokenDoc.type });
					return { status: true, message: 'Token is valid and consumed' };
				} else {
					this.log('warn', 'Expired token consumed', { user_id: tokenDoc.user_id, type: tokenDoc.type });
					return { status: false, message: 'Token is expired' };
				}
			} else {
				this.log('warn', 'Invalid token consumption attempt', { token });
				return { status: false, message: 'Token is invalid' };
			}
		} catch (error) {
			this.log('error', 'Failed to consume token', { error: (error as Error).message });
			throw new TokenError('Failed to consume token');
		}
	}

	// Get all tokens
	async getAllTokens(filter?: FilterQuery<Token>): Promise<Token[]> {
		try {
			const tokens = await this.TokenModel.find(filter || {}).lean();
			this.log('debug', 'All tokens retrieved');
			return tokens.map((token) => {
				token._id = token._id.toString();
				return token;
			});
		} catch (error) {
			this.log('error', 'Failed to get all tokens', { error: (error as Error).message });
			throw new TokenError('Failed to get all tokens');
		}
	}

	// Delete expired tokens
	async deleteExpiredTokens(): Promise<number> {
		try {
			const result = await this.TokenModel.deleteMany({ expires: { $lte: Math.floor(Date.now() / 1000) } });
			this.log('info', 'Expired tokens deleted', { deletedCount: result.deletedCount });
			return result.deletedCount;
		} catch (error) {
			this.log('error', 'Failed to delete expired tokens', { error: (error as Error).message });
			throw new TokenError('Failed to delete expired tokens');
		}
	}
}
