/**
 * @file src/utils/setupCheck.ts
 * @description Centralized and memoized setup completion check utility.
 *
 * This provides a single, high-performance source of truth for setup status.
 * It is dependency-free to ensure it can be safely used in the vite.config.ts environment.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// A minimal, dependency-free logger for use ONLY during the build-time setup check.
const buildLogger = {
	info: (message: string) => console.log(`[SVELTY] ✅ ${message}`),
	error: (message: string, error: unknown) => console.error(`[SVELTY] ❌ ${message}`, error)
};

// Memoization variable to cache the setup status.
let setupStatus: boolean | null = null;

export function isSetupComplete(): boolean {
	if (setupStatus !== null) {
		return setupStatus;
	}

	try {
		const privateConfigPath = join(process.cwd(), 'config', 'private.ts');
		if (!existsSync(privateConfigPath)) {
			setupStatus = false;
			return setupStatus;
		}

		const configContent = readFileSync(privateConfigPath, 'utf8');

		const hasJwtSecret = !/JWT_SECRET_KEY:\s*(""|''|``)/.test(configContent);
		const hasDbHost = !/DB_HOST:\s*(""|''|``)/.test(configContent);
		const hasDbName = !/DB_NAME:\s*(""|''|``)/.test(configContent);

		if (hasJwtSecret && hasDbHost && hasDbName) {
			buildLogger.info('Setup check passed. Application is configured.');
			setupStatus = true;
		} else {
			setupStatus = false;
		}
		return setupStatus;
	} catch (error) {
		buildLogger.error('Error during setup check:', error);
		setupStatus = false;
		return setupStatus;
	}
}

/**
 * Invalidates the cached setup status, forcing a recheck on the next call to isSetupComplete().
 * This should be called after setup completion to ensure the cache is updated.
 */
export function invalidateSetupCache(): void {
	setupStatus = null;
}
