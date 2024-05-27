// import type { Cookie, Session, Token, User, Message } from '@src/auth/types';

// Define DatabaseAdapter interface
export interface DatabaseAdapter {
	// Database Connection and Setup Methods
	connect(): Promise<void>;
	getCollectionModels(): Promise<Record<string, any>>;
	setupAuthModels(): void;
	setupMediaModels(): void;

	// // User Management Methods
	// createUser(userData: Partial<User>): Promise<User>;
	// updateUserAttributes(user: User, attributes: Partial<User>): Promise<void>;
	// deleteUser(id: string): Promise<void>;
	// getUserCount(): Promise<number>;
	// getUserById(id: string): Promise<User | null>;
	// getAllUsers(): Promise<User[]>;

	// // Session Management Methods
	// createSession(data: { user_id: string; expires?: number }): Promise<Session>;
	// destroySession(session_id: string): Promise<void>;
	// validateSession(session_id: string): Promise<User | null>;
	// invalidateAllUserSessions(user_id: string): Promise<void>;

	// // Authentication Methods
	// checkUser(fields: { _id?: string; email?: string }): Promise<User | null>;
	// createSessionCookie(session: Session): Cookie;
	// login(email: string, password: string): Promise<User | null>;
	// logOut(session_id: string): Promise<void>;

	// // Token Management Methods
	// createToken(user_id: string, expires?: number): Promise<string>;
	// validateToken(token: string, user_id: string): Promise<{ success: boolean; message: string }>;
	// consumeToken(token: string, user_id: string): Promise<{ status: boolean; message: string }>;
	// getAllTokens(): Promise<Token[]>;
	// updateUserPassword(email: string, newPassword: string): Promise<{ status: boolean; message: string }>;

	// // System Messages Methods
	// sendMessage(sender: string, receiver: string, content: string): Promise<void>;
	// getMessages(sender: string, receiver: string): Promise<Message[]>;
}
