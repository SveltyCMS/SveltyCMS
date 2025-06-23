/**
 * @file src/auth/mongoDBAuth/tokenAdapter.ts
 * @description MongoDB adapter for token-related operations.
 *
 * ### Features:
 * - Create, validate, and consume tokens
 * - Manage token schemas and models
 * - Handle token expiration
 * - Token generation and validation
 * - Token schema definition
 * - Token expiration handling
 * - Integration with MongoDB through Mongoose
 */

import mongoose, { Schema } from 'mongoose';
import type { Types, Model } from 'mongoose';

import crypto from 'crypto';
import { error } from '@sveltejs/kit';

// Types
import type { Token } from '../types';
import type { authDBInterface } from '../authDBInterface';

// System Logging
import { logger } from '@utils/logger.svelte';

// Define the Token schema
export const TokenSchema = new Schema(
	{
		user_id: { type: String, required: true }, // ID of the user who owns the token, required field
		token: { type: String, required: true, unique: true }, // Token string, required field
		email: { type: String, required: true }, // Email associated with the token, required field
		expires: { type: Date, required: true }, // Expiry timestamp of the token, required field
		type: { type: String, required: true } // Type of the token, required field
	},
	{ timestamps: true } // Automatically adds `createdAt` and `updatedAt` fields
);

export class TokenAdapter implements Partial<authDBInterface> {
	private TokenModel: Model<Token>;

	constructor() {
		// Create the Token model
		this.TokenModel = mongoose.models?.auth_tokens || mongoose.model<Token>('auth_tokens', TokenSchema);
	}

