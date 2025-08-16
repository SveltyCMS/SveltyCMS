/**
 * @file src/routes/api/setup/complete/+server.ts
 * @description API endpoint to complete the setup process
 */

import { UserAdapter } from '@src/auth/mongoDBAuth/userAdapter';
import { connectToMongoDBWithConfig } from '@src/databases/mongodb/dbconnect';
import { getPublicSettings, invalidateSettingsCache, loadGlobalSettings } from '@src/stores/globalSettings';
import { setupAdminSchema } from '@src/utils/formSchemas';
import { hashPassword } from '@src/utils/password';
import { json } from '@sveltejs/kit';
import { randomBytes } from 'crypto';
import mongoose from 'mongoose';
import { safeParse } from 'valibot';
import type { RequestHandler } from './$types';

// Interface definitions for better type safety
interface DatabaseConfig {
	type: string;
	host: string;
	port: number;
	name: string;
	user: string;
	password: string;
}

interface SystemConfig {
	siteName: string;
	hostDev: string;
	hostProd: string;
	defaultLanguage: string;
	availableLanguages: string[];
	mediaFolder: string;
	useGoogleOAuth?: boolean;
	useRedis?: boolean;
	useMapbox?: boolean;
}

interface ApiKeysConfig {
	googleClientId?: string;
	googleClientSecret?: string;
	redisHost?: string;
	redisPort?: string;
	redisPassword?: string;
	mapboxApiToken?: string;
	secretMapboxApiToken?: string;
}

interface AdminConfig {
	username: string;
	email: string;
	password: string;
	confirmPassword: string;
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const setupData = await request.json();
		const { database, admin, system, apiKeys } = setupData;

		console.log('🚀 Starting setup completion process...');
		console.log('📊 Database config:', { host: database.host, name: database.name, user: database.user });

		// Step 1: Ensure database connection is established
		console.log('🔌 Connecting to MongoDB...');
		await connectToMongoDBWithConfig(database);
		console.log('✅ MongoDB connection established');

		// Step 2: Clear any existing data from database
		console.log('🧹 Clearing existing database collections...');
		await clearExistingDatabase();
		console.log('✅ Database cleared of old data');

		// Step 3: Save all settings to database
		console.log('💾 Saving settings to database...');
		await saveSettingsToDatabase(system, apiKeys || {});
		console.log('✅ Settings saved to database');

		// Step 4: Create admin user
		console.log('👤 Creating/updating admin user...');
		await createAdminUser(admin);
		console.log('✅ Admin user processed');

		// Step 5: Invalidate settings cache and reload from database
		console.log('🔄 Invalidating settings cache...');
		invalidateSettingsCache();

		// Force reload the settings from database (with error handling)
		try {
			await loadGlobalSettings();
			console.log('✅ Settings cache reloaded from database');

			// Double-check that the setup completion was saved
			const settings = getPublicSettings();
			console.log('📊 Setup verification:', {
				SETUP_COMPLETED: settings.SETUP_COMPLETED,
				SITE_NAME: settings.SITE_NAME
			});
		} catch (loadError) {
			console.warn('⚠️ Could not reload settings cache, continuing anyway:', loadError);
		}

		// Step 6: Send response immediately before any potential server restart
		const response = json({
			success: true,
			message: 'Setup completed successfully'
		});

		// Step 7: Update private config file with database settings (do this after response)
		// Use a longer delay to allow the response to be sent and prevent immediate reload issues
		setTimeout(async () => {
			try {
				const fs = await import('fs/promises');
				const path = await import('path');
				const configPath = path.resolve(process.cwd(), 'config/private.ts');
				const configContent = await fs.readFile(configPath, 'utf8');

				// Check if config needs updating (only update if different)
				const needsUpdate =
					!configContent.includes(`DB_HOST: '${database.host}'`) ||
					!configContent.includes(`DB_NAME: '${database.name}'`) ||
					!configContent.includes(`DB_USER: '${database.user}'`);

				if (needsUpdate) {
					await updatePrivateConfig(database);
					console.log('✅ Private config updated successfully');
				} else {
					console.log('ℹ️ Private config already up to date, skipping update');
				}
			} catch (error) {
				console.error('❌ Error updating private config:', error);
			}
		}, 2000); // 2 second delay instead of setImmediate

		return response;
	} catch (error) {
		console.error('Setup completion error:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error during setup'
			},
			{ status: 500 }
		);
	}
};

