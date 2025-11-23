/**
 * @file src/hooks/handleSetup.ts
 * @description Middleware to manage the initial application setup process.
 *
 * Improvements:
 * - **Performance:** Removed redundant file reading. Relies purely on the memoized `isSetupComplete` utility.
 * - **Cleanliness:** Removed unused `fs` and `path` imports.
 * - **Logic:** Simplified flow—if `isSetupComplete` returns true, the config is valid.
 */

import { redirect, type Handle } from '@sveltejs/kit';
import { isSetupComplete } from '@utils/setupCheck';
import { logger } from '@utils/logger.server';

// --- CONSTANTS ---

/**
 * Regex pattern to identify asset requests that should always be allowed.
 * These are essential for the setup page UI to render properly.
 */
const ASSET_REGEX =
	/^\/(?:@vite\/client|@fs\/|src\/|node_modules\/|vite\/|_app|static|favicon\.ico|\.svelte-kit\/generated\/client\/nodes|.*\.(svg|png|jpg|jpeg|gif|css|js|woff|woff2|ttf|eot|map))/;

// --- UTILITY FUNCTIONS ---

// Checks if a pathname is an allowed route during setup.
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

	// --- Step 1: Check Setup Status ---
	// We use the cached/memoized check from utils.
	// This utility ALREADY checks if the config exists AND if it has valid (non-empty) values.
	if (event.locals.__setupConfigExists === undefined) {
		event.locals.__setupConfigExists = isSetupComplete();
	}
	const isComplete = event.locals.__setupConfigExists;

	// --- Step 2: Handle Incomplete Setup ---
	if (!isComplete) {
		// Log warning only once per request flow to prevent spam
		if (!event.locals.__setupLogged) {
			logger.warn('System requires initial setup.');
			event.locals.__setupLogged = true;
		}

		// Allow access to setup routes and assets
		if (isAllowedDuringSetup(pathname)) {
			return resolve(event, createSetupResolver());
		}

		// Redirect everything else to /setup
		if (!event.locals.__setupRedirectLogged) {
			logger.debug(`Redirecting ${pathname} to /setup`);
			event.locals.__setupRedirectLogged = true;
		}
		throw redirect(302, '/setup');
	}

	// --- Step 3: Handle Complete Setup ---
	// If setup is complete, BLOCK access to /setup routes
	if (pathname.startsWith('/setup') && !pathname.startsWith('/api/setup')) {
		if (!event.locals.__setupLoginRedirectLogged) {
			logger.trace(`Setup complete. Blocking access to ${pathname}, redirecting to /login`);
			event.locals.__setupLoginRedirectLogged = true;
		}
		throw redirect(302, '/login');
	}

	// Proceed normally
	return resolve(event);
};
