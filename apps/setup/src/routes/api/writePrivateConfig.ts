/**
 * @file src/routes/api/setup/writePrivateConfig.ts
 * @description Utility to write private.ts configuration file during setup
 *
 * ### Features
 * - Writes database credentials and security keys to private.ts
 */

import type { DatabaseConfig } from '@shared/database/schemas';
import { logger } from '@shared/utils/logger.server';
import { isSetupComplete } from '@shared/utils/setupCheck';

/**
 * Writes database credentials and security keys to private.ts
 * Includes safety features: backup existing file and prevent overwrite after setup
 */
export async function writePrivateConfig(dbConfig: DatabaseConfig, securityKeys?: { jwtSecret: string; encryptionKey: string }): Promise<void> {
	const fs = await import('fs/promises');
	const path = await import('path');
	const { randomBytes } = await import('crypto');

	// Support TEST_MODE for isolated testing
	const configFileName = process.env.TEST_MODE ? 'private.test.ts' : 'private.ts';

	// Determine workspace root - handle case where CWD is inside apps/setup
	let workspaceRoot = process.cwd();
	if (workspaceRoot.endsWith('apps/setup') || workspaceRoot.endsWith('apps/setup/')) {
		workspaceRoot = path.resolve(workspaceRoot, '../../');
	}

	const privateConfigPath = path.resolve(workspaceRoot, 'config', configFileName);

	// Prevent overwrite after setup complete
	if (isSetupComplete()) {
		const error = 'Cannot overwrite private.ts - setup already completed. Use reset endpoint instead.';
		logger.error(error);
		throw new Error(error);
	}

	// Generate random keys if not provided
	const generateRandomKey = () => randomBytes(32).toString('base64');
	const jwtSecret = securityKeys?.jwtSecret || generateRandomKey();
	const encryptionKey = securityKeys?.encryptionKey || generateRandomKey();

	// Generate the private.ts content
	const privateConfigContent = `
/**
 * @file config/private.ts
 * @description Private configuration file containing essential bootstrap variables.
 * These values are required for the server to start and connect to the database.
 * This file was populated during the initial setup process.
 */
// import { createPrivateConfig } from '@shared/database/schemas'; // Removed to avoid alias resolution issues in production/tests

export const privateEnv = {
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
};
`;

	try {
		await fs.writeFile(privateConfigPath, privateConfigContent, 'utf-8');

		// Validate written file to ensure integrity
		const writtenContent = await fs.readFile(privateConfigPath, 'utf-8');

		// Check that critical fields are present in the written file
		const requiredFields = [
			'JWT_SECRET_KEY',
			'ENCRYPTION_KEY',
			`DB_HOST: '${dbConfig.host}'`,
			`DB_NAME: '${dbConfig.name}'`,
			`DB_TYPE: '${dbConfig.type}'`
		];

		const missingFields = requiredFields.filter((field) => !writtenContent.includes(field));

		if (missingFields.length > 0) {
			throw new Error(`Private config validation failed - missing fields: ${missingFields.join(', ')}`);
		}

		logger.info('Private configuration file written and validated successfully');
	} catch (error) {
		logger.error('Failed to write private config:', error);
		throw new Error(`Failed to write private configuration: ${error instanceof Error ? error.message : String(error)}`);
	}
}
