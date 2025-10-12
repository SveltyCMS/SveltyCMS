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
 * This is called from hooks after config check passes and database is initialized.
 */
export async function isSetupCompleteAsync(): Promise<boolean> {
	// First check config file
	if (!isSetupComplete()) {
		console.log('[setupCheck] Config check failed');
		return false;
	}

	// If we've already checked the database, return cached result
	if (setupStatusCheckedDb) {
		console.log('[setupCheck] Returning cached DB check result:', setupStatus);
		return setupStatus ?? false;
	}

	try {
		// Dynamically import db module to avoid circular dependencies
		const db = await import('@src/databases/db');
		const dbAdapter = db.dbAdapter;

		// console.log('[setupCheck] dbAdapter exists:', !!dbAdapter);
		// console.log('[setupCheck] dbAdapter.auth exists:', !!dbAdapter?.auth);

		if (!dbAdapter || !dbAdapter.auth) {
			// Database not initialized yet - don't cache this, allow retry
			console.log('[setupCheck] Database not initialized yet');
			return false;
		}

		// Check if admin users exist in database using dbAdapter.auth
		console.log('[setupCheck] Calling getAllUsers...');
		const result = await dbAdapter.auth.getAllUsers({ limit: 1 });
		console.log('[setupCheck] getAllUsers result:', {
			success: result.success,
			hasData: result.success ? !!result.data : false,
			dataLength: result.success ? result.data?.length : 0,
			error: !result.success ? result.error : null
		});

		const hasUsers = result.success && result.data && result.data.length > 0;

		setupStatus = hasUsers;
		setupStatusCheckedDb = true;
		console.log('[setupCheck] Setup complete:', hasUsers);
		return hasUsers;
	} catch (error) {
		// Database check failed - might be dropped DB or connection issue
		console.error(`[SveltyCMS] ❌ Database validation failed during setup check:`, error);
		// Don't cache failures - allow retry on next request
		return false;
	}
}

/**
 * Invalidates the cached setup status, forcing a recheck on the next call to isSetupComplete().
 * This should be called after setup completion to ensure the cache is updated.
 * @param clearPrivateEnv - Whether to clear private environment config (default: false during setup completion)
 */
export function invalidateSetupCache(clearPrivateEnv = false): void {
	setupStatus = null;
	setupStatusCheckedDb = false;

	// Also clear the database initialization state to force a fresh init
	// This ensures that after setup completes, the system will fully reinitialize
	// During setup completion, we DON'T clear privateEnv so initialization can use it
	if (clearPrivateEnv) {
		import('@src/databases/db')
			.then((db) => {
				if (db.clearPrivateConfigCache) {
					db.clearPrivateConfigCache(false); // Don't keep privateEnv
				}
			})
			.catch(() => {
				// Ignore errors during cache clear (db module might not be loaded yet)
			});
	}
}
