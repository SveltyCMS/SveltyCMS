/**
 * @file apps/shared-utils/configCheck.ts
 * @description Centralized, generic, and memoized config file check.
 * It is dependency-free and can be used in any app or build script.
 */

import { existsSync, readFileSync } from 'node:fs';

// Memoization variable to cache the setup status.
let configStatus: boolean | null = null;

/**
 * Checks if a config file exists and has key values populated.
 * @param configPath - The absolute path to the private.ts config file.
 */
export function isConfigFilePopulated(configPath: string): boolean {
	if (configStatus !== null) {
		return configStatus;
	}

	try {
		if (!existsSync(configPath)) {
			configStatus = false;
			return configStatus;
		}

		const configContent = readFileSync(configPath, 'utf8');

		// Check for uninitialized placeholder values
		const hasJwtSecret = !/JWT_SECRET_KEY:\s*(""|''|``)/.test(configContent);
		const hasDbHost = !/DB_HOST:\s*(""|''|``)/.test(configContent);
		const hasDbName = !/DB_NAME:\s*(""|''|``)/.test(configContent);

		configStatus = hasJwtSecret && hasDbHost && hasDbName;
		return configStatus;
	} catch (error) {
		// Log error here as it's an exceptional case during a critical check
		console.error(`[ConfigCheck] ❌ Error during config check:`, error);
		configStatus = false;
		return configStatus;
	}
}

// Invalidates the cached config status
export function invalidateConfigCache(): void {
	configStatus = null;
}
