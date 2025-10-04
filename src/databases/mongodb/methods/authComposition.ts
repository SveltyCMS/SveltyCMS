/**
 * @file src/databases/mongodb/methods/authComposition.ts
 * @description Composition layer for MongoDB authentication adapters
 *
 * This file combines three specialized auth adapters (User, Session, Token) into
 * a unified interface. It serves as the glue code between modular adapters and
 * the MongoDB adapter, following the composition over inheritance pattern.
 *
 * **Architecture Pattern:**
 * - Dependency Injection: Adapters are instantiated here
 * - Composition: Methods are bound and exposed as unified interface
 * - Decoupling: Keeps individual adapters independent and testable
 *
 * **Purpose:**
 * Instead of merging 1,786 lines of auth code into one massive file, this
 * composition layer allows us to maintain separation of concerns while
 * providing a single interface for the MongoDB adapter.
 */

import type { IDBAdapter } from '@src/databases/dbInterface';
import { SessionAdapter } from '../models/authSession';
import { TokenAdapter } from '../models/authToken';
import { UserAdapter } from '../models/authUser';

// Type helper to extract the auth interface from IDBAdapter
type AuthInterface = IDBAdapter['auth'];

/**
 * Compose the MongoDB Auth adapter from its sub-adapters.
 *
 * This function creates instances of UserAdapter, SessionAdapter, and TokenAdapter,
 * then binds all their methods into a unified object that matches the auth interface
 * defined in IDBAdapter['auth'].
 *
 * @returns A composed auth interface with all methods properly bound
 *
 * @example
 * ```typescript
 * // Used internally by MongoDBAdapter
 * const authAdapter = composeMongoAuthAdapter();
 *
 * // All methods are properly bound:
 * const user = await authAdapter.createUser({ email: 'test@example.com' });
 * const session = await authAdapter.createSession({ user_id: user._id, expires: new Date() });
 * ```
 */
export function composeMongoAuthAdapter(): AuthInterface {
	const userAdapter = new UserAdapter();
	const sessionAdapter = new SessionAdapter();
	const tokenAdapter = new TokenAdapter();

	const adapter = {
		// User Management Methods
		createUser: userAdapter.createUser.bind(userAdapter),
		updateUserAttributes: userAdapter.updateUserAttributes.bind(userAdapter),
		deleteUser: userAdapter.deleteUser.bind(userAdapter),
		getUserById: userAdapter.getUserById.bind(userAdapter),
		getUserByEmail: userAdapter.getUserByEmail.bind(userAdapter),
		getAllUsers: userAdapter.getAllUsers.bind(userAdapter),
		getUserCount: userAdapter.getUserCount.bind(userAdapter),
		deleteUsers: userAdapter.deleteUsers?.bind(userAdapter),
		blockUsers: userAdapter.blockUsers?.bind(userAdapter),
		unblockUsers: userAdapter.unblockUsers?.bind(userAdapter),

		// Session Management Methods
		createSession: sessionAdapter.createSession.bind(sessionAdapter),
		updateSessionExpiry: sessionAdapter.updateSessionExpiry.bind(sessionAdapter),
		deleteSession: sessionAdapter.deleteSession.bind(sessionAdapter),
		deleteExpiredSessions: sessionAdapter.deleteExpiredSessions.bind(sessionAdapter),
		validateSession: sessionAdapter.validateSession.bind(sessionAdapter),
		invalidateAllUserSessions: sessionAdapter.invalidateAllUserSessions.bind(sessionAdapter),
		getActiveSessions: sessionAdapter.getActiveSessions.bind(sessionAdapter),
		getAllActiveSessions: sessionAdapter.getAllActiveSessions.bind(sessionAdapter),
		getSessionTokenData: sessionAdapter.getSessionTokenData.bind(sessionAdapter),
		rotateToken: sessionAdapter.rotateToken.bind(sessionAdapter),
		cleanupRotatedSessions: sessionAdapter.cleanupRotatedSessions?.bind(sessionAdapter),

		// Token Management Methods
		createToken: tokenAdapter.createToken.bind(tokenAdapter),
		validateToken: tokenAdapter.validateToken.bind(tokenAdapter),
		consumeToken: tokenAdapter.consumeToken.bind(tokenAdapter),
		getTokenByValue: tokenAdapter.getTokenByValue.bind(tokenAdapter),
		deleteExpiredTokens: tokenAdapter.deleteExpiredTokens.bind(tokenAdapter),
		getAllTokens: tokenAdapter.getAllTokens.bind(tokenAdapter),
		updateToken: tokenAdapter.updateToken.bind(tokenAdapter),
		deleteTokens: tokenAdapter.deleteTokens.bind(tokenAdapter),
		blockTokens: tokenAdapter.blockTokens.bind(tokenAdapter),
		unblockTokens: tokenAdapter.unblockTokens.bind(tokenAdapter)
	};

	// Return the composed adapter (TypeScript will enforce type compatibility)
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return adapter as any as AuthInterface;
}
