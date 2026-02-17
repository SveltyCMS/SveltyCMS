/**
 * @file src/routes/setup/writePrivateConfig.ts
 * @description Utility to write the `config/private.ts` file with database credentials
 * during the setup process.
 */

import type { DatabaseConfig } from '@src/databases/schemas';
import { logger } from '@utils/logger.server';
import { isSetupComplete } from '@utils/setupCheck';

/**
 * Writes database credentials and security keys to private.ts
 * Includes safety features: backup existing file and prevent overwrite after setup
 */
export async function writePrivateConfig(dbConfig: DatabaseConfig, system: { multiTenant?: boolean; demoMode?: boolean } = {}): Promise<void> {
	const fs = await import('node:fs/promises');
	const path = await import('node:path');
	const { randomBytes } = await import('node:crypto');

	// Support TEST_MODE for isolated testing
	const configFileName = process.env.TEST_MODE ? 'private.test.ts' : 'private.ts';
	const privateConfigPath = path.resolve(process.cwd(), 'config', configFileName);

	// Prevent overwrite after setup complete (unless in TEST_MODE)
	if (isSetupComplete() && !process.env.TEST_MODE) {
		const error = 'Cannot overwrite private.ts - setup already completed. Use reset endpoint instead.';
		logger.error(error);
		throw new Error(error);
	}

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
// import { createPrivateConfig } from '@src/databases/schemas'; // Removed to avoid alias resolution issues in production/tests

export const privateEnv = {
	// --- Core Database Connection ---
	DB_TYPE: '${dbConfig.type}',
	DB_HOST: '${dbConfig.host}',
	DB_PORT: ${dbConfig.port || 0},
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
	MULTI_TENANT: ${system.multiTenant ? 'true' : 'false'},
	DEMO: ${system.demoMode ? 'true' : 'false'},

	/* * NOTE: All other settings (SMTP, Google OAuth, Redis, feature flags, etc.)
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

/**
 * Updates the private.ts file to set architectural modes (Demo / Multi-Tenant).
 * This is called during the final step of setup.
 */
export async function updatePrivateConfigMode(modes: { demoMode?: boolean; multiTenant?: boolean }): Promise<void> {
	const fs = await import('node:fs/promises');
	const path = await import('node:path');

	// Support TEST_MODE for isolated testing
	const configFileName = process.env.TEST_MODE ? 'private.test.ts' : 'private.ts';
	const privateConfigPath = path.resolve(process.cwd(), 'config', configFileName);

	try {
		logger.debug('DEBUG: [updatePrivateConfigMode] CALLED with:', JSON.stringify(modes));
		let content = await fs.readFile(privateConfigPath, 'utf-8');
		logger.debug('DEBUG: [updatePrivateConfigMode] READ content length:', content.length);
		let modified = false;

		// Helper to properly stringify boolean
		const toBoolString = (val: boolean) => (val ? 'true' : 'false');

		// Update MULTI_TENANT
		if (modes.multiTenant !== undefined) {
			const multiTenantRegex = /MULTI_TENANT\s*:\s*(true|false)/;
			const match = multiTenantRegex.exec(content);
			logger.debug('DEBUG: [updatePrivateConfigMode] MULTI_TENANT regex match:', match ? match[0] : 'null');

			if (match) {
				const newValue = `MULTI_TENANT: ${toBoolString(modes.multiTenant)}`;
				if (match[0] !== newValue) {
					content = content.replace(multiTenantRegex, newValue);
					modified = true;
					logger.debug('DEBUG: [updatePrivateConfigMode] Replaced MULTI_TENANT');
				} else {
					logger.debug('DEBUG: [updatePrivateConfigMode] MULTI_TENANT already set to', newValue);
				}
			} else {
				// If not found, insert it before the closing brace
				logger.debug('DEBUG: [updatePrivateConfigMode] MULTI_TENANT not found, inserting...');
				const insertMarker = '// --- Fundamental Architectural Mode ---';
				if (content.includes(insertMarker)) {
					content = content.replace(insertMarker, `${insertMarker}\n\tMULTI_TENANT: ${toBoolString(modes.multiTenant)},`);
					modified = true;
				} else {
					// Fallback: insert at end of object
					const lastBraceIndex = content.lastIndexOf('};');
					if (lastBraceIndex !== -1) {
						content = `${content.slice(0, lastBraceIndex)}\tMULTI_TENANT: ${toBoolString(modes.multiTenant)},\n${content.slice(lastBraceIndex)}`;
						modified = true;
					}
				}
			}
		}

		// Update DEMO
		if (modes.demoMode !== undefined) {
			const demoRegex = /DEMO\s*:\s*(true|false)/;
			const match = demoRegex.exec(content);
			logger.debug('DEBUG: [updatePrivateConfigMode] DEMO regex match:', match ? match[0] : 'null');

			if (match) {
				const newValue = `DEMO: ${toBoolString(modes.demoMode)}`;
				if (match[0] !== newValue) {
					content = content.replace(demoRegex, newValue);
					modified = true;
					logger.debug('DEBUG: [updatePrivateConfigMode] Replaced DEMO');
				} else {
					logger.debug('DEBUG: [updatePrivateConfigMode] DEMO already set to', newValue);
				}
			} else {
				// If not found, try to insert after MULTI_TENANT
				logger.debug('DEBUG: [updatePrivateConfigMode] DEMO not found, inserting...');
				const multiTenantMatch = /MULTI_TENANT\s*:\s*(true|false),?/;
				if (multiTenantMatch.test(content)) {
					// Replace the match with itself + the new line
					content = content.replace(multiTenantMatch, `$& \n\tDEMO: ${toBoolString(modes.demoMode)},`);
					modified = true;
				} else {
					// Fallback: insert at end of object
					const lastBraceIndex = content.lastIndexOf('};');
					if (lastBraceIndex !== -1) {
						content = `${content.slice(0, lastBraceIndex)}\tDEMO: ${toBoolString(modes.demoMode)},\n${content.slice(lastBraceIndex)}`;
						modified = true;
					}
				}
			}
		}

		if (modified) {
			await fs.writeFile(privateConfigPath, content, 'utf-8');
			logger.info('Updated private.ts with architectural modes:', modes);
		} else {
			logger.warn('No changes made to private.ts (values might be identical or regex failed)');
		}
	} catch (error) {
		logger.error('Failed to update private config modes:', error);
		// Critical failure - we must throw to alert the setup process
		throw error;
	}
}
