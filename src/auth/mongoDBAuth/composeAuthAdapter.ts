import type { authDBInterface } from '@src/auth/authDBInterface';
import { SessionAdapter } from '@src/auth/mongoDBAuth/sessionAdapter';
import { TokenAdapter } from '@src/auth/mongoDBAuth/tokenAdapter';
import { UserAdapter } from '@src/auth/mongoDBAuth/userAdapter';

/**
 * Compose the Mongo Auth adapter from its sub-adapters.
 * Returns an object conforming to `authDBInterface` with all methods bound.
 */
export function composeMongoAuthAdapter(): authDBInterface {
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
	} as unknown;

	return adapter as authDBInterface;
}
