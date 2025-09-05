/**
 * @file src/utils/setupCheck.ts
 * @description Centralized setup completion check utility
 *
 * This provides a single source of truth for determining if setup is complete.
 * Setup is considered complete if the private config file exists and contains
 * the essential configuration values like JWT_SECRET_KEY.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Check if setup is complete by verifying the private config file exists
 * and contains essential configuration
 */
export function isSetupComplete(): boolean {
	try {
		// Check if private config file exists
		const privateConfigPath = join(process.cwd(), 'config', 'private.ts');

		if (!existsSync(privateConfigPath)) {
			console.debug('Setup not complete: private.ts file does not exist');
			return false;
		}

		// Read the file content and check for essential values
		try {
			const configContent = readFileSync(privateConfigPath, 'utf8');

			// Check for JWT_SECRET_KEY as the primary indicator
			const hasJwtSecret =
				configContent.includes('JWT_SECRET_KEY') &&
				!configContent.includes('JWT_SECRET_KEY: ""') &&
				!configContent.includes("JWT_SECRET_KEY: ''") &&
				!configContent.includes('JWT_SECRET_KEY: ``');

			if (!hasJwtSecret) {
				console.debug('Setup not complete: JWT_SECRET_KEY not found or empty in private.ts');
				return false;
			}

			// Check for database configuration (individual DB fields)
			const hasDbConfig =
				configContent.includes('DB_TYPE') &&
				configContent.includes('DB_HOST') &&
				configContent.includes('DB_NAME') &&
				configContent.includes('DB_USER') &&
				configContent.includes('DB_PASSWORD') &&
				!configContent.includes('DB_HOST: ""') &&
				!configContent.includes("DB_HOST: ''") &&
				!configContent.includes('DB_HOST: ``') &&
				!configContent.includes('DB_NAME: ""') &&
				!configContent.includes("DB_NAME: ''") &&
				!configContent.includes('DB_NAME: ``');

			if (!hasDbConfig) {
				console.debug('Setup not complete: DB configuration not found or empty in private.ts');
				return false;
			}

			console.debug('Setup is complete: private.ts exists with required configuration');
			return true;
		} catch (readError) {
			console.debug(`Setup not complete: Failed to read private.ts - ${readError.message}`);
			return false;
		}
	} catch (error) {
		console.debug(`Setup not complete: Error checking setup status - ${error.message}`);
		return false;
	}
}

/**
 * Async version that can be used in server contexts where needed
 */
export async function isSetupCompleteAsync(): Promise<boolean> {
	return isSetupComplete();
}
