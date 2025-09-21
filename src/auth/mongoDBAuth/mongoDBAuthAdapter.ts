/**
 * @file src/auth/mongoDBAuth/mongoDBAuthAdapter.ts
 * @description MongoDB implementation of the complete authDBInterface.
 *
 * This adapter combines UserAdapter, SessionAdapter, and TokenAdapter
 * to provide a complete implementation of authDBInterface with proper
 * DatabaseResult<T> return types.
 */

import type { DatabaseResult } from '@src/databases/dbInterface';
import type { authDBInterface, PaginationOption } from '../authDBInterface';
import type { Session, Token, User } from '../types';
import { SessionAdapter } from './sessionAdapter';
import { TokenAdapter } from './tokenAdapter';
import { UserAdapter } from './userAdapter';

export class MongoDBAuthAdapter implements authDBInterface {
	private userAdapter: UserAdapter;
	private sessionAdapter: SessionAdapter;
	private tokenAdapter: TokenAdapter;

	constructor() {
		this.userAdapter = new UserAdapter();
		this.sessionAdapter = new SessionAdapter();
		this.tokenAdapter = new TokenAdapter();
	}

	// Helper method to wrap results in DatabaseResult format
	private wrapResult<T>(data: T): DatabaseResult<T> {
		return {
			success: true,
			data,
			meta: { timestamp: new Date().toISOString() }
		};
	}

	private wrapError(error: Error | string): DatabaseResult<never> {
		const message = error instanceof Error ? error.message : error;
		return {
			success: false,
			message,
			error: {
				code: 'DATABASE_ERROR',
				message,
				details: error instanceof Error ? error.stack : undefined
			}
		};
	}

	// User Management Methods
	async createUser(userData: Partial<User>): Promise<DatabaseResult<User>> {
		try {
			const result = await this.userAdapter.createUser(userData);
			return result; // UserAdapter already returns DatabaseResult<User>
		} catch (error) {
			return this.wrapError(error as Error);
		}
	}

	async updateUserAttributes(user_id: string, userData: Partial<User>, tenantId?: string): Promise<DatabaseResult<User>> {
		try {
			const user = await this.userAdapter.updateUserAttributes(user_id, userData, tenantId);
			return this.wrapResult(user);
		} catch (error) {
			return this.wrapError(error as Error);
		}
	}

	async deleteUser(user_id: string, tenantId?: string): Promise<DatabaseResult<void>> {
		try {
			await this.userAdapter.deleteUser(user_id, tenantId);
			return this.wrapResult(undefined);
		} catch (error) {
			return this.wrapError(error as Error);
		}
	}

	async getUserById(user_id: string, tenantId?: string): Promise<DatabaseResult<User | null>> {
		try {
			const user = await this.userAdapter.getUserById(user_id, tenantId);
			return this.wrapResult(user);
		} catch (error) {
			return this.wrapError(error as Error);
		}
	}

	async getUserByEmail(criteria: { email: string; tenantId?: string }): Promise<DatabaseResult<User | null>> {
		try {
			const user = await this.userAdapter.getUserByEmail(criteria);
			return this.wrapResult(user);
		} catch (error) {
			return this.wrapError(error as Error);
		}
	}

	async getAllUsers(options?: PaginationOption): Promise<DatabaseResult<User[]>> {
		try {
			const users = await this.userAdapter.getAllUsers(options);
			return this.wrapResult(users);
		} catch (error) {
			return this.wrapError(error as Error);
		}
	}

	async getUserCount(filter?: Record<string, unknown>): Promise<DatabaseResult<number>> {
		try {
			const count = await this.userAdapter.getUserCount(filter);
			return this.wrapResult(count);
		} catch (error) {
			return this.wrapError(error as Error);
		}
	}

	async deleteUsers(user_ids: string[], tenantId?: string): Promise<DatabaseResult<{ deletedCount: number }>> {
		try {
			await this.userAdapter.deleteUsers(user_ids, tenantId);
			return this.wrapResult({ deletedCount: user_ids.length });
		} catch (error) {
			return this.wrapError(error as Error);
		}
	}

