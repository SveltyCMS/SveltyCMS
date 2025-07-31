/**
 * @file src/auth/authDBInterface.ts
 * @description Interface definition for basic CRUD operations in an authentication system.
 *
 * This module defines the essential CRUD operations for database adapters:
 * - User management
 * - Session management
 * - Token management
 *
 * All relevant methods now include an optional `tenantId` to support multi-tenancy.
 */

import type { User, Session, Token } from './types';
import type { DatabaseResult } from '@src/databases/dbInterface';

// Pagination and Sorting Options Types
type SortOption = { [key: string]: 'asc' | 'desc' } | [string, 'asc' | 'desc'][];
export type PaginationOption = {
	limit?: number;
	offset?: number;
	sort?: SortOption;
	filter?: Record<string, unknown>;
};

export interface authDBInterface {
	// User Management Methods
	createUser(userData: Partial<User>): Promise<DatabaseResult<User>>; // Create a new user
	updateUserAttributes(user_id: string, userData: Partial<User>, tenantId?: string): Promise<DatabaseResult<User>>; // Edit a user
	deleteUser(user_id: string, tenantId?: string): Promise<DatabaseResult<void>>; // Delete a user
	getUserById(user_id: string, tenantId?: string): Promise<DatabaseResult<User | null>>; // Get a user by ID
	getUserByEmail(criteria: { email: string; tenantId?: string }): Promise<DatabaseResult<User | null>>; // Get a user by email
	getAllUsers(options?: PaginationOption): Promise<DatabaseResult<User[]>>; // Get all users for a tenant
	getUserCount(filter?: Record<string, unknown>): Promise<DatabaseResult<number>>; // Get the count of users for a tenant
	deleteUsers(user_ids: string[], tenantId?: string): Promise<DatabaseResult<{ deletedCount: number }>>; // Delete multiple users
	blockUsers(user_ids: string[], tenantId?: string): Promise<DatabaseResult<{ modifiedCount: number }>>; // Block multiple users
	unblockUsers(user_ids: string[], tenantId?: string): Promise<DatabaseResult<{ modifiedCount: number }>>; // Unblock multiple users
	// Session Management Methods

	createSession(sessionData: { user_id: string; expires: Date; tenantId?: string }): Promise<DatabaseResult<Session>>; // Create a new session
	updateSessionExpiry(session_id: string, newExpiry: Date): Promise<DatabaseResult<Session>>; // Update the expiry of an existing session
	deleteSession(session_id: string): Promise<DatabaseResult<void>>; // Delete a session
	deleteExpiredSessions(): Promise<DatabaseResult<number>>; // Delete expired sessions
	validateSession(session_id: string): Promise<DatabaseResult<User | null>>; // Validate a session
	invalidateAllUserSessions(user_id: string, tenantId?: string): Promise<DatabaseResult<void>>; // Invalidate all sessions for a user in a tenant
	getActiveSessions(user_id: string, tenantId?: string): Promise<DatabaseResult<Session[]>>; // Get active sessions for a user in a tenant
	getAllActiveSessions(tenantId?: string): Promise<DatabaseResult<Session[]>>; // Get all active sessions for a tenant
	getSessionTokenData(session_id: string): Promise<DatabaseResult<{ expiresAt: Date; user_id: string } | null>>; // Get session token data
	rotateToken(oldToken: string, expires: Date): Promise<DatabaseResult<string>>; // Rotate a token
	cleanupRotatedSessions?(): Promise<DatabaseResult<number>>; // Clean up rotated sessions
	// Token Management Methods

	createToken(data: { user_id: string; email: string; expires: Date; type: string; tenantId?: string }): Promise<DatabaseResult<string>>; // Create a new token
	updateToken(token_id: string, tokenData: Partial<Token>, tenantId?: string): Promise<DatabaseResult<Token>>; // Update a token
	validateToken(
		token: string,
		user_id?: string,
		type?: string,
		tenantId?: string
	): Promise<DatabaseResult<{ success: boolean; message: string; email?: string }>>; // Validate a token
	consumeToken(token: string, user_id?: string, type?: string, tenantId?: string): Promise<DatabaseResult<{ status: boolean; message: string }>>; // Consume a token
	getTokenData(token: string, user_id?: string, type?: string, tenantId?: string): Promise<DatabaseResult<Token | null>>; // Get token data
	getTokenByValue(token: string, tenantId?: string): Promise<DatabaseResult<Token | null>>; // Get token details by token value
	getAllTokens(filter?: Record<string, unknown>): Promise<DatabaseResult<Token[]>>; // Get all tokens for a tenant
	deleteExpiredTokens(): Promise<DatabaseResult<number>>; // Delete expired tokens
	deleteTokens(token_ids: string[], tenantId?: string): Promise<DatabaseResult<{ deletedCount: number }>>; // Delete multiple tokens
	blockTokens(token_ids: string[], tenantId?: string): Promise<DatabaseResult<{ modifiedCount: number }>>; // Block multiple tokens
	unblockTokens(token_ids: string[], tenantId?: string): Promise<DatabaseResult<{ modifiedCount: number }>>; // Unblock multiple tokens
}
