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
import type { Model, Document } from 'mongoose';

import { v4 as uuidv4 } from 'uuid';
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
		tenantId: { type: String, index: true }, // Tenant identifier for multi-tenancy
		token: { type: String, required: true, unique: true }, // Token string, required field
		email: { type: String, required: true }, // Email associated with the token, required field
		expires: { type: Date, required: true }, // Expiry timestamp of the token, required field
		type: { type: String, required: true }, // Type of the token, required field
		username: { type: String, required: false }, // Username associated with the token
		role: { type: String, required: false }, // Role associated with the token
		blocked: { type: Boolean, required: false, default: false } // Whether the token is blocked
	},
	{ timestamps: true } // Automatically adds `createdAt` and `updatedAt` fields
);

interface TokenDocument extends Token, Document {}

export class TokenAdapter implements Partial<authDBInterface> {
	private TokenModel: Model<TokenDocument>;

	constructor() {
		// Create the Token model
		this.TokenModel = mongoose.models?.auth_tokens || mongoose.model<TokenDocument>('auth_tokens', TokenSchema);
	}

	async createToken(data: {
		user_id: string;
		email: string;
		expires: Date;
		type: string;
		username?: string;
		role?: string;
		tenantId?: string;
	}): Promise<string> {
		try {
			// Use uuidv4 for token generation - much simpler and safer
			const token = uuidv4().replace(/-/g, ''); // Remove hyphens for a cleaner 32-character token
			const newToken = new this.TokenModel({
				user_id: data.user_id,
				tenantId: data.tenantId,
				email: data.email.toLowerCase(), // Normalize email to lowercase
				expires: data.expires,
				type: data.type,
				username: data.username,
				role: data.role,
				token
			});
			await newToken.save();
			logger.debug('Token created', { user_id: data.user_id, type: data.type, tenantId: data.tenantId });
			return token;
		} catch (err) {
			const message = `Error in TokenAdapter.createToken: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id: data.user_id, type: data.type });
			throw error(500, message);
		}
	} // Validate a token

	async validateToken(
		token: string,
		user_id?: string,
		type?: string,
		tenantId?: string
	): Promise<{ success: boolean; message: string; email?: string }> {
		try {
			const query: mongoose.FilterQuery<Token> = { token };
			if (user_id) query.user_id = user_id;
			if (type) query.type = type;
			if (tenantId) query.tenantId = tenantId;

			const tokenDoc = await this.TokenModel.findOne(query).lean();
			if (!tokenDoc) {
				logger.warn('Invalid token', { token });
				return { success: false, message: 'Token is invalid' };
			} // Check if token is blocked

			if (tokenDoc.blocked) {
				logger.warn('Blocked token', { user_id: tokenDoc.user_id, type: tokenDoc.type });
				return { success: false, message: 'Token is blocked' };
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
	} // Consume a token

	async consumeToken(token: string, user_id?: string, type?: string, tenantId?: string): Promise<{ status: boolean; message: string }> {
		try {
			const query: mongoose.FilterQuery<Token> = { token };
			if (user_id) query.user_id = user_id;
			if (type) query.type = type;
			if (tenantId) query.tenantId = tenantId;

			const tokenDoc = await this.TokenModel.findOneAndDelete(query).lean();
			if (!tokenDoc) {
				logger.warn('Invalid token consumption attempt', { token });
				return { status: false, message: 'Token is invalid' };
			} // Check if token was blocked

			if (tokenDoc.blocked) {
				logger.warn('Blocked token consumption attempt', { user_id: tokenDoc.user_id, type: tokenDoc.type });
				return { status: false, message: 'Token is blocked' };
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
	} // Get all tokens

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
	} // Delete expired tokens

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
	} // Delete multiple tokens by token strings

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
	} // Block multiple tokens (set them as blocked )

	async blockTokens(tokens: string[]): Promise<number> {
		try {
			// Set blocked status to true
			const result = await this.TokenModel.updateMany({ token: { $in: tokens } }, { blocked: true });
			logger.info('Tokens blocked', { modifiedCount: result.modifiedCount, tokens });
			return result.modifiedCount;
		} catch (err) {
			const message = `Error in TokenAdapter.blockTokens: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { tokens });
			throw error(500, message);
		}
	} // Unblock multiple tokens

	async unblockTokens(tokens: string[]): Promise<number> {
		try {
			// Set blocked status to false to unblock
			const result = await this.TokenModel.updateMany({ token: { $in: tokens } }, { blocked: false });
			logger.info('Tokens unblocked', { modifiedCount: result.modifiedCount, tokens });
			return result.modifiedCount;
		} catch (err) {
			const message = `Error in TokenAdapter.unblockTokens: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { tokens });
			throw error(500, message);
		}
	} // Update a single token

	async updateToken(
		token: string,
		updateData: Partial<{ email: string; role: string; expiresInHours: number; user_id: string; username: string }>
	): Promise<boolean> {
		try {
			const updateFields: Record<string, unknown> = {};

			if (updateData.email) updateFields.email = updateData.email;
			if (updateData.username) updateFields.username = updateData.username;
			if (updateData.role) updateFields.role = updateData.role;
			if (updateData.expiresInHours) {
				updateFields.expires = new Date(Date.now() + updateData.expiresInHours * 60 * 60 * 1000);
			}

			const result = await this.TokenModel.updateOne({ token }, { $set: updateFields });

			if (result.modifiedCount > 0) {
				logger.debug('Token updated successfully', { token });
				return true;
			} else {
				logger.warn('Token not found or not modified', { token });
				return false;
			}
		} catch (err) {
			const message = `Error in TokenAdapter.updateToken: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { token, updateData });
			throw error(500, message);
		}
	} // Get token details by token value

	async getTokenByValue(token: string): Promise<Token | null> {
		try {
			const tokenDoc = await this.TokenModel.findOne({ token }).lean();
			return tokenDoc
				? {
						_id: tokenDoc._id.toString(),
						user_id: tokenDoc.user_id,
						token: tokenDoc.token,
						email: tokenDoc.email,
						expires: tokenDoc.expires,
						type: tokenDoc.type,
						blocked: tokenDoc.blocked,
						username: tokenDoc.username,
						role: tokenDoc.role,
						createdAt: tokenDoc.createdAt,
						updatedAt: tokenDoc.updatedAt
					}
				: null;
		} catch (err) {
			const message = `Error in TokenAdapter.getTokenByValue: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { token });
			throw error(500, message);
		}
	}

	private formatToken(token: TokenDocument): Token {
		const tokenObject = token.toObject ? token.toObject() : token;
		const { _id, ...tokenData } = tokenObject;
		return {
			id: _id.toString(),
			...tokenData
		} as Token;
	}
}