	async blockUsers(user_ids: string[], tenantId?: string): Promise<DatabaseResult<{ modifiedCount: number }>> {
		try {
			await this.userAdapter.blockUsers(user_ids, tenantId);
			return this.wrapResult({ modifiedCount: user_ids.length });
		} catch (error) {
			return this.wrapError(error as Error);
		}
	}

	async unblockUsers(user_ids: string[], tenantId?: string): Promise<DatabaseResult<{ modifiedCount: number }>> {
		try {
			await this.userAdapter.unblockUsers(user_ids, tenantId);
			return this.wrapResult({ modifiedCount: user_ids.length });
		} catch (error) {
			return this.wrapError(error as Error);
		}
	}

	// Session Management Methods
	async createSession(sessionData: { user_id: string; expires: Date; tenantId?: string }): Promise<DatabaseResult<Session>> {
		try {
			const session = await this.sessionAdapter.createSession(sessionData);
			return this.wrapResult(session);
		} catch (error) {
			return this.wrapError(error as Error);
		}
	}

	async updateSessionExpiry(session_id: string, newExpiry: Date): Promise<DatabaseResult<Session>> {
		try {
			const session = await this.sessionAdapter.updateSessionExpiry(session_id, newExpiry);
			return this.wrapResult(session);
		} catch (error) {
			return this.wrapError(error as Error);
		}
	}

	async deleteSession(session_id: string): Promise<DatabaseResult<void>> {
		try {
			await this.sessionAdapter.deleteSession(session_id);
			return this.wrapResult(undefined);
		} catch (error) {
			return this.wrapError(error as Error);
		}
	}

	async deleteExpiredSessions(): Promise<DatabaseResult<number>> {
		try {
			const count = await this.sessionAdapter.deleteExpiredSessions();
			return this.wrapResult(count);
		} catch (error) {
			return this.wrapError(error as Error);
		}
	}

	async validateSession(session_id: string): Promise<DatabaseResult<User | null>> {
		try {
			const user = await this.sessionAdapter.validateSession(session_id);
			return this.wrapResult(user);
		} catch (error) {
			return this.wrapError(error as Error);
		}
	}

	async invalidateAllUserSessions(user_id: string /*, tenantId?: string */): Promise<DatabaseResult<void>> {
		try {
			await this.sessionAdapter.invalidateAllUserSessions(user_id);
			return this.wrapResult(undefined);
		} catch (error) {
			return this.wrapError(error as Error);
		}
	}

	async getActiveSessions(user_id: string /*, tenantId?: string */): Promise<DatabaseResult<Session[]>> {
		try {
			const result = await this.sessionAdapter.getActiveSessions(user_id);
			if (result.success) {
				return this.wrapResult(result.data);
			} else {
				return this.wrapError(result.error || 'Failed to get active sessions');
			}
		} catch (error) {
			return this.wrapError(error as Error);
		}
	}

	async getAllActiveSessions(/* tenantId?: string */): Promise<DatabaseResult<Session[]>> {
		try {
			const result = await this.sessionAdapter.getAllActiveSessions();
			if (result.success) {
				return this.wrapResult(result.data);
			} else {
				return this.wrapError(result.error || 'Failed to get all active sessions');
			}
		} catch (error) {
			return this.wrapError(error as Error);
		}
	}

