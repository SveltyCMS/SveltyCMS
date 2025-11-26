/**
 * @file apps/cms/src/utils/setupCheck.ts
 * @description App-specific setup check that validates both config file and database.
 * It imports the generic file checker from shared-utils.
 */

import { join } from 'node:path';
// 1. Import the generic check from nx shared-utils
import { isConfigFilePopulated, invalidateConfigCache } from '../../../shared-utils/configCheck';
// 2. Import app-specific modules
import { dbAdapter } from '../databases/db';

// --- Path Configuration ---
// In monorepo: config is at workspace root (../../config from apps/cms)
const workspaceRoot = join(process.cwd(), '..', '..');
const configDir = join(workspaceRoot, 'config');
const privateConfigPath = join(configDir, 'private.ts');

// --- Memoization for Database Check ---
let dbStatusChecked = false;
let dbStatus: boolean | null = null;

/**
 * Sync check: Checks if the config file is populated.
 * This is safe to use in vite.config.ts
 */
export function isSetupConfigComplete(): boolean {
	// Call the generic, shared function
	return isConfigFilePopulated(privateConfigPath);
}

/**
 * Async version that also checks if database has admin users.
 * This is called from hooks after config check passes and database is initialized.
 */
export async function isSetupCompleteAsync(): Promise<boolean> {
	// 1. Check config file first
	if (!isSetupConfigComplete()) {
		console.log('[setupCheck] Config check failed');
		return false;
	}

	// 2. If we've already checked the database, return cached result
	if (dbStatusChecked) {
		console.log('[setupCheck] Returning cached DB check result:', dbStatus);
		return dbStatus ?? false;
	}

	try {
		// 3. Check if database is initialized (app-specific)
		if (!dbAdapter || !dbAdapter.auth) {
			console.log('[setupCheck] Database not initialized yet');
			return false; // DB not ready, don't cache this
		}

		// 4. Check for admin users (app-specific)
		console.log('[setupCheck] Calling getAllUsers...');
		const result = await dbAdapter.auth.getAllUsers({ limit: 1 });
		console.log('[setupCheck] getAllUsers result:', {
			success: result.success,
			hasData: result.success ? !!result.data : false,
			dataLength: result.success ? result.data?.length : 0,
			error: !result.success ? result.error : null
		});

		const hasUsers = result.success && result.data && result.data.length > 0;

		dbStatus = hasUsers;
		dbStatusChecked = true;
		console.log('[setupCheck] Setup complete:', hasUsers);
		return hasUsers;
	} catch (error) {
		console.error(`[SveltyCMS] ❌ Database validation failed during setup check:`, error);
		return false; // Don't cache failures
	}
}

/**
 * Invalidates the cached setup status, forcing a recheck on the next call.
 * This should be called after setup completion to ensure the cache is updated.
 */
export function invalidateSetupCache(clearPrivateEnv = false): void {
	// 1. Invalidate the shared config cache
	invalidateConfigCache();

	// 2. Invalidate the local DB check cache
	dbStatus = null;
	dbStatusChecked = false;

	// 3. Clear the app-specific DB connection cache
	if (clearPrivateEnv) {
		// This import is safe because it's inside its own app
		import('../databases/db')
			.then((db) => {
				if (db.clearPrivateConfigCache) {
					db.clearPrivateConfigCache(false); // Don't keep privateEnv
				}
			})
			.catch(() => {
				// Ignore errors
			});
	}
}