	async createToken(data: { user_id: string; email: string; expires: Date; type: string }): Promise<string> {
		try {
			const token = crypto.randomBytes(32).toString('base64url'); // Generate a 44-character base64url token
			const newToken = new this.TokenModel({ ...data, token });
			await newToken.save();
			logger.debug('Token created', { user_id: data.user_id, type: data.type });
			return token;
		} catch (err) {
			const message = `Error in TokenAdapter.createToken: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id: data.user_id, type: data.type });
			throw error(500, message);
		}
	}

	// Validate a token
	async validateToken(token: string, user_id?: string, type?: string): Promise<{ success: boolean; message: string; email?: string }> {
		try {
			const query: mongoose.FilterQuery<Token> = { token };
			if (user_id) query.user_id = user_id;
			if (type) query.type = type;

			const tokenDoc = await this.TokenModel.findOne(query).lean();
			if (!tokenDoc) {
				logger.warn('Invalid token', { token });
				return { success: false, message: 'Token is invalid' };
			}

			if (new Date(tokenDoc.expires) > new Date()) {
				logger.debug('Token validated', { user_id: tokenDoc.user_id, type: tokenDoc.type });
				return { success: true, message: 'Token is valid', email: tokenDoc.email };
			} else {
				logger.warn('Expired token', { user_id: tokenDoc.user_id, type: tokenDoc.type });
				return { success: false, message: 'Token is expired' };
			}
		} catch (err) {
			const message = `Error in TokenAdapter.validateToken: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { token, user_id, type });
			throw error(500, message);
		}
	}

	// Consume a token
	async consumeToken(token: string, user_id?: string, type?: string): Promise<{ status: boolean; message: string }> {
		try {
			const query: mongoose.FilterQuery<Token> = { token };
			if (user_id) query.user_id = user_id;
			if (type) query.type = type;

			const tokenDoc = await this.TokenModel.findOneAndDelete(query).lean();
			if (!tokenDoc) {
				logger.warn('Invalid token consumption attempt', { token });
				return { status: false, message: 'Token is invalid' };
			}

			if (new Date(tokenDoc.expires) > new Date()) {
				logger.debug('Token consumed', { user_id: tokenDoc.user_id, type: tokenDoc.type });
				return { status: true, message: 'Token is valid and consumed' };
			} else {
				logger.warn('Expired token consumed', { user_id: tokenDoc.user_id, type: tokenDoc.type });
				return { status: false, message: 'Token is expired' };
			}
		} catch (err) {
			const message = `Error in TokenAdapter.consumeToken: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { token, user_id, type });
			throw error(500, message);
		}
	}

	// Get all tokens
	async getAllTokens(filter?: Record<string, unknown>): Promise<Token[]> {
		try {
			const tokens = await this.TokenModel.find(filter || {}).lean();
			logger.debug('All tokens retrieved', { count: tokens.length });
			return tokens.map(this.formatToken);
		} catch (err) {
			const message = `Error in TokenAdapter.getAllTokens: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { filter });
			throw error(500, message);
		}
	}

	// Delete expired tokens
	async deleteExpiredTokens(): Promise<number> {
		try {
			const result = await this.TokenModel.deleteMany({ expires: { $lte: new Date() } });
			logger.info('Expired tokens deleted', { deletedCount: result.deletedCount });
			return result.deletedCount;
		} catch (err) {
			const message = `Error in TokenAdapter.deleteExpiredTokens: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Delete multiple tokens by token strings
	async deleteTokens(tokens: string[]): Promise<number> {
		try {
			const result = await this.TokenModel.deleteMany({ token: { $in: tokens } });
			logger.info('Tokens deleted', { deletedCount: result.deletedCount, tokens });
			return result.deletedCount;
		} catch (err) {
			const message = `Error in TokenAdapter.deleteTokens: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { tokens });
			throw error(500, message);
		}
	}

	// Block multiple tokens (set them as blocked/expired)
	async blockTokens(tokens: string[]): Promise<number> {
		try {
			// Set tokens to expire immediately to effectively block them
			const result = await this.TokenModel.updateMany(
				{ token: { $in: tokens } },
				{ expires: new Date() }
			);
			logger.info('Tokens blocked', { modifiedCount: result.modifiedCount, tokens });
			return result.modifiedCount;
		} catch (err) {
			const message = `Error in TokenAdapter.blockTokens: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { tokens });
			throw error(500, message);
		}
	}

	// Unblock multiple tokens (extend their expiration)
	async unblockTokens(tokens: string[]): Promise<number> {
		try {
			// Extend expiration by 7 days from now to unblock
			const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
			const result = await this.TokenModel.updateMany(
				{ token: { $in: tokens } },
				{ expires: newExpiry }
			);
			logger.info('Tokens unblocked', { modifiedCount: result.modifiedCount, tokens });
			return result.modifiedCount;
		} catch (err) {
			const message = `Error in TokenAdapter.unblockTokens: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { tokens });
			throw error(500, message);
		}
	}

	// Update a single token
	async updateToken(token: string, updateData: Partial<{ email: string; role: string; expiresInHours: number; user_id: string }>): Promise<boolean> {
		try {
			const updateFields: Record<string, unknown> = {};

			if (updateData.email) updateFields.email = updateData.email;
			if (updateData.user_id) updateFields.user_id = updateData.user_id;
			if (updateData.role) updateFields.type = updateData.role; // role maps to type in the schema
			if (updateData.expiresInHours) {
				updateFields.expires = new Date(Date.now() + updateData.expiresInHours * 60 * 60 * 1000);
			}

			const result = await this.TokenModel.updateOne(
				{ token },
				{ $set: updateFields }
			);

			if (result.matchedCount === 0) {
				logger.warn('Token not found for update', { token });
				throw error(404, 'Token not found');
			}

			logger.info('Token updated', { token, modifiedCount: result.modifiedCount, updateData });
			return result.modifiedCount > 0;
		} catch (err) {
			const message = `Error in TokenAdapter.updateToken: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { token, updateData });
			throw error(500, message);
		}
	}

	// Get token data
	async getTokenData(token: string, user_id?: string, type?: string): Promise<Token | null> {
		try {
			const query: mongoose.FilterQuery<Token> = { token };
			if (user_id) query.user_id = user_id;
			if (type) query.type = type;

			const tokenDoc = await this.TokenModel.findOne(query).lean();
			if (!tokenDoc) {
				logger.debug('Token not found', { token, user_id, type });
				return null;
			}

			if (new Date(tokenDoc.expires) <= new Date()) {
				logger.debug('Token is expired', { token, user_id, type });
				return null;
			}

			return this.formatToken(tokenDoc);
		} catch (err) {
			const message = `Error in TokenAdapter.getTokenData: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { token, user_id, type });
			throw error(500, message);
		}
	}

	private formatToken(token: { _id: Types.ObjectId; user_id: string; token: string; email: string; expires: Date; type: string }): Token {
		return {
			...token,
			_id: token._id.toString(),
			expires: token.expires.toISOString()
		};
	}
}
