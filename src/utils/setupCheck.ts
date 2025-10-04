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
let setupStatusCheckedDb = false;

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

		// Config file exists and has values - assume setup complete for now
		// Database validation will happen asynchronously in isSetupCompleteAsync()
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
 * Async version that also checks if database has admin users.
 * This is called from hooks after config check passes.
 */
export async function isSetupCompleteAsync(): Promise<boolean> {
	// First check config file
	if (!isSetupComplete()) {
		return false;
	}

	// If we've already checked the database, return cached result
	if (setupStatusCheckedDb) {
		return setupStatus ?? false;
	}

	try {
		// Dynamically import db module to avoid circular dependencies
		const db = await import('@src/databases/db');
		const dbAdapter = db.dbAdapter;

		if (!dbAdapter || !dbAdapter.auth) {
			setupStatus = false;
			setupStatusCheckedDb = true;
			return false;
		}

		// Check if admin users exist in database using dbAdapter.auth
		const result = await dbAdapter.auth.getAllUsers({ limit: 1 });
		const hasUsers = result.success && result.data && result.data.length > 0;

		setupStatus = hasUsers;
		setupStatusCheckedDb = true;
		return hasUsers;
	} catch (error) {
		// Database check failed - might be dropped DB or connection issue
		console.error(`[SveltyCMS] ❌ Database validation failed during setup check:`, error);
		setupStatus = false;
		setupStatusCheckedDb = true;
		return false;
	}
}

/**
 * Invalidates the cached setup status, forcing a recheck on the next call to isSetupComplete().
 * This should be called after setup completion to ensure the cache is updated.
 */
export function invalidateSetupCache(): void {
	setupStatus = null;
	setupStatusCheckedDb = false;
}
