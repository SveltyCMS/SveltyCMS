import type { User, Session, Token } from './types';

export interface AuthDBAdapter {
	// User Management Methods
	createUser(userData: Partial<User>): Promise<User>;
	updateUserAttributes(user: User, attributes: Partial<User>): Promise<void>;
	deleteUser(id: string): Promise<void>;
	getUserById(id: string): Promise<User | null>;
	getUserByEmail(email: string): Promise<User | null>;
	getAllUsers(): Promise<User[]>;
	getUserCount(): Promise<number>;

	// Session Management Methods
	createSession(data: { user_id: string; expires: number }): Promise<Session>;
	destroySession(session_id: string): Promise<void>;
	validateSession(session_id: string): Promise<User | null>;
	invalidateAllUserSessions(user_id: string): Promise<void>;

	// Token Management Methods
	createToken(user_id: string, email: string, expires: number): Promise<string>;
	validateToken(token: string, user_id: string): Promise<{ success: boolean; message: string }>;
	consumeToken(token: string, user_id: string): Promise<{ status: boolean; message: string }>;
	getAllTokens(): Promise<Token[]>;
}
