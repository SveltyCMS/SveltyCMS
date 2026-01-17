import mongoose, { Schema } from 'mongoose';
import { v4 } from 'uuid';
import { logger } from './logger.js';
import { g as generateId } from './mongoDBUtils.js';
const TokenSchema = new Schema(
	{
		_id: { type: String, required: true, default: () => generateId() },
		// UUID primary key
		user_id: { type: String, required: true },
		// ID of the user who owns the token, required field
		tenantId: { type: String, index: true },
		// Tenant identifier for multi-tenancy
		token: { type: String, required: true, unique: true },
		// Token string, required field
		email: { type: String, required: true },
		// Email associated with the token, required field
		expires: { type: Date, required: true },
		// Expiry timestamp of the token, required field
		type: { type: String, required: true },
		// Type of the token, required field
		username: { type: String, required: false },
		// Username associated with the token
		role: { type: String, required: false },
		// Role associated with the token
		blocked: { type: Boolean, required: false, default: false }
		// Whether the token is blocked
	},
	{
		timestamps: true,
		// Automatically adds `createdAt` and `updatedAt` fields
		_id: false
		// Disable Mongoose auto-ObjectId generation
	}
);
TokenSchema.index({ expires: 1 }, { expireAfterSeconds: 0 });
TokenSchema.index({ user_id: 1, type: 1, expires: 1 });
TokenSchema.index({ email: 1, type: 1, expires: 1 });
TokenSchema.index({ tenantId: 1, type: 1, expires: 1 });
TokenSchema.index({ tenantId: 1, user_id: 1, type: 1 });
TokenSchema.index({ type: 1, expires: 1, blocked: 1 });
class TokenAdapter {
	TokenModel;
	constructor() {
		if (mongoose.models.auth_tokens) {
			delete mongoose.models.auth_tokens;
		}
		this.TokenModel = mongoose.models?.auth_tokens || mongoose.model('auth_tokens', TokenSchema);
	}
	async createToken(data) {
		try {
			const token = v4().replace(/-/g, '');
			const newToken = new this.TokenModel({
				user_id: data.user_id,
				tenantId: data.tenantId,
				email: data.email.toLowerCase(),
				// Normalize email to lowercase
				expires: data.expires,
				type: data.type,
				username: data.username,
				role: data.role,
				token
			});
			await newToken.save();
			logger.debug('Token created', { user_id: data.user_id, type: data.type, tenantId: data.tenantId });
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
	}
	// Validate a token
	async validateToken(token, user_id, type, tenantId) {
		try {
			const query = { token };
			if (user_id) query.user_id = user_id;
			if (type) query.type = type;
			if (tenantId) query.tenantId = tenantId;
			const tokenDoc = await this.TokenModel.findOne(query).lean();
			if (!tokenDoc) {
				logger.warn('Invalid token', { token });
				return { success: true, data: { success: false, message: 'Token is invalid' } };
			}
			if (tokenDoc.blocked) {
				logger.warn('Blocked token', { user_id: tokenDoc.user_id, type: tokenDoc.type });
				return { success: true, data: { success: false, message: 'Token is blocked' } };
			}
			if (new Date(tokenDoc.expires) > /* @__PURE__ */ new Date()) {
				logger.debug('Token validated', { user_id: tokenDoc.user_id, type: tokenDoc.type });
				return { success: true, data: { success: true, message: 'Token is valid', email: tokenDoc.email } };
			} else {
				logger.warn('Expired token', { user_id: tokenDoc.user_id, type: tokenDoc.type });
				return { success: true, data: { success: false, message: 'Token is expired' } };
			}
		} catch (err) {
			const message = `Error in TokenAdapter.validateToken: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { token, user_id, type });
			return {
				success: false,
				message,
				error: { code: 'TOKEN_VALIDATION_ERROR', message }
			};
		}
	}
	// Consume a token
	async consumeToken(token, user_id, type, tenantId) {
		try {
			const query = { token };
			if (user_id) query.user_id = user_id;
			if (type) query.type = type;
			if (tenantId) query.tenantId = tenantId;
			const tokenDoc = await this.TokenModel.findOneAndDelete(query).lean();
			if (!tokenDoc) {
				logger.warn('Invalid token consumption attempt', { token });
				return { success: true, data: { status: false, message: 'Token is invalid' } };
			}
			if (tokenDoc.blocked) {
				logger.warn('Blocked token consumption attempt', { user_id: tokenDoc.user_id, type: tokenDoc.type });
				return { success: true, data: { status: false, message: 'Token is blocked' } };
			}
			if (new Date(tokenDoc.expires) > /* @__PURE__ */ new Date()) {
				logger.debug('Token consumed', { user_id: tokenDoc.user_id, type: tokenDoc.type });
				return { success: true, data: { status: true, message: 'Token is valid and consumed' } };
			} else {
				logger.warn('Expired token consumed', { user_id: tokenDoc.user_id, type: tokenDoc.type });
				return { success: true, data: { status: false, message: 'Token is expired' } };
			}
		} catch (err) {
			const message = `Error in TokenAdapter.consumeToken: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { token, user_id, type });
			return {
				success: false,
				message,
				error: { code: 'TOKEN_CONSUMPTION_ERROR', message }
			};
		}
	}
	// Get all tokens
	async getAllTokens(filter) {
		try {
			const tokens = await this.TokenModel.find(filter || {}).lean();
			logger.debug('All tokens retrieved', { count: tokens.length });
			return {
				success: true,
				data: tokens.map((tokenDoc) => this.formatToken(tokenDoc))
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
	}
	// Delete expired tokens
	async deleteExpiredTokens() {
		try {
			const result = await this.TokenModel.deleteMany({ expires: { $lte: /* @__PURE__ */ new Date().toISOString() } });
			logger.info('Expired tokens deleted', { deletedCount: result.deletedCount });
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
	}
	// Delete multiple tokens by token strings
	async deleteTokens(token_ids, tenantId) {
		try {
			const filter = { token: { $in: token_ids } };
			if (tenantId) {
				filter.tenantId = tenantId;
			}
			const result = await this.TokenModel.deleteMany(filter);
			logger.info('Tokens deleted', { deletedCount: result.deletedCount, token_ids });
			return { success: true, data: { deletedCount: result.deletedCount } };
		} catch (err) {
			const message = `Error in TokenAdapter.deleteTokens: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { token_ids });
			return {
				success: false,
				message,
				error: { code: 'TOKEN_DELETION_ERROR', message }
			};
		}
	}
	// Block multiple tokens (set them as blocked )
	async blockTokens(token_ids, tenantId) {
		try {
			const filter = { token: { $in: token_ids } };
			if (tenantId) {
				filter.tenantId = tenantId;
			}
			const result = await this.TokenModel.updateMany(filter, { blocked: true });
			logger.info('Tokens blocked', { modifiedCount: result.modifiedCount, token_ids });
			return { success: true, data: { modifiedCount: result.modifiedCount } };
		} catch (err) {
			const message = `Error in TokenAdapter.blockTokens: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { token_ids });
			return {
				success: false,
				message,
				error: { code: 'TOKEN_BLOCK_ERROR', message }
			};
		}
	}
	// Unblock multiple tokens
	async unblockTokens(token_ids, tenantId) {
		try {
			const filter = { token: { $in: token_ids } };
			if (tenantId) {
				filter.tenantId = tenantId;
			}
			const result = await this.TokenModel.updateMany(filter, { blocked: false });
			logger.info('Tokens unblocked', { modifiedCount: result.modifiedCount, token_ids });
			return { success: true, data: { modifiedCount: result.modifiedCount } };
		} catch (err) {
			const message = `Error in TokenAdapter.unblockTokens: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { token_ids });
			return {
				success: false,
				message,
				error: { code: 'TOKEN_UNBLOCK_ERROR', message }
			};
		}
	}
	// Update a single token
	async updateToken(token_id, tokenData, tenantId) {
		try {
			const filter = { token: token_id };
			if (tenantId) {
				filter.tenantId = tenantId;
			}
			const result = await this.TokenModel.findOneAndUpdate(filter, { $set: tokenData }, { new: true, lean: true });
			if (result) {
				logger.debug('Token updated successfully', { token_id });
				return { success: true, data: result };
			} else {
				logger.warn('Token not found', { token_id });
				return {
					success: false,
					message: 'Token not found',
					error: { code: 'TOKEN_NOT_FOUND', message: 'Token not found' }
				};
			}
		} catch (err) {
			const message = `Error in TokenAdapter.updateToken: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { token_id, tokenData });
			return {
				success: false,
				message,
				error: { code: 'TOKEN_UPDATE_ERROR', message }
			};
		}
	}
	// Get token details by token value
	async getTokenByValue(token, tenantId) {
		try {
			const filter = { token };
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
	formatToken(token) {
		const { _id, ...tokenData } = token;
		if ('_id' in tokenData) {
			delete tokenData._id;
		}
		const result = {
			id: _id ? _id.toString() : '',
			...tokenData
		};
		return result;
	}
}
export { TokenAdapter, TokenSchema };
//# sourceMappingURL=authToken.js.map
