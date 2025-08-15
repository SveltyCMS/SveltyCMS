/**
 * @file src/routes/api/setup/complete/+server.ts
 * @description API endpoint to complete the setup process
 */

import { UserAdapter } from '@src/auth/mongoDBAuth/userAdapter';
import { connectToMongoDBWithConfig } from '@src/databases/mongodb/dbconnect';
import { config } from '@src/lib/config.server';
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

		// Step 1: Ensure database connection is established
		await connectToMongoDBWithConfig(database);

		// Step 2: Clear any existing data from database
		await clearExistingDatabase();

		// Step 3: Initialize database models and collections
		await initializeDatabaseModels();

		// Step 4: Save all settings to database
		await saveSettingsToDatabase(system, apiKeys || {});

		// Step 5: Create admin user
		await createAdminUser(admin);

		// Step 6: Invalidate settings cache and reload from database
		config.invalidateCache();

		// Force reload the settings from database (with error handling)
		try {
			await config.refresh();
		} catch (loadError) {
			console.warn('Could not reload settings cache, continuing anyway:', loadError);
		}

		// Step 7: Update environment files with database settings (before response to avoid server restart)
		try {
			await updateEnvironmentFiles(database);
		} catch (error) {
			console.error('Error updating environment files:', error);
		}

		// Step 8: Send response after all setup is complete
		const response = json({
			success: true,
			message: 'Setup completed successfully'
		});

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

async function updateEnvironmentFiles(dbConfig: DatabaseConfig) {
	const fs = await import('fs/promises');
	const path = await import('path');

	// Update .env file (static/private - build-time variables)
	const envPath = path.resolve(process.cwd(), '.env');
	const envLocalPath = path.resolve(process.cwd(), '.env.local');

	// Generate JWT and encryption keys if not already present
	const jwtSecret = generateRandomKey();
	const encryptionKey = generateRandomKey();

	// Create .env content (build-time variables)
	const envContent = `# =============================================================================
# DATABASE CONFIGURATION (Required for initial connection)
# =============================================================================

# Database Type (default: mongodb)
DB_TYPE=${dbConfig.type}

# Database Connection
DB_HOST=${dbConfig.host}
DB_PORT=${dbConfig.port}

# =============================================================================
# SECURITY CONFIGURATION (Required for authentication and encryption)
# =============================================================================

# JWT Secret Key (for authentication - use a strong, unique key)
JWT_SECRET_KEY=${jwtSecret}

# Encryption Key (for data security - must be exactly 32 characters)
ENCRYPTION_KEY=${encryptionKey}
`;

	// Create .env.local content (runtime variables)
	const envLocalContent = `# =============================================================================
# RUNTIME DATABASE CONFIGURATION
# =============================================================================

# Database Name
DB_NAME=${dbConfig.name}

# Database Credentials (if required)
DB_USER=${dbConfig.user || ''}
DB_PASSWORD=${dbConfig.password || ''}
`;

	try {
		// Write .env file
		await fs.writeFile(envPath, envContent, 'utf8');

		// Write .env.local file
		await fs.writeFile(envLocalPath, envLocalContent, 'utf8');
	} catch (error) {
		console.error('Error writing environment files:', error);
		throw error;
	}
}

// Helper function to generate random keys for JWT and encryption
function generateRandomKey(): string {
	return randomBytes(32).toString('hex');
}

/**
 * Initialize all database models and collections
 */
async function initializeDatabaseModels(): Promise<void> {
	try {
		// Import the database adapter
		const { MongoDBAdapter } = await import('@src/databases/mongodb/mongoDBAdapter');
		const dbAdapter = new MongoDBAdapter();

		// Setup all models
		await dbAdapter.auth.setupAuthModels();
		await dbAdapter.media.setupMediaModels();
		await dbAdapter.widgets.setupWidgetModels();

		// Initialize roles and permissions
		const { initializeRoles } = await import('@root/config/roles');
		await initializeRoles();

		// Initialize content structure models
		const { registerContentStructureDiscriminators } = await import('@src/databases/mongodb/models/contentStructure');
		registerContentStructureDiscriminators();

		// Initialize theme models (basic setup)
		const { themeSchema } = await import('@src/databases/mongodb/models/theme');
		// Just ensure the model is registered
		if (!mongoose.models.Theme) {
			mongoose.model('Theme', themeSchema);
		}

		// Initialize virtual folder models (basic setup)
		const { systemVirtualFolderSchema } = await import('@src/databases/mongodb/models/systemVirtualFolder');
		// Just ensure the model is registered
		if (!mongoose.models.SystemVirtualFolder) {
			mongoose.model('SystemVirtualFolder', systemVirtualFolderSchema);
		}
	} catch (error) {
		console.error('Error initializing database models:', error);
		throw error;
	}
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

		// Drop all collections
		for (const collection of collections) {
			try {
				await mongoose.connection.db.dropCollection(collection.name);
			} catch (error) {
				// If the error is just that collection doesn't exist, that's fine
				if (!error.message?.includes('ns not found')) {
					console.error(`Error dropping collection ${collection.name}:`, error);
					throw error;
				}
			}
		}
	} catch (error) {
		console.error('Error clearing database:', error);
		throw error;
	}
}

async function saveSettingsToDatabase(system: SystemConfig, apiKeys: ApiKeysConfig) {
	const settings = [
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

	// Use the SystemSettingModel for key-value settings (this is the correct model for settings)
	const { SystemSettingModel } = await import('@src/databases/mongodb/models/setting');
	for (const setting of settings) {
		await SystemSettingModel.updateOne(
			{ key: setting.key },
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

		return await userAdapter.updateUserAttributes(existingUser._id, updatedData);
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

		return result;
	}
}
