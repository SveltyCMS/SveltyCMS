import type { User, Session, Token } from './types';

export interface AuthDBAdapter {
	// User Management Methods
	createUser(userData: Partial<User>): Promise<User>;
	updateUserAttributes(userId: string, attributes: Partial<User>): Promise<void>;
	deleteUser(userId: string): Promise<void>;
	getUserById(userId: string): Promise<User | null>;
	getUserByEmail(email: string): Promise<User | null>;
	getAllUsers(): Promise<User[]>;
	getUserCount(): Promise<number>;

	// Session Management Methods
	createSession(data: { userId: string; expires: number }): Promise<Session>;
	destroySession(sessionId: string): Promise<void>;
	validateSession(sessionId: string): Promise<User | null>;
	invalidateAllUserSessions(userId: string): Promise<void>;

	// Token Management Methods
	createToken(data: { userId: string; email: string; expires: number }): Promise<string>;
	validateToken(token: string, userId: string): Promise<{ success: boolean; message: string }>;
	consumeToken(token: string, userId: string): Promise<{ status: boolean; message: string }>;
	getAllTokens(): Promise<Token[]>;
}
