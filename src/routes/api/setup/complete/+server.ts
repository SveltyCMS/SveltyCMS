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

import { dbAdapter, authAdapter } from '@src/databases/db';
import { invalidateSettingsCache, privateEnv } from '@src/stores/globalSettings';
import { setupAdminSchema } from '@src/utils/formSchemas';
import { hashPassword } from '@src/utils/password';
import { json } from '@sveltejs/kit';
import { logger } from '@utils/logger.svelte';
import { randomBytes } from 'crypto';
import { safeParse } from 'valibot';
import type { RequestHandler } from './$types';
import type { authDBInterface } from '@src/auth/authDBInterface';

// Interface definitions
interface DatabaseConfig {
	type: string;
	host: string;
	port: number;
	name: string;
	user: string;
	password: string;
}

interface AdminConfig {
	username: string;
	email: string;
	password: string;
	confirmPassword: string;
}

// Helper function to create temporary database adapter for setup operations
async function createTemporaryDatabaseAdapter(dbConfig: DatabaseConfig) {
	const dbType = dbConfig.type || 'mongodb';

	switch (dbType) {
		case 'mongodb': {
			const { MongoDBAdapter } = await import('@src/databases/mongodb/mongoDBAdapter');
			const adapter = new MongoDBAdapter();

			// Configure the adapter with the provided database config
			// Note: This bypasses the normal initialization to use setup-provided credentials
			const connectionString = buildMongoConnectionString(dbConfig);
			const connectResult = await adapter.connect(connectionString, {
				user: dbConfig.user || undefined,
				pass: dbConfig.password || undefined,
				dbName: dbConfig.name,
				authSource: dbConfig.host.startsWith('mongodb+srv://') ? undefined : 'admin',
				retryWrites: true,
				serverSelectionTimeoutMS: 15000,
				maxPoolSize: 10
			});

			if (!connectResult.success) {
				throw new Error(`Database connection failed: ${connectResult.error?.message}`);
			}

			// Set up auth models after connection is established
			await adapter.auth.setupAuthModels();

			return adapter;
		}
		default:
			throw new Error(`Database type ${dbType} not supported for setup operations`);
	}
}

