/**
 * @file src/utils/setupCheck.ts
 * @description Centralized and memoized setup completion check utility.
 *
 * @improvements
 * - **Relative Imports:** Uses `../databases/db` instead of aliases to ensure safety when running inside `vite.config.ts`.
 * - **Namespace Imports:** Uses `fs` and `path` namespaces for consistency with other server utilities.
 * - **Robustness:** Stronger checks during dynamic imports.
 */

import fs from 'node:fs';
import path from 'node:path';

// Memoization variable to cache the setup status.
let setupStatus: boolean | null = null;
let setupStatusCheckedDb = false;

export function isSetupComplete(): boolean {
	if (setupStatus !== null) {
		return setupStatus;
	}

	try {
		// Use process.cwd() to ensure we look at the project root
		// Support TEST_MODE for isolated testing without affecting live config
		const configFileName = process.env.TEST_MODE ? 'private.test.ts' : 'private.ts';
		const privateConfigPath = path.join(process.cwd(), 'config', configFileName);

		if (!fs.existsSync(privateConfigPath)) {
			if (process.env.TEST_MODE) console.log(`[setupCheck] ${configFileName} NOT FOUND`);
			setupStatus = false;
			return setupStatus;
		}
		if (process.env.TEST_MODE) console.log(`[setupCheck] ${configFileName} FOUND`);

		const configContent = fs.readFileSync(privateConfigPath, 'utf8');

		// Regex checks to ensure keys are not set to empty strings
		// Supports both Object property style (Key: "Value") and Variable assignment style (Key = "Value")
		const hasJwtSecret = !/JWT_SECRET_KEY[:=]\s*(""|''|``)/.test(configContent);
		const hasDbHost = !/DB_HOST[:=]\s*(""|''|``)/.test(configContent);
		const hasDbName = !/DB_NAME[:=]\s*(""|''|``)/.test(configContent);

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
	// 1. Fast fail: Check config file first
	if (!isSetupComplete()) {
		return false;
	}

	// 2. Cache hit: If we've already checked the database, return cached result
	if (setupStatusCheckedDb) {
		return setupStatus ?? false;
	}

	try {
		// 3. Dynamic Import: Use relative path to avoid alias resolution issues in vite.config.ts
		// We perform this check lazily to prevent circular dependencies during boot
		const db = await import('../databases/db');
		const dbAdapter = db.dbAdapter;

		// Guard against uninitialized adapter
		if (!dbAdapter) {
			return false;
		}

		// Check if database is connected before trying to access auth
		if (typeof dbAdapter.isConnected === 'function' && !dbAdapter.isConnected()) {
			// Database not connected yet - return false without caching
			// This allows the check to succeed once connection is established
			return false;
		}

		// Ensure auth is initialized before access
		if (dbAdapter.ensureAuth) {
			await dbAdapter.ensureAuth();
		}

		if (!dbAdapter.auth) {
			console.log('[setupCheck] Auth module not ready after initialization');
			return false;
		}

		// 4. Data Verification: Check if admin users exist
		const result = await dbAdapter.auth.getAllUsers({ limit: 1 });
		// console.log('[setupCheck] User check result:', JSON.stringify(result)); // Uncomment for deep debugging

		const hasUsers = result.success && result.data && result.data.length > 0;
		if (!hasUsers) {
			console.log('[setupCheck] Config exists but NO ADMIN USERS found in DB. Marking setup as incomplete.');
		}

		// Update cache - only mark as checked if we found users
		// This allows a background seeding process to finish and be detected on next request
		setupStatus = hasUsers;
		setupStatusCheckedDb = hasUsers;
		return hasUsers;
	} catch (error) {
		console.error(`[SveltyCMS] ❌ Database validation failed during setup check:`, error);
		// Don't cache failures - allow retry on next request (e.g., if DB is temporarily down)
		return false;
	}
}

/**
 * Invalidates the cached setup status, forcing a recheck on the next call.
 * @param clearPrivateEnv - Whether to clear private environment config (default: false)
 */
export function invalidateSetupCache(clearPrivateEnv = false): void {
	setupStatus = null;
	setupStatusCheckedDb = false;

	if (clearPrivateEnv) {
		// Use relative import here as well for consistency
		import('../databases/db')
			.then((db) => {
				if (typeof db.clearPrivateConfigCache === 'function') {
					db.clearPrivateConfigCache(false);
				}
			})
			.catch((err) => {
				// Ignore module load errors during invalidation, just log warning in dev
				if (process.env.NODE_ENV === 'development') {
					console.warn('[setupCheck] Could not clear private config cache:', err);
				}
			});
	}
}
