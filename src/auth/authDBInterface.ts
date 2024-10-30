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

// Pagination and Sorting Options Types
type SortOption = { [key: string]: 'asc' | 'desc' } | [string, 'asc' | 'desc'][];
export type PaginationOption = { limit?: number; offset?: number; sort?: SortOption; filter?: Record<string, unknown> };

export interface authDBInterface {
	// User Management Methods
	createUser(userData: Partial<User>): Promise<User>; // Create a new user
	updateUserAttributes(user_id: string, userData: Partial<User>): Promise<User>; // Edit a user
	deleteUser(user_id: string): Promise<void>; // Delete a user
	getUserById(user_id: string): Promise<User | null>; // Get a user by ID
	getUserByEmail(email: string): Promise<User | null>; // Get a user by email
	getAllUsers(options?: PaginationOption): Promise<User[]>; // Get all users
	getUserCount(filter?: Record<string, unknown>): Promise<number>; // Get the count of users

	// Session Management Methods
	createSession(sessionData: { user_id: string; expires: Date }): Promise<Session>; // Create a new session
	updateSessionExpiry(session_id: string, newExpiry: Date): Promise<Session>; // Update the expiry of an existing session
	deleteSession(session_id: string): Promise<void>; // Delete a session
	deleteExpiredSessions(): Promise<number>; // Delete expired sessions
	validateSession(session_id: string): Promise<User | null>; // Validate a session
	invalidateAllUserSessions(user_id: string): Promise<void>; // Invalidate all sessions for a user
	getActiveSessions(user_id: string): Promise<Session[]>; // Get active sessions for a user

	// Token Management Methods
	createToken(data: { user_id: string; email: string; expires: Date; type: string }): Promise<string>; // Create a new token
	validateToken(token: string, user_id?: string, type?: string): Promise<{ success: boolean; message: string; email?: string }>; // Validate a token
	consumeToken(token: string, user_id?: string, type?: string): Promise<{ status: boolean; message: string }>; // Consume a token
	getAllTokens(filter?: Record<string, unknown>): Promise<Token[]>; // Get all tokens
	deleteExpiredTokens(): Promise<number>; // Delete expired tokens
}
