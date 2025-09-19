/**
 * @file src/routes/api/setup/complete/+server.ts
 * @description Finalizes the initial CMS setup by creating the admin user,
 *              persisting database credentials, and logging the user in.
 * @summary
 *  - Connects to the database using credentials from the request.
 *  - Creates or updates the admin user.
 *  - Updates `config/private.ts` with the database credentials.
 *  - Invalidates the global settings cache to force a reload on the next request.
 *  - Creates an authenticated session for the admin user.
 *
 * This endpoint assumes that the database has already been seeded via the
 * `/api/setup/seed-settings` endpoint, which is triggered on a successful
 * database connection test in the UI.
 */

import { dev } from '$app/environment';

// Auth

import type { DatabaseConfig } from '@root/config/types';
import { Auth, hashPassword } from '@src/auth';
import type { authDBInterface } from '@src/auth/authDBInterface';
import { createSessionStore } from '@src/auth/sessionStore';
import type { User } from '@src/auth/types';
import { invalidateSettingsCache } from '@src/stores/globalSettings';
import { setupAdminSchema } from '@src/utils/formSchemas';
import { json } from '@sveltejs/kit';
import { logger } from '@utils/logger.svelte';
import { randomBytes } from 'crypto';
import { safeParse } from 'valibot';
import { getSetupDatabaseAdapter } from '../utils';
import type { RequestHandler } from './$types';

interface AdminConfig {
	username: string;
	email: string;
	password: string;
	confirmPassword: string;
}

export const POST: RequestHandler = async ({ request }) => {
	const correlationId = randomBytes(6).toString('hex');
	try {
		const setupData = await request.json();
		const { database, admin } = setupData as {
			database: DatabaseConfig;
			admin: AdminConfig;
		};

		logger.info('Starting setup finalization', { correlationId, db: database.name, admin: admin.email });

		// 1. Validate admin user data
		const adminValidation = safeParse(setupAdminSchema, admin);
		if (!adminValidation.success) {
			const issues = adminValidation.issues.map((i) => i.message).join(', ');
			return json({ success: false, error: `Invalid admin user data: ${issues}` }, { status: 400 });
		}

		// 1.1 Validate DB credentials presence for engines requiring auth (Mongo local often requires auth)
		if ((database.type === 'mongodb' || database.type === 'mongodb+srv') && (!database.user || !database.password)) {
			return json(
				{
					success: false,
					error: 'Credentials required for MongoDB setup finalization',
					userFriendly: 'Provide a database username and password to complete setup.'
				},
				{ status: 400 }
			);
		}

		// 2. Create temporary database adapter and establish connection (agnostic)
		const { adapter: tempDbAdapter } = await getSetupDatabaseAdapter(database);
		logger.info('Database connection established for setup finalization', { correlationId });

		// 3. Set up auth models and compose a proper auth adapter for MongoDB
		// We cannot use tempDbAdapter.auth directly (it only exposes setup hooks).
		await tempDbAdapter.auth.setupAuthModels();

		let authAdapter: authDBInterface;
		if (database.type === 'mongodb' || database.type === 'mongodb+srv') {
			const { UserAdapter } = await import('@src/auth/mongoDBAuth/userAdapter');
			const { SessionAdapter } = await import('@src/auth/mongoDBAuth/sessionAdapter');
			const { TokenAdapter } = await import('@src/auth/mongoDBAuth/tokenAdapter');

			const userAdapter = new UserAdapter();
			const sessionAdapter = new SessionAdapter();
			const tokenAdapter = new TokenAdapter();

			authAdapter = {
				// User Management Methods
				createUser: userAdapter.createUser.bind(userAdapter),
				updateUserAttributes: userAdapter.updateUserAttributes.bind(userAdapter),
				deleteUser: userAdapter.deleteUser.bind(userAdapter),
				getUserById: userAdapter.getUserById.bind(userAdapter),
				getUserByEmail: userAdapter.getUserByEmail.bind(userAdapter),
				getAllUsers: userAdapter.getAllUsers.bind(userAdapter),
				getUserCount: userAdapter.getUserCount.bind(userAdapter),

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
				updateToken: tokenAdapter.updateToken.bind(tokenAdapter),
				validateToken: tokenAdapter.validateToken.bind(tokenAdapter),
				consumeToken: tokenAdapter.consumeToken.bind(tokenAdapter),
				getTokenByValue: tokenAdapter.getTokenByValue.bind(tokenAdapter),
				getAllTokens: tokenAdapter.getAllTokens.bind(tokenAdapter),
				deleteExpiredTokens: tokenAdapter.deleteExpiredTokens.bind(tokenAdapter),
				deleteTokens: tokenAdapter.deleteTokens.bind(tokenAdapter),
				blockTokens: tokenAdapter.blockTokens.bind(tokenAdapter),
				unblockTokens: tokenAdapter.unblockTokens.bind(tokenAdapter)
			} as authDBInterface;
		} else {
			throw new Error(`Setup completion currently supports only MongoDB. Received: ${database.type}`);
		}

		// 4. Create a temporary full Auth instance using the composed adapter
		const tempAuth = new Auth(authAdapter, createSessionStore());
		logger.info('Temporary Auth service created for setup finalization', { correlationId });

		// 5. Create or update the admin user
		const adminUser = await createAdminUser(admin, tempAuth, correlationId);
		logger.info('Admin user created/updated', { correlationId, userId: adminUser._id, userIdType: typeof adminUser._id });

		// Ensure user._id is a string
		if (adminUser._id && typeof adminUser._id !== 'string') {
			logger.warn('Converting adminUser._id to string', { correlationId, originalType: typeof adminUser._id });
			adminUser._id = adminUser._id.toString();
		}

		// 6. Update the private config file with database credentials (to be refactored to .env in next step)
		await updatePrivateConfig(database, correlationId);

		// 7. Invalidate settings cache to force reload with new database connection
		invalidateSettingsCache();
		logger.info('Global settings cache invalidated', { correlationId });

		// 8. Create a session for the new admin user
		const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
		logger.info('Creating session for admin user', { correlationId, userId: adminUser._id, userIdType: typeof adminUser._id });
		const session = await tempAuth.createSession({ user_id: adminUser._id, expires });
		const sessionCookie = tempAuth.createSessionCookie(session._id);

		logger.info('Admin user created and session established, redirecting to dashboard', { correlationId });

		// 9. Determine redirect path
		const redirectPath = `/`; // Redirect to dashboard

		const response = json({
			success: true,
			message: 'Setup finalized successfully!',
			redirectPath,
			loggedIn: true
		});

		// 10. Set the session cookie
		response.headers.set(
			'Set-Cookie',
			`${sessionCookie.name}=${sessionCookie.value}; Path=${sessionCookie.attributes.path}; HttpOnly; SameSite=${sessionCookie.attributes.sameSite}; Max-Age=${sessionCookie.attributes.maxAge}${!dev ? '; Secure' : ''}`
		);

		return response;
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
		logger.error('Setup finalization failed', { correlationId, error: errorMessage });
		return json(
			{
				success: false,
				error: errorMessage
			},
			{ status: 500 }
		);
	}
};

