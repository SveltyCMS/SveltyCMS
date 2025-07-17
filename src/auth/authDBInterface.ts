/**
 * @file src/auth/authDBInterface.ts
 * @description Interface definition for basic CRUD operations in an authentication system.
 *
 * This module defines the essential CRUD operations for database adapters:
 * - User management
 * - Session management
 * - Token management
 *
 * Usage:
 * Implemented by database adapters to ensure consistent operations across different databases or file-based systems.
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
	updateUserAttributes(user_id: string, userData: Partial<User>): Promise<DatabaseResult<User>>; // Edit a user
	deleteUser(user_id: string): Promise<DatabaseResult<void>>; // Delete a user
	getUserById(user_id: string): Promise<DatabaseResult<User | null>>; // Get a user by ID
	getUserByEmail(email: string): Promise<DatabaseResult<User | null>>; // Get a user by email
	getAllUsers(options?: PaginationOption): Promise<DatabaseResult<User[]>>; // Get all users
	getUserCount(filter?: Record<string, unknown>): Promise<DatabaseResult<number>>; // Get the count of users
	deleteUsers(user_ids: string[]): Promise<DatabaseResult<{ deletedCount: number }>>; // Delete multiple users
	blockUsers(user_ids: string[]): Promise<DatabaseResult<{ modifiedCount: number }>>; // Block multiple users
	unblockUsers(user_ids: string[]): Promise<DatabaseResult<{ modifiedCount: number }>>; // Unblock multiple users

	// Session Management Methods
	createSession(sessionData: { user_id: string; expires: Date }): Promise<DatabaseResult<Session>>; // Create a new session
	updateSessionExpiry(session_id: string, newExpiry: Date): Promise<DatabaseResult<Session>>; // Update the expiry of an existing session
	deleteSession(session_id: string): Promise<DatabaseResult<void>>; // Delete a session
	deleteExpiredSessions(): Promise<DatabaseResult<number>>; // Delete expired sessions
	validateSession(session_id: string): Promise<DatabaseResult<User | null>>; // Validate a session
	invalidateAllUserSessions(user_id: string): Promise<DatabaseResult<void>>; // Invalidate all sessions for a user
	getActiveSessions(user_id: string): Promise<DatabaseResult<Session[]>>; // Get active sessions for a user
	getSessionTokenData(session_id: string): Promise<DatabaseResult<{ expiresAt: Date; user_id: string } | null>>; // Get session token data
	rotateToken(oldToken: string, expires: Date): Promise<DatabaseResult<string>>; // Rotate a token
	cleanupRotatedSessions?(): Promise<DatabaseResult<number>>; // Clean up rotated sessions

	// Token Management Methods
	createToken(data: { user_id: string; email: string; expires: Date; type: string }): Promise<DatabaseResult<string>>; // Create a new token
	updateToken(token_id: string, tokenData: Partial<Token>): Promise<DatabaseResult<Token>>; // Update a token
	validateToken(token: string, user_id?: string, type?: string): Promise<DatabaseResult<{ success: boolean; message: string; email?: string }>>; // Validate a token
	consumeToken(token: string, user_id?: string, type?: string): Promise<DatabaseResult<{ status: boolean; message: string }>>; // Consume a token
	getTokenData(token: string, user_id?: string, type?: string): Promise<DatabaseResult<Token | null>>; // Get token data
	getTokenByValue(token: string): Promise<DatabaseResult<Token | null>>; // Get token details by token value
	getAllTokens(filter?: Record<string, unknown>): Promise<DatabaseResult<Token[]>>; // Get all tokens
	deleteExpiredTokens(): Promise<DatabaseResult<number>>; // Delete expired tokens
	deleteTokens(token_ids: string[]): Promise<DatabaseResult<{ deletedCount: number }>>; // Delete multiple tokens
	blockTokens(token_ids: string[]): Promise<DatabaseResult<{ modifiedCount: number }>>; // Block multiple tokens
	unblockTokens(token_ids: string[]): Promise<DatabaseResult<{ modifiedCount: number }>>; // Unblock multiple tokens
}