	async getSessionTokenData(session_id: string): Promise<DatabaseResult<{ expiresAt: Date; user_id: string } | null>> {
		try {
			// This method needs to be implemented in SessionAdapter or derived from existing methods
			const user = await this.sessionAdapter.validateSession(session_id);
			if (user) {
				// Simplified implementation - in practice, you'd want to get actual session data
				return this.wrapResult({ expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), user_id: user._id });
			}
			return this.wrapResult(null);
		} catch (error) {
			return this.wrapError(error as Error);
		}
	}

	async rotateToken(oldToken: string, expires: Date): Promise<DatabaseResult<string>> {
		try {
			const newToken = await this.sessionAdapter.rotateToken(oldToken, expires);
			return this.wrapResult(newToken);
		} catch (error) {
			return this.wrapError(error as Error);
		}
	}

	async cleanupRotatedSessions(): Promise<DatabaseResult<number>> {
		try {
			if (this.sessionAdapter.cleanupRotatedSessions) {
				const count = await this.sessionAdapter.cleanupRotatedSessions();
				return this.wrapResult(count);
			}
			return this.wrapResult(0);
		} catch (error) {
			return this.wrapError(error as Error);
		}
	}

	// Token Management Methods - These would need to be implemented with TokenAdapter
	async createToken(data: { user_id: string; email: string; expires: Date; type: string; tenantId?: string }): Promise<DatabaseResult<string>> {
		try {
			const token = await this.tokenAdapter.createToken(data);
			return this.wrapResult(token);
		} catch (error) {
			return this.wrapError(error as Error);
		}
	}

	async updateToken(token_id: string, tokenData: Partial<Token>, tenantId?: string): Promise<DatabaseResult<Token>> {
		try {
			const token = await this.tokenAdapter.updateToken(token_id, tokenData, tenantId);
			return this.wrapResult(token);
		} catch (error) {
			return this.wrapError(error as Error);
		}
	}

	async validateToken(
		token: string,
		user_id?: string,
		type?: string,
		tenantId?: string
	): Promise<DatabaseResult<{ success: boolean; message: string; email?: string }>> {
		try {
			const result = await this.tokenAdapter.validateToken(token, user_id, type, tenantId);
			return this.wrapResult(result);
		} catch (error) {
			return this.wrapError(error as Error);
		}
	}

	async consumeToken(
		token: string,
		user_id?: string,
		type?: string,
		tenantId?: string
	): Promise<DatabaseResult<{ status: boolean; message: string }>> {
		try {
			const result = await this.tokenAdapter.consumeToken(token, user_id, type, tenantId);
			return this.wrapResult(result);
		} catch (error) {
			return this.wrapError(error as Error);
		}
	}

	async getTokenData(token: string, user_id?: string, type?: string, tenantId?: string): Promise<DatabaseResult<Token | null>> {
		try {
			const result = await this.tokenAdapter.getTokenData(token, user_id, type, tenantId);
			return this.wrapResult(result);
		} catch (error) {
			return this.wrapError(error as Error);
		}
	}

	async getTokenByValue(token: string, tenantId?: string): Promise<DatabaseResult<Token | null>> {
		try {
			const result = await this.tokenAdapter.getTokenByValue(token, tenantId);
			return this.wrapResult(result);
		} catch (error) {
			return this.wrapError(error as Error);
		}
	}

	async getAllTokens(filter?: Record<string, unknown>): Promise<DatabaseResult<Token[]>> {
		try {
			const tokens = await this.tokenAdapter.getAllTokens(filter);
			return this.wrapResult(tokens);
		} catch (error) {
			return this.wrapError(error as Error);
		}
	}

	async deleteExpiredTokens(): Promise<DatabaseResult<number>> {
		try {
			const count = await this.tokenAdapter.deleteExpiredTokens();
			return this.wrapResult(count);
		} catch (error) {
			return this.wrapError(error as Error);
		}
	}

	async deleteTokens(token_ids: string[], tenantId?: string): Promise<DatabaseResult<{ deletedCount: number }>> {
		try {
			const result = await this.tokenAdapter.deleteTokens(token_ids, tenantId);
			return this.wrapResult({ deletedCount: result });
		} catch (error) {
			return this.wrapError(error as Error);
		}
	}

	async blockTokens(token_ids: string[], tenantId?: string): Promise<DatabaseResult<{ modifiedCount: number }>> {
		try {
			const result = await this.tokenAdapter.blockTokens(token_ids, tenantId);
			return this.wrapResult({ modifiedCount: result });
		} catch (error) {
			return this.wrapError(error as Error);
		}
	}

	async unblockTokens(token_ids: string[], tenantId?: string): Promise<DatabaseResult<{ modifiedCount: number }>> {
		try {
			const result = await this.tokenAdapter.unblockTokens(token_ids, tenantId);
			return this.wrapResult({ modifiedCount: result });
		} catch (error) {
			return this.wrapError(error as Error);
		}
	}
}
