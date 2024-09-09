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
type SortOption = { [key: string]: 1 | -1 } | [string, 1 | -1][];
type PaginationOption = { limit?: number; skip?: number; sort?: SortOption; filter?: object };

export interface authDBInterface {
	// User Management Methods
	createUser(userData: Partial<User>): Promise<User>;
	updateUserAttributes(user_id: string, userData: Partial<User>): Promise<User>;
	deleteUser(user_id: string): Promise<void>;
	getUserById(user_id: string): Promise<User | null>;
	getUserByEmail(email: string): Promise<User | null>;
	getAllUsers(options?: PaginationOption): Promise<User[]>;
	getUserCount(filter?: object): Promise<number>;

	// Session Management Methods
	createSession(sessionData: { user_id: string; expires: number }): Promise<Session>; // Expires is now Unix timestamp (number)
	updateSessionExpiry(session_id: string, newExpiry: number): Promise<Session>; // Expires is now Unix timestamp (number)
	deleteSession(session_id: string): Promise<void>;
	deleteExpiredSessions(): Promise<number>; // Return number of deleted sessions
	validateSession(session_id: string): Promise<User | null>;
	invalidateAllUserSessions(user_id: string): Promise<void>;
	getActiveSessions(user_id: string): Promise<Session[]>;

	// Token Management Methods
	createToken(data: { user_id: string; email: string; expires: number; type: string }): Promise<string>;
	validateToken(token: string, user_id: string, type: string): Promise<{ success: boolean; message: string }>;
	consumeToken(token: string, user_id: string, type: string): Promise<{ status: boolean; message: string }>;
	getAllTokens(filter?: object): Promise<Token[]>;
	deleteExpiredTokens(): Promise<number>;
}
