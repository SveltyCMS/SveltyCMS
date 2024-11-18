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
import mongoose, { Schema } from 'mongoose';
import type { Document } from 'mongoose';

import crypto from 'crypto';
import { error } from '@sveltejs/kit';

// Types
import type { Token } from '../types';
import type { authDBInterface } from '../authDBInterface';

// System Logging
import { logger } from '@utils/logger';

// Define the Token schema
export const TokenSchema = new Schema(
	{
		user_id: { type: String, required: true }, // ID of the user who owns the token, required field
		token: { type: String, required: true }, // Token string, required field
		email: { type: String, required: true }, // Email associated with the token, required field
		expires: { type: Date, required: true }, // Expiry timestamp of the token, required field
		type: { type: String, required: true } // Type of the token, required field
	},
	{ timestamps: true } // Automatically adds `createdAt` and `updatedAt` fields
);

export class TokenAdapter implements Partial<authDBInterface> {
	private TokenModel: mongoose.Model<Token & Document>;

	constructor() {
		// Create the Token model
		this.TokenModel = mongoose.models?.auth_tokens || mongoose.model<Token & Document>('auth_tokens', TokenSchema);
	}

	// Helper function for centralized logging
	private log(level: 'info' | 'debug' | 'warn' | 'error', message: string, additionalInfo: Record<string, unknown> = {}): void {
		logger[level](`${message} ${JSON.stringify(additionalInfo)}`);
	}

	async createToken(data: { user_id: string; email: string; expires: Date; type: string }): Promise<string> {
		try {
			const token = crypto.randomBytes(32).toString('hex');
			const newToken = new this.TokenModel({ ...data, token });
			await newToken.save();
			this.log('debug', 'Token created', { user_id: data.user_id, type: data.type });
			return token;
		} catch (err) {
			const message = `Error in TokenAdapter.createToken: ${err instanceof Error ? err.message : String(err)}`;
			this.log('error', message, { user_id: data.user_id, type: data.type });
			throw error(500, message);
		}
	}

	// Validate a token
	async validateToken(token: string, user_id?: string, type?: string): Promise<{ success: boolean; message: string; email?: string }> {
		try {
			const query: mongoose.FilterQuery<Token & Document> = { token };
			if (user_id) query.user_id = user_id;
			if (type) query.type = type;

			const tokenDoc = await this.TokenModel.findOne(query).lean();
			if (!tokenDoc) {
				this.log('warn', 'Invalid token', { token });
				return { success: false, message: 'Token is invalid' };
			}

			if (new Date(tokenDoc.expires) > new Date()) {
				this.log('debug', 'Token validated', { user_id: tokenDoc.user_id, type: tokenDoc.type });
				return { success: true, message: 'Token is valid', email: tokenDoc.email };
			} else {
				this.log('warn', 'Expired token', { user_id: tokenDoc.user_id, type: tokenDoc.type });
				return { success: false, message: 'Token is expired' };
			}
		} catch (err) {
			const message = `Error in TokenAdapter.validateToken: ${err instanceof Error ? err.message : String(err)}`;
			this.log('error', message, { token, user_id, type });
			throw error(500, message);
		}
	}

	// Consume a token
	async consumeToken(token: string, user_id?: string, type?: string): Promise<{ status: boolean; message: string }> {
		try {
			const query: mongoose.FilterQuery<Token & Document> = { token };
			if (user_id) query.user_id = user_id;
			if (type) query.type = type;

			const tokenDoc = await this.TokenModel.findOneAndDelete(query).lean();
			if (!tokenDoc) {
				this.log('warn', 'Invalid token consumption attempt', { token });
				return { status: false, message: 'Token is invalid' };
			}

			if (new Date(tokenDoc.expires) > new Date()) {
				this.log('debug', 'Token consumed', { user_id: tokenDoc.user_id, type: tokenDoc.type });
				return { status: true, message: 'Token is valid and consumed' };
			} else {
				this.log('warn', 'Expired token consumed', { user_id: tokenDoc.user_id, type: tokenDoc.type });
				return { status: false, message: 'Token is expired' };
			}
		} catch (err) {
			const message = `Error in TokenAdapter.consumeToken: ${err instanceof Error ? err.message : String(err)}`;
			this.log('error', message, { token, user_id, type });
			throw error(500, message);
		}
	}

	// Get all tokens
	async getAllTokens(filter?: Record<string, unknown>): Promise<Token[]> {
		try {
			const tokens = await this.TokenModel.find(filter || {}).lean();
			this.log('debug', 'All tokens retrieved', { count: tokens.length });
			return tokens.map(this.formatToken);
		} catch (err) {
			const message = `Error in TokenAdapter.getAllTokens: ${err instanceof Error ? err.message : String(err)}`;
			this.log('error', message, { filter });
			throw error(500, message);
		}
	}

	// Delete expired tokens
	async deleteExpiredTokens(): Promise<number> {
		try {
			const result = await this.TokenModel.deleteMany({ expires: { $lte: new Date() } });
			this.log('info', 'Expired tokens deleted', { deletedCount: result.deletedCount });
			return result.deletedCount;
		} catch (err) {
			const message = `Error in TokenAdapter.deleteExpiredTokens: ${err instanceof Error ? err.message : String(err)}`;
			this.log('error', message);
			throw error(500, message);
		}
	}

	private formatToken(token: any): Token {
		return {
			...token,
			_id: token._id.toString(),
			expires: token.expires.toISOString()
		};
	}
}
