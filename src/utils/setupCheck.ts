/**
 * @file src/utils/setupCheck.ts
 * @description Centralized and memoized setup completion check utility
 *
 * This provides a single, high-performance source of truth for setup status.
 * It is dependency-free to ensure it can be safely used in the vite.config.ts environment.
 * It is designed to be silent, returning only a boolean, leaving logging to the caller.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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

		setupStatus = hasJwtSecret && hasDbHost && hasDbName;
		return setupStatus;
	} catch (error) {
		// Log error here as it's an exceptional case during a critical check
		console.error(`[SveltyCMS] ❌ Error during setup check:`, error);
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