async function updatePrivateConfig(dbConfig: DatabaseConfig) {
	const fs = await import('fs/promises');
	const path = await import('path');

	const configPath = path.resolve(process.cwd(), 'config/private.ts');

	// Only update if file already exists; do NOT create (template copy happens in vite.config)
	const exists = await fs
		.access(configPath)
		.then(() => true)
		.catch(() => false);
	if (!exists) {
		console.warn('⚠️ Skipping private config update – file missing (should have been created from template earlier).');
		return;
	}

	let configContent = await fs.readFile(configPath, 'utf8');

	// Ensure header comment matches simplified format (optional)
	configContent = configContent.replace(
		/\/\*\*[\s\S]*?@description[\s\S]*?\*\/\n/,
		`/**\n * @file config/private.ts\n * @description Private configuration file - will be populated during setup\n */\n\n`
	);

	// Replace DB fields
	configContent = configContent
		.replace(/DB_TYPE:\s*['"][^'"]*['"]/, `DB_TYPE: '${dbConfig.type}'`)
		.replace(/DB_HOST:\s*['"][^'"]*['"]/, `DB_HOST: '${dbConfig.host}'`)
		.replace(/DB_PORT:\s*\d+/, `DB_PORT: ${dbConfig.port}`)
		.replace(/DB_NAME:\s*['"][^'"]*['"]/, `DB_NAME: '${dbConfig.name}'`)
		.replace(/DB_USER:\s*['"][^'"]*['"]/, `DB_USER: '${dbConfig.user}'`)
		.replace(/DB_PASSWORD:\s*['"][^'"]*['"]/, `DB_PASSWORD: '${dbConfig.password}'`);

	// If JWT secret empty in file, inject one (search for JWT_SECRET_KEY: '' or undefined)
	if (/JWT_SECRET_KEY:\s*['"]{2}/.test(configContent)) {
		configContent = configContent.replace(/JWT_SECRET_KEY:\s*['"]{2}/, `JWT_SECRET_KEY: '${generateRandomKey()}'`);
	}

	await fs.writeFile(configPath, configContent);
}

// Helper function to generate random keys for JWT and encryption
function generateRandomKey(): string {
	return randomBytes(32).toString('hex');
}

/**
 * Clear all existing collections from the database to ensure a clean setup
 */
async function clearExistingDatabase(): Promise<void> {
	try {
		// Ensure we're connected to MongoDB
		if (mongoose.connection.readyState !== 1) {
			throw new Error('MongoDB connection not established');
		}

		// Get all collection names
		const collections = await mongoose.connection.db.listCollections().toArray();
		console.log(`🧹 Found ${collections.length} existing collections to remove`);

		// Drop all collections
		for (const collection of collections) {
			try {
				await mongoose.connection.db.dropCollection(collection.name);
				console.log(`  ✅ Dropped collection: ${collection.name}`);
			} catch (error) {
				// If the error is just that collection doesn't exist, that's fine
				if (error.message?.includes('ns not found')) {
					console.log(`  ⚠️ Collection ${collection.name} already dropped`);
				} else {
					console.error(`  ❌ Error dropping collection ${collection.name}:`, error);
					throw error;
				}
			}
		}

		console.log(`🧹 Database cleared: dropped ${collections.length} collections`);
	} catch (error) {
		console.error('❌ Error clearing database:', error);
		throw error;
	}
}

async function saveSettingsToDatabase(system: SystemConfig, apiKeys: ApiKeysConfig) {
	const settings = [
		// Setup completion marker (public so it can be checked)
		{ key: 'SETUP_COMPLETED', value: true, visibility: 'public' },
		{ key: 'SETUP_COMPLETED_AT', value: new Date().toISOString(), visibility: 'private' },

		// Public settings
		{ key: 'SITE_NAME', value: system.siteName, visibility: 'public' },
		{ key: 'HOST_DEV', value: system.hostDev, visibility: 'public' },
		{ key: 'HOST_PROD', value: system.hostProd, visibility: 'public' },
		{ key: 'DEFAULT_CONTENT_LANGUAGE', value: system.defaultLanguage, visibility: 'public' },
		{ key: 'AVAILABLE_CONTENT_LANGUAGES', value: system.availableLanguages, visibility: 'public' },
		{ key: 'BASE_LOCALE', value: system.defaultLanguage, visibility: 'public' }, // Set base locale to default language
		{ key: 'LOCALES', value: system.availableLanguages, visibility: 'public' }, // Set locales to available languages
		{ key: 'MEDIA_FOLDER', value: system.mediaFolder, visibility: 'public' },

		// Essential settings with defaults
		{ key: 'PASSWORD_LENGTH', value: 8, visibility: 'public' },
		{ key: 'MAX_FILE_SIZE', value: 10485760, visibility: 'public' }, // 10MB
		{ key: 'BODY_SIZE_LIMIT', value: 10485760, visibility: 'public' }, // 10MB
		{ key: 'DEMO', value: false, visibility: 'public' },
		{ key: 'SEASONS', value: false, visibility: 'public' },
		{ key: 'SEASON_REGION', value: 'Western_Europe', visibility: 'public' },

		// Image processing defaults
		{ key: 'IMAGE_SIZES', value: { sm: 320, md: 640, lg: 1024, xl: 1920 }, visibility: 'public' },
		{ key: 'MEDIA_OUTPUT_FORMAT_QUALITY', value: { format: 'webp', quality: 80 }, visibility: 'public' },

		// Logging defaults
		{ key: 'LOG_RETENTION_DAYS', value: 30, visibility: 'private' },
		{ key: 'LOG_LEVELS', value: ['error', 'warn', 'info'], visibility: 'private' },

		// Private settings
		{ key: 'USE_GOOGLE_OAUTH', value: system.useGoogleOAuth, visibility: 'private' },
		{ key: 'USE_REDIS', value: system.useRedis, visibility: 'private' },
		{ key: 'USE_MAPBOX', value: system.useMapbox, visibility: 'private' },

		// API keys (private)
		{ key: 'GOOGLE_CLIENT_ID', value: apiKeys?.googleClientId ?? undefined, visibility: 'private' },
		{ key: 'GOOGLE_CLIENT_SECRET', value: apiKeys?.googleClientSecret ?? undefined, visibility: 'private' },
		{ key: 'REDIS_HOST', value: apiKeys?.redisHost ?? undefined, visibility: 'private' },
		{ key: 'REDIS_PORT', value: apiKeys?.redisPort ?? undefined, visibility: 'private' },
		{ key: 'REDIS_PASSWORD', value: apiKeys?.redisPassword ?? undefined, visibility: 'private' },
		{ key: 'MAPBOX_API_TOKEN', value: apiKeys?.mapboxApiToken ?? undefined, visibility: 'private' },
		{ key: 'SECRET_MAPBOX_API_TOKEN', value: apiKeys?.secretMapboxApiToken ?? undefined, visibility: 'private' }
	];

	// Use the dedicated SystemSettingModel for key-value settings
	const { SystemSettingModel } = await import('@src/databases/mongodb/models/setting');
	for (const setting of settings) {
		await SystemSettingModel.updateOne(
			{ key: setting.key, scope: 'system' },
			{
				$set: {
					key: setting.key,
					value: setting.value,
					scope: 'system',
					visibility: setting.visibility,
					isGlobal: true,
					updatedAt: new Date()
				}
			},
			{ upsert: true }
		);
	}
}

async function createAdminUser(admin: AdminConfig) {
	// Debug: Log admin email before calling getUserByEmail
	console.log('Backend received admin email:', admin.email);
	if (!admin.username || !admin.email || !admin.password) {
		throw new Error('Admin user information is incomplete');
	}
	if (typeof admin.email !== 'string' || !admin.email.trim() || !admin.email.includes('@')) {
		throw new Error('Admin email is missing or invalid.');
	}

	// Validate admin user data against centralized schema
	const validationResult = safeParse(setupAdminSchema, admin);
	if (!validationResult.success) {
		const errors = validationResult.issues.map((issue) => issue.message).join(', ');
		throw new Error(`Invalid admin user data: ${errors}`);
	}

	// Hash the password using the centralized password utility
	const hashedPassword = await hashPassword(admin.password);

	// Use the user adapter
	const userAdapter = new UserAdapter();

	// Check if user already exists
	const existingUser = await userAdapter.getUserByEmail({ email: admin.email });

	if (existingUser) {
		// User exists, update their information
		const updatedData = {
			username: admin.username,
			password: hashedPassword,
			role: 'admin',
			isRegistered: true,
			updatedAt: new Date()
		};

		const result = await userAdapter.updateUserAttributes(existingUser._id, updatedData);
		console.log(`Admin user updated: ${admin.email}`);
		return result;
	} else {
		// User doesn't exist, create new one
		const userData = {
			username: admin.username,
			email: admin.email,
			password: hashedPassword,
			role: 'admin',
			isRegistered: true,
			createdAt: new Date(),
			updatedAt: new Date()
		};

		const result = await userAdapter.createUser(userData);
		if (!result) {
			throw new Error('Failed to create admin user');
		}

		console.log(`Admin user created: ${admin.email}`);
		return result;
	}
}
