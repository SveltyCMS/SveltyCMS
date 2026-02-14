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
import { isSetupCompleteAsync } from '@utils/setupCheck';
import { logger } from '@utils/logger.server';
import { AppError, handleApiError } from '@utils/errorHandling';
import { error } from '@sveltejs/kit';

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
	// Allow standard setup, API setup, version check, assets, AND localized setup
	return (
		pathname.startsWith('/setup') ||
		/^\/[a-z]{2,5}(-[a-zA-Z]+)?\/setup/.test(pathname) || // Localized setup (e.g. /en/setup)
		pathname.startsWith('/api/system') || // Allow system API during setup
		pathname.startsWith('/api/settings/public') || // Allow public settings
		pathname === '/api/system/version' ||
		ASSET_REGEX.test(pathname)
	);
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
	const isApi = pathname.startsWith('/api/');

	try {
		// --- Step 1: Check Setup Status ---
		// We use the cached/memoized check from utils.
		// This utility checks if the config exists AND if the database has admin users.
		if (event.locals.__setupConfigExists === undefined) {
			event.locals.__setupConfigExists = await isSetupCompleteAsync();
		}
		const isComplete = event.locals.__setupConfigExists;

		// --- Step 2: Handle Incomplete Setup ---
		if (!isComplete) {
			// Log warning only once per request flow to prevent spam
			// AND only if the user is attempting to access a non-setup route
			if (!event.locals.__setupLogged && !isAllowedDuringSetup(pathname)) {
				logger.warn('System requires initial setup.');
				event.locals.__setupLogged = true;
			}

			// Allow access to setup routes and assets
			if (isAllowedDuringSetup(pathname)) {
				return await resolve(event, createSetupResolver());
			}

			// For API requests, return a proper error instead of redirecting
			if (isApi) {
				throw new AppError('System setup required. Please complete the setup.', 503, 'SETUP_REQUIRED');
			}

			// Redirect everything else to /setup
			if (!event.locals.__setupRedirectLogged) {
				logger.debug(`Redirecting ${pathname} to /setup`);
				event.locals.__setupRedirectLogged = true;
			}
			throw redirect(302, '/setup');
		}

		// --- Step 3: Handle Complete Setup ---
		// If setup is complete, BLOCK access to /setup routes (including localized ones)
		// EXCEPTION: Allow the final "completeSetup" action to run even if private.ts exists
		// because seedDatabase (step 2) creates private.ts, which makes isComplete true.
		const isSetupRoute = pathname.startsWith('/setup') || /^\/[a-z]{2,5}(-[a-zA-Z]+)?\/setup/.test(pathname);
		const isCompleteAction = event.url.search.includes('/completeSetup');

		if (isSetupRoute && !isCompleteAction) {
			if (!event.locals.__setupLoginRedirectLogged) {
				logger.trace(`Setup complete. Blocking access to ${pathname}, redirecting to /login`);
				event.locals.__setupLoginRedirectLogged = true;
			}
			throw redirect(302, '/');
		}

		// Proceed normally
		return await resolve(event);
	} catch (err) {
		if (isApi) {
			return handleApiError(err, event);
		}

		if (err instanceof AppError) {
			throw error(err.status, err.message);
		}

		throw err;
	}
};
