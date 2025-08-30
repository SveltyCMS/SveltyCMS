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

import { UserAdapter } from '@src/auth/mongoDBAuth/userAdapter';
import { connectToMongoDBWithConfig } from '@src/databases/mongodb/dbconnect';
import { SystemSettingModel } from '@src/databases/mongodb/models/systemSetting';
import { auth } from '@src/hooks/auth';
import { invalidateSettingsCache, privateEnv } from '@src/stores/globalSettings';
import { setupAdminSchema } from '@src/utils/formSchemas';
import { hashPassword } from '@src/utils/password';
import { json } from '@sveltejs/kit';
import { logger } from '@utils/logger.svelte';
import { randomBytes } from 'crypto';
import { safeParse } from 'valibot';
import type { RequestHandler } from './$types';

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

		// 2. Connect to the database
		await connectToMongoDBWithConfig(database);
		logger.info('MongoDB connection established for setup finalization', { correlationId });

		// 3. Check if setup is already completed
		const setupCompleted = await SystemSettingModel.findOne({ key: 'SETUP_COMPLETED', value: true });
		if (setupCompleted && !force) {
			logger.warn('Setup already completed. Use force=true to override.', { correlationId });
			return json({ success: true, message: 'Setup already completed.' }, { status: 409 });
		}

		// 4. Create or update the admin user
		await createAdminUser(admin, correlationId);

		// 5. Update the private config file with database credentials
		await updatePrivateConfig(database, correlationId);

		// 6. Invalidate settings cache to force reload on next request
		invalidateSettingsCache();
		logger.info('Global settings cache invalidated', { correlationId });

		// 7. Create session for the admin user
		const userAdapter = new UserAdapter();
		const adminUser = await userAdapter.getUserByEmail({ email: admin.email });
		if (!adminUser?._id) {
			throw new Error('Could not find newly created admin user to create session.');
		}

		const session = await auth.createSession(adminUser._id, {});
		const sessionCookie = auth.createSessionCookie(session.id);
		cookies.set(sessionCookie.name, sessionCookie.value, {
			path: '.',
			...sessionCookie.attributes
		});
		logger.info('Admin session created successfully', { correlationId });

		// 8. Determine redirect path
		const redirectPath = `/${privateEnv.DEFAULT_CONTENT_LANGUAGE}/dashboard`;

		return json({
			success: true,
			message: 'Setup finalized successfully!',
			redirectPath,
			loggedIn: true
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

async function createAdminUser(admin: AdminConfig, correlationId: string) {
	const hashedPassword = await hashPassword(admin.password);
	const userAdapter = new UserAdapter();
	const existingUser = await userAdapter.getUserByEmail({ email: admin.email });

	if (existingUser) {
		await userAdapter.updateUserAttributes(existingUser._id, {
			username: admin.username,
			password: hashedPassword,
			role: 'admin',
			isRegistered: true,
			updatedAt: new Date()
		});
		logger.info('Admin user updated', { correlationId, email: admin.email });
	} else {
		await userAdapter.createUser({
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
			const regex = new RegExp(`${key}:\\s*(['"]?)[^'"]*\\1`);
			if (regex.test(configContent)) {
				configContent = configContent.replace(regex, `${key}: ${value}`);
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
