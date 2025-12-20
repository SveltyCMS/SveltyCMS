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
		const privateConfigPath = path.join(process.cwd(), 'config', 'private.ts');

		if (!fs.existsSync(privateConfigPath)) {
			setupStatus = false;
			return setupStatus;
		}

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
		if (!dbAdapter || !dbAdapter.auth) {
			if (process.env.NODE_ENV === 'development') {
				console.log('[setupCheck] Database adapter not ready yet');
			}
			return false;
		}

		// 4. Data Verification: Check if admin users exist
		const result = await dbAdapter.auth.getAllUsers({ limit: 1 });
		const hasUsers = result.success && result.data && result.data.length > 0;

		// Update cache
		setupStatus = hasUsers;
		setupStatusCheckedDb = true;
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