async function createAdminUser(admin: AdminConfig, auth: Auth, correlationId: string): Promise<User> {
	const hashedPassword = await hashPassword(admin.password);

	const existingUser = await auth.getUserByEmail({ email: admin.email });

	if (existingUser) {
		console.log('createAdminUser existingUser:', { existingUser, type: typeof existingUser, keys: Object.keys(existingUser), _id: existingUser._id });
		if (!existingUser._id) {
			logger.error('Existing user found but _id is undefined', { correlationId, email: admin.email, userKeys: Object.keys(existingUser) });
			throw new Error('Existing user has undefined _id');
		}
		await auth.updateUserAttributes(existingUser._id, {
			username: admin.username,
			password: hashedPassword,
			role: 'admin',
			isRegistered: true,
			updatedAt: new Date()
		});
		logger.info('Admin user updated', { correlationId, email: admin.email });
		const updatedUser = await auth.getUserByEmail({ email: admin.email });
		if (!updatedUser) throw new Error('Failed to retrieve updated admin user');
		return updatedUser;
	} else {
		const newUser = await auth.createUser({
			username: admin.username,
			email: admin.email,
			password: hashedPassword,
			role: 'admin',
			isRegistered: true
		});
		logger.info('Admin user created', {
			correlationId,
			email: admin.email,
			userId: newUser._id,
			userIdType: typeof newUser._id,
			userKeys: Object.keys(newUser)
		});
		return newUser;
	}
}

async function updatePrivateConfig(dbConfig: DatabaseConfig, correlationId: string) {
	const fs = await import('fs/promises');
	const path = await import('path');
	const envPath = path.resolve(process.cwd(), '.env');

	// Generate a random JWT secret key if not present
	const jwtSecret = dbConfig.jwtSecretKey || generateRandomKey();

	const envContent = [
		`DB_TYPE="${dbConfig.type}"`,
		`DB_HOST="${dbConfig.host}"`,
		`DB_PORT=${dbConfig.port}`,
		`DB_NAME="${dbConfig.name}"`,
		`DB_USER="${dbConfig.user}"`,
		`DB_PASSWORD="${dbConfig.password}"`,
		`JWT_SECRET_KEY="${jwtSecret}"`
		// Add other private keys here as needed
	].join('\n');

	try {
		await fs.writeFile(envPath, envContent);
		logger.info('✅ .env file created/updated successfully', { correlationId, path: envPath });
	} catch (error) {
		logger.error('Failed to update .env file', {
			correlationId,
			path: envPath,
			error: error instanceof Error ? error.message : String(error)
		});
		// Do not re-throw; failing to write the config is not a fatal error for the setup flow,
		// but it will require manual configuration.
	}
}

function generateRandomKey(): string {
	return randomBytes(32).toString('hex');
}
