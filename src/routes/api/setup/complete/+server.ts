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
import { Auth, hashPassword } from '@src/auth';
import { createSessionStore } from '@src/auth/sessionStore';
import type { User } from '@src/auth/types';
import { invalidateSettingsCache } from '@src/stores/globalSettings';
import { setupAdminSchema } from '@src/utils/formSchemas';
import { json, type RequestHandler } from '@sveltejs/kit';
import { logger } from '@utils/logger.svelte';
import { randomBytes } from 'crypto';
import { safeParse } from 'valibot';

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

		// 2. Create temporary database adapter and establish connection
		const temporaryAdapter = await createTemporaryDatabaseAdapter(database);
		logger.info('Database connection established for setup finalization', { correlationId });

		// 3. Create a temporary full Auth instance using the temporary adapter's auth interface
		const tempAuth = new Auth(temporaryAdapter.auth, createSessionStore());
		logger.info('Temporary Auth service created for setup finalization', { correlationId });

		// 4. Create or update the admin user
		const adminUser = await createAdminUser(admin, tempAuth, correlationId);

		// 5. Update the private config file with database credentials
		await updatePrivateConfig(database, correlationId);

		// 6. Invalidate settings cache to force reload with new database connection
		invalidateSettingsCache();
		logger.info('Global settings cache invalidated', { correlationId });

		// 7. Create a session for the new admin user
		const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
		const session = await tempAuth.createSession({ user_id: adminUser._id, expires });
		const sessionCookie = tempAuth.createSessionCookie(session._id);

		logger.info('Admin user created and session established, redirecting to dashboard', { correlationId });

		// 8. Determine redirect path
		const redirectPath = `/`; // Redirect to dashboard

		const response = json({
			success: true,
			message: 'Setup finalized successfully!',
			redirectPath,
			loggedIn: true
		});

		// 9. Set the session cookie
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
		logger.info('Admin user created', { correlationId, email: admin.email });
		return newUser;
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
