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
import { isSetupComplete, isSetupCompleteAsync } from '@utils/setupCheck';
import { logger } from '@utils/logger.svelte';

// --- CONSTANTS ---

/**
 * Regex pattern to identify asset requests that should always be allowed.
 * These are essential for the setup page UI to render properly.
 */
const ASSET_REGEX =
	/^\/(?:@vite\/client|@fs\/|src\/|node_modules\/|vite\/|_app|static|favicon\.ico|.*\.(svg|png|jpg|jpeg|gif|css|js|woff|woff2|ttf|eot|map))/;

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

	// --- Step 2: Full Setup Check (Async, cached per request) ---
	if (event.locals.__setupComplete === undefined) {
		event.locals.__setupComplete = await isSetupCompleteAsync();
	}
	const setupComplete = event.locals.__setupComplete;

	if (!setupComplete) {
		if (!event.locals.__setupLogged) {
			logger.warn('Config exists but database is empty. Setup required.');
			event.locals.__setupLogged = true;
		}
		if (isAllowedDuringSetup(pathname)) {
			return resolve(event, createSetupResolver());
		}
		if (!event.locals.__setupRedirectLogged) {
			logger.debug(`Redirecting \x1b[34m${pathname}\x1b[0m to /setup (database empty)`);
			event.locals.__setupRedirectLogged = true;
		}
		throw redirect(302, '/setup');
	}

	// --- Step 3: Setup is Complete ---
	if (pathname.startsWith('/setup') && !pathname.startsWith('/api/setup')) {
		if (!event.locals.__setupLoginRedirectLogged) {
			logger.trace(`Setup complete. Blocking access to \x1b[34m${pathname}\x1b[0m, redirecting to /login`);
			event.locals.__setupLoginRedirectLogged = true;
		}
		throw redirect(302, '/login');
	}

	return resolve(event);
};
