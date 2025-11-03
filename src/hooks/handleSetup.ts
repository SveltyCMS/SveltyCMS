/**
 * @file src/hooks/handleSetup.ts
 * @description Middleware to manage the initial application setup process
 *
 * ### Setup Flow
 * 1. **Not Configured**: Config file missing → Allow only setup routes
 * 2. **Configured, No Users**: Config exists but DB empty → Allow only setup routes
 * 3. **Complete**: Config exists and users exist → Block setup routes
 *
 * ### Behavior
 * - Checks setup completion using both sync (config file) and async (database) checks
 * - Redirects all requests to `/setup` if setup is not complete
 * - Blocks access to `/setup` page after completion (redirects to `/login`)
 * - Allows essential assets during setup for the setup UI to function
 * - Uses special response filtering to allow cookies during setup
 *
 * ### Prerequisites
 * - handleSystemState has confirmed system is operational
 * - This hook runs before authentication/authorization
 *
 * @note This middleware will be removed when setup becomes a standalone app
 */

import { redirect, type Handle } from '@sveltejs/kit';
import { isSetupComplete } from '@utils/setupCheck';
import { logger } from '@utils/logger.server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// --- CONSTANTS ---

/**
 * Regex pattern to identify asset requests that should always be allowed.
 * These are essential for the setup page UI to render properly.
 */
const ASSET_REGEX =
	/^\/(?:@vite\/client|@fs\/|src\/|node_modules\/|vite\/|_app|static|favicon\.ico|\.svelte-kit\/generated\/client\/nodes|.*\.(svg|png|jpg|jpeg|gif|css|js|woff|woff2|ttf|eot|map))/;

// --- UTILITY FUNCTIONS ---

/**
 * Checks if a pathname is an allowed route during setup.
 *
 * @param pathname - The URL pathname to check
 * @returns True if the route should be accessible during setup
 */
function isAllowedDuringSetup(pathname: string): boolean {
	return pathname.startsWith('/setup') || pathname.startsWith('/api/setup') || ASSET_REGEX.test(pathname);
}

/**
 * Creates a response resolver with special headers for setup mode.
 * This allows the setup API to set cookies (like admin session) before redirecting.
 */
function createSetupResolver() {
	return {
		filterSerializedResponseHeaders: (name: string) => {
			const lower = name.toLowerCase();
			return lower.startsWith('content-') || lower.startsWith('etag') || lower === 'set-cookie' || lower === 'cache-control';
		}
	};
}

// --- MAIN HOOK ---

export const handleSetup: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	// --- Step 1: Quick Config Check (Synchronous, cached per request) ---
	if (event.locals.__setupConfigExists === undefined) {
		event.locals.__setupConfigExists = isSetupComplete();
	}
	const configExists = event.locals.__setupConfigExists;

	if (!configExists) {
		if (!event.locals.__setupLogged) {
			logger.warn('Config file missing. System requires initial setup.');
			event.locals.__setupLogged = true;
		}
		if (isAllowedDuringSetup(pathname)) {
			return resolve(event, createSetupResolver());
		}
		if (!event.locals.__setupRedirectLogged) {
			logger.debug(`Redirecting ${pathname} to /setup (config missing)`);
			event.locals.__setupRedirectLogged = true;
		}
		throw redirect(302, '/setup');
	}

	// --- Step 2: Config Exists - But Check If It Has Valid Values ---
	// Vite might create private.ts with empty strings on first run
	// We need to verify the config actually has values before blocking setup

	const privateConfigPath = join(process.cwd(), 'config', 'private.ts');
	const configContent = readFileSync(privateConfigPath, 'utf8');

	// Check if essential values are filled (not empty strings)
	// Pattern matches: JWT_SECRET_KEY: '' or JWT_SECRET_KEY: ""
	const hasValidJwtSecret = configContent.includes('JWT_SECRET_KEY') && !/JWT_SECRET_KEY:\s*['"]{2}\s*[,}]/.test(configContent);
	const hasValidDbHost = configContent.includes('DB_HOST') && !/DB_HOST:\s*['"]{2}\s*[,}]/.test(configContent);
	const hasValidDbName = configContent.includes('DB_NAME') && !/DB_NAME:\s*['"]{2}\s*[,}]/.test(configContent);

	const configHasValues = hasValidJwtSecret && hasValidDbHost && hasValidDbName;

	if (!configHasValues) {
		// Config file exists but has no values - treat as not configured
		if (!event.locals.__setupLogged) {
			logger.warn('Config file exists but has empty values. System requires setup.');
			event.locals.__setupLogged = true;
		}
		if (isAllowedDuringSetup(pathname)) {
			return resolve(event, createSetupResolver());
		}
		if (!event.locals.__setupRedirectLogged) {
			logger.debug(`Redirecting ${pathname} to /setup (config incomplete)`);
			event.locals.__setupRedirectLogged = true;
		}
		throw redirect(302, '/setup');
	}

	// --- Step 3: Config Has Values - Setup Was Completed ---
	// If private.ts exists with valid values, setup has been completed.
	// Even if the database is empty (manually wiped), we should NOT go back to setup.
	// Instead, let the auth system handle it (redirect to /login where they'll see auth errors).
	// The admin can then restore the database or contact support.

	// --- Step 4: Setup is Complete - Block Access to Setup Routes ---
	if (pathname.startsWith('/setup') && !pathname.startsWith('/api/setup')) {
		if (!event.locals.__setupLoginRedirectLogged) {
			logger.trace(`Setup complete. Blocking access to \x1b[34m${pathname}\x1b[0m, redirecting to /login`);
			event.locals.__setupLoginRedirectLogged = true;
		}
		throw redirect(302, '/login');
	}

	return resolve(event);
};
