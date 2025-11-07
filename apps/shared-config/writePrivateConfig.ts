/**
 * @file apps/shared-config/writePrivateConfig.ts
 * @description Shared utility to write private.ts configuration file during setup
 * This eliminates the circular dependency between setup-wizard and cms apps.
 */

import type { DatabaseConfig } from './schemas.js';

/**
 * Writes database credentials and security keys to private.ts
 * @param dbConfig - Database configuration from setup wizard
 * @param logger - Optional logger instance for logging (defaults to console)
 */
export async function writePrivateConfig(
	dbConfig: DatabaseConfig,
	logger?: { info: (msg: string) => void; error: (msg: string, err?: unknown) => void }
): Promise<void> {
	const fs = await import('fs/promises');
	const path = await import('path');
	const { randomBytes } = await import('crypto');

	// Use provided logger or fallback to console
	const log = logger || {
		info: (msg: string) => console.log(msg),
		error: (msg: string, err?: unknown) => console.error(msg, err)
	};

	// Config is in workspace root config/ directory
	const privateConfigPath = path.resolve(process.cwd(), '../../config', 'private.ts');

	// Generate random keys
	const generateRandomKey = () => randomBytes(32).toString('base64');
	const jwtSecret = generateRandomKey();
	const encryptionKey = generateRandomKey();

	// Generate the private.ts content
	const privateConfigContent = `/**
 * @file config/private.ts
 * @description Private configuration file containing essential bootstrap variables.
 * These values are required for the server to start and connect to the database.
 * This file was populated during the initial setup process.
 */
import { createPrivateConfig } from '@sveltycms/shared-config/schemas';

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
	MULTI_TENANT: false

	/* NOTE: All other settings (SMTP, Google OAuth, feature flags, etc.)
	 * are loaded dynamically from the database after the application starts.
	 */
});
`;

	try {
		await fs.writeFile(privateConfigPath, privateConfigContent, 'utf-8');
		log.info('✅ Private configuration file written successfully');
	} catch (error) {
		log.error('Failed to write private config:', error);
		throw new Error(
			`Failed to write private configuration: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}