// Helper function to create temporary auth adapter for setup operations (database-agnostic)
async function createTemporaryAuthAdapter(dbType: string = 'mongodb'): Promise<authDBInterface> {
	try {
		switch (dbType.toLowerCase()) {
			case 'mongodb': {
				// Import MongoDB auth adapters
				const { UserAdapter } = await import('@src/auth/mongoDBAuth/userAdapter');
				const { SessionAdapter } = await import('@src/auth/mongoDBAuth/sessionAdapter');
				const { TokenAdapter } = await import('@src/auth/mongoDBAuth/tokenAdapter');

				console.log('Creating MongoDB auth adapters...');
				const userAdapter = new UserAdapter();
				const sessionAdapter = new SessionAdapter();
				const tokenAdapter = new TokenAdapter();

				// Verify adapters were created successfully
				if (!userAdapter || !sessionAdapter || !tokenAdapter) {
					throw new Error('One or more MongoDB auth adapters failed to instantiate');
				}

				// For setup, we only need a minimal set of auth methods
				const requiredUserMethods = ['createUser', 'updateUserAttributes', 'getUserByEmail'];
				for (const method of requiredUserMethods) {
					if (!userAdapter[method] || typeof userAdapter[method] !== 'function') {
						throw new Error(`UserAdapter missing required method: ${method}`);
					}
				}

				// Return a minimal authDBInterface with only the methods needed for setup
				return {
					// Core user methods needed for setup (wrapped to match DatabaseResult format)
					createUser: async (userData: Partial<any>) => {
						try {
							const result = await userAdapter.createUser(userData);
							return { success: true, data: result };
						} catch (error) {
							return { success: false, error: { code: 'CREATE_USER_ERROR', message: error instanceof Error ? error.message : String(error) } };
						}
					},
					updateUserAttributes: async (user_id: string, userData: Partial<any>, tenantId?: string) => {
						try {
							const result = await userAdapter.updateUserAttributes(user_id, userData, tenantId);
							return { success: true, data: result };
						} catch (error) {
							return { success: false, error: { code: 'UPDATE_USER_ERROR', message: error instanceof Error ? error.message : String(error) } };
						}
					},
					getUserByEmail: async (criteria: { email: string; tenantId?: string }) => {
						try {
							const result = await userAdapter.getUserByEmail(criteria);
							return { success: true, data: result };
						} catch (error) {
							return { success: false, error: { code: 'GET_USER_ERROR', message: error instanceof Error ? error.message : String(error) } };
						}
					},

					// Stub implementations for other required interface methods (not used during setup)
					deleteUser: () => Promise.resolve({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented for setup' } }),
					getUserById: () => Promise.resolve({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented for setup' } }),
					getAllUsers: () => Promise.resolve({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented for setup' } }),
					getUserCount: () => Promise.resolve({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented for setup' } }),
					deleteUsers: () => Promise.resolve({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented for setup' } }),
					blockUsers: () => Promise.resolve({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented for setup' } }),
					unblockUsers: () => Promise.resolve({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented for setup' } }),

					// Session method stubs
					createSession: () => Promise.resolve({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented for setup' } }),
					updateSessionExpiry: () => Promise.resolve({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented for setup' } }),
					deleteSession: () => Promise.resolve({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented for setup' } }),
					deleteExpiredSessions: () => Promise.resolve({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented for setup' } }),
					validateSession: () => Promise.resolve({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented for setup' } }),
					invalidateAllUserSessions: () =>
						Promise.resolve({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented for setup' } }),
					getActiveSessions: () => Promise.resolve({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented for setup' } }),
					getAllActiveSessions: () => Promise.resolve({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented for setup' } }),
					getSessionTokenData: () => Promise.resolve({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented for setup' } }),
					rotateToken: () => Promise.resolve({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented for setup' } }),
					cleanupRotatedSessions: () => Promise.resolve({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented for setup' } }),

					// Token method stubs
					createToken: () => Promise.resolve({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented for setup' } }),
					updateToken: () => Promise.resolve({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented for setup' } }),
					validateToken: () => Promise.resolve({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented for setup' } }),
					consumeToken: () => Promise.resolve({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented for setup' } }),
					getTokenData: () => Promise.resolve({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented for setup' } }),
					getTokenByValue: () => Promise.resolve({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented for setup' } }),
					getAllTokens: () => Promise.resolve({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented for setup' } }),
					deleteExpiredTokens: () => Promise.resolve({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented for setup' } }),
					deleteTokens: () => Promise.resolve({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented for setup' } }),
					blockTokens: () => Promise.resolve({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented for setup' } }),
					unblockTokens: () => Promise.resolve({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Not implemented for setup' } })
				} as authDBInterface;
			}
			// Future database types can be added here
			// case 'postgresql': {
			//   // Import PostgreSQL auth adapters
			//   break;
			// }
			default:
				throw new Error(`Database type ${dbType} not supported for auth operations`);
		}
	} catch (error) {
		console.error('Failed to create temporary auth adapter:', error);
		throw new Error(`Auth adapter creation failed: ${error instanceof Error ? error.message : String(error)}`);
	}
}

// Helper function to build MongoDB connection string
function buildMongoConnectionString(dbConfig: DatabaseConfig): string {
	const hasScheme = typeof dbConfig.host === 'string' && (dbConfig.host.startsWith('mongodb://') || dbConfig.host.startsWith('mongodb+srv://'));
	const isAtlas = hasScheme && dbConfig.host.startsWith('mongodb+srv://');
	const baseHost = hasScheme ? dbConfig.host : `mongodb://${dbConfig.host}`;

	// Append port only if: not Atlas, a port provided, and baseHost does not already include an explicit port
	let hostWithPort = baseHost;
	if (!isAtlas && dbConfig.port) {
		const hostPortPart = baseHost.replace(/^mongodb(?:\+srv)?:\/\//, '').split('/')[0];
		const alreadyHasPort = /:[0-9]+$/.test(hostPortPart);
		if (!alreadyHasPort) hostWithPort = `${baseHost}:${dbConfig.port}`;
	}

	return isAtlas ? `${baseHost}/${dbConfig.name}` : `${hostWithPort}/${dbConfig.name}`;
}

// Helper function to connect to database using database-agnostic interface
async function connectToDatabaseWithConfig(dbConfig: DatabaseConfig): Promise<void> {
	// During setup, we create a temporary adapter since the global one isn't initialized yet
	const adapter = await createTemporaryDatabaseAdapter(dbConfig);

	// Test the connection by attempting to get system capabilities
	const capabilities = await adapter.getCapabilities();
	if (!capabilities.success) {
		throw new Error(`Database connection failed: ${capabilities.error?.message}`);
	}

	logger.info('Database connection established using database-agnostic adapter');
}

export const POST: RequestHandler = async ({ request, cookies }) => {
	const correlationId = randomBytes(6).toString('hex');
	try {
		const setupData = await request.json();
		const { database, admin, force } = setupData as {
			database: DatabaseConfig;
			admin: AdminConfig;
			force?: boolean;
		};

		logger.info('Starting setup finalization', { correlationId, db: database.name, admin: admin.email, force });

		// 1. Validate admin user data
		const adminValidation = safeParse(setupAdminSchema, admin);
		if (!adminValidation.success) {
			const issues = adminValidation.issues.map((i) => i.message).join(', ');
			return json({ success: false, error: `Invalid admin user data: ${issues}` }, { status: 400 });
		}

		// 2. Create temporary database adapter and establish connection
		const temporaryAdapter = await createTemporaryDatabaseAdapter(database);
		logger.info('Database connection established for setup finalization', { correlationId });

		// 3. Create temporary auth adapter (after database connection is established)
		const temporaryAuthAdapter = await createTemporaryAuthAdapter(database.type);
		logger.info('Auth adapters created for setup finalization', { correlationId });

		// 4. Create or update the admin user using the temporary auth adapter
		await createAdminUser(admin, temporaryAuthAdapter, correlationId);

		// 4. Update the private config file with database credentials
		await updatePrivateConfig(database, correlationId);

		// 5. Invalidate settings cache to force reload with new database connection
		invalidateSettingsCache();
		logger.info('Global settings cache invalidated', { correlationId });

		// 6. Skip system reinitialization here since background seeding already handled it
		// The system will initialize properly on the first non-setup request
		logger.info('Skipping system reinitialization - background seeding already completed database setup', { correlationId });

		// 8. Admin user created successfully, skip session creation for now
		// The user will be redirected to login page and can log in normally
		logger.info('Admin user created successfully, redirecting to login', { correlationId });

		// 7. Determine redirect path
		const redirectPath = `/login`; // Redirect to login page instead of dashboard

		return json({
			success: true,
			message: 'Setup finalized successfully!',
			redirectPath,
			loggedIn: false
		});
	} catch (error) {
		logger.error('Setup finalization failed', { correlationId, error: error instanceof Error ? error.message : String(error) });
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'An unknown error occurred during setup finalization.'
			},
			{ status: 500 }
		);
	}
};

async function createAdminUser(admin: AdminConfig, authAdapter: authDBInterface, correlationId: string) {
	const hashedPassword = await hashPassword(admin.password);

	if (!authAdapter) {
		throw new Error('Auth adapter not available for user creation.');
	}

	const existingUser = await authAdapter.getUserByEmail({ email: admin.email });

	if (existingUser.success && existingUser.data) {
		await authAdapter.updateUserAttributes(existingUser.data._id, {
			username: admin.username,
			password: hashedPassword,
			role: 'admin',
			isRegistered: true,
			updatedAt: new Date()
		});
		logger.info('Admin user updated', { correlationId, email: admin.email });
	} else {
		await authAdapter.createUser({
			username: admin.username,
			email: admin.email,
			password: hashedPassword,
			role: 'admin',
			isRegistered: true
		});
		logger.info('Admin user created', { correlationId, email: admin.email });
	}
}

async function updatePrivateConfig(dbConfig: DatabaseConfig, correlationId: string) {
	const fs = await import('fs/promises');
	const path = await import('path');
	const configPath = path.resolve(process.cwd(), 'config/private.ts');

	try {
		let configContent = await fs.readFile(configPath, 'utf8');

		const replacements: { [key: string]: string | number } = {
			DB_TYPE: `'${dbConfig.type}'`,
			DB_HOST: `'${dbConfig.host}'`,
			DB_PORT: dbConfig.port,
			DB_NAME: `'${dbConfig.name}'`,
			DB_USER: `'${dbConfig.user}'`,
			DB_PASSWORD: `'${dbConfig.password}'`
		};

		for (const [key, value] of Object.entries(replacements)) {
			// Special handling for DB_PORT which should be numeric
			if (key === 'DB_PORT') {
				const portRegex = new RegExp(`${key}:\\s*\\d+`);
				if (portRegex.test(configContent)) {
					configContent = configContent.replace(portRegex, `${key}: ${value}`);
				}
			} else {
				const regex = new RegExp(`${key}:\\s*['"][^'"]*['"]`);
				if (regex.test(configContent)) {
					configContent = configContent.replace(regex, `${key}: ${value}`);
				}
			}
		}

		// Inject secrets if they are empty
		if (/JWT_SECRET_KEY:\s*['"]{2}/.test(configContent)) {
			configContent = configContent.replace(/JWT_SECRET_KEY:\s*['"]{2}/, `JWT_SECRET_KEY: '${generateRandomKey()}'`);
		}
		if (/ENCRYPTION_KEY:\s*['"]{2}/.test(configContent)) {
			configContent = configContent.replace(/ENCRYPTION_KEY:\s*['"]{2}/, `ENCRYPTION_KEY: '${generateRandomKey()}'`);
		}

		await fs.writeFile(configPath, configContent);
		logger.info('Private config file updated successfully', { correlationId, path: configPath });
	} catch (error) {
		logger.error('Failed to update private config file', {
			correlationId,
			path: configPath,
			error: error instanceof Error ? error.message : String(error)
		});
		// Do not re-throw; failing to write the config is not a fatal error for the setup flow,
		// but it will require manual configuration.
	}
}

function generateRandomKey(): string {
	return randomBytes(32).toString('hex');
}
