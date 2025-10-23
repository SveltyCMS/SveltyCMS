/**
 * @file src/routes/api/setup/writePrivateConfig.ts
 * @description Utility to write private.ts configuration file during setup
 */

import type { DatabaseConfig } from '@src/databases/schemas';
import { logger } from '@utils/logger.svelte';

/**
 * Writes database credentials and security keys to private.ts
 */
export async function writePrivateConfig(dbConfig: DatabaseConfig): Promise<void> {
	const fs = await import('fs/promises');
	const path = await import('path');
	const { randomBytes } = await import('crypto');

	const privateConfigPath = path.resolve(process.cwd(), 'config', 'private.ts');

	// Generate random keys
	const generateRandomKey = () => randomBytes(32).toString('base64');
	const jwtSecret = generateRandomKey();
	const encryptionKey = generateRandomKey();

	// Generate the private.ts content
	const privateConfigContent = `
/**
 * @file config/private.ts
 * @description Private configuration file containing essential bootstrap variables.
 * These values are required for the server to start and connect to the database.
 * This file was populated during the initial setup process.
 */
import { createPrivateConfig } from '@src/databases/schemas';

export const privateEnv = createPrivateConfig({
	// --- Core Database Connection ---
	DB_TYPE: '${dbConfig.type}',
	DB_HOST: '${dbConfig.host}',
	DB_PORT: ${dbConfig.port},
	DB_NAME: '${dbConfig.name}',
	DB_USER: '${dbConfig.user || ''}',
	DB_PASSWORD: '${dbConfig.password || ''}',

	// --- Connection Behavior ---
	DB_RETRY_ATTEMPTS: 5,
	DB_RETRY_DELAY: 3000, // 3 seconds

	// --- Core Security Keys ---
	JWT_SECRET_KEY: '${jwtSecret}',
	ENCRYPTION_KEY: '${encryptionKey}',

	// --- Fundamental Architectural Mode ---
	MULTI_TENANT: false,

	/* * NOTE: All other settings (SMTP, Google OAuth, feature flags, etc.)
	 * are loaded dynamically from the database after the application starts.
	 */
});
`;

	try {
		await fs.writeFile(privateConfigPath, privateConfigContent, 'utf-8');
		logger.info('✅ Private configuration file written successfully');
	} catch (error) {
		logger.error('Failed to write private config:', error);
		throw new Error(`Failed to write private configuration: ${error instanceof Error ? error.message : String(error)}`);
	}
}
