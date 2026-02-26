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

import type { Token } from '@src/databases/auth/types';
// Types
import type { DatabaseResult, ISODateString } from '@src/databases/db-interface';
import { generateId } from '@src/databases/mongodb/methods/mongodb-utils';
// System Logging
import { logger } from '@utils/logger';
import type { Model, QueryFilter } from 'mongoose';
import mongoose, { Schema } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// Define the Token schema
export const TokenSchema = new Schema(
	{
		_id: { type: String, required: true, default: () => generateId() }, // UUID primary key
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
	{
		timestamps: true, // Automatically adds `createdAt` and `updatedAt` fields
		_id: false // Disable Mongoose auto-ObjectId generation
	}
);

// --- Indexes ---
// TTL index: Automatically delete expired tokens (auto-cleanup)
TokenSchema.index({ expires: 1 }, { expireAfterSeconds: 0 });

// Compound indexes for common query patterns (50-80% performance boost)
TokenSchema.index({ user_id: 1, type: 1, expires: 1 }); // User's active tokens by type
TokenSchema.index({ email: 1, type: 1, expires: 1 }); // Email verification/reset queries
TokenSchema.index({ tenantId: 1, type: 1, expires: 1 }); // Multi-tenant token queries
TokenSchema.index({ tenantId: 1, user_id: 1, type: 1 }); // Tenant-specific user tokens
TokenSchema.index({ type: 1, expires: 1, blocked: 1 }); // Active tokens by type (admin queries)

interface TokenDocument extends Omit<mongoose.Document, '_id'>, Omit<Token, '_id'> {
	_id: string;
}

/**
 * TokenAdapter class handles all token-related database operations.
 * This is a partial implementation that will be composed with other adapters.
 */
export class TokenAdapter {
	private readonly TokenModel: Model<TokenDocument>;

	constructor() {
		// Create the Token model
		this.TokenModel = mongoose.models?.auth_tokens || mongoose.model<TokenDocument>('auth_tokens', TokenSchema);
	}

	async createToken(data: {
		user_id: string;
		email: string;
		expires: ISODateString;
		type: string;
		username?: string;
		role?: string;
		tenantId?: string;
	}): Promise<DatabaseResult<string>> {
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
			logger.debug('Token created', {
				user_id: data.user_id,
				type: data.type,
				tenantId: data.tenantId
			});
			return { success: true, data: token };
		} catch (err) {
			const message = `Error in TokenAdapter.createToken: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { user_id: data.user_id, type: data.type });
			return {
				success: false,
				message,
				error: { code: 'TOKEN_CREATION_ERROR', message }
			};
		}
	} // Validate a token

	async validateToken(
		token: string,
		userId?: string,
		type?: string,
		tenantId?: string
	): Promise<DatabaseResult<{ success: boolean; message: string; email?: string }>> {
		try {
			const query: Record<string, unknown> = { token };
			if (userId) {
				query.user_id = userId;
			}
			if (type) {
				query.type = type;
			}
			if (tenantId) {
				query.tenantId = tenantId;
			}

			const tokenDoc = await this.TokenModel.findOne(query).lean();
			if (!tokenDoc) {
				logger.warn('Invalid token', { token });
				return {
					success: true,
					data: { success: false, message: 'Token is invalid' }
				};
			} // Check if token is blocked

			if (tokenDoc.blocked) {
				logger.warn('Blocked token', {
					user_id: tokenDoc.user_id,
					type: tokenDoc.type
				});
				return {
					success: true,
					data: { success: false, message: 'Token is blocked' }
				};
			}

			if (new Date(tokenDoc.expires as unknown as string) > new Date()) {
				logger.debug('Token validated', {
					user_id: tokenDoc.user_id,
					type: tokenDoc.type
				});
				return {
					success: true,
					data: {
						success: true,
						message: 'Token is valid',
						email: tokenDoc.email as string
					}
				};
			}
			logger.warn('Expired token', {
				user_id: tokenDoc.user_id,
				type: tokenDoc.type
			});
			return {
				success: true,
				data: { success: false, message: 'Token is expired' }
			};
		} catch (err) {
			const message = `Error in TokenAdapter.validateToken: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { token, user_id: userId, type });
			return {
				success: false,
				message,
				error: { code: 'TOKEN_VALIDATION_ERROR', message }
			};
		}
	} // Consume a token

	async consumeToken(
		token: string,
		userId?: string,
		type?: string,
		tenantId?: string
	): Promise<DatabaseResult<{ status: boolean; message: string }>> {
		try {
			const query: Record<string, unknown> = { token };
			if (userId) {
				query.user_id = userId;
			}
			if (type) {
				query.type = type;
			}
			if (tenantId) {
				query.tenantId = tenantId;
			}

			const tokenDoc = await this.TokenModel.findOneAndDelete(query as QueryFilter<TokenDocument>).lean();
			if (!tokenDoc) {
				logger.warn('Invalid token consumption attempt', { token });
				return {
					success: true,
					data: { status: false, message: 'Token is invalid' }
				};
			} // Check if token was blocked

			if (tokenDoc.blocked) {
				logger.warn('Blocked token consumption attempt', {
					user_id: tokenDoc.user_id,
					type: tokenDoc.type
				});
				return {
					success: true,
					data: { status: false, message: 'Token is blocked' }
				};
			}

			if (new Date(tokenDoc.expires as unknown as string) > new Date()) {
				logger.debug('Token consumed', {
					user_id: tokenDoc.user_id,
					type: tokenDoc.type
				});
				return {
					success: true,
					data: { status: true, message: 'Token is valid and consumed' }
				};
			}
			logger.warn('Expired token consumed', {
				user_id: tokenDoc.user_id,
				type: tokenDoc.type
			});
			return {
				success: true,
				data: { status: false, message: 'Token is expired' }
			};
		} catch (err) {
			const message = `Error in TokenAdapter.consumeToken: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { token, user_id: userId, type });
			return {
				success: false,
				message,
				error: { code: 'TOKEN_CONSUMPTION_ERROR', message }
			};
		}
	} // Get all tokens

	async getAllTokens(filter?: Record<string, unknown>): Promise<DatabaseResult<Token[]>> {
		try {
			const tokens = await this.TokenModel.find((filter as QueryFilter<TokenDocument>) || {}).lean();
			logger.debug('All tokens retrieved', { count: tokens.length });
			return {
				success: true,
				data: tokens.map((tokenDoc) => this.formatToken(tokenDoc as unknown as Partial<Token>))
			};
		} catch (err) {
			const message = `Error in TokenAdapter.getAllTokens: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { filter });
			return {
				success: false,
				message,
				error: { code: 'TOKEN_RETRIEVAL_ERROR', message }
			};
		}
	} // Delete expired tokens

	async deleteExpiredTokens(): Promise<DatabaseResult<number>> {
		try {
			const result = await this.TokenModel.deleteMany({
				expires: { $lte: new Date().toISOString() }
			} as QueryFilter<TokenDocument>);
			logger.info('Expired tokens deleted', {
				deletedCount: result.deletedCount
			});
			return { success: true, data: result.deletedCount };
		} catch (err) {
			const message = `Error in TokenAdapter.deleteExpiredTokens: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return {
				success: false,
				message,
				error: { code: 'TOKEN_DELETION_ERROR', message }
			};
		}
	} // Delete multiple tokens by token strings

	async deleteTokens(tokenIds: string[], tenantId?: string): Promise<DatabaseResult<{ deletedCount: number }>> {
		try {
			const filter: Record<string, unknown> = { token: { $in: tokenIds } };
			if (tenantId) {
				filter.tenantId = tenantId;
			}
			const result = await this.TokenModel.deleteMany(filter as QueryFilter<TokenDocument>);
			logger.info('Tokens deleted', {
				deletedCount: result.deletedCount,
				token_ids: tokenIds
			});
			return { success: true, data: { deletedCount: result.deletedCount } };
		} catch (err) {
			const message = `Error in TokenAdapter.deleteTokens: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { token_ids: tokenIds });
			return {
				success: false,
				message,
				error: { code: 'TOKEN_DELETION_ERROR', message }
			};
		}
	} // Block multiple tokens (set them as blocked )

	async blockTokens(tokenIds: string[], tenantId?: string): Promise<DatabaseResult<{ modifiedCount: number }>> {
		try {
			const filter: Record<string, unknown> = { token: { $in: tokenIds } };
			if (tenantId) {
				filter.tenantId = tenantId;
			}
			// Set blocked status to true
			const result = await this.TokenModel.updateMany(filter as QueryFilter<TokenDocument>, {
				blocked: true
			});
			logger.info('Tokens blocked', {
				modifiedCount: result.modifiedCount,
				token_ids: tokenIds
			});
			return { success: true, data: { modifiedCount: result.modifiedCount } };
		} catch (err) {
			const message = `Error in TokenAdapter.blockTokens: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { token_ids: tokenIds });
			return {
				success: false,
				message,
				error: { code: 'TOKEN_BLOCK_ERROR', message }
			};
		}
	} // Unblock multiple tokens

	async unblockTokens(tokenIds: string[], tenantId?: string): Promise<DatabaseResult<{ modifiedCount: number }>> {
		try {
			const filter: Record<string, unknown> = { token: { $in: tokenIds } };
			if (tenantId) {
				filter.tenantId = tenantId;
			}
			// Set blocked status to false to unblock
			const result = await this.TokenModel.updateMany(filter as QueryFilter<TokenDocument>, {
				blocked: false
			});
			logger.info('Tokens unblocked', {
				modifiedCount: result.modifiedCount,
				token_ids: tokenIds
			});
			return { success: true, data: { modifiedCount: result.modifiedCount } };
		} catch (err) {
			const message = `Error in TokenAdapter.unblockTokens: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { token_ids: tokenIds });
			return {
				success: false,
				message,
				error: { code: 'TOKEN_UNBLOCK_ERROR', message }
			};
		}
	} // Update a single token

	async updateToken(tokenId: string, tokenData: Partial<Token>, tenantId?: string): Promise<DatabaseResult<Token>> {
		try {
			const filter: Record<string, unknown> = { token: tokenId };
			if (tenantId) {
				filter.tenantId = tenantId;
			}

			const result = await this.TokenModel.findOneAndUpdate(
				filter as QueryFilter<TokenDocument>,
				{ $set: tokenData },
				{ returnDocument: 'after', lean: true }
			);

			if (result) {
				logger.debug('Token updated successfully', { token_id: tokenId });
				return { success: true, data: result as unknown as Token };
			}
			logger.warn('Token not found', { token_id: tokenId });
			return {
				success: false,
				message: 'Token not found',
				error: { code: 'TOKEN_NOT_FOUND', message: 'Token not found' }
			};
		} catch (err) {
			const message = `Error in TokenAdapter.updateToken: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { token_id: tokenId, tokenData });
			return {
				success: false,
				message,
				error: { code: 'TOKEN_UPDATE_ERROR', message }
			};
		}
	} // Get token details by token value

	async getTokenByValue(token: string, tenantId?: string): Promise<DatabaseResult<Token | null>> {
		try {
			const filter: Record<string, unknown> = { token };
			if (tenantId) {
				filter.tenantId = tenantId;
			}
			const tokenDoc = await this.TokenModel.findOne(filter).lean();
			const result = tokenDoc
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
			return { success: true, data: result };
		} catch (err) {
			const message = `Error in TokenAdapter.getTokenByValue: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { token });
			return {
				success: false,
				message,
				error: { code: 'TOKEN_RETRIEVAL_ERROR', message }
			};
		}
	}

	private formatToken(token: Partial<Token> & { _id?: string | mongoose.Types.ObjectId }): Token {
		// Accepts both TokenDocument and plain objects from .lean()
		const { _id, ...tokenData } = token;
		// Remove _id from tokenData if present
		if ('_id' in tokenData) {
			(tokenData as Record<string, unknown>)._id = undefined;
		}
		// Compose the Token object, ensuring id is always a string
		const result = {
			id: _id ? _id.toString() : '',
			...tokenData
		};
		// If you want to ensure type safety, cast to unknown first, then Token
		return result as unknown as Token;
	}
}
